/**
 * 朝代更迭 — 智能制度自适应
 *
 * 闻所未闻的功能：
 * 根据项目阶段和任务特点，自动推荐最适合的制度，
 * 甚至可以自动切换。
 *
 * 原理：
 *   - 项目初期/快速原型 → 明制（集权高效，快速迭代）
 *   - 需要严格审核的阶段 → 唐制（三权制衡，封驳防错）
 *   - 国际化团队/商业项目 → 现代制（扁平高效）
 *   - 大量编码任务 → 明制
 *   - 大量审查/合规任务 → 唐制
 *   - 混合任务 → 根据比例推荐
 *
 * 还可以检测"制度疲劳"——如果在某个制度下频繁失败，
 * 会建议更换制度试试。
 *
 * 用法：
 *   /evolve           分析并推荐最优制度
 *   /evolve --auto     自动切换到推荐的制度
 *   /evolve --history  查看制度变迁历史
 */

const chalk = require('chalk');
const { sessionRecorder } = require('./time-travel');
const { memoryStore } = require('../memory/store');

/**
 * 制度特长分析
 */
const REGIME_STRENGTHS = {
  ming: {
    name: '🏮 明朝内阁制',
    strengths: ['快速开发', '原型验证', '独立编码', '小型任务'],
    weaknesses: ['缺乏审核', '安全隐患'],
    bestFor: /写|编|实现|开发|创建|快速|原型|小/i,
    taskTypeAffinity: { coding: 0.9, devops: 0.7, writing: 0.8, management: 0.5, review: 0.3 },
    failureThreshold: 3  // 连续N次失败建议切换
  },
  tang: {
    name: '🐉 唐朝三省制',
    strengths: ['严格审核', '安全检查', '代码质量', '大型项目'],
    weaknesses: ['速度较慢', '流程繁琐'],
    bestFor: /审查|安全|重构|大型|review|检查|合规|质量/i,
    taskTypeAffinity: { review: 0.95, coding: 0.6, devops: 0.8, legal: 0.9, management: 0.7 },
    failureThreshold: 4
  },
  modern: {
    name: '🏢 现代企业制',
    strengths: ['国际化', '多领域协作', '商业项目', '数据分析'],
    weaknesses: ['古风不足（笑）'],
    bestFor: /分析|报告|市场|国际|英文|商业|数据|策略/i,
    taskTypeAffinity: { finance: 0.9, marketing: 0.95, management: 0.8, coding: 0.7, legal: 0.8 },
    failureThreshold: 3
  }
};

/**
 * 分析并推荐最优制度
 * @param {object} params
 * @param {string} [params.currentRegime] - 当前制度
 * @param {string} [params.cwd] - 项目目录
 * @returns {object} 推荐结果
 */
function analyzeAndRecommend(params = {}) {
  const currentRegime = params.currentRegime || 'ming';

  console.log();
  console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('  ║') + chalk.bold.yellow('    👑  朝代更迭分析  👑') + chalk.gray('    Regime Evolution') + '       ' + chalk.yellow('║'));
  console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
  console.log();
  console.log(`  当前制度: ${chalk.cyan(REGIME_STRENGTHS[currentRegime]?.name || currentRegime)}`);
  console.log();

  const scores = {};
  const reasons = {};

  // ── 1. 基于历史任务类型分析 ──
  const sessions = sessionRecorder.listSessions(30);

  const taskTypeCount = {};
  let totalTasks = 0;
  let failCount = {};

  for (const s of sessions) {
    totalTasks++;
    const regime = s.regime || 'ming';
    if (s.success === false) {
      failCount[regime] = (failCount[regime] || 0) + 1;
    }

    // 简单的关键词分类
    const prompt = s.prompt || '';
    if (/写|编|实现|开发|code|bug|fix/i.test(prompt)) taskTypeCount['coding'] = (taskTypeCount['coding'] || 0) + 1;
    if (/审查|review|检查/i.test(prompt)) taskTypeCount['review'] = (taskTypeCount['review'] || 0) + 1;
    if (/部署|运维|docker|deploy/i.test(prompt)) taskTypeCount['devops'] = (taskTypeCount['devops'] || 0) + 1;
    if (/分析|报告|数据/i.test(prompt)) taskTypeCount['finance'] = (taskTypeCount['finance'] || 0) + 1;
    if (/营销|品牌|文案/i.test(prompt)) taskTypeCount['marketing'] = (taskTypeCount['marketing'] || 0) + 1;
  }

  // 计算每个制度的适配度得分
  for (const [regimeId, regime] of Object.entries(REGIME_STRENGTHS)) {
    let score = 50; // 基础分
    const regimeReasons = [];

    // 任务类型适配度
    for (const [taskType, count] of Object.entries(taskTypeCount)) {
      const affinity = regime.taskTypeAffinity[taskType] || 0.5;
      score += count * affinity * 5;
    }

    // 最近使用的制度有加分（稳定性）
    if (regimeId === currentRegime) {
      score += 10;
      regimeReasons.push('当前制度，切换有成本');
    }

    // 制度疲劳检测
    if (failCount[regimeId] >= regime.failureThreshold) {
      score -= 30;
      regimeReasons.push(`⚠️ 在该制度下失败 ${failCount[regimeId]} 次，可能存在制度疲劳`);
    }

    // 如果主要是编码任务
    if ((taskTypeCount['coding'] || 0) > totalTasks * 0.6) {
      if (regimeId === 'ming') {
        score += 20;
        regimeReasons.push('编码密集型项目，明制快速迭代更高效');
      }
    }

    // 如果有审查需求
    if ((taskTypeCount['review'] || 0) > 0) {
      if (regimeId === 'tang') {
        score += 15;
        regimeReasons.push('有审查需求，唐制三权制衡更可靠');
      }
    }

    // 如果有商业/分析任务
    if ((taskTypeCount['finance'] || 0) + (taskTypeCount['marketing'] || 0) > totalTasks * 0.3) {
      if (regimeId === 'modern') {
        score += 20;
        regimeReasons.push('商业分析任务多，现代制更适合');
      }
    }

    scores[regimeId] = Math.round(score);
    reasons[regimeId] = regimeReasons;
  }

  // ── 展示分析结果 ──

  // 任务分布
  if (totalTasks > 0) {
    console.log(chalk.bold('  📊 最近任务分布:'));
    for (const [type, count] of Object.entries(taskTypeCount).sort((a, b) => b[1] - a[1])) {
      const barLen = Math.round(count / totalTasks * 20);
      console.log(`    ${chalk.white(type.padEnd(12))} ${chalk.cyan('█'.repeat(barLen))} ${count}`);
    }
    console.log();
  }

  // 制度评分
  const sortedRegimes = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const recommended = sortedRegimes[0][0];

  console.log(chalk.bold('  🏆 制度适配度评分:\n'));

  for (const [regimeId, score] of sortedRegimes) {
    const regime = REGIME_STRENGTHS[regimeId];
    const isCurrent = regimeId === currentRegime;
    const isRecommended = regimeId === recommended;
    const barLen = 25;
    const filled = Math.round(Math.min(score / 150, 1) * barLen);
    const barColor = isRecommended ? chalk.green : chalk.gray;

    const label = isRecommended ? chalk.green.bold(' ★ 推荐') : isCurrent ? chalk.yellow(' ← 当前') : '';

    console.log(`    ${regime.name} ${label}`);
    console.log(`      ${barColor('█'.repeat(filled))}${chalk.gray('░'.repeat(barLen - filled))} ${score} 分`);
    console.log(`      ${chalk.gray('优势: ' + regime.strengths.join(', '))}`);

    if (reasons[regimeId].length > 0) {
      for (const reason of reasons[regimeId]) {
        console.log(`      ${chalk.gray('→ ' + reason)}`);
      }
    }
    console.log();
  }

  // 推荐建议
  if (recommended !== currentRegime) {
    console.log(chalk.green.bold(`  💡 建议: 从 ${REGIME_STRENGTHS[currentRegime].name} 切换到 ${REGIME_STRENGTHS[recommended].name}`));
    console.log(chalk.gray(`     执行: /regime ${recommended}`));
  } else {
    console.log(chalk.green('  ✓ 当前制度适配度最高，无需切换。'));
  }

  // 失败警告
  for (const [regimeId, count] of Object.entries(failCount)) {
    if (count >= REGIME_STRENGTHS[regimeId]?.failureThreshold) {
      console.log(chalk.yellow(`\n  ⚠️ 制度疲劳警告: ${REGIME_STRENGTHS[regimeId].name} 下最近失败 ${count} 次`));
      console.log(chalk.gray('     连续失败可能意味着当前制度不适合这类任务'));
    }
  }

  console.log();

  return {
    currentRegime,
    recommended,
    scores,
    reasons,
    shouldSwitch: recommended !== currentRegime
  };
}

module.exports = { analyzeAndRecommend, REGIME_STRENGTHS };
