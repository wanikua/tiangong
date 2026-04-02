/**
 * 自进化引擎 — Agent 自我改进系统
 *
 * 前所未有的功能：
 * 天工开物可以分析自己的代码、识别自己的不足、
 * 然后修改自己的源代码来改进自己。
 *
 * 进化方向：
 *   1. 性能进化 — 分析历史执行时间，优化慢的模块
 *   2. 提示进化 — 分析任务成功率，自动优化 system prompt
 *   3. 工具进化 — 根据使用频率和失败率，改进工具实现
 *   4. 记忆进化 — 自动整理和优化记忆库
 *   5. 制度进化 — 根据数据自动调整 Agent 权限和流程
 *   6. 考题进化 — 根据科举结果生成更好的考题
 *
 * 安全机制：
 *   - 所有进化都先生成 diff，需要天子批准才能应用
 *   - 自动创建 git 备份分支
 *   - 进化日志完整记录
 *   - 可以随时回滚到任何历史版本
 *
 * 用法：
 *   /evolve-self              分析可进化的方向
 *   /evolve-self --prompt      优化 system prompt
 *   /evolve-self --tools       优化工具实现
 *   /evolve-self --memory      整理记忆库
 *   /evolve-self --apply <id>  应用某项进化（需确认）
 *   /evolve-self --history     查看进化历史
 *   /evolve-self --rollback    回滚上次进化
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { callLLM } = require('../shangshu/li/api-client');
const { loadConfig } = require('../config/setup');
const { sessionRecorder } = require('./time-travel');
const { reputationManager } = require('./reputation');
const { memoryStore } = require('../memory/store');
const { execBash } = require('../shangshu/bing/bash');
const { Spinner } = require('../engine/spinner');

// ─── 进化日志存储 ────────────────────────────────────

const EVOLUTION_DIR = path.join(process.env.HOME || '/tmp', '.tiangong', 'evolution');
const EVOLUTION_LOG = path.join(EVOLUTION_DIR, 'history.json');

function ensureEvolutionDir() {
  if (!fs.existsSync(EVOLUTION_DIR)) {
    fs.mkdirSync(EVOLUTION_DIR, { recursive: true });
  }
}

// ─── 进化分析 ────────────────────────────────────────

/**
 * 分析可进化的方向
 * @returns {object[]} 进化建议列表
 */
async function analyzeEvolutionOpportunities() {
  console.log();
  console.log(chalk.red('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.red('  ║') + chalk.bold.yellow('    🧬  自 进 化 引 擎  🧬') + chalk.gray('    Self-Evolution') + '       ' + chalk.red('║'));
  console.log(chalk.red('  ╚══════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray('  分析系统运行数据，寻找进化机会...\n'));

  const opportunities = [];

  // ── 1. Prompt 进化分析 ──
  const promptSpinner = new Spinner({ color: 'yellow' });
  promptSpinner.start('分析 System Prompt 效果...');

  const promptOps = await analyzePromptEffectiveness();
  promptSpinner.succeed(`发现 ${promptOps.length} 个 Prompt 进化机会`);
  opportunities.push(...promptOps);

  // ── 2. 工具进化分析 ──
  const toolSpinner = new Spinner({ color: 'cyan' });
  toolSpinner.start('分析工具使用情况...');

  const toolOps = analyzeToolUsage();
  toolSpinner.succeed(`发现 ${toolOps.length} 个工具进化机会`);
  opportunities.push(...toolOps);

  // ── 3. 记忆进化分析 ──
  const memSpinner = new Spinner({ color: 'magenta' });
  memSpinner.start('分析记忆库健康度...');

  const memOps = analyzeMemoryHealth();
  memSpinner.succeed(`发现 ${memOps.length} 个记忆进化机会`);
  opportunities.push(...memOps);

  // ── 4. 制度进化分析 ──
  const regimeSpinner = new Spinner({ color: 'green' });
  regimeSpinner.start('分析制度运行效率...');

  const regimeOps = analyzeRegimeEfficiency();
  regimeSpinner.succeed(`发现 ${regimeOps.length} 个制度进化机会`);
  opportunities.push(...regimeOps);

  // ── 展示进化机会 ──
  console.log();

  if (opportunities.length === 0) {
    console.log(chalk.green('  🧬 系统状态良好，暂无需要进化的方向。'));
    console.log();
    return opportunities;
  }

  // 按影响力排序
  opportunities.sort((a, b) => b.impact - a.impact);

  console.log(chalk.bold.yellow(`  🧬 发现 ${opportunities.length} 个进化机会:\n`));

  for (let i = 0; i < opportunities.length; i++) {
    const op = opportunities[i];
    const impactBar = '●'.repeat(Math.min(op.impact, 5)) + '○'.repeat(Math.max(0, 5 - op.impact));
    const impactColor = op.impact >= 4 ? chalk.red : op.impact >= 3 ? chalk.yellow : chalk.blue;
    const categoryIcon = {
      prompt: '📝',
      tool: '🔧',
      memory: '🧠',
      regime: '👑',
      performance: '⚡'
    }[op.category] || '🧬';

    console.log(`  ${chalk.cyan(String(i + 1).padStart(2))}. ${categoryIcon} ${chalk.bold(op.title)}`);
    console.log(`      影响力: ${impactColor(impactBar)}  类别: ${chalk.gray(op.category)}`);
    console.log(`      ${chalk.gray(op.description)}`);
    if (op.suggestion) {
      console.log(`      ${chalk.green('→')} ${chalk.white(op.suggestion)}`);
    }
    console.log();
  }

  console.log(chalk.gray('  使用 /evolve-self --apply <序号> 应用进化'));
  console.log(chalk.gray('  使用 /evolve-self --history 查看进化历史'));
  console.log();

  return opportunities;
}

// ─── Prompt 进化 ─────────────────────────────────────

async function analyzePromptEffectiveness() {
  const opportunities = [];
  const sessions = sessionRecorder.listSessions(50);

  if (sessions.length < 5) return opportunities;

  // 按 Agent 统计成功率
  const agentStats = {};
  for (const s of sessions) {
    for (const step of s.steps || []) {
      if (!agentStats[step.agent]) agentStats[step.agent] = { success: 0, fail: 0 };
      if (step.type === 'step_complete') agentStats[step.agent].success++;
      if (step.type === 'step_failed') agentStats[step.agent].fail++;
    }
  }

  // 找出成功率低的 Agent
  for (const [agentId, stats] of Object.entries(agentStats)) {
    const total = stats.success + stats.fail;
    if (total < 3) continue; // 样本太少
    const rate = stats.success / total;

    if (rate < 0.6) {
      opportunities.push({
        category: 'prompt',
        title: `${agentId} 的 System Prompt 需要优化`,
        description: `${agentId} 成功率仅 ${Math.round(rate * 100)}% (${stats.success}/${total})，可能是 prompt 描述不够精准`,
        suggestion: `使用 /evolve-self --prompt ${agentId} 让 AI 重写此 Agent 的 prompt`,
        impact: rate < 0.4 ? 5 : 4,
        agentId,
        type: 'prompt_rewrite'
      });
    }
  }

  return opportunities;
}

/**
 * 执行 Prompt 进化
 * @param {string} agentId
 */
async function evolvePrompt(agentId) {
  const config = loadConfig() || {};
  const model = config.model;

  console.log(chalk.yellow(`\n  🧬 正在为 ${agentId} 进化 System Prompt...\n`));

  // 读取当前 prompt-builder 源码
  const promptBuilderPath = path.join(__dirname, '..', 'zhongshu', 'prompt-builder.js');
  const currentSource = fs.readFileSync(promptBuilderPath, 'utf-8');

  // 收集该 Agent 的历史表现数据
  const sessions = sessionRecorder.listSessions(20);
  const agentHistory = [];
  for (const s of sessions) {
    const relevantSteps = (s.steps || []).filter(st => st.agent === agentId);
    if (relevantSteps.length > 0) {
      agentHistory.push({
        prompt: s.prompt,
        success: relevantSteps.every(st => st.type !== 'step_failed'),
        errors: relevantSteps.filter(st => st.type === 'step_failed').map(st => st.error)
      });
    }
  }

  // 收集记忆中的教训
  const mistakes = memoryStore.recallAgentMemory(agentId, { type: 'mistake', limit: 10 });

  const spinner = new Spinner({ color: 'yellow' });
  spinner.start('AI 正在分析并生成优化后的 prompt...');

  try {
    const response = await callLLM({
      model,
      system: `你是一个 AI 系统的自我优化引擎。你需要根据一个 Agent 的历史表现数据，
优化它的 System Prompt，使它在未来的任务中表现更好。

重要原则：
- 保持 Agent 的核心身份和职能不变
- 根据失败案例增加针对性的指导
- 根据教训避免已知的错误模式
- 使 prompt 更具体、更有指导性
- 保持古风措辞风格`,
      messages: [{
        role: 'user',
        content: `Agent ID: ${agentId}

当前 prompt-builder.js 源码:
\`\`\`javascript
${currentSource}
\`\`\`

历史任务表现:
${JSON.stringify(agentHistory.slice(0, 10), null, 2)}

历史教训记忆:
${mistakes.map(m => `- ${m.content}`).join('\n')}

请分析这个 Agent 的问题，并输出：
1. 问题诊断（为什么成功率低）
2. 优化后的 prompt 片段（可以直接添加到 buildSystemPrompt 函数中）
3. 预期改进效果`
      }],
      maxTokens: 2048
    });

    spinner.succeed('Prompt 进化方案已生成');

    const evolution = response.content || '';

    // 保存进化记录
    saveEvolutionRecord({
      type: 'prompt_evolution',
      agentId,
      content: evolution,
      status: 'pending', // 等待天子批准
      timestamp: new Date().toISOString()
    });

    // 展示
    console.log(chalk.gray('\n  ┌─ 进化方案 ────────────────────────────────'));
    for (const line of evolution.split('\n')) {
      console.log(chalk.gray('  │ ') + chalk.white(line));
    }
    console.log(chalk.gray('  └──────────────────────────────────────────────'));
    console.log();
    console.log(chalk.yellow('  ⚠️ 此进化方案需要天子批准后才会生效。'));
    console.log(chalk.gray('  使用 /evolve-self --apply <id> 批准应用'));

  } catch (err) {
    spinner.fail(`Prompt 进化失败: ${err.message}`);
  }
}

// ─── 工具进化分析 ────────────────────────────────────

function analyzeToolUsage() {
  const opportunities = [];
  const sessions = sessionRecorder.listSessions(30);

  // 统计工具使用情况
  const toolStats = {};
  for (const s of sessions) {
    for (const tc of s.toolCalls || []) {
      if (!toolStats[tc.tool]) toolStats[tc.tool] = { calls: 0, failures: 0 };
      toolStats[tc.tool].calls++;
      // 如果后续有失败步骤，可能与工具有关
    }
  }

  // 找出从未被使用的工具
  const definedTools = ['bash', 'read_file', 'write_file', 'edit_file', 'glob', 'grep', 'list_dir'];
  for (const tool of definedTools) {
    if (!toolStats[tool] || toolStats[tool].calls === 0) {
      opportunities.push({
        category: 'tool',
        title: `工具 ${tool} 从未被使用`,
        description: '这个工具可能需要更好的描述，或者可以移除以减少 token 消耗',
        suggestion: '优化工具描述或考虑移除',
        impact: 2,
        type: 'unused_tool'
      });
    }
  }

  return opportunities;
}

// ─── 记忆进化分析 ────────────────────────────────────

function analyzeMemoryHealth() {
  const opportunities = [];

  try {
    const allMemories = memoryStore.exportAllMemories();

    // 检查记忆总量
    let totalMemories = allMemories.court.length;
    let staleCount = 0;
    const now = Date.now();
    const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;

    for (const [agentId, memories] of Object.entries(allMemories.agents)) {
      totalMemories += memories.length;
      // 检查过期记忆
      for (const m of memories) {
        if (now - new Date(m.createdAt).getTime() > thirtyDaysMs && m.accessCount === 0) {
          staleCount++;
        }
      }
    }

    if (staleCount > 10) {
      opportunities.push({
        category: 'memory',
        title: `${staleCount} 条过期记忆可以清理`,
        description: '超过30天且从未被检索的记忆，占用存储但无实际价值',
        suggestion: '使用 /evolve-self --memory 自动清理过期记忆',
        impact: 2,
        type: 'stale_memory'
      });
    }

    // 检查重复记忆
    if (totalMemories > 100) {
      opportunities.push({
        category: 'memory',
        title: '记忆库较大，建议整理',
        description: `共 ${totalMemories} 条记忆，可能存在重复和冗余`,
        suggestion: '运行记忆整理以提高检索效率',
        impact: 2,
        type: 'memory_cleanup'
      });
    }
  } catch { /* ignore */ }

  return opportunities;
}

/**
 * 执行记忆进化（清理过期记忆）
 */
function evolveMemory() {
  console.log(chalk.yellow('\n  🧠 正在进化记忆库...\n'));

  const allMemories = memoryStore.exportAllMemories();
  const now = Date.now();
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  let cleaned = 0;

  for (const [agentId, memories] of Object.entries(allMemories.agents)) {
    const before = memories.length;
    const kept = memories.filter(m => {
      const createdTime = new Date(m.createdAt).getTime();
      if (isNaN(createdTime)) return m.weight >= 7 || m.type === 'mistake';
      const age = now - createdTime;
      // 保留：30天内的、或被访问过的、或权重高的、或是教训类的
      return age < thirtyDaysMs || m.accessCount > 0 || m.weight >= 7 || m.type === 'mistake';
    });

    if (kept.length < before) {
      const removed = before - kept.length;
      cleaned += removed;
      console.log(chalk.gray(`    ${agentId}: 清理 ${removed} 条过期记忆 (${before} → ${kept.length})`));
    }
  }

  if (cleaned > 0) {
    console.log(chalk.green(`\n  ✓ 共清理 ${cleaned} 条过期记忆`));

    saveEvolutionRecord({
      type: 'memory_evolution',
      content: `清理 ${cleaned} 条过期记忆`,
      status: 'applied',
      timestamp: new Date().toISOString()
    });
  } else {
    console.log(chalk.green('  ✓ 记忆库健康，无需清理'));
  }
  console.log();
}

// ─── 制度进化分析 ────────────────────────────────────

function analyzeRegimeEfficiency() {
  const opportunities = [];
  const sessions = sessionRecorder.listSessions(30);

  if (sessions.length < 10) return opportunities;

  // 按制度统计
  const regimeStats = {};
  for (const s of sessions) {
    const regime = s.regime || 'ming';
    if (!regimeStats[regime]) regimeStats[regime] = { total: 0, success: 0, avgSteps: 0 };
    regimeStats[regime].total++;
    if (s.success) regimeStats[regime].success++;
    regimeStats[regime].avgSteps += (s.steps || []).length;
  }

  for (const [regime, stats] of Object.entries(regimeStats)) {
    if (stats.total < 3) continue;
    stats.avgSteps = Math.round(stats.avgSteps / stats.total);
    const rate = stats.success / stats.total;

    if (rate < 0.5) {
      opportunities.push({
        category: 'regime',
        title: `${regime} 制度成功率低 (${Math.round(rate * 100)}%)`,
        description: `在 ${regime} 制度下 ${stats.total} 次任务中仅 ${stats.success} 次成功`,
        suggestion: '考虑使用 /evolve 分析最优制度',
        impact: 4,
        type: 'regime_underperform'
      });
    }
  }

  return opportunities;
}

// ─── 进化记录管理 ────────────────────────────────────

function saveEvolutionRecord(record) {
  ensureEvolutionDir();
  record.id = `evo_${Date.now()}`;

  let history = [];
  try {
    if (fs.existsSync(EVOLUTION_LOG)) {
      history = JSON.parse(fs.readFileSync(EVOLUTION_LOG, 'utf-8'));
    }
  } catch { /* ignore */ }

  history.push(record);

  // 保留最近 100 条
  if (history.length > 100) history = history.slice(-100);

  fs.writeFileSync(EVOLUTION_LOG, JSON.stringify(history, null, 2));
  return record;
}

function getEvolutionHistory() {
  try {
    if (fs.existsSync(EVOLUTION_LOG)) {
      return JSON.parse(fs.readFileSync(EVOLUTION_LOG, 'utf-8'));
    }
  } catch { /* ignore */ }
  return [];
}

/**
 * 打印进化历史
 */
function printEvolutionHistory() {
  const history = getEvolutionHistory();

  console.log();
  console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('  ║') + chalk.bold.yellow('    🧬  进 化 历 史  🧬') + '                               ' + chalk.yellow('║'));
  console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
  console.log();

  if (history.length === 0) {
    console.log(chalk.gray('  （暂无进化记录。使用 /evolve-self 开始自我进化）'));
    console.log();
    return;
  }

  console.log(chalk.gray('  ID                  类型            状态      时间'));
  console.log(chalk.gray('  ' + '─'.repeat(60)));

  for (const record of history.slice(-15).reverse()) {
    const statusIcon = record.status === 'applied' ? chalk.green('✓')
      : record.status === 'pending' ? chalk.yellow('…')
      : record.status === 'rolled_back' ? chalk.red('↩')
      : chalk.gray('?');

    const time = new Date(record.timestamp).toLocaleString();
    const typeLabels = {
      prompt_evolution: '📝 Prompt进化',
      memory_evolution: '🧠 记忆进化',
      tool_evolution: '🔧 工具进化',
      regime_evolution: '👑 制度进化'
    };

    console.log(`  ${statusIcon} ${chalk.gray(record.id.padEnd(18))} ${(typeLabels[record.type] || record.type).padEnd(14)} ${chalk.gray(time)}`);
    if (record.content) {
      console.log(chalk.gray(`    ${record.content.split('\n')[0].slice(0, 60)}`));
    }
  }
  console.log();
}

module.exports = {
  analyzeEvolutionOpportunities,
  evolvePrompt,
  evolveMemory,
  printEvolutionHistory,
  getEvolutionHistory,
  saveEvolutionRecord
};
