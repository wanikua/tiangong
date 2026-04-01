/**
 * 核心引擎 — 对话循环
 *
 * 根据制度动态显示：
 * 明制：司礼监接旨 → 内阁优化 → 六部执行 → 都察院审查
 * 唐制：中书省起草 → 门下省审核 → 尚书省执行
 * 现代：CEO 决策 → CXO 分管 → 团队执行
 */

const chalk = require('chalk');
const { generatePlan } = require('../zhongshu/planner');
const { PermissionGate } = require('../menxia/permission-gate');
const { Dispatcher } = require('../shangshu/dispatcher');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { loadConfig } = require('../config/setup');
const { DEFAULT_REGIME, DEFAULT_MAX_BUDGET_USD } = require('../config/defaults');

// 各制度的显示名称
const REGIME_LABELS = {
  ming: {
    planning: { icon: '📜', name: '司礼监', verb: '接旨传令' },
    review:   { icon: '🛡️', name: '都察院', verb: '审查' },
    execute:  { icon: '⚔️', name: '六部', verb: '奉旨执行' },
    approve:  '内阁票拟通过',
    reject:   '都察院驳回',
    done:     '🏛️ 全部完成，回奏天子。',
    partial:  '⚠️ 部分步骤失败，请天子过目。'
  },
  tang: {
    planning: { icon: '📜', name: '中书省', verb: '起草执行计划' },
    review:   { icon: '🛡️', name: '门下省', verb: '审核' },
    execute:  { icon: '⚔️', name: '尚书省', verb: '调度六部执行' },
    approve:  '门下省准奏',
    reject:   '门下省驳回',
    done:     '🏛️ 全部完成，回奏天子。',
    partial:  '⚠️ 部分步骤失败，请天子过目。'
  },
  modern: {
    planning: { icon: '💼', name: 'CEO', verb: '制定战略' },
    review:   { icon: '✅', name: 'QA', verb: '质量审核' },
    execute:  { icon: '⚙️', name: 'Teams', verb: '团队执行' },
    approve:  'Approved',
    reject:   'Rejected',
    done:     '✅ All tasks completed.',
    partial:  '⚠️ Some tasks failed. Please review.'
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

  const L = REGIME_LABELS[regimeId] || REGIME_LABELS.ming;

  console.log(chalk.gray(`\n制度: ${regimeId} | 模型: ${model || '(默认)'}\n`));

  // ── 决策层：起草执行计划 ──
  console.log(chalk.yellow(`${L.planning.icon} ${L.planning.name}${L.planning.verb}...\n`));
  const plan = generatePlan(prompt, regimeId);

  if (verbose || options.dryRun) {
    console.log(chalk.gray('执行计划:'));
    for (const step of plan.steps) {
      const deps = step.dependencies ? ` (依赖: ${step.dependencies.join(',')})` : '';
      console.log(chalk.gray(`  #${step.id} [${step.agent}] ${step.description}${deps}`));
    }
    console.log();
  }

  if (options.dryRun) {
    console.log(chalk.yellow('(dry-run 模式，不实际执行)'));
    return;
  }

  // ── 审核层 ──
  console.log(chalk.blue(`${L.review.icon} ${L.review.name}${L.review.verb}中...\n`));
  const gate = new PermissionGate(regimeId);

  for (let i = 1; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const caller = plan.steps[0].agent;
    const check = gate.checkAgentCall(caller, step.agent);
    if (!check.allowed) {
      console.log(chalk.red(`❌ ${L.reject}: ${check.reason}`));
      return;
    }
  }
  console.log(chalk.green(`✅ ${L.approve}\n`));

  // ── 执行层 ──
  console.log(chalk.magenta(`${L.execute.icon} ${L.execute.name}${L.execute.verb}...\n`));

  const costTracker = new CostTracker(DEFAULT_MAX_BUDGET_USD);

  const dispatcher = new Dispatcher({
    regimeId,
    model,
    costTracker,
    cwd: process.cwd(),
    verbose,
    onProgress: (event) => {
      switch (event.type) {
        case 'step_start':
          console.log(chalk.cyan(`  → #${event.step} [${event.agent}] ${event.task}`));
          break;
        case 'step_complete':
          console.log(chalk.green(`  ✓ #${event.step} [${event.agent}] 完成`));
          break;
        case 'step_failed':
          console.log(chalk.red(`  ✗ #${event.step} [${event.agent}] 失败: ${event.error}`));
          break;
        case 'tool_call':
          if (verbose) {
            console.log(chalk.gray(`    🔧 [${event.agent}] ${event.tool}(${JSON.stringify(event.input).slice(0, 80)})`));
          }
          break;
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
        console.log(chalk.white(stepResult.output.content));
        console.log();
      }
    }
    console.log(chalk.green(`${L.done}\n`));
  } else {
    for (const [stepId, stepResult] of Object.entries(result.results)) {
      if (stepResult.status === 'failed') {
        console.log(chalk.red(`步骤 #${stepId} 失败: ${stepResult.error}`));
      } else if (stepResult.output?.content) {
        console.log(chalk.white(stepResult.output.content));
      }
    }
    console.log(chalk.yellow(`\n${L.partial}\n`));
  }

  // 户部报账
  const cost = costTracker.getSummary();
  console.log(chalk.gray(`💰 户部: ${cost.total.totalCostUsd} USD | ${cost.total.inputTokens} in / ${cost.total.outputTokens} out`));
  if (verbose) {
    console.log(chalk.gray(JSON.stringify(cost.perAgent, null, 2)));
  }
}

module.exports = { startSession };
