/**
 * 核心引擎 — 对话循环
 *
 * 根据制度动态显示：
 * 明制：司礼监接旨 → 内阁优化 → 六部执行 → 都察院审查
 * 唐制：中书省起草 → 门下省审核 → 尚书省执行
 * 现代：CEO 决策 → CXO 分管 → 团队执行
 */

const chalk = require('chalk');
const { generatePlan, isSimpleChat } = require('../zhongshu/planner');
const { PermissionGate } = require('../menxia/permission-gate');
const { Dispatcher } = require('../shangshu/dispatcher');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { loadConfig } = require('../config/setup');
const { DEFAULT_REGIME } = require('../config/defaults');
const { Spinner, formatDuration } = require('./spinner');
const { createLogger } = require('../utils/logger');
const log = createLogger('query-loop');

// 各制度的显示名称
const REGIME_LABELS = {
  ming: {
    planning: { icon: '📜', name: '司礼监', verb: '接旨传令' },
    review:   { icon: '🛡️', name: '都察院', verb: '审查' },
    execute:  { icon: '⚔️', name: '六部', verb: '奉旨执行' },
    approve:  '内阁票拟通过',
    reject:   '都察院驳回',
    done:     '全部完成，回奏天子。',
    partial:  '部分步骤失败，请天子过目。'
  },
  tang: {
    planning: { icon: '📜', name: '中书省', verb: '起草执行计划' },
    review:   { icon: '🛡️', name: '门下省', verb: '审核' },
    execute:  { icon: '⚔️', name: '尚书省', verb: '调度六部执行' },
    approve:  '门下省准奏',
    reject:   '门下省驳回',
    done:     '全部完成，回奏天子。',
    partial:  '部分步骤失败，请天子过目。'
  },
  modern: {
    planning: { icon: '💼', name: 'CEO', verb: '制定战略' },
    review:   { icon: '✅', name: 'QA', verb: '质量审核' },
    execute:  { icon: '⚙️', name: 'Teams', verb: '团队执行' },
    approve:  'Approved',
    reject:   'Rejected',
    done:     'All tasks completed.',
    partial:  'Some tasks failed. Please review.'
  }
};

/**
 * 启动一次会话
 * @param {string} prompt - 用户输入
 * @param {object} options - CLI 选项
 */
async function startSession(prompt, options = {}) {
  const config = loadConfig() || {};
  const regimeId = options.regime || config.regime || DEFAULT_REGIME;
  const model = options.model || config.model;
  const verbose = options.verbose || false;
  const sessionStart = Date.now();

  const L = REGIME_LABELS[regimeId] || REGIME_LABELS.ming;

  console.log(chalk.gray(`  制度: ${regimeId} | 模型: ${model || '(默认)'}\n`));

  // ── 决策层：起草执行计划 ──
  const planSpinner = new Spinner({ color: 'yellow' });
  planSpinner.start(`${L.planning.icon} ${L.planning.name}${L.planning.verb}...`);

  const plan = await generatePlan(prompt, regimeId, { cwd: process.cwd() });

  planSpinner.succeed(`${L.planning.icon} ${L.planning.name}${L.planning.verb} — ${plan.steps.length} 步 ${plan.planMethod === 'llm' ? chalk.green('(智能规划)') : ''}`);

  if (verbose || options.dryRun) {
    console.log(chalk.gray('  执行计划:'));
    for (const step of plan.steps) {
      const deps = step.dependencies ? chalk.gray(` → 依赖 #${step.dependencies.join(',')}`) : '';
      console.log(chalk.gray(`    #${step.id} `) + chalk.cyan(`[${step.agent}]`) + chalk.white(` ${step.description}`) + deps);
    }
    console.log();
  }

  if (options.dryRun) {
    console.log(chalk.yellow('  (dry-run 模式，不实际执行)'));
    return;
  }

  // ── 快速路径：单 Agent + 完整工具，跳过多 Agent 审核流程 ──
  // 像 Claude Code 一样：能读文件、跑命令、改代码，但不需要六部会审
  if (isSimpleChat(prompt)) {
    const { callLLM, callLLMStreaming } = require('../shangshu/li/api-client');
    const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
    const { getToolSchemas, executeTool } = require('../shangshu/bing/tools');

    const chatSpinner = new Spinner({ color: 'cyan' });
    const chatAgent = plan.steps[0].agent;
    chatSpinner.start(chalk.cyan(`[${chatAgent}]`) + ' 回复中...');

    try {
      // 采集项目上下文给快速路径 agent
      let projectContext = '';
      try {
        const { gatherProjectContext } = require('../zhongshu/planner');
        projectContext = await gatherProjectContext(process.cwd());
      } catch (err) { log.debug('项目上下文采集失败:', err.message); }

      const systemPrompt = buildSystemPrompt(chatAgent, regimeId, {
        cwd: process.cwd(),
        projectContext
      });
      const tools = getToolSchemas();
      // 对话连续性：如果有上一轮的 messages，追加当前用户输入
      let messages = options._messages
        ? [...options._messages, { role: 'user', content: prompt }]
        : [{ role: 'user', content: prompt }];
      const cwd = process.cwd();
      let finalContent = '';
      const MAX_ROUNDS = 15;

      // ── 工具调用循环（和 Claude Code 一样，LLM 可以多轮使用工具）──
      let useStreaming = false;
      for (let round = 0; round < MAX_ROUNDS; round++) {
        // 上下文压缩：messages 过多时保留首尾，丢弃中间
        if (messages.length > 20) {
          const head = messages.slice(0, 1);       // first user message
          const tail = messages.slice(-6);          // last 3 rounds
          const dropped = messages.length - head.length - tail.length;
          messages = [...head, { role: 'user', content: `[系统] 上下文已压缩，省略了 ${dropped} 条中间消息` }, ...tail];
        }
        // 最后回复尝试流式输出（非工具轮）
        if (useStreaming) {
          chatSpinner.stop();

          let hasStreamContent = false;
          const streamResponse = await callLLMStreaming({
            model, providerId: options.provider, system: systemPrompt,
            messages, tools, maxTokens: 4096,
            _tiangong: { taskType: 'chat', agentId: chatAgent, isSimple: true }
          }, (text) => {
            // 首次收到文本时才输出框头（避免空框）
            if (!hasStreamContent) {
              console.log(chalk.gray(`  ┌─ ${chatAgent} 回奏 ─────────────────────────────`));
              process.stdout.write(chalk.gray('  │ '));
              hasStreamContent = true;
            }
            for (const ch of text) {
              if (ch === '\n') {
                process.stdout.write('\n' + chalk.gray('  │ '));
              } else {
                process.stdout.write(ch);
              }
            }
          });

          finalContent = streamResponse.content;
          if (hasStreamContent) {
            process.stdout.write('\n');
            console.log(chalk.gray('  └──────────────────────────────────────────────'));
          }

          // 如果流式回复里有工具调用，继续循环
          if (streamResponse.toolCalls?.length > 0) {
            // 需要继续工具循环但已经流式输出了部分内容
            // 不太常见，回退到非流式继续
            useStreaming = false;
            continue;
          }
          break;
        }

        const response = await callLLM({
          model,
          providerId: options.provider,
          system: systemPrompt,
          messages,
          tools,
          maxTokens: 4096,
          _tiangong: { taskType: 'chat', agentId: chatAgent, isSimple: true }
        });

        if (response.content) {
          finalContent = response.content;
        }

        // 没有工具调用 → 结束循环（如果还有后续轮次，用流式）
        if (!response.toolCalls || response.toolCalls.length === 0) {
          break;
        }

        // 更新 spinner 显示工具调用
        const toolNames = response.toolCalls.map(tc => tc.name).join(', ');
        chatSpinner.update(chalk.cyan(`[${chatAgent}]`) + chalk.gray(` ${toolNames}...`));

        // 构建 assistant 消息（含 tool_use blocks）
        const config = loadConfig() || {};
        const providerId = options.provider || config.provider || 'anthropic';
        const isAnthropic = providerId === 'anthropic';

        if (isAnthropic) {
          const assistantBlocks = [];
          if (response.content) assistantBlocks.push({ type: 'text', text: response.content });
          for (const tc of response.toolCalls) {
            assistantBlocks.push({ type: 'tool_use', id: tc.id, name: tc.name, input: tc.input });
          }
          messages.push({ role: 'assistant', content: assistantBlocks });
        } else {
          const msg = { role: 'assistant' };
          if (response.content) msg.content = response.content;
          msg.tool_calls = response.toolCalls.map(tc => ({
            id: tc.id, type: 'function',
            function: { name: tc.name, arguments: JSON.stringify(tc.input) }
          }));
          messages.push(msg);
        }

        // 执行每个工具并喂回结果
        const toolResultEntries = [];
        for (const tc of response.toolCalls) {
          let toolResult;
          try {
            toolResult = await executeTool(tc.name, tc.input, { cwd, agentId: chatAgent });
          } catch (err) {
            toolResult = `工具执行失败: ${err.message}`;
          }
          if (typeof toolResult !== 'string') toolResult = toolResult ? String(toolResult) : '(无结果)';
          if (toolResult.length > 50000) toolResult = toolResult.slice(0, 50000) + '\n... (截断)';
          toolResultEntries.push({ id: tc.id, result: toolResult });
        }

        if (isAnthropic) {
          // Anthropic: 所有 tool_result 合并到一条 user 消息
          messages.push({
            role: 'user',
            content: toolResultEntries.map(e => ({ type: 'tool_result', tool_use_id: e.id, content: e.result }))
          });
        } else {
          for (const e of toolResultEntries) {
            messages.push({ role: 'tool', tool_call_id: e.id, content: e.result });
          }
        }

        // 工具执行完毕，下一轮用流式输出
        useStreaming = true;
        chatSpinner.update(chalk.cyan(`[${chatAgent}]`) + ' 思考中...');
      }

      // 如果没走流式路径（第一轮就直接回答了），用普通输出
      if (!useStreaming || !finalContent) {
        chatSpinner.succeed(chalk.cyan(`[${chatAgent}]`) + ' 完成');
      }

      // 只在非流式时输出回奏框（流式路径已经在循环内输出了）
      if (!useStreaming && finalContent) {
        console.log();
        console.log(chalk.gray(`  ┌─ ${chatAgent} 回奏 ─────────────────────────────`));
        const lines = (finalContent || '').split('\n');
        for (const line of lines) {
          console.log(chalk.gray('  │ ') + chalk.white(line));
        }
        console.log(chalk.gray('  └──────────────────────────────────────────────'));
      }

      // 庆祝动画（金榜题名宝藏效果）
      try {
        const { treasureManager } = require('../features/treasure-hunt');
        if (treasureManager.isEffectActive('scroll_ascii_party')) {
          const { playCelebration } = require('../features/treasure-animation');
          await playCelebration();
        }
      } catch (err) { log.debug('celebration effect check failed', err.message); }

      console.log();
      console.log(chalk.green(`  ${L.done}`));

      // 惊喜掉落：任务完成后随机掉宝藏
      try {
        const { treasureManager } = require('../features/treasure-hunt');
        const surprise = treasureManager.checkSurpriseDrop();
        if (surprise) {
          console.log(chalk.yellow('\n  完成任务时，你意外发现了一个宝藏！'));
          const { playDropAnimation } = require('../features/treasure-animation');
          await playDropAnimation(surprise.rarity, surprise);
        }
      } catch (err) { log.debug('surprise drop check failed', err.message); }

      // 消耗一次性效果
      try {
        const { treasureManager } = require('../features/treasure-hunt');
        for (const id of Object.keys(treasureManager.data.activeEffects || {})) {
          treasureManager.tickEffect(id);
        }
      } catch (err) { log.debug('effect tick failed', err.message); }

      // 功勋奖励 + 通知（让用户看到 agent 在成长）
      try {
        const { reputationManager } = require('../features/reputation');
        const elapsed_ms = Date.now() - sessionStart;
        const res = reputationManager.reward(chatAgent, 'task_complete');
        if (elapsed_ms < 10000) reputationManager.reward(chatAgent, 'task_fast');
        const rank = reputationManager.getRank(chatAgent);
        // 升官时 _announcePromotion 已自动打印，这里只显示普通 XP 变化
        if (!res.levelUp) {
          const bar = chalk.green('█'.repeat(Math.round(10 * rank.progress))) + chalk.gray('░'.repeat(10 - Math.round(10 * rank.progress)));
          console.log(chalk.gray(`  ${rank.emoji} ${chatAgent} +${res.xpGained}功勋 ${bar} ${rank.title} (${rank.xp}/${rank.nextRank ? rank.nextRank.xpRequired : '满'})`));
        }
      } catch (err) { log.debug('reputation reward failed', err.message); }

      const elapsed = formatDuration(Date.now() - sessionStart);

      // 上报花费给 REPL（/cost 可以看到）
      if (options._onCost) {
        try {
          const { CostTracker } = require('../shangshu/hu/cost-tracker');
          const ct = new CostTracker();
          // 粗略估算：每轮 messages 增长 ~2 条，每条约 500 tokens
          const estInputTokens = messages.length * 500;
          const estOutputTokens = (finalContent || '').length;
          ct.record(chatAgent, model, estInputTokens, estOutputTokens);
          options._onCost(ct.getSummary());
        } catch { /* ignore */ }
      }

      console.log();
      console.log(chalk.gray('  ─────────────────────────────────────────────'));
      console.log(chalk.gray(`  快速回答 | ${elapsed}`));
      console.log();

      // 自动保存会话
      try {
        const { saveSession, generateSessionId } = require('./session-store');
        saveSession(generateSessionId(), { messages, prompt, model, regime: regimeId });
      } catch (err) { log.debug('session save failed', err.message); }

      // 返回 messages 供 REPL 保持对话连续性
      return { messages };
    } catch (err) {
      chatSpinner.fail('回复失败: ' + err.message);
    }

    return {};
  }

  // ── 审核层 ──
  const reviewSpinner = new Spinner({ color: 'blue' });
  reviewSpinner.start(`${L.review.icon} ${L.review.name}${L.review.verb}中...`);

  const gate = new PermissionGate(regimeId);
  let permissionOk = true;

  // 权限检查逻辑：
  // 每一步的"调用者"取决于制度流程，不是简单的前一步。
  // 规则：谁有权调度谁？按 canCall 链路检查。
  // 特殊：审查步骤（review）是调度系统发起的，不是被审查的 Agent 发起的。
  const dispatchAgent = plan.steps[0].agent; // 调度者

  for (let i = 1; i < plan.steps.length; i++) {
    const step = plan.steps[i];

    // 确定 caller：谁调度了这一步？
    let callerId;
    if (step.task === 'review' || step.task === 'review_plan') {
      // 审查步骤：找流程中有权调度审查者的 Agent
      // 优先用调度者，其次用依赖步骤中的 Agent
      callerId = dispatchAgent;
      // 如果调度者无权，依次尝试之前步骤中的 Agent
      if (!gate.checkAgentCall(callerId, step.agent).allowed) {
        for (let j = i - 1; j >= 0; j--) {
          if (gate.checkAgentCall(plan.steps[j].agent, step.agent).allowed) {
            callerId = plan.steps[j].agent;
            break;
          }
        }
      }
    } else if (step.dependencies && step.dependencies.length > 0) {
      const depStep = plan.steps.find(s => s.id === step.dependencies[0]);
      callerId = depStep ? depStep.agent : plan.steps[i - 1].agent;
    } else {
      callerId = plan.steps[i - 1].agent;
    }

    const check = gate.checkAgentCall(callerId, step.agent);
    if (!check.allowed) {
      // 降级：如果 caller 无权调度，尝试用全局调度者（司礼监/CEO）
      const fallback = gate.checkAgentCall(dispatchAgent, step.agent);
      if (!fallback.allowed) {
        reviewSpinner.fail(`${L.reject}: ${check.reason}`);
        permissionOk = false;
        break;
      }
    }
  }

  if (!permissionOk) return;
  reviewSpinner.succeed(`${L.approve}`);

  // ── 执行层 ──
  console.log(chalk.magenta(`\n  ${L.execute.icon} ${L.execute.name}${L.execute.verb}...\n`));

  const costTracker = new CostTracker();
  let completedSteps = 0;
  const totalSteps = plan.steps.length;

  const stepSpinners = {};

  const dispatcher = new Dispatcher({
    regimeId,
    model,
    costTracker,
    cwd: process.cwd(),
    verbose,
    onProgress: (event) => {
      switch (event.type) {
        case 'step_start': {
          const spinner = new Spinner({ color: 'cyan' });
          stepSpinners[event.step] = spinner;
          spinner.start(chalk.cyan(`[${event.agent}]`) + ` ${event.task}`);
          break;
        }
        case 'step_complete': {
          completedSteps++;
          const spinner = stepSpinners[event.step];
          if (spinner) {
            spinner.succeed(chalk.cyan(`[${event.agent}]`) + ` 完成  ${chalk.gray(progressBar(completedSteps, totalSteps, 15))}`);
          }
          break;
        }
        case 'step_failed': {
          completedSteps++;
          const spinner = stepSpinners[event.step];
          if (spinner) {
            spinner.fail(chalk.cyan(`[${event.agent}]`) + chalk.red(` 失败: ${event.error}`));
          }
          break;
        }
        case 'tool_call':
          if (verbose) {
            console.log(chalk.gray(`    [${event.agent}] ${event.tool}(${JSON.stringify(event.input).slice(0, 80)})`));
          }
          break;
        case 'text_delta': {
          // 流式文本输出（多Agent模式）
          const spinner = stepSpinners[event.step];
          if (spinner && spinner.timer) { spinner.stop(); }
          process.stdout.write(event.text);
          break;
        }
      }
    }
  });

  const result = await dispatcher.executePlan(plan);

  // ── 回奏 ──
  console.log();

  if (result.success) {
    // 输出最终结果
    for (const [stepId, stepResult] of Object.entries(result.results)) {
      if (stepResult.output?.content) {
        // 用引用框包裹 Agent 输出
        const agentId = stepResult.output.agent;
        console.log(chalk.gray(`  ┌─ ${agentId} 回奏 ─────────────────────────────`));
        const lines = stepResult.output.content.split('\n');
        for (const line of lines) {
          console.log(chalk.gray('  │ ') + chalk.white(line));
        }
        console.log(chalk.gray('  └──────────────────────────────────────────────'));
        console.log();
      }
    }
    console.log(chalk.green(`  ${L.done}`));
  } else {
    for (const [stepId, stepResult] of Object.entries(result.results)) {
      if (stepResult.status === 'failed') {
        console.log(chalk.red(`  ✗ 步骤 #${stepId} 失败: ${stepResult.error}`));
      } else if (stepResult.output?.content) {
        console.log(chalk.white(stepResult.output.content));
      }
    }
    console.log(chalk.yellow(`\n  ${L.partial}`));
  }

  // ── 户部报账 ──
  const cost = costTracker.getSummary();
  const elapsed = formatDuration(Date.now() - sessionStart);

  console.log();
  console.log(chalk.gray('  ─────────────────────────────────────────────'));
  const totalTokens = (cost.total.inputTokens + cost.total.outputTokens).toLocaleString();
  console.log(chalk.gray(`  户部: ${chalk.yellow(totalTokens + ' tokens')} | ${cost.total.inputTokens.toLocaleString()} in / ${cost.total.outputTokens.toLocaleString()} out | ${elapsed}`));

  if (verbose) {
    for (const [agentId, agentCost] of Object.entries(cost.perAgent)) {
      console.log(chalk.gray(`     └ ${agentId}: ${(agentCost.inputTokens + agentCost.outputTokens).toLocaleString()} tokens (${agentCost.calls} 次调用)`));
    }
  }

  // 功勋总结（多 Agent 路径 — dispatcher 已调过 reward，这里展示汇总）
  try {
    const { reputationManager } = require('../features/reputation');
    const agentsSeen = new Set();
    const xpLines = [];
    for (const step of plan.steps) {
      if (agentsSeen.has(step.agent)) continue;
      agentsSeen.add(step.agent);
      const rank = reputationManager.getRank(step.agent);
      const agentData = reputationManager.getAgent(step.agent);
      const streak = agentData.streak > 1 ? chalk.red(` 🔥${agentData.streak}连胜`) : '';
      xpLines.push(`${rank.emoji} ${step.agent} ${chalk.white(rank.title)}${streak}`);
    }
    if (xpLines.length > 0) {
      console.log(chalk.gray('  功勋: ') + xpLines.join(chalk.gray(' | ')));
    }
  } catch (err) { log.debug('reputation display failed', err.message); }

  console.log();

  // 多 Agent 路径：dispatcher 已通过 sessionRecorder (time-travel) 保存了完整会话记录
  // 不再重复保存到 session-store，避免 replay 列表出现重复条目

  // 回调 REPL 的花费追踪
  if (options._onCost) {
    options._onCost(cost);
  }

  // 返回摘要 messages 供 REPL 保持上下文
  const returnMessages = options._messages ? [...options._messages] : [];
  returnMessages.push({ role: 'user', content: prompt });
  // 附上最终 agent 输出作为 assistant 消息
  const lastOutput = Object.values(result.results).filter(r => r.output?.content).pop();
  if (lastOutput) {
    returnMessages.push({ role: 'assistant', content: lastOutput.output.content });
  }
  return { messages: returnMessages };
}

module.exports = { startSession };
