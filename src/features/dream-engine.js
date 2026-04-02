/**
 * 朝堂梦境 — Agent 预判引擎
 *
 * 闻所未闻的功能：
 * Agent 在空闲时"做梦"—— 基于历史对话、项目状态、代码变更，
 * 主动预测用户下一步可能需要什么，提前准备好方案。
 *
 * 原理：
 *   1. 分析最近 N 次对话模式
 *   2. 扫描项目中的 TODO / FIXME / HACK 标记
 *   3. 检查 git diff 中的未完成工作
 *   4. 检查 package.json 的 outdated 依赖
 *   5. 生成"预感列表"——用户可能需要做但还没说的事
 *
 * 类比：像一个能读心的太监总管，在陛下开口之前就把茶端好了。
 *
 * 用法：
 *   /dream              查看朝堂预感
 *   /dream --deep       深度分析（扫描更多维度）
 *   /dream --act 3      直接执行第3条预感
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { execBash } = require('../shangshu/bing/bash');
const { sessionRecorder } = require('./time-travel');
const { memoryStore } = require('../memory/store');
const { callLLM } = require('../shangshu/li/api-client');
const { loadConfig } = require('../config/setup');
const { Spinner } = require('../engine/spinner');

/**
 * 预感来源
 */
const DREAM_SOURCES = {
  todo_scan: {
    name: '代码标记',
    icon: '📌',
    description: '扫描 TODO / FIXME / HACK / XXX / BUG'
  },
  git_analysis: {
    name: 'Git 未了之事',
    icon: '🔀',
    description: '分析未提交改动、长期未合并的分支'
  },
  pattern_predict: {
    name: '行为预测',
    icon: '🔮',
    description: '基于历史对话模式预测下一步'
  },
  dependency_check: {
    name: '依赖检查',
    icon: '📦',
    description: '检查过时依赖和安全漏洞'
  },
  code_health: {
    name: '代码健康',
    icon: '🏥',
    description: '检查代码中的坏味道和潜在问题'
  }
};

/**
 * 运行梦境引擎
 * @param {object} params
 * @param {string} [params.cwd] - 项目目录
 * @param {boolean} [params.deep=false] - 是否深度分析
 * @returns {Promise<object[]>} 预感列表
 */
async function runDreamEngine(params = {}) {
  const cwd = params.cwd || process.cwd();
  const deep = params.deep || false;

  console.log();
  console.log(chalk.magenta('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.magenta('  ║') + chalk.bold.magenta('    🔮  朝 堂 梦 境  🔮') + chalk.gray('    Dream Engine') + '             ' + chalk.magenta('║'));
  console.log(chalk.magenta('  ╚══════════════════════════════════════════════════════╝'));
  console.log();
  console.log(chalk.gray('  太监总管正在揣摩圣意...\n'));

  const premonitions = [];

  // ── 1. 扫描代码标记 ──
  const todoSpinner = new Spinner({ color: 'magenta' });
  todoSpinner.start('扫描 TODO / FIXME / HACK ...');
  try {
    const todos = await scanTodoMarkers(cwd);
    todoSpinner.succeed(`发现 ${todos.length} 个代码标记`);
    for (const todo of todos.slice(0, 8)) {
      premonitions.push({
        source: 'todo_scan',
        priority: todo.type === 'FIXME' || todo.type === 'BUG' ? 'high' : 'medium',
        title: `${todo.type}: ${todo.text}`,
        detail: `${todo.file}:${todo.line}`,
        actionable: `修复 ${todo.file} 第 ${todo.line} 行的 ${todo.type}`
      });
    }
  } catch (err) {
    todoSpinner.fail('代码标记扫描失败');
  }

  // ── 2. Git 未了之事 ──
  const gitSpinner = new Spinner({ color: 'magenta' });
  gitSpinner.start('分析 Git 状态...');
  try {
    const gitInsights = await analyzeGitState(cwd);
    gitSpinner.succeed(`发现 ${gitInsights.length} 个 Git 待办`);
    premonitions.push(...gitInsights);
  } catch (err) {
    gitSpinner.fail('Git 分析失败');
  }

  // ── 3. 依赖检查 ──
  const depSpinner = new Spinner({ color: 'magenta' });
  depSpinner.start('检查依赖状态...');
  try {
    const depIssues = await checkDependencies(cwd);
    depSpinner.succeed(`发现 ${depIssues.length} 个依赖问题`);
    premonitions.push(...depIssues);
  } catch (err) {
    depSpinner.fail('依赖检查失败');
  }

  // ── 4. 行为预测（基于历史） ──
  const histSpinner = new Spinner({ color: 'magenta' });
  histSpinner.start('分析历史行为模式...');
  try {
    const predictions = predictNextActions(cwd);
    histSpinner.succeed(`生成 ${predictions.length} 条预测`);
    premonitions.push(...predictions);
  } catch (err) {
    histSpinner.fail('行为预测失败');
  }

  // ── 5. 深度分析：代码健康（可选） ──
  if (deep) {
    const healthSpinner = new Spinner({ color: 'magenta' });
    healthSpinner.start('深度代码健康检查...');
    try {
      const healthIssues = await checkCodeHealth(cwd);
      healthSpinner.succeed(`发现 ${healthIssues.length} 个健康问题`);
      premonitions.push(...healthIssues);
    } catch (err) {
      healthSpinner.fail('代码健康检查失败');
    }
  }

  // ── 展示预感列表 ──
  console.log();
  if (premonitions.length === 0) {
    console.log(chalk.green('  太监总管: 陛下，一切安好，臣没有什么要奏报的。'));
    console.log();
    return [];
  }

  // 按优先级排序
  const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
  premonitions.sort((a, b) => (priorityOrder[a.priority] || 3) - (priorityOrder[b.priority] || 3));

  console.log(chalk.magenta.bold('  太监总管: 陛下，臣斗胆奏报以下预感：\n'));

  for (let i = 0; i < premonitions.length; i++) {
    const p = premonitions[i];
    const sourceInfo = DREAM_SOURCES[p.source] || { icon: '💭', name: '其他' };
    const priorityIcon = p.priority === 'critical' ? chalk.red.bold('🔴')
      : p.priority === 'high' ? chalk.yellow('🟡')
      : p.priority === 'medium' ? chalk.blue('🔵')
      : chalk.gray('⚪');

    console.log(`  ${chalk.cyan(String(i + 1).padStart(2))}. ${priorityIcon} ${sourceInfo.icon} ${chalk.white(p.title)}`);
    if (p.detail) {
      console.log(`      ${chalk.gray(p.detail)}`);
    }
    if (p.actionable) {
      console.log(`      ${chalk.green('→')} ${chalk.gray(p.actionable)}`);
    }
    console.log();
  }

  console.log(chalk.gray('  使用 /dream --act <序号> 可直接执行对应的预感'));
  console.log();

  return premonitions;
}

// ─── 扫描 TODO/FIXME/HACK ────────────────────────────

async function scanTodoMarkers(cwd) {
  const result = await execBash(
    `rg -n "(TODO|FIXME|HACK|XXX|BUG)[:：\\s]" --glob "!node_modules" --glob "!.git" --glob "!dist" --glob "!build" --glob "!*.lock" "${cwd}" 2>/dev/null | head -30`,
    { cwd }
  );

  if (!result.stdout) return [];

  return result.stdout.split('\n').filter(Boolean).map(line => {
    const match = line.match(/^(.+):(\d+):\s*.*?(TODO|FIXME|HACK|XXX|BUG)[:：\s]\s*(.+)/i);
    if (match) {
      return {
        file: path.relative(cwd, match[1]),
        line: parseInt(match[2]),
        type: match[3].toUpperCase(),
        text: match[4].trim().slice(0, 80)
      };
    }
    return null;
  }).filter(Boolean);
}

// ─── Git 分析 ────────────────────────────────────────

async function analyzeGitState(cwd) {
  const insights = [];

  // 未提交的改动
  const statusResult = await execBash('git status --porcelain 2>/dev/null', { cwd });
  if (statusResult.stdout) {
    const changedFiles = statusResult.stdout.split('\n').filter(Boolean);
    if (changedFiles.length > 0) {
      insights.push({
        source: 'git_analysis',
        priority: 'medium',
        title: `${changedFiles.length} 个未提交的文件改动`,
        detail: changedFiles.slice(0, 5).map(f => f.trim()).join(', '),
        actionable: '考虑提交或 stash 这些改动'
      });
    }
  }

  // 长期未合并的分支
  const branchResult = await execBash(
    'git branch --no-merged main 2>/dev/null || git branch --no-merged master 2>/dev/null',
    { cwd }
  );
  if (branchResult.stdout) {
    const unmerged = branchResult.stdout.split('\n').filter(b => b.trim() && !b.includes('*'));
    if (unmerged.length > 0) {
      insights.push({
        source: 'git_analysis',
        priority: 'low',
        title: `${unmerged.length} 个未合并的分支`,
        detail: unmerged.slice(0, 5).map(b => b.trim()).join(', '),
        actionable: '考虑合并或清理这些分支'
      });
    }
  }

  // 最近的 commit 是否有 WIP 标记
  const logResult = await execBash('git log --oneline -5 2>/dev/null', { cwd });
  if (logResult.stdout) {
    const wipCommits = logResult.stdout.split('\n').filter(l => /WIP|wip|todo|temp|fixup/i.test(l));
    if (wipCommits.length > 0) {
      insights.push({
        source: 'git_analysis',
        priority: 'medium',
        title: `${wipCommits.length} 个 WIP/临时 commit 待整理`,
        detail: wipCommits[0].trim(),
        actionable: '考虑 squash 或完善这些 commit'
      });
    }
  }

  return insights;
}

// ─── 依赖检查 ────────────────────────────────────────

async function checkDependencies(cwd) {
  const issues = [];
  const pkgPath = path.join(cwd, 'package.json');

  if (!fs.existsSync(pkgPath)) return issues;

  // 检查是否有 lock 文件但没有 node_modules
  const hasLock = fs.existsSync(path.join(cwd, 'package-lock.json'))
    || fs.existsSync(path.join(cwd, 'yarn.lock'))
    || fs.existsSync(path.join(cwd, 'pnpm-lock.yaml'));
  const hasModules = fs.existsSync(path.join(cwd, 'node_modules'));

  if (hasLock && !hasModules) {
    issues.push({
      source: 'dependency_check',
      priority: 'high',
      title: '依赖未安装 (有 lock 文件但无 node_modules)',
      actionable: '运行 npm install'
    });
  }

  // 检查 package.json 中的 scripts
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

    // 有 test 脚本但可能没跑
    if (pkg.scripts?.test && pkg.scripts.test !== 'echo "Error: no test specified" && exit 1') {
      issues.push({
        source: 'dependency_check',
        priority: 'low',
        title: '项目有测试脚本，可以运行 npm test 检查',
        actionable: 'npm test'
      });
    }

    // 有 lint 脚本
    if (pkg.scripts?.lint) {
      issues.push({
        source: 'dependency_check',
        priority: 'low',
        title: '项目有 lint 脚本，可以运行代码检查',
        actionable: 'npm run lint'
      });
    }
  } catch { /* ignore */ }

  return issues;
}

// ─── 行为预测 ────────────────────────────────────────

function predictNextActions(cwd) {
  const predictions = [];

  // 基于最近的会话历史预测
  const sessions = sessionRecorder.listSessions(10);

  if (sessions.length >= 3) {
    // 分析最近的任务类型模式
    const recentPrompts = sessions.map(s => s.prompt);

    // 如果最近都在做某一类任务，预测还会继续
    const codingKeywords = /写|编|实现|开发|创建|重构|修复|bug|代码/;
    const codingCount = recentPrompts.filter(p => codingKeywords.test(p)).length;

    if (codingCount >= 2) {
      predictions.push({
        source: 'pattern_predict',
        priority: 'low',
        title: '陛下最近频繁下旨编码，是否需要跑一轮测试？',
        actionable: '运行项目测试确保改动正确'
      });
    }

    // 如果最近有失败的会话
    const failedSessions = sessions.filter(s => s.success === false);
    if (failedSessions.length >= 2) {
      predictions.push({
        source: 'pattern_predict',
        priority: 'medium',
        title: `最近 ${failedSessions.length} 道旨意执行失败，是否需要查看验尸报告？`,
        actionable: '/autopsy 查看故障分析'
      });
    }
  }

  // 基于朝廷记忆预测
  const courtMemories = memoryStore.recallCourtMemory({ type: 'decision', limit: 3 });
  if (courtMemories.length > 0) {
    const latestDecision = courtMemories[0];
    predictions.push({
      source: 'pattern_predict',
      priority: 'low',
      title: `朝廷此前决策: "${latestDecision.content}"，是否还需跟进？`,
      detail: `来源: ${latestDecision.source}`,
      actionable: '继续推进此前的决策'
    });
  }

  return predictions;
}

// ─── 代码健康检查（深度模式） ────────────────────────

async function checkCodeHealth(cwd) {
  const issues = [];

  // 大文件检查
  const bigFiles = await execBash(
    `find "${cwd}" -name "*.js" -o -name "*.ts" -o -name "*.py" | xargs wc -l 2>/dev/null | sort -rn | head -5`,
    { cwd }
  );
  if (bigFiles.stdout) {
    const lines = bigFiles.stdout.split('\n').filter(Boolean);
    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+(.+)/);
      if (match && parseInt(match[1]) > 500 && !match[2].includes('total')) {
        issues.push({
          source: 'code_health',
          priority: 'low',
          title: `${path.relative(cwd, match[2])} 有 ${match[1]} 行，考虑拆分`,
          actionable: '拆分大文件提高可维护性'
        });
      }
    }
  }

  // console.log 残留检查
  const consoleLogs = await execBash(
    `rg -c "console\\.log" --glob "*.js" --glob "*.ts" --glob "!node_modules" --glob "!dist" --glob "!*.test.*" "${cwd}" 2>/dev/null | head -10`,
    { cwd }
  );
  if (consoleLogs.stdout) {
    const totalLogs = consoleLogs.stdout.split('\n').filter(Boolean)
      .reduce((sum, line) => sum + parseInt(line.split(':').pop() || 0), 0);
    if (totalLogs > 10) {
      issues.push({
        source: 'code_health',
        priority: 'low',
        title: `项目中有 ${totalLogs} 处 console.log，可能需要清理`,
        actionable: '考虑替换为正式的日志框架'
      });
    }
  }

  return issues;
}

module.exports = { runDreamEngine, DREAM_SOURCES };
