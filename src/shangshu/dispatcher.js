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
const { callLLM } = require('./li/api-client');
const { getToolSchemas, executeTool } = require('./bing/tools');
const { CostTracker } = require('./hu/cost-tracker');
const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
const { memoryStore } = require('../memory/store');
const { processConversation } = require('../memory/extractor');

const MAX_TOOL_ROUNDS = 30;

class Dispatcher {
  constructor(options = {}) {
    this.regimeId = options.regimeId || 'ming';
    this.model = options.model;
    this.onProgress = options.onProgress || (() => {});
    this.gate = new PermissionGate(this.regimeId);
    this.costTracker = options.costTracker || new CostTracker();
    this.cwd = options.cwd || process.cwd();
    this.verbose = options.verbose || false;
  }

  /**
   * 执行计划
   */
  async executePlan(plan) {
    const results = {};

    for (const step of plan.steps) {
      this.onProgress({ type: 'step_start', step: step.id, agent: step.agent, task: step.description });

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
      } catch (err) {
        results[step.id] = { status: 'failed', error: err.message, completedAt: new Date().toISOString() };
        this.onProgress({ type: 'step_failed', step: step.id, agent: step.agent, error: err.message });
      }
    }

    return {
      plan, results,
      completedAt: new Date().toISOString(),
      success: Object.values(results).every(r => r.status === 'success'),
      cost: this.costTracker.getSummary()
    };
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
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      if (this.costTracker.isOverBudget()) {
        throw new Error('户部报告：已超预算，停止执行');
      }

      const response = await callLLM({
        model: this.model,
        system: systemPrompt,
        messages,
        tools,
        maxTokens: 4096
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
      messages.push({
        role: 'assistant',
        content: this._buildAssistantContent(response)
      });

      // 执行每个工具调用
      for (const tc of response.toolCalls) {
        this.onProgress({
          type: 'tool_call',
          step: step.id,
          agent: agentId,
          tool: tc.name,
          input: tc.input
        });

        let toolResult;
        try {
          // 门下省安全检查（Bash 命令）
          if (tc.name === 'bash' && tc.input.command) {
            const safety = checkCommandSafety(tc.input.command);
            if (safety.blocked) {
              toolResult = `[刑部拦截] 危险命令被阻止: ${safety.risks.map(r => r.desc).join(', ')}`;
            }
          }

          if (!toolResult) {
            toolResult = await executeTool(tc.name, tc.input, { cwd: this.cwd, agentId });
          }
        } catch (err) {
          toolResult = `工具执行失败: ${err.message}`;
        }

        // 截断过长的工具结果
        if (toolResult.length > 50000) {
          toolResult = toolResult.slice(0, 50000) + '\n... (截断，结果过长)';
        }

        // 把工具结果加入历史
        messages.push({
          role: 'user',
          content: this._buildToolResult(tc.id, tc.name, toolResult)
        });
      }
    }

    // 记忆提取：从最终输出中学习
    processConversation(originalPrompt, finalContent, agentId, { projectPath: this.cwd });

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

    // 记忆注入
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
   * 构建 assistant 消息（Anthropic 格式）
   * @private
   */
  _buildAssistantContent(response) {
    // Anthropic 格式：content 是数组
    const blocks = [];
    if (response.content) {
      blocks.push({ type: 'text', text: response.content });
    }
    for (const tc of response.toolCalls) {
      blocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
    }
    return blocks;
  }

  /**
   * 构建工具结果消息（Anthropic 格式）
   * @private
   */
  _buildToolResult(toolUseId, toolName, result) {
    return [
      { type: 'tool_result', tool_use_id: toolUseId, content: result }
    ];
  }
}

module.exports = { Dispatcher };
