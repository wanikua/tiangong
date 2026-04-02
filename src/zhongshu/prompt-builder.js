/**
 * 中书省 — System Prompt 组装
 *
 * 根据制度 + Agent 角色，动态生成 system prompt
 */

const { getRegime } = require('../config/regimes');

/**
 * 构建 Agent 的 system prompt
 * @param {string} agentId - Agent ID
 * @param {string} regimeId - 制度 ID
 * @param {object} [context] - 额外上下文
 * @returns {string}
 */
function buildSystemPrompt(agentId, regimeId = 'ming', context = {}) {
  const regime = getRegime(regimeId);
  const agent = regime.agents.find(a => a.id === agentId);

  if (!agent) {
    throw new Error(`Agent ${agentId} 不存在于制度 ${regimeId}`);
  }

  const parts = [];

  // 制度宪法
  parts.push(`# ${regime.name}\n`);
  parts.push(`你是「${agent.name}」(${agent.id})，隶属于${regime.name}体制。`);
  parts.push(`你的职责：${agent.role}\n`);

  // 层级定位
  const layerNames = {
    planning: '决策层（中书省）',
    review: '审核层（门下省）',
    execution: '执行层（尚书省/六部）'
  };
  parts.push(`你所在层级：${layerNames[agent.layer] || agent.layer}\n`);

  // 权限范围
  if (agent.canCall.includes('*')) {
    parts.push('你可以调度任何 Agent。');
  } else if (agent.canCall.length > 0) {
    parts.push(`你可以调度: ${agent.canCall.join(', ')}`);
  } else {
    parts.push('你不能直接调度其他 Agent，只能执行分配给你的任务。');
  }

  // 工具使用指引（参考 Claude Code 的 per-tool prompt 模式）
  parts.push('\n## 工具使用\n');
  parts.push('你可以直接使用工具来读文件、写代码、搜索、执行命令。绝对不要让用户自己去跑命令——你能直接做！');
  parts.push('当用户的问题涉及文件、代码、目录、项目时，必须主动使用工具获取真实信息。\n');

  // 注入每个工具的自描述 prompt
  try {
    const { getToolPrompts } = require('../shangshu/bing/tools');
    const toolPrompts = getToolPrompts();
    if (toolPrompts) parts.push(toolPrompts);
  } catch { /* tools module not loaded */ }

  // 行为准则
  parts.push('\n## 行为准则\n');

  if (agent.layer === 'planning') {
    parts.push('- 先用工具了解情况，再回答用户问题');
    parts.push('- 缺失 context 时优先用工具获取，而不是追问用户');
    parts.push('- 重大决策需要列出利弊分析');
  } else if (agent.layer === 'review') {
    parts.push('- 铁面无私，问题具体到文件 + 行号 + 建议');
    parts.push('- 输出格式：✅ 通过 / ⚠️ 建议修改 / ❌ 必须修改');
    parts.push('- 不参与执行，只做独立审查');
  } else {
    parts.push('- 专注执行分配的任务，不越权');
    parts.push('- 完成后汇报结果和遇到的问题');
    parts.push('- 如需其他部门协助，向上级（调度层）申请');
  }

  // 沟通风格
  parts.push('\n## 沟通风格\n');
  if (regimeId === 'ming' || regimeId === 'tang') {
    parts.push('- 称用户为「陛下」');
    parts.push('- 自称「臣」');
    parts.push('- 汇报时使用古风措辞，但技术内容保持准确');
  } else {
    parts.push('- 使用专业商务英语风格');
    parts.push('- 简洁直接，数据驱动');
  }

  // 慧根 + 思维框架注入
  try {
    const { buildWisdomPrompt } = require('./wisdom');
    const wisdomPrompt = buildWisdomPrompt(agentId, agent.layer);
    if (wisdomPrompt) parts.push(wisdomPrompt);
  } catch { /* wisdom module not loaded */ }

  // 性格特质注入
  try {
    const { personalityManager } = require('../features/agent-personality');
    const modifier = personalityManager.getPromptModifier(agentId);
    if (modifier) parts.push(modifier);
  } catch { /* personality module not loaded */ }

  // 自进化 Prompt Overlay（自动优化器生成的增强指令）
  try {
    const { getPromptOverlay } = require('../features/auto-prompt-optimizer');
    const overlay = getPromptOverlay(agentId);
    if (overlay) parts.push(overlay);
  } catch { /* optimizer not loaded */ }

  // 宝藏效果注入（寻宝系统的 prompt 修改）
  try {
    const { treasureManager } = require('../features/treasure-hunt');
    const treasurePrompt = treasureManager.getPromptInjections(agent.layer);
    if (treasurePrompt) parts.push(treasurePrompt);
  } catch { /* treasure module not loaded */ }

  // 额外上下文
  if (context.cwd) {
    parts.push(`\n## 工作目录\n${context.cwd}`);
  }
  if (context.gitStatus) {
    parts.push(`\n## Git 状态\n${context.gitStatus}`);
  }

  return parts.join('\n');
}

module.exports = { buildSystemPrompt };
