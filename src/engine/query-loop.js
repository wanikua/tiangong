/**
 * 核心引擎 — 对话循环
 *
 * 天子下旨 → 中书省起草 → 门下省审核 → 尚书省执行 → 结果回奏
 */

const chalk = require('chalk');
const { generatePlan } = require('../zhongshu/planner');
const { PermissionGate } = require('../menxia/permission-gate');
const { Dispatcher } = require('../shangshu/dispatcher');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { loadConfig } = require('../config/setup');
const { DEFAULT_REGIME, DEFAULT_MAX_BUDGET_USD } = require('../config/defaults');

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

  console.log(chalk.gray(`\n制度: ${regimeId} | 模型: ${model || '(默认)'}\n`));

  // ── 中书省：起草执行计划 ──
  console.log(chalk.yellow('📜 中书省起草执行计划...\n'));
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

  // ── 门下省：审核权限 ──
  console.log(chalk.blue('🛡️ 门下省审核中...\n'));
  const gate = new PermissionGate(regimeId);

  for (let i = 1; i < plan.steps.length; i++) {
    const step = plan.steps[i];
    const caller = plan.steps[0].agent;
    const check = gate.checkAgentCall(caller, step.agent);
    if (!check.allowed) {
      console.log(chalk.red(`❌ 门下省驳回: ${check.reason}`));
      return;
    }
  }
  console.log(chalk.green('✅ 门下省准奏\n'));

  // ── 尚书省：调度六部执行 ──
  console.log(chalk.magenta('⚔️ 尚书省调度六部执行...\n'));

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
    console.log(chalk.green('🏛️ 全部完成，回奏天子。\n'));
  } else {
    for (const [stepId, stepResult] of Object.entries(result.results)) {
      if (stepResult.status === 'failed') {
        console.log(chalk.red(`步骤 #${stepId} 失败: ${stepResult.error}`));
      } else if (stepResult.output?.content) {
        console.log(chalk.white(stepResult.output.content));
      }
    }
    console.log(chalk.yellow('\n⚠️ 部分步骤失败，请天子过目。\n'));
  }

  // 户部报账
  const cost = costTracker.getSummary();
  console.log(chalk.gray(`💰 户部: ${cost.total.totalCostUsd} USD | ${cost.total.inputTokens} in / ${cost.total.outputTokens} out`));
  if (verbose) {
    console.log(chalk.gray(JSON.stringify(cost.perAgent, null, 2)));
  }
}

module.exports = { startSession };
