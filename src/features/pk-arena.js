/**
 * 武举殿试 — Agent PK 擂台
 *
 * Claude Code 没有的独创功能：
 * 让两个（或多个）Agent 对同一个任务各自独立完成，
 * 然后由用户（天子）或另一个 Agent（主考官）评判高下。
 *
 * 场景：
 *  - 代码方案 PK：兵部 vs 工部，谁写得更好？
 *  - 文案 PK：礼部 vs 翰林院，谁更有文采？
 *  - 架构 PK：不同 Agent 提出不同架构方案
 *
 * 用法：
 *   /pk bingbu gongbu "写一个 HTTP 服务器"
 *   /pk --judge duchayuan  bingbu gongbu "实现排序算法"
 */

const chalk = require('chalk');
const { Dispatcher } = require('../shangshu/dispatcher');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { loadConfig } = require('../config/setup');
const { getRegime } = require('../config/regimes');
const { Spinner } = require('../engine/spinner');

/**
 * PK 结果展示
 */
const PK_BANNER = () => `
${chalk.red('  ╔══════════════════════════════════════════════════════╗')}
${chalk.red('  ║')}    ${chalk.bold.yellow('⚔️  武 举 殿 试  ⚔️')}    ${chalk.gray('Agent PK Arena')}           ${chalk.red('║')}
${chalk.red('  ╚══════════════════════════════════════════════════════╝')}
`;

/**
 * 运行 PK 对决
 * @param {object} params
 * @param {string} params.prompt - 题目
 * @param {string[]} params.contestants - 参赛 Agent ID 列表
 * @param {string} [params.judgeId] - 评判 Agent ID（如不指定则由用户评判）
 * @param {string} [params.regimeId] - 制度
 * @returns {Promise<object>} PK 结果
 */
async function runPK(params) {
  const { prompt, contestants, judgeId, regimeId = 'ming' } = params;
  const config = loadConfig() || {};
  const regime = getRegime(regimeId);

  console.log(PK_BANNER());
  console.log(chalk.white(`  题目: ${chalk.bold(prompt)}\n`));
  console.log(chalk.white(`  参赛者: ${contestants.map(c => chalk.cyan(c)).join(' vs ')}`));
  if (judgeId) {
    console.log(chalk.white(`  主考官: ${chalk.yellow(judgeId)}`));
  }
  console.log();

  const results = {};
  const costTracker = new CostTracker();

  // 每个 Agent 独立完成任务
  for (let i = 0; i < contestants.length; i++) {
    const agentId = contestants[i];
    const agent = regime.agents.find(a => a.id === agentId);
    const name = agent ? agent.name : agentId;

    console.log(chalk.yellow(`  ─── 第${numToChinese(i + 1)}位: ${name} (${agentId}) ───\n`));

    const spinner = new Spinner({ color: 'cyan' });
    spinner.start(`${name} 正在答题...`);

    try {
      const dispatcher = new Dispatcher({
        regimeId,
        model: config.model,
        costTracker,
        cwd: process.cwd(),
        verbose: false,
        onProgress: (event) => {
          if (event.type === 'tool_call') {
            spinner.update(`${name} 答题中... [${event.tool}]`);
          }
        }
      });

      // 构建单步计划
      const plan = {
        prompt,
        regime: regimeId,
        steps: [{
          id: 1,
          agent: agentId,
          task: 'pk_answer',
          description: prompt,
          input: prompt
        }]
      };

      const result = await dispatcher.executePlan(plan);
      const firstResult = Object.values(result.results)[0];
      const output = firstResult?.output?.content || '(无输出)';

      spinner.succeed(`${name} 答题完成`);
      results[agentId] = { output, success: true, name };

      // 展示答案（折叠显示）
      console.log(chalk.gray(`  ┌─ ${name}的答案 ────────────────────────────`));
      const lines = output.split('\n').slice(0, 30); // 最多显示30行
      for (const line of lines) {
        console.log(chalk.gray('  │ ') + chalk.white(line));
      }
      if (output.split('\n').length > 30) {
        console.log(chalk.gray('  │ ') + chalk.gray(`... (还有 ${output.split('\n').length - 30} 行)`));
      }
      console.log(chalk.gray('  └──────────────────────────────────────────────'));
      console.log();

    } catch (err) {
      spinner.fail(`${name} 答题失败: ${err.message}`);
      results[agentId] = { output: null, success: false, error: err.message, name };
    }
  }

  // ── 评判 ──
  console.log(chalk.yellow('  ═══════════════════════════════════════════════'));
  console.log(chalk.bold.yellow('  📜 评 判 环 节'));
  console.log(chalk.yellow('  ═══════════════════════════════════════════════\n'));

  if (judgeId) {
    // AI 评判
    console.log(chalk.gray(`  主考官 ${judgeId} 正在审阅...\n`));

    const judgePrompt = buildJudgePrompt(prompt, results);
    const dispatcher = new Dispatcher({
      regimeId,
      model: config.model,
      costTracker,
      cwd: process.cwd(),
      verbose: false,
      onProgress: () => {}
    });

    const judgePlan = {
      prompt: judgePrompt,
      regime: regimeId,
      steps: [{
        id: 1,
        agent: judgeId,
        task: 'judge',
        description: '评判 PK 结果',
        input: judgePrompt
      }]
    };

    try {
      const judgeResult = await dispatcher.executePlan(judgePlan);
      const judgeFirstResult = Object.values(judgeResult.results)[0];
      const verdict = judgeFirstResult?.output?.content || '(评判无输出)';

      console.log(chalk.yellow('  主考官评语:'));
      console.log();
      for (const line of verdict.split('\n')) {
        console.log(chalk.white(`  ${line}`));
      }
      console.log();
    } catch (err) {
      console.log(chalk.red(`  主考官评判失败: ${err.message}`));
    }
  } else {
    // 用户评判
    console.log(chalk.white('  请天子御览以上答案，自行裁定胜负。'));
    console.log(chalk.gray('  提示: 可以用 /pk --judge duchayuan 指定 AI 主考官'));
  }

  // 费用汇总
  const cost = costTracker.getSummary();
  console.log(chalk.gray(`\n  ⚡ 殿试消耗: ${cost.total.inputTokens + cost.total.outputTokens} tokens`));

  return { results, cost };
}

/**
 * 构建评判 Prompt
 * @private
 */
function buildJudgePrompt(task, results) {
  const parts = [`你是科举主考官。以下是各位考生对同一题目的答案。请公正评判：\n`];
  parts.push(`题目: ${task}\n`);

  for (const [agentId, result] of Object.entries(results)) {
    if (result.success) {
      parts.push(`\n--- ${result.name} (${agentId}) 的答案 ---`);
      parts.push(result.output);
    } else {
      parts.push(`\n--- ${result.name} (${agentId}) 未完成答题 ---`);
    }
  }

  parts.push(`\n请从以下维度评判并排名：`);
  parts.push(`1. 正确性 — 答案是否正确`);
  parts.push(`2. 代码质量 — 可读性、健壮性、最佳实践`);
  parts.push(`3. 创新性 — 有无巧妙的思路`);
  parts.push(`4. 完整性 — 是否考虑了边界情况`);
  parts.push(`\n最后给出排名和总评。`);

  return parts.join('\n');
}

/** @private 数字转中文 */
function numToChinese(n) {
  const map = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
  return map[n] || n;
}

module.exports = { runPK };
