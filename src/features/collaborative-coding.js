/**
 * 六部联名奏折 — 多 Agent 协同编码
 *
 * 闻所未闻的功能：
 * 不同于简单的分步执行，这里是真正的"协同"——
 * 多个 Agent 同时对同一段代码各负责不同的方面：
 *
 *   兵部 → 写核心逻辑
 *   刑部 → 同步做安全审计
 *   都察院 → 同步做 Code Review
 *   工部 → 同步写测试 & 部署配置
 *   翰林院 → 同步写文档
 *
 * 最终合并为一份完整的、经过多方审视的交付物。
 *
 * 类比：不是流水线，而是圆桌会议。所有人同时看同一份文件，
 *       各自发表意见，最终产出的代码经过了"多人 Review"。
 *
 * 用法：
 *   /collab "写一个用户认证模块"
 *   /collab --agents bingbu,xingbu,duchayuan "实现支付接口"
 */

const chalk = require('chalk');
const { callLLM } = require('../shangshu/li/api-client');
const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
const { getRegime } = require('../config/regimes');
const { loadConfig } = require('../config/setup');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { Spinner } = require('../engine/spinner');
const { reputationManager } = require('./reputation');
const { bannerBox } = require('../utils/terminal');

/**
 * 协同角色定义 — 按制度分别命名
 */
const COLLAB_ROLES = {
  architect: {
    name: { ming: '内阁首辅', tang: '中书令', modern: 'Architect' },
    emoji: { ming: '🏛️', tang: '📜', modern: '🏗️' },
    prompt: '你是架构师。分析需求，设计模块结构、接口定义、数据模型。输出 API 设计和文件结构。',
    defaultAgent: { ming: 'neige', tang: 'zhongshu_ling', modern: 'cto' }
  },
  coder: {
    name: { ming: '兵部尚书', tang: '尚书左仆射', modern: 'Lead Engineer' },
    emoji: { ming: '⚔️', tang: '🐉', modern: '💻' },
    prompt: '你是核心编码者。根据架构设计编写完整的实现代码。注重代码质量和最佳实践。',
    defaultAgent: { ming: 'bingbu', tang: 'bing_bu', modern: 'engineer' }
  },
  security: {
    name: { ming: '刑部尚书', tang: '门下侍郎', modern: 'Security Lead' },
    emoji: { ming: '⚖️', tang: '🛡️', modern: '🔒' },
    prompt: '你是安全审计员。审查代码的安全问题：注入、XSS、权限漏洞、敏感信息泄露。给出具体修复代码。',
    defaultAgent: { ming: 'xingbu', tang: 'menxia_shilang', modern: 'cto' }
  },
  tester: {
    name: { ming: '工部尚书', tang: '工部侍郎', modern: 'QA Lead' },
    emoji: { ming: '🔨', tang: '🧪', modern: '🧪' },
    prompt: '你是测试工程师。为代码编写全面的单元测试和集成测试。覆盖正常流程和边界情况。',
    defaultAgent: { ming: 'gongbu', tang: 'gong_bu', modern: 'devops' }
  },
  reviewer: {
    name: { ming: '都察院御史', tang: '给事中', modern: 'Tech Lead' },
    emoji: { ming: '👁️', tang: '🔍', modern: '🔍' },
    prompt: '你是代码审查员。从可读性、性能、可维护性角度做 Code Review。给出具体的改进建议。',
    defaultAgent: { ming: 'duchayuan', tang: 'jishizhong', modern: 'cto' }
  },
  docs: {
    name: { ming: '翰林学士', tang: '中书舍人', modern: 'Tech Writer' },
    emoji: { ming: '📝', tang: '🖊️', modern: '📝' },
    prompt: '你是技术写手。为代码编写 README、API 文档、使用示例。文档要清晰实用。',
    defaultAgent: { ming: 'hanlin', tang: 'zhongshu_sheren', modern: 'marketer' }
  }
};

/**
 * 获取角色的制度化名称和 emoji
 */
function getRoleDisplay(roleId, regimeId) {
  const role = COLLAB_ROLES[roleId];
  if (!role) return { name: roleId, emoji: '?' };
  const rid = regimeId || 'ming';
  return {
    name: role.name[rid] || role.name.ming,
    emoji: role.emoji[rid] || role.emoji.ming
  };
}

/**
 * 制度化 UI 文案
 */
const COLLAB_UI = {
  ming: {
    title: '六部联名奏折',
    subtitle: '内阁督办 · 六部协同',
    phaseParallel: '六部并行办差',
    phaseResult: '联名奏折',
    costLabel: '户部报账',
    completionLabel: '奏折完成度'
  },
  tang: {
    title: '三省会审',
    subtitle: '中书起草 · 门下审核 · 尚书执行',
    phaseParallel: '三省并行议事',
    phaseResult: '三省会审结果',
    costLabel: '度支报账',
    completionLabel: '会审完成度'
  },
  modern: {
    title: 'Team Sprint',
    subtitle: 'Architecture + Code + Security + QA + Review',
    phaseParallel: 'Parallel Execution',
    phaseResult: 'Sprint Deliverables',
    costLabel: 'Cost',
    completionLabel: 'Completion'
  }
};

/**
 * 运行协同编码
 * @param {object} params
 * @param {string} params.task - 任务描述
 * @param {string[]} [params.roles] - 指定参与角色
 * @param {string} [params.regimeId='ming']
 * @returns {Promise<object>}
 */
async function runCollaborativeCoding(params) {
  const { task, regimeId = 'ming' } = params;
  const config = loadConfig() || {};
  const model = config.model;
  const costTracker = new CostTracker();
  const ui = COLLAB_UI[regimeId] || COLLAB_UI.ming;

  // 根据制度获取实际的 agent 列表，映射为 collab 角色
  const regime = getRegime(regimeId);
  const regimeAgents = regime ? regime.agents : [];

  // 默认角色组合
  const activeRoles = params.roles || ['architect', 'coder', 'security', 'tester', 'reviewer'];

  console.log();
  console.log(bannerBox(chalk.bold.yellow('    📋  ' + ui.title + '  📋') + chalk.gray('    ' + ui.subtitle), { color: chalk.yellow }));
  console.log();
  const taskLabel = regimeId === 'modern' ? 'Task:' : '任务:';
  const teamLabel = regimeId === 'modern' ? 'Team:' : '参与:';
  console.log('  ' + chalk.white(taskLabel) + ' ' + chalk.bold(task));
  console.log('  ' + chalk.white(teamLabel) + ' ' + activeRoles.map(r => {
    const d = getRoleDisplay(r, regimeId);
    return d.emoji + ' ' + d.name;
  }).join('  '));
  console.log();

  const outputs = {};

  // ── 第一阶段：架构设计（如果有架构师角色） ──
  let architectureOutput = '';
  if (activeRoles.includes('architect')) {
    const role = COLLAB_ROLES.architect;
    const display = getRoleDisplay('architect', regimeId);
    const spinner = new Spinner({ color: 'yellow' });
    spinner.start(display.emoji + ' ' + display.name + (regimeId === 'modern' ? ' designing...' : '正在设计架构...'));

    try {
      const agentId = role.defaultAgent[regimeId] || 'neige';
      const response = await callLLM({
        model,
        system: buildSystemPrompt(agentId, regimeId) + '\n\n' + role.prompt,
        messages: [{ role: 'user', content: `请为以下需求设计架构方案：\n\n${task}\n\n输出：1) 模块划分 2) 接口定义 3) 数据模型 4) 文件结构` }],
        maxTokens: 2048
      });
      architectureOutput = response.content || '';
      costTracker.record(agentId, model || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

      spinner.succeed(display.emoji + ' ' + display.name + (regimeId === 'modern' ? ' done' : '完成'));
      outputs.architect = architectureOutput;
    } catch (err) {
      spinner.fail(display.name + (regimeId === 'modern' ? ' failed: ' : '失败: ') + err.message);
    }
  }

  // ── 第二阶段：并行执行其余角色 ──
  // 每个角色都能看到架构师的输出（如果有）
  const parallelRoles = activeRoles.filter(r => r !== 'architect');

  console.log(chalk.yellow('\n  === ' + ui.phaseParallel + ' ===========================\n'));

  for (const roleId of parallelRoles) {
    const role = COLLAB_ROLES[roleId];
    const display = getRoleDisplay(roleId, regimeId);
    const agentId = role.defaultAgent[regimeId] || 'bingbu';
    const spinner = new Spinner({ color: 'cyan' });
    spinner.start(display.emoji + ' ' + display.name + (regimeId === 'modern' ? ' working...' : '办差中...'));

    try {
      const context = architectureOutput
        ? `\n\n架构师的设计方案:\n${architectureOutput}`
        : '';

      // 如果是安全官/审查官，需要看到编码者的输出
      let codeContext = '';
      if ((roleId === 'security' || roleId === 'reviewer' || roleId === 'tester') && outputs.coder) {
        codeContext = `\n\n编码者的实现代码:\n${outputs.coder}`;
      }

      const response = await callLLM({
        model,
        system: buildSystemPrompt(agentId, regimeId) + '\n\n' + role.prompt,
        messages: [{
          role: 'user',
          content: `任务: ${task}${context}${codeContext}\n\n请从你的职能角度完成你的工作。`
        }],
        maxTokens: 3072
      });

      const output = response.content || '';
      costTracker.record(agentId, model || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

      spinner.succeed(display.emoji + ' ' + display.name + (regimeId === 'modern' ? ' done' : '完成'));
      outputs[roleId] = output;

      // 功勋
      reputationManager.reward(agentId, 'task_complete');

    } catch (err) {
      spinner.fail(display.name + (regimeId === 'modern' ? ' failed: ' : '失败: ') + err.message);
      outputs[roleId] = null;
    }
  }

  // ── 展示合并结果 ──
  console.log(chalk.yellow('\n  === ' + ui.phaseResult + ' ===========================\n'));

  const roleDisplayOrder = ['architect', 'coder', 'security', 'tester', 'reviewer', 'docs'];

  for (const roleId of roleDisplayOrder) {
    if (!outputs[roleId]) continue;

    const display = getRoleDisplay(roleId, regimeId);
    console.log(chalk.gray('  +- ' + display.emoji + ' ' + display.name + ' ' + '-'.repeat(Math.max(1, 35 - display.name.length))));

    const lines = outputs[roleId].split('\n');
    const displayLines = lines.slice(0, 40);
    for (const line of displayLines) {
      console.log(chalk.gray('  | ') + chalk.white(line));
    }
    if (lines.length > 40) {
      const moreText = regimeId === 'modern' ? ' more lines' : ' 行未显示';
      console.log(chalk.gray('  | ... (' + (lines.length - 40) + moreText + ')'));
    }
    console.log(chalk.gray('  +' + '-'.repeat(48)));
    console.log();
  }

  // ── 生成合并分数 ──
  const completedRoles = Object.entries(outputs).filter(([_, v]) => v !== null).length;
  const totalRoles = activeRoles.length;

  console.log(chalk.bold('  ' + ui.completionLabel + ':'));
  const pct = completedRoles / totalRoles;
  const barLen = 25;
  const filled = Math.round(barLen * pct);
  const barColor = pct === 1 ? chalk.green : pct >= 0.8 ? chalk.yellow : chalk.red;
  const doneText = regimeId === 'modern' ? ' roles done' : ' 角色完成';
  console.log('    ' + barColor('#'.repeat(filled)) + chalk.gray('.'.repeat(barLen - filled)) + ' ' + completedRoles + '/' + totalRoles + doneText + ' (' + Math.round(pct * 100) + '%)');

  const cost = costTracker.getSummary();
  console.log(chalk.gray('\n  ' + ui.costLabel + ': $' + cost.total.totalCostUsd.toFixed(4)));
  console.log();

  return { task, outputs, completedRoles, totalRoles, cost };
}

module.exports = { runCollaborativeCoding, COLLAB_ROLES };
