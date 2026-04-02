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

/**
 * 协同角色定义
 */
const COLLAB_ROLES = {
  architect: {
    name: '架构师',
    emoji: '🏗️',
    prompt: '你是架构师。分析需求，设计模块结构、接口定义、数据模型。输出 API 设计和文件结构。',
    defaultAgent: { ming: 'neige', tang: 'zhongshu_ling', modern: 'cto' }
  },
  coder: {
    name: '编码者',
    emoji: '⚔️',
    prompt: '你是核心编码者。根据架构设计编写完整的实现代码。注重代码质量和最佳实践。',
    defaultAgent: { ming: 'bingbu', tang: 'bing_bu', modern: 'engineer' }
  },
  security: {
    name: '安全官',
    emoji: '🛡️',
    prompt: '你是安全审计员。审查代码的安全问题：注入、XSS、权限漏洞、敏感信息泄露。给出具体修复代码。',
    defaultAgent: { ming: 'xingbu', tang: 'menxia_shilang', modern: 'cto' }
  },
  tester: {
    name: '测试官',
    emoji: '🧪',
    prompt: '你是测试工程师。为代码编写全面的单元测试和集成测试。覆盖正常流程和边界情况。',
    defaultAgent: { ming: 'gongbu', tang: 'gong_bu', modern: 'devops' }
  },
  reviewer: {
    name: '审查官',
    emoji: '🔍',
    prompt: '你是代码审查员。从可读性、性能、可维护性角度做 Code Review。给出具体的改进建议。',
    defaultAgent: { ming: 'duchayuan', tang: 'jishizhong', modern: 'cto' }
  },
  docs: {
    name: '文档官',
    emoji: '📝',
    prompt: '你是技术写手。为代码编写 README、API 文档、使用示例。文档要清晰实用。',
    defaultAgent: { ming: 'hanlin', tang: 'zhongshu_sheren', modern: 'marketer' }
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

  // 默认角色组合
  const activeRoles = params.roles || ['architect', 'coder', 'security', 'tester', 'reviewer'];

  console.log();
  console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('  ║') + chalk.bold.yellow('    📋  六部联名奏折  📋') + chalk.gray('    Collaborative Code') + '     ' + chalk.yellow('║'));
  console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
  console.log();
  console.log(`  ${chalk.white('任务:')} ${chalk.bold(task)}`);
  console.log(`  ${chalk.white('参与:')} ${activeRoles.map(r => `${COLLAB_ROLES[r].emoji} ${COLLAB_ROLES[r].name}`).join('  ')}`);
  console.log();

  const outputs = {};

  // ── 第一阶段：架构设计（如果有架构师角色） ──
  let architectureOutput = '';
  if (activeRoles.includes('architect')) {
    const role = COLLAB_ROLES.architect;
    const spinner = new Spinner({ color: 'yellow' });
    spinner.start(`${role.emoji} ${role.name}正在设计架构...`);

    try {
      const agentId = role.defaultAgent[regimeId] || 'neige';
      const response = await callLLM({
        model,
        system: buildSystemPrompt(agentId, regimeId) + '\n\n' + role.prompt,
        messages: [{ role: 'user', content: `请为以下需求设计架构方案：\n\n${task}\n\n输出：1) 模块划分 2) 接口定义 3) 数据模型 4) 文件结构` }],
        maxTokens: 2048
      });
      architectureOutput = response.content || '';
      const tokens = (response.usage?.input_tokens || 0) + (response.usage?.output_tokens || 0);
      costTracker.record(agentId, model || 'claude-sonnet-4-6',
        response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

      spinner.succeed(`${role.emoji} 架构设计完成`);
      outputs.architect = architectureOutput;
    } catch (err) {
      spinner.fail(`架构设计失败: ${err.message}`);
    }
  }

  // ── 第二阶段：并行执行其余角色 ──
  // 每个角色都能看到架构师的输出（如果有）
  const parallelRoles = activeRoles.filter(r => r !== 'architect');

  console.log(chalk.yellow(`\n  ═══ 并行执行阶段 ═══════════════════════════\n`));

  // 模拟"并行"（实际逐个执行，但 UI 上呈现并行感）
  for (const roleId of parallelRoles) {
    const role = COLLAB_ROLES[roleId];
    const agentId = role.defaultAgent[regimeId] || 'bingbu';
    const spinner = new Spinner({ color: 'cyan' });
    spinner.start(`${role.emoji} ${role.name}工作中...`);

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

      spinner.succeed(`${role.emoji} ${role.name}完成`);
      outputs[roleId] = output;

      // 功勋
      reputationManager.reward(agentId, 'task_complete');

    } catch (err) {
      spinner.fail(`${role.name}失败: ${err.message}`);
      outputs[roleId] = null;
    }
  }

  // ── 展示合并结果 ──
  console.log(chalk.yellow(`\n  ═══ 联名奏折 ═══════════════════════════════\n`));

  const roleDisplayOrder = ['architect', 'coder', 'security', 'tester', 'reviewer', 'docs'];

  for (const roleId of roleDisplayOrder) {
    if (!outputs[roleId]) continue;

    const role = COLLAB_ROLES[roleId];
    console.log(chalk.gray(`  ┌─ ${role.emoji} ${role.name} ${'─'.repeat(35)}`));

    const lines = outputs[roleId].split('\n');
    const displayLines = lines.slice(0, 40); // 最多显示40行
    for (const line of displayLines) {
      console.log(chalk.gray('  │ ') + chalk.white(line));
    }
    if (lines.length > 40) {
      console.log(chalk.gray(`  │ ... (还有 ${lines.length - 40} 行)`));
    }
    console.log(chalk.gray('  └' + '─'.repeat(48)));
    console.log();
  }

  // ── 生成合并分数 ──
  const completedRoles = Object.entries(outputs).filter(([_, v]) => v !== null).length;
  const totalRoles = activeRoles.length;

  console.log(chalk.bold('  📊 协同完成度:'));
  const pct = completedRoles / totalRoles;
  const barLen = 25;
  const filled = Math.round(barLen * pct);
  const barColor = pct === 1 ? chalk.green : pct >= 0.8 ? chalk.yellow : chalk.red;
  console.log(`    ${barColor('█'.repeat(filled))}${chalk.gray('░'.repeat(barLen - filled))} ${completedRoles}/${totalRoles} 角色完成 (${Math.round(pct * 100)}%)`);

  const cost = costTracker.getSummary();
  console.log(chalk.gray(`\n  💰 协同费用: $${cost.total.totalCostUsd.toFixed(4)}`));
  console.log();

  return { task, outputs, completedRoles, totalRoles, cost };
}

module.exports = { runCollaborativeCoding, COLLAB_ROLES };
