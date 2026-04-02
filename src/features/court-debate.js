/**
 * 廷议模式 — 朝堂辩论
 *
 * Claude Code 没有的独创功能：
 * 多个 Agent 对一个复杂问题进行"廷议"（辩论），
 * 每个 Agent 从自己的职能角度发言，互相质疑和补充，
 * 最终形成一个更全面的方案。
 *
 * 不同于简单的"多步骤执行"：
 * - Agent 能看到其他 Agent 的发言并回应
 * - 自动产生"争议焦点"和"共识"
 * - 最终由天子裁决采纳哪些意见
 *
 * 用法：
 *   /debate "我们应该用 PostgreSQL 还是 MongoDB？"
 *   /debate --rounds 3 "如何设计微服务架构？"
 */

const chalk = require('chalk');
const { callLLM } = require('../shangshu/li/api-client');
const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
const { getRegime } = require('../config/regimes');
const { loadConfig } = require('../config/setup');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { Spinner } = require('../engine/spinner');

/**
 * 发言气泡样式（每个 Agent 不同颜色）
 */
const AGENT_COLORS = [
  'cyan', 'yellow', 'magenta', 'green', 'blue', 'red', 'white'
];

/**
 * 运行廷议
 * @param {object} params
 * @param {string} params.topic - 议题
 * @param {string[]} [params.participants] - 参与 Agent ID（默认自动选择）
 * @param {number} [params.rounds=2] - 辩论轮次
 * @param {string} [params.regimeId='ming']
 * @returns {Promise<object>}
 */
async function runDebate(params) {
  const { topic, rounds = 2, regimeId = 'ming' } = params;
  const config = loadConfig() || {};
  const regime = getRegime(regimeId);
  const costTracker = new CostTracker();

  // 自动选择参与者：决策层 + 相关执行层
  const participants = params.participants
    || selectParticipants(topic, regime);

  // ── Banner ──
  console.log();
  console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('  ║') + chalk.bold.yellow('    📣  廷 议 开 始  📣') + chalk.gray('    Court Debate') + '              ' + chalk.yellow('║'));
  console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.white(`  议题: ${chalk.bold(topic)}`));
  console.log(chalk.white(`  轮次: ${rounds}`));
  console.log(chalk.white(`  参与: ${participants.map(p => {
    const a = regime.agents.find(ag => ag.id === p);
    return a ? `${a.emoji} ${a.name}` : p;
  }).join('  ')}`));
  console.log();

  const transcript = []; // 完整发言记录
  const model = config.model;

  // ── 多轮辩论 ──
  for (let round = 1; round <= rounds; round++) {
    console.log(chalk.yellow(`  ═══ 第${numToChinese(round)}轮 ${'═'.repeat(40)}\n`));

    for (let i = 0; i < participants.length; i++) {
      const agentId = participants[i];
      const agent = regime.agents.find(a => a.id === agentId);
      const name = agent ? agent.name : agentId;
      const emoji = agent ? agent.emoji : '🗣️';
      const color = AGENT_COLORS[i % AGENT_COLORS.length];
      const colorFn = chalk[color];

      const spinner = new Spinner({ color });
      spinner.start(`${emoji} ${name} 准备发言...`);

      try {
        // 构建上下文：包含之前所有发言
        const systemPrompt = buildDebatePrompt(agentId, regimeId, round, rounds);
        const userMessage = buildDebateMessage(topic, transcript, round, agentId);

        const response = await callLLM({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: userMessage }],
          maxTokens: 1024
        });

        const speech = response.content || '(无发言)';
        const inputTokens = response.usage?.input_tokens || response.usage?.prompt_tokens || 0;
        const outputTokens = response.usage?.output_tokens || response.usage?.completion_tokens || 0;
        costTracker.record(agentId, model || 'claude-sonnet-4-6', inputTokens, outputTokens);

        spinner.stop();

        // 气泡式展示发言
        const headerLine = `  ${emoji} ${colorFn.bold(name)}  ${chalk.gray(`(${agentId})`)}`;
        console.log(headerLine);

        const lines = speech.split('\n');
        for (const line of lines) {
          console.log(colorFn('  │ ') + chalk.white(line));
        }
        console.log();

        transcript.push({
          round,
          agentId,
          name,
          speech,
          timestamp: new Date().toISOString()
        });

      } catch (err) {
        spinner.fail(`${name} 发言失败: ${err.message}`);
        transcript.push({
          round,
          agentId,
          name,
          speech: `(发言失败: ${err.message})`,
          error: true,
          timestamp: new Date().toISOString()
        });
      }
    }
  }

  // ── 总结 ──
  console.log(chalk.yellow('  ═══ 廷议总结 ═══════════════════════════════════\n'));

  // 尝试让一个 Agent 做总结
  const summarySpinner = new Spinner({ color: 'yellow' });
  summarySpinner.start('太史令撰写廷议总结...');

  try {
    const summaryPrompt = buildSummaryPrompt(topic, transcript, regimeId);
    const summaryResponse = await callLLM({
      model,
      system: '你是太史令，负责客观记录和总结朝堂廷议。',
      messages: [{ role: 'user', content: summaryPrompt }],
      maxTokens: 1024
    });

    summarySpinner.succeed('廷议总结完成');
    console.log();

    const summary = summaryResponse.content || '(无总结)';
    console.log(chalk.gray('  ┌─ 太史令记录 ────────────────────────────'));
    for (const line of summary.split('\n')) {
      console.log(chalk.gray('  │ ') + chalk.white(line));
    }
    console.log(chalk.gray('  └──────────────────────────────────────────────'));

  } catch (err) {
    summarySpinner.fail('总结失败');
  }

  const cost = costTracker.getSummary();
  console.log(chalk.gray(`\n  💰 廷议费用: $${cost.total.totalCostUsd.toFixed(4)} | ${cost.total.inputTokens + cost.total.outputTokens} tokens`));
  console.log();

  return { transcript, topic, rounds };
}

/**
 * 自动选择参与者
 * @private
 */
function selectParticipants(topic, regime) {
  const agents = regime.agents || [];

  // 决策层一定参与
  const planners = agents.filter(a => a.layer === 'planning').slice(0, 2);

  // 执行层（最多3个参与）
  const executors = agents.filter(a => a.layer === 'execution').slice(0, 3);

  // 审核层参与
  const reviewers = agents.filter(a => a.layer === 'review').slice(0, 1);

  const all = [...planners, ...executors, ...reviewers];
  return [...new Set(all.map(a => a.id))];
}

/**
 * 构建辩论 system prompt
 * @private
 */
function buildDebatePrompt(agentId, regimeId, currentRound, totalRounds) {
  const base = buildSystemPrompt(agentId, regimeId);
  return `${base}

## 当前是廷议（朝堂辩论）模式

你正在参与一场廷议。规则：
- 你需要从自己的职能角度对议题发表看法
- 如果你不同意之前其他大臣的意见，直接指出并说明理由
- 如果你同意，可以补充细节或提出新的角度
- 发言要言简意赅，每次发言控制在 200 字以内
- 第 ${currentRound}/${totalRounds} 轮${currentRound === totalRounds ? '，这是最后一轮，请给出你的最终立场' : ''}`;
}

/**
 * 构建辩论用户消息
 * @private
 */
function buildDebateMessage(topic, transcript, currentRound, currentAgentId) {
  const parts = [`廷议议题: ${topic}\n`];

  if (transcript.length > 0) {
    parts.push('之前的发言记录:');
    for (const entry of transcript) {
      parts.push(`\n[${entry.name}] (第${entry.round}轮):`);
      parts.push(entry.speech);
    }
    parts.push('\n---');
  }

  parts.push(`\n请你以自己的职能角度发表意见。${currentRound > 1 ? '你可以回应之前的发言。' : ''}`);

  return parts.join('\n');
}

/**
 * 构建总结 prompt
 * @private
 */
function buildSummaryPrompt(topic, transcript, regimeId) {
  const parts = [`请总结以下廷议：\n`];
  parts.push(`议题: ${topic}\n`);

  for (const entry of transcript) {
    parts.push(`[${entry.name}] (第${entry.round}轮): ${entry.speech}`);
  }

  parts.push(`\n请用以下格式总结：`);
  parts.push(`1. 【共识】各方一致同意的观点`);
  parts.push(`2. 【争议】存在分歧的焦点`);
  parts.push(`3. 【建议】综合各方意见给出的建议方案`);

  return parts.join('\n');
}

/** @private */
function numToChinese(n) {
  const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return map[n] || n;
}

module.exports = { runDebate };
