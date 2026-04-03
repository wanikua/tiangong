/**
 * 尚书省 — 六部调度器
 *
 * 接收执行计划，为每个步骤启动一个 Agent 循环：
 * 1. 构建 system prompt（含记忆）
 * 2. 调用 LLM API
 * 3. 如果 LLM 返回 tool_use → 执行工具 → 把结果喂回 LLM
 * 4. 重复直到 LLM 返回 end_turn 或达到最大轮次
 */

const chalk = require('chalk');
const { PermissionGate } = require('../menxia/permission-gate');
const { checkCommandSafety } = require('../menxia/security-check');
const { callLLM, callLLMStreaming } = require('./li/api-client');
const { getToolSchemas, executeTool, executeToolsBatched } = require('./bing/tools');
const { CostTracker } = require('./hu/cost-tracker');
const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
const { memoryStore } = require('../memory/store');
const { processConversation } = require('../memory/extractor');
const { vikingStore } = require('../memory/viking-store');
const { reputationManager } = require('../features/reputation');
const { sessionRecorder } = require('../features/time-travel');

const { loadConfig, CONSTANTS } = require('../config/index');
const { createLogger } = require('../utils/logger');
const log = createLogger('dispatcher');

class Dispatcher {
  constructor(options = {}) {
    this.regimeId = options.regimeId || 'ming';
    this.model = options.model;
    this.onProgress = options.onProgress || (() => {});
    this.gate = new PermissionGate(this.regimeId);
    this.costTracker = options.costTracker || new CostTracker();
    this.cwd = options.cwd || process.cwd();
    this.verbose = options.verbose || false;
    // 检测当前 provider 是否是 Anthropic（影响消息格式）
    const config = loadConfig() || {};
    this.providerId = config.provider || 'anthropic';
    this.isAnthropic = this.providerId === 'anthropic';
  }

  /**
   * 执行计划
   */
  async executePlan(plan) {
    const results = {};

    // 开始记录会话（奏折）
    const sessionId = sessionRecorder.startSession(plan.prompt, {
      regime: this.regimeId,
      model: this.model
    });

    for (const step of plan.steps) {
      this.onProgress({ type: 'step_start', step: step.id, agent: step.agent, task: step.description });
      sessionRecorder.recordEvent(sessionId, { type: 'step_start', step: step.id, agent: step.agent, task: step.description });

      const stepStart = Date.now();

      try {
        if (step.dependencies) {
          for (const depId of step.dependencies) {
            if (!results[depId] || results[depId].status === 'failed') {
              throw new Error(`依赖步骤 #${depId} 未完成或失败`);
            }
          }
        }

        const upstreamOutputs = {};
        if (step.dependencies) {
          for (const depId of step.dependencies) {
            upstreamOutputs[depId] = results[depId];
          }
        }

        const result = await this._executeAgentLoop(step, upstreamOutputs, plan.prompt);
        results[step.id] = { status: 'success', output: result, completedAt: new Date().toISOString() };

        this.onProgress({ type: 'step_complete', step: step.id, agent: step.agent, status: 'success' });
        sessionRecorder.recordEvent(sessionId, { type: 'step_complete', step: step.id, agent: step.agent });

        // 功勋奖励
        const elapsed = Date.now() - stepStart;
        reputationManager.reward(step.agent, 'task_complete');
        if (elapsed < 10000) reputationManager.reward(step.agent, 'task_fast');

      } catch (err) {
        results[step.id] = { status: 'failed', error: err.message, completedAt: new Date().toISOString() };
        this.onProgress({ type: 'step_failed', step: step.id, agent: step.agent, error: err.message });
        sessionRecorder.recordEvent(sessionId, { type: 'step_failed', step: step.id, agent: step.agent, error: err.message });

        // 功勋惩罚
        reputationManager.penalize(step.agent, 'task_fail');
      }
    }

    const finalResult = {
      plan, results,
      completedAt: new Date().toISOString(),
      success: Object.values(results).every(r => r.status === 'success'),
      cost: this.costTracker.getSummary()
    };

    // 结束会话记录
    sessionRecorder.endSession(sessionId, finalResult);

    return finalResult;
  }

  /**
   * 为一个 Agent 运行完整的 LLM ↔ 工具循环
   * @private
   */
  async _executeAgentLoop(step, upstreamOutputs, originalPrompt) {
    const agentId = step.agent;

    // 构建 system prompt（含记忆）
    const systemPrompt = this._buildAgentContext(agentId, step, upstreamOutputs, originalPrompt);

    // 构建初始用户消息
    const userMessage = this._buildTaskMessage(step, upstreamOutputs);

    const messages = [
      { role: 'user', content: userMessage }
    ];

    const tools = getToolSchemas();
    let finalContent = '';

    // 工具调用循环
    for (let round = 0; round < CONSTANTS.MAX_TOOL_ROUNDS; round++) {
      if (this.costTracker.isOverBudget()) {
        throw new Error('户部报告：已超预算，停止执行');
      }

      const response = await callLLM({
        model: this.model,
        system: systemPrompt,
        messages,
        tools,
        maxTokens: CONSTANTS.DEFAULT_MAX_TOKENS,
        _tiangong: {
          taskType: step.task,
          agentId: agentId,
          layer: step.task === 'chat' ? 'planning' : undefined
        }
      });

      // 记录用量
      const inputTokens = response.usage.input_tokens || response.usage.prompt_tokens || 0;
      const outputTokens = response.usage.output_tokens || response.usage.completion_tokens || 0;
      this.costTracker.record(agentId, this.model || 'claude-sonnet-4-6', inputTokens, outputTokens);

      // 有文本内容 → 输出
      if (response.content) {
        finalContent = response.content;
        if (this.verbose) {
          console.log(chalk.gray(`    [${agentId}] ${response.content.slice(0, 200)}`));
        }
      }

      // 没有工具调用 → 结束
      if (!response.toolCalls || response.toolCalls.length === 0) {
        break;
      }

      // 把 assistant 消息加入历史（含 tool_use）
      const assistantMsg = this._buildAssistantContent(response);
      if (this.isAnthropic) {
        messages.push({ role: 'assistant', content: assistantMsg });
      } else {
        // OpenAI 格式：_buildAssistantContent 已返回完整 message
        messages.push(assistantMsg);
      }

      // 执行工具调用（read-only 并发，write 串行）
      // 先做安全检查
      for (const tc of response.toolCalls) {
        if (tc.name === 'bash' && tc.input.command) {
          const safety = checkCommandSafety(tc.input.command);
          if (safety.blocked) {
            tc._blocked = `[刑部拦截] 危险命令被阻止: ${safety.risks.map(r => r.desc).join(', ')}`;
          } else if (safety.requiresConfirmation) {
            this.onProgress({ type: 'tool_call', step: step.id, agent: agentId, tool: '⚠️ 刑部警告', input: { risks: safety.risks.map(r => r.desc) } });
          }
        }
        this.onProgress({ type: 'tool_call', step: step.id, agent: agentId, tool: tc.name, input: tc.input });
      }

      // 批量执行（被拦截的跳过）
      const toolResults = await executeToolsBatched(
        response.toolCalls.map(tc => tc._blocked
          ? { ...tc, _preResult: tc._blocked }
          : tc
        ),
        { cwd: this.cwd, agentId }
      );

      // 喂回结果
      for (const tr of toolResults) {
        let toolResult = tr.result;
        if (toolResult.length > CONSTANTS.MAX_OUTPUT_TRUNCATION) {
          toolResult = toolResult.slice(0, CONSTANTS.MAX_OUTPUT_TRUNCATION) + '\n... (截断，结果过长)';
        }

        const toolResultMsg = this._buildToolResult(tr.id, tr.name, toolResult);
        if (this.isAnthropic) {
          messages.push({ role: 'user', content: toolResultMsg });
        } else {
          // OpenAI 格式：_buildToolResult 已返回完整 message
          messages.push(toolResultMsg);
        }
      }
    }

    // 记忆提取：从最终输出中学习
    processConversation(originalPrompt, finalContent, agentId, { projectPath: this.cwd });

    // OpenViking 自进化：将经验写入虚拟文件系统
    try {
      vikingStore.evolveFromSession(agentId, originalPrompt, finalContent, {
        success: !!finalContent,
        toolCalls: messages.filter(m => m.role === 'assistant').length
      });
    } catch (err) { log.debug('Viking 自进化失败:', err.message); }

    return {
      agent: agentId,
      content: finalContent,
      rounds: messages.filter(m => m.role === 'assistant').length
    };
  }

  /**
   * 构建 Agent 上下文（system prompt + 记忆）
   * @private
   */
  _buildAgentContext(agentId, step, upstreamOutputs, originalPrompt) {
    const parts = [];

    // 角色 prompt
    parts.push(buildSystemPrompt(agentId, this.regimeId, { cwd: this.cwd }));

    // OpenViking 上下文注入（L0/L1 按需加载）
    try {
      const vikingContext = vikingStore.buildContextPrompt(agentId, {
        taskContext: originalPrompt,
        projectPath: this.cwd,
        maxTokens: 2000
      });
      if (vikingContext) {
        parts.push('\n' + vikingContext);
      }
    } catch (err) { log.debug('Viking 上下文加载失败:', err.message); }

    // 旧版记忆注入（兼容）
    const memoryPrompt = memoryStore.buildMemoryPrompt(agentId, {
      projectPath: this.cwd,
      taskContext: originalPrompt
    });
    if (memoryPrompt) {
      parts.push('\n' + memoryPrompt);
    }

    return parts.join('\n');
  }

  /**
   * 构建任务消息
   * @private
   */
  _buildTaskMessage(step, upstreamOutputs) {
    const parts = [`任务: ${step.description}`];

    if (step.input) {
      parts.push(`\n原始旨意: ${step.input}`);
    }

    // 附上游输出
    const upKeys = Object.keys(upstreamOutputs);
    if (upKeys.length > 0) {
      parts.push('\n前序步骤结果:');
      for (const depId of upKeys) {
        const dep = upstreamOutputs[depId];
        if (dep.output?.content) {
          parts.push(`\n--- 步骤 #${depId} (${dep.output.agent}) ---`);
          parts.push(dep.output.content);
        }
      }
    }

    return parts.join('\n');
  }

  /**
   * 构建 assistant 消息
   * Anthropic: content 是 block 数组
   * OpenAI: content 是字符串 + tool_calls 数组
   * @private
   */
  _buildAssistantContent(response) {
    if (this.isAnthropic) {
      // Anthropic 格式
      const blocks = [];
      if (response.content) {
        blocks.push({ type: 'text', text: response.content });
      }
      for (const tc of response.toolCalls) {
        blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
      }
      return blocks;
    } else {
      // OpenAI 兼容格式：返回完整的 message 对象
      const msg = { role: 'assistant' };
      if (response.content) msg.content = response.content;
      if (response.toolCalls && response.toolCalls.length > 0) {
        msg.tool_calls = response.toolCalls.map(tc => ({
          id: tc.id,
          type: 'function',
          function: { name: tc.name, arguments: JSON.stringify(tc.input) }
        }));
      }
      return msg;
    }
  }

  /**
   * 构建工具结果消息
   * Anthropic: role=user + content=[{ type: 'tool_result', ... }]
   * OpenAI: role=tool + tool_call_id + content
   * @private
   */
  _buildToolResult(toolUseId, toolName, result) {
    if (this.isAnthropic) {
      return [
        { type: 'tool_result', tool_use_id: toolUseId, content: result }
      ];
    } else {
      // OpenAI 格式：直接返回完整的消息对象（不是数组）
      return { role: 'tool', tool_call_id: toolUseId, content: result };
    }
  }
}

module.exports = { Dispatcher };
