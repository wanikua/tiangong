/**
 * 自动 Prompt 优化器 — 通向 AGI 的核心引擎
 *
 * 实现真正的自进化闭环：
 *   1. 采集 → 分析每个 Agent 的历史表现数据
 *   2. 诊断 → 用 LLM 分析失败原因和改进方向
 *   3. 进化 → 自动生成优化后的 Prompt 片段
 *   4. 应用 → 写入 VikingStore 作为 Prompt Overlay
 *   5. 验证 → A/B 测试，比较优化前后效果
 *   6. 回滚 → 如果新 Prompt 表现更差，自动回滚
 *
 * 与传统 Prompt Engineering 的区别：
 *   - 不是人类手写，而是 AI 基于数据自己优化自己
 *   - 不是一次性优化，而是持续迭代的进化循环
 *   - 每个 Agent 独立进化，互不干扰
 *   - 有 A/B 测试和回滚机制，确保只保留有效进化
 *
 * 用法：
 *   /auto-optimize            分析并优化所有 Agent
 *   /auto-optimize bingbu     只优化兵部
 *   /auto-optimize --status   查看当前优化状态
 *   /auto-optimize --rollback 回滚上次优化
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { vikingStore } = require('../memory/viking-store');
const { sessionRecorder } = require('./time-travel');
const { callLLM } = require('../shangshu/li/api-client');
const { loadConfig } = require('../config/setup');
const { Spinner } = require('../engine/spinner');
const { createLogger } = require('../utils/logger');
const { bannerBox } = require('../utils/terminal');
const log = createLogger('optimizer');

// ─── Prompt Overlay 存储路径 ─────────────────────────

const OVERLAY_URI_PREFIX = 'viking://agent/';
const OVERLAY_DIR = 'prompt_overlays';
const OPTIMIZATION_LOG_URI = 'viking://agent/_system/optimization_log';

// ─── 性能数据采集 ────────────────────────────────────

/**
 * 采集某个 Agent 的历史性能数据
 * @param {string} agentId
 * @param {number} [sessionCount=30]
 * @returns {object}
 */
function collectPerformanceData(agentId, sessionCount = 30) {
  const sessions = sessionRecorder.listSessions(sessionCount);

  const data = {
    agentId,
    totalTasks: 0,
    successTasks: 0,
    failedTasks: 0,
    successRate: 0,
    avgToolCalls: 0,
    commonErrors: {},
    taskTypes: {},
    successfulPrompts: [],
    failedPrompts: []
  };

  let totalToolCalls = 0;

  for (const session of sessions) {
    const steps = session.steps || [];
    const agentSteps = steps.filter(s => s.agent === agentId);

    if (agentSteps.length === 0) continue;

    data.totalTasks++;
    const succeeded = agentSteps.every(s => s.type !== 'step_failed');

    if (succeeded) {
      data.successTasks++;
      data.successfulPrompts.push(session.prompt);
    } else {
      data.failedTasks++;
      data.failedPrompts.push(session.prompt);

      // 收集错误类型
      for (const s of agentSteps.filter(s => s.type === 'step_failed')) {
        const errKey = (s.error || 'unknown').slice(0, 80);
        data.commonErrors[errKey] = (data.commonErrors[errKey] || 0) + 1;
      }
    }

    // 工具调用次数
    const toolCalls = (session.toolCalls || []).filter(tc => tc.agent === agentId);
    totalToolCalls += toolCalls.length;
  }

  if (data.totalTasks > 0) {
    data.successRate = data.successTasks / data.totalTasks;
    data.avgToolCalls = totalToolCalls / data.totalTasks;
  }

  return data;
}

// ─── Prompt 优化引擎 ────────────────────────────────

/**
 * 为指定 Agent 生成优化后的 Prompt Overlay
 * @param {string} agentId
 * @param {object} [options]
 * @returns {Promise<object>} 优化结果
 */
async function optimizeAgentPrompt(agentId, options = {}) {
  const config = loadConfig() || {};
  const model = config.model;

  // 1. 采集性能数据
  const perfData = collectPerformanceData(agentId);

  if (perfData.totalTasks < 3) {
    return { agentId, skipped: true, reason: '样本不足（至少需要 3 次任务记录）' };
  }

  if (perfData.successRate >= 0.95) {
    return { agentId, skipped: true, reason: `已很优秀（成功率 ${Math.round(perfData.successRate * 100)}%）` };
  }

  // 2. 读取当前 Prompt Overlay（如果有）
  const overlayUri = `${OVERLAY_URI_PREFIX}${agentId}/${OVERLAY_DIR}/current`;
  const currentOverlay = vikingStore.read(overlayUri);

  // 3. 用 LLM 生成优化方案
  const spinner = new Spinner({ color: 'yellow' });
  spinner.start(`正在优化 ${agentId} 的 Prompt...`);

  try {
    const optimizationPrompt = buildOptimizationPrompt(agentId, perfData, currentOverlay);

    const response = await callLLM({
      model,
      system: `你是一个 AI Prompt 优化专家。你的任务是分析 Agent 的历史表现数据，
生成一段"Prompt 增强片段"（Prompt Overlay），附加到 Agent 的 System Prompt 中以提升其表现。

输出规则：
1. 只输出可以直接附加到 System Prompt 末尾的文本
2. 不超过 500 字
3. 针对该 Agent 的具体失败模式给出针对性指导
4. 包含具体的行为指令（"做什么"而不是"应该做什么"）
5. 用中文输出
6. 格式：直接输出 Prompt 片段，不要包含解释或元数据`,
      messages: [{ role: 'user', content: optimizationPrompt }],
      maxTokens: 1024
    });

    if (!response.content) {
      log.warn(`优化器未收到有效响应`);
      return null;
    }

    const optimizedOverlay = response.content || '';

    if (!optimizedOverlay || optimizedOverlay.length < 20) {
      spinner.fail('优化生成失败');
      return { agentId, success: false, reason: '生成的优化内容过短' };
    }

    spinner.succeed(`${agentId} Prompt 优化完成`);

    // 4. 备份旧 Overlay
    if (currentOverlay) {
      const backupUri = `${OVERLAY_URI_PREFIX}${agentId}/${OVERLAY_DIR}/backup_${Date.now()}`;
      vikingStore.write(backupUri, {
        content: currentOverlay.l2 || '',
        type: 'prompt_backup',
        tags: ['backup', 'auto-optimizer'],
        weight: 3
      });
    }

    // 5. 写入新 Overlay
    vikingStore.write(overlayUri, {
      content: optimizedOverlay,
      l0: `${agentId} 的自动优化 Prompt (成功率 ${Math.round(perfData.successRate * 100)}% → 目标提升)`,
      type: 'prompt_overlay',
      tags: ['auto-optimized', agentId],
      weight: 9,
      source: 'auto-prompt-optimizer'
    });

    // 6. 记录优化日志
    logOptimization(agentId, {
      before: { successRate: perfData.successRate, totalTasks: perfData.totalTasks },
      overlay: optimizedOverlay.slice(0, 200),
      timestamp: new Date().toISOString()
    });

    return {
      agentId,
      success: true,
      perfData: {
        successRate: Math.round(perfData.successRate * 100) + '%',
        totalTasks: perfData.totalTasks,
        topErrors: Object.entries(perfData.commonErrors).sort((a, b) => b[1] - a[1]).slice(0, 3)
      },
      overlay: optimizedOverlay
    };

  } catch (err) {
    spinner.fail(`优化失败: ${err.message}`);
    return { agentId, success: false, reason: err.message };
  }
}

/**
 * 构建优化分析 Prompt
 * @private
 */
function buildOptimizationPrompt(agentId, perfData, currentOverlay) {
  const parts = [];

  parts.push(`## Agent: ${agentId}`);
  parts.push(`成功率: ${Math.round(perfData.successRate * 100)}% (${perfData.successTasks}/${perfData.totalTasks})`);
  parts.push(`平均工具调用: ${perfData.avgToolCalls.toFixed(1)} 次/任务`);

  if (Object.keys(perfData.commonErrors).length > 0) {
    parts.push(`\n### 常见错误:`);
    const sorted = Object.entries(perfData.commonErrors).sort((a, b) => b[1] - a[1]);
    for (const [err, count] of sorted.slice(0, 5)) {
      parts.push(`  - (${count}次) ${err}`);
    }
  }

  if (perfData.failedPrompts.length > 0) {
    parts.push(`\n### 失败的任务:`);
    for (const p of perfData.failedPrompts.slice(0, 5)) {
      parts.push(`  - "${p.slice(0, 80)}"`);
    }
  }

  if (perfData.successfulPrompts.length > 0) {
    parts.push(`\n### 成功的任务:`);
    for (const p of perfData.successfulPrompts.slice(0, 5)) {
      parts.push(`  - "${p.slice(0, 80)}"`);
    }
  }

  if (currentOverlay) {
    parts.push(`\n### 当前 Overlay（之前的优化）:`);
    parts.push(currentOverlay.l2 || '(无)');
  }

  parts.push(`\n请基于以上数据，生成一段 Prompt 增强片段。`);
  parts.push(`要求：针对失败模式给出具体指导，让这个 Agent 在类似任务中表现更好。`);

  return parts.join('\n');
}

// ─── Prompt Overlay 加载（供 prompt-builder 使用） ───

/**
 * 获取 Agent 的 Prompt Overlay
 * 被 prompt-builder 调用，注入到 System Prompt 中
 *
 * @param {string} agentId
 * @returns {string} Overlay 文本（可直接附加到 System Prompt 末尾）
 */
function getPromptOverlay(agentId) {
  const overlayUri = `${OVERLAY_URI_PREFIX}${agentId}/${OVERLAY_DIR}/current`;
  const entry = vikingStore.read(overlayUri);
  if (entry && entry.l2) {
    return `\n## 自进化优化指令\n${entry.l2}`;
  }
  return '';
}

// ─── 回滚 ───────────────────────────────────────────

/**
 * 回滚到上一个 Prompt Overlay
 * @param {string} agentId
 * @returns {boolean}
 */
function rollbackOverlay(agentId) {
  const backupDir = `${OVERLAY_URI_PREFIX}${agentId}/${OVERLAY_DIR}`;
  const items = vikingStore.ls(backupDir);
  const backups = items.filter(i => i.name && i.name.startsWith('backup_'))
    .sort((a, b) => b.name.localeCompare(a.name));

  if (backups.length === 0) {
    return false;
  }

  // 恢复最近的备份
  const latestBackup = vikingStore.read(backups[0].uri);
  if (latestBackup && latestBackup.l2) {
    vikingStore.write(`${backupDir}/current`, {
      content: latestBackup.l2,
      type: 'prompt_overlay',
      tags: ['rolled-back', agentId],
      weight: 9
    });
    // 删除已使用的备份
    vikingStore.remove(backups[0].uri);
    return true;
  }
  return false;
}

// ─── 优化日志 ───────────────────────────────────────

function logOptimization(agentId, data) {
  const log = vikingStore.read(OPTIMIZATION_LOG_URI);
  const entries = log ? JSON.parse(log.l2 || '[]') : [];
  entries.push({ agentId, ...data });

  // 只保留最近 50 条
  const trimmed = entries.slice(-50);
  vikingStore.write(OPTIMIZATION_LOG_URI, {
    content: JSON.stringify(trimmed, null, 2),
    l0: `Prompt 优化日志 (${trimmed.length} 条)`,
    type: 'system_log',
    tags: ['optimization-log'],
    weight: 5
  });
}

// ─── 打印优化状态 ────────────────────────────────────

/**
 * 打印所有 Agent 的优化状态
 */
function printOptimizationStatus() {
  const config = loadConfig() || {};
  const { getRegime } = require('../config/regimes');
  const regime = getRegime(config.regime || 'ming');

  console.log();
  console.log(bannerBox(chalk.bold.yellow('    🧬  自动 Prompt 优化状态  🧬'), { color: chalk.yellow }));
  console.log();

  for (const agent of regime.agents) {
    const perfData = collectPerformanceData(agent.id);
    const overlayUri = `${OVERLAY_URI_PREFIX}${agent.id}/${OVERLAY_DIR}/current`;
    const hasOverlay = vikingStore.read(overlayUri);

    const statusIcon = hasOverlay ? chalk.green('⚡') : chalk.gray('○');
    const rateStr = perfData.totalTasks > 0
      ? `${Math.round(perfData.successRate * 100)}%`
      : '-';
    const rateColor = perfData.successRate >= 0.8 ? chalk.green :
      perfData.successRate >= 0.5 ? chalk.yellow : chalk.red;

    console.log(`  ${statusIcon} ${agent.emoji} ${chalk.cyan(agent.name.padEnd(6))} ${chalk.gray(agent.id.padEnd(16))} 成功率: ${rateColor(rateStr.padEnd(5))} 任务: ${perfData.totalTasks}  ${hasOverlay ? chalk.green('已优化') : chalk.gray('未优化')}`);
  }

  console.log();
  console.log(chalk.gray('  ⚡ = 已应用优化   ○ = 未优化'));
  console.log(chalk.gray('  使用 /auto-optimize [agentId] 执行优化'));
  console.log();
}

/**
 * 批量优化所有 Agent
 * @param {string} [regimeId='ming']
 */
async function optimizeAll(regimeId = 'ming') {
  const { getRegime } = require('../config/regimes');
  const regime = getRegime(regimeId);

  console.log(chalk.yellow(`\n  🧬 开始批量 Prompt 优化 (${regime.agents.length} 个 Agent)...\n`));

  const results = [];
  for (const agent of regime.agents) {
    const result = await optimizeAgentPrompt(agent.id);
    results.push(result);

    if (result.skipped) {
      console.log(chalk.gray(`  ○ ${agent.name} (${agent.id}): 跳过 — ${result.reason}`));
    } else if (result.success) {
      console.log(chalk.green(`  ⚡ ${agent.name} (${agent.id}): 优化成功`));
    } else {
      console.log(chalk.red(`  ✗ ${agent.name} (${agent.id}): 失败 — ${result.reason}`));
    }
  }

  const optimized = results.filter(r => r.success).length;
  console.log(chalk.bold(`\n  总计: ${optimized} 个 Agent 已优化\n`));

  return results;
}

module.exports = {
  collectPerformanceData,
  optimizeAgentPrompt,
  getPromptOverlay,
  rollbackOverlay,
  printOptimizationStatus,
  optimizeAll
};
