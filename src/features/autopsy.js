/**
 * 大理寺 — Agent 故障验尸报告
 *
 * Claude Code 没有的独创功能：
 * 当任务失败时，自动生成详细的故障分析报告，
 * 包含根因分析、影响范围、修复建议。
 *
 * 用法：
 *   /autopsy          分析最近一次失败
 *   /autopsy 3        分析第3号奏折的失败
 *   /autopsy --all    查看所有失败统计
 */

const chalk = require('chalk');
const { sessionRecorder } = require('./time-travel');
const { memoryStore } = require('../memory/store');
const { bannerBox } = require('../utils/terminal');

/**
 * 故障分类
 */
const FAILURE_CATEGORIES = {
  api_error: {
    name: 'API 错误',
    icon: '🌐',
    patterns: [/API \d{3}/, /API Key/, /api/i, /请求超时/, /ECONNREFUSED/],
    advice: '检查 API Key 配置和网络连接'
  },
  tool_error: {
    name: '工具执行失败',
    icon: '🔧',
    patterns: [/工具执行失败/, /未知工具/, /文件不存在/, /权限/],
    advice: '检查文件路径和权限'
  },
  security_block: {
    name: '安全拦截',
    icon: '🛡️',
    patterns: [/刑部/, /拦截/, /阻止/, /危险命令/],
    advice: '命令被安全策略拦截，请用更安全的替代方案'
  },
  budget_exceeded: {
    name: '超预算',
    icon: '💸',
    patterns: [/超预算/, /预算/],
    advice: '任务复杂度超出预算，考虑拆分任务或增加预算'
  },
  permission_denied: {
    name: '权限不足',
    icon: '🚫',
    patterns: [/无权/, /权限/, /驳回/],
    advice: '检查制度下的 Agent 调用权限配置'
  },
  timeout: {
    name: '超时',
    icon: '⏰',
    patterns: [/超时/, /timeout/i],
    advice: '任务耗时过长，考虑拆分或增加超时时间'
  },
  dependency_failed: {
    name: '依赖失败',
    icon: '🔗',
    patterns: [/依赖步骤/, /未完成/],
    advice: '前置步骤失败导致后续步骤无法执行'
  },
  unknown: {
    name: '未知错误',
    icon: '❓',
    patterns: [],
    advice: '请查看详细错误信息'
  }
};

/**
 * 生成验尸报告
 * @param {object} session - 会话记录
 * @returns {object} 验尸报告
 */
function generateAutopsy(session) {
  const report = {
    sessionId: session.id,
    prompt: session.prompt,
    time: session.startedAt,
    regime: session.regime,
    failedSteps: [],
    rootCause: null,
    category: null,
    cascadeEffect: [],
    recommendations: [],
    agentPerformance: {}
  };

  // 分析失败步骤
  const steps = session.steps || [];
  const failedStepEvents = steps.filter(s => s.type === 'step_failed');
  const successStepEvents = steps.filter(s => s.type === 'step_complete');

  for (const step of failedStepEvents) {
    const category = categorizeError(step.error || '');
    report.failedSteps.push({
      stepId: step.step,
      agent: step.agent,
      error: step.error,
      category: category.name,
      icon: category.icon
    });
  }

  // 根因分析：最早的失败通常是根因
  if (report.failedSteps.length > 0) {
    const firstFailure = report.failedSteps[0];
    report.rootCause = firstFailure;
    report.category = categorizeError(firstFailure.error || '');

    // 级联影响
    if (report.failedSteps.length > 1) {
      report.cascadeEffect = report.failedSteps.slice(1).map(f => ({
        agent: f.agent,
        likelyCausedBy: firstFailure.agent
      }));
    }
  }

  // Agent 表现统计
  const allAgents = new Set([
    ...failedStepEvents.map(s => s.agent),
    ...successStepEvents.map(s => s.agent)
  ]);

  for (const agentId of allAgents) {
    const succeeded = successStepEvents.filter(s => s.agent === agentId).length;
    const failed = failedStepEvents.filter(s => s.agent === agentId).length;
    report.agentPerformance[agentId] = {
      succeeded,
      failed,
      reliability: succeeded + failed > 0 ? succeeded / (succeeded + failed) : 0
    };
  }

  // 修复建议
  if (report.category) {
    report.recommendations.push(report.category.advice);
  }

  // 基于历史记忆的建议
  if (report.rootCause) {
    try {
      const agentMemories = memoryStore.recallAgentMemory(report.rootCause.agent, {
        type: 'mistake',
        limit: 5
      });
      if (agentMemories.length > 0) {
        report.recommendations.push(`${report.rootCause.agent} 历史教训: ${agentMemories[0].content}`);
      }
    } catch { /* agent ID 可能是中文名，跳过记忆查询 */ }
  }

  return report;
}

/**
 * 分类错误
 * @private
 */
function categorizeError(errorMsg) {
  for (const [key, cat] of Object.entries(FAILURE_CATEGORIES)) {
    if (key === 'unknown') continue;
    if (cat.patterns.some(p => p.test(errorMsg))) {
      return cat;
    }
  }
  return FAILURE_CATEGORIES.unknown;
}

/**
 * 打印验尸报告
 * @param {number} [sessionIndex] - 会话序号（不传则取最近失败的）
 */
function printAutopsy(sessionIndex) {
  let session;

  if (sessionIndex) {
    session = sessionRecorder.getSession(sessionIndex);
  } else {
    // 找最近一次失败的会话
    const sessions = sessionRecorder.listSessions(20);
    session = sessions.find(s => s.success === false);
  }

  if (!session) {
    console.log(chalk.green('\n  恭喜！最近没有失败的奏折。大臣们干得不错。\n'));
    return;
  }

  const report = generateAutopsy(session);

  console.log();
  console.log(bannerBox(chalk.bold.red('    🔍  大理寺验尸报告  🔍'), { color: chalk.red }));
  console.log();

  console.log(`  ${chalk.white('旨意:')}   ${report.prompt}`);
  console.log(`  ${chalk.white('时间:')}   ${new Date(report.time).toLocaleString()}`);
  console.log(`  ${chalk.white('制度:')}   ${report.regime}`);
  console.log();

  // 根因分析
  if (report.rootCause) {
    console.log(chalk.bold.red('  🎯 根因分析:'));
    console.log(`    ${report.category.icon} ${chalk.red(report.category.name)}`);
    console.log(`    ${chalk.white('出错 Agent:')} ${chalk.cyan(report.rootCause.agent)}`);
    console.log(`    ${chalk.white('错误信息:')} ${chalk.red(report.rootCause.error)}`);
    console.log();
  }

  // 失败步骤
  if (report.failedSteps.length > 0) {
    console.log(chalk.bold.red('  📋 失败步骤:'));
    for (const step of report.failedSteps) {
      console.log(`    ${step.icon} ${chalk.red(`#${step.stepId}`)} [${chalk.cyan(step.agent)}] ${step.error}`);
    }
    console.log();
  }

  // 级联效应
  if (report.cascadeEffect.length > 0) {
    console.log(chalk.bold.yellow('  🔗 级联效应:'));
    for (const cascade of report.cascadeEffect) {
      console.log(`    ${chalk.cyan(cascade.agent)} 失败 ← 可能因为 ${chalk.red(cascade.likelyCausedBy)} 先失败`);
    }
    console.log();
  }

  // Agent 表现
  if (Object.keys(report.agentPerformance).length > 0) {
    console.log(chalk.bold('  📊 大臣表现:'));
    for (const [agentId, perf] of Object.entries(report.agentPerformance)) {
      const bar = perf.reliability >= 1 ? chalk.green('●') : perf.reliability > 0 ? chalk.yellow('●') : chalk.red('●');
      console.log(`    ${bar} ${chalk.cyan(agentId.padEnd(14))} 成功 ${perf.succeeded} / 失败 ${perf.failed}`);
    }
    console.log();
  }

  // 修复建议
  if (report.recommendations.length > 0) {
    console.log(chalk.bold.green('  💡 修复建议:'));
    for (let i = 0; i < report.recommendations.length; i++) {
      console.log(`    ${i + 1}. ${chalk.white(report.recommendations[i])}`);
    }
    console.log();
  }
}

/**
 * 打印失败统计总览
 */
function printFailureStats() {
  const sessions = sessionRecorder.listSessions(100);
  const failed = sessions.filter(s => s.success === false);

  console.log();
  console.log(chalk.bold('  📊 故障统计总览'));
  console.log(chalk.gray('  ─────────────────────────────'));
  console.log(`  总会话: ${sessions.length}  成功: ${chalk.green(sessions.length - failed.length)}  失败: ${chalk.red(failed.length)}`);
  console.log(`  成功率: ${sessions.length > 0 ? chalk.yellow(Math.round((sessions.length - failed.length) / sessions.length * 100) + '%') : '-'}`);

  // 按类别统计
  const categoryCount = {};
  for (const s of failed) {
    for (const step of s.steps.filter(st => st.type === 'step_failed')) {
      const cat = categorizeError(step.error || '');
      categoryCount[cat.name] = (categoryCount[cat.name] || 0) + 1;
    }
  }

  if (Object.keys(categoryCount).length > 0) {
    console.log(chalk.bold('\n  故障类别分布:'));
    const sorted = Object.entries(categoryCount).sort((a, b) => b[1] - a[1]);
    const max = sorted[0][1];
    for (const [cat, count] of sorted) {
      const barLen = Math.round(count / max * 20);
      console.log(`    ${chalk.white(cat.padEnd(12))} ${chalk.red('█'.repeat(barLen))} ${count}`);
    }
  }

  console.log();
}

module.exports = { generateAutopsy, printAutopsy, printFailureStats };
