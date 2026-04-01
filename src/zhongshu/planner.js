/**
 * 中书省 — 起草执行计划
 *
 * 分析用户意图，生成结构化的执行计划，分配给对应的六部
 */

const { getRegime } = require('../config/regimes');

/**
 * 任务类型识别
 */
const TASK_PATTERNS = {
  coding: /写|编|实现|开发|创建|重构|修复|bug|代码|function|api|接口|组件/i,
  review: /审查|review|检查|评审|安全/i,
  devops: /部署|运维|docker|ci|cd|发布|服务器|监控/i,
  finance: /财务|预算|成本|分析|数据|报表|报告/i,
  marketing: /营销|品牌|文案|推广|内容|社交|设计/i,
  management: /项目|管理|计划|进度|排期|任务/i,
  legal: /合规|法律|合同|协议|license|隐私/i,
  writing: /写作|小说|文章|文档|翻译/i
};

/**
 * 任务类型 → 六部映射（明制）
 */
const TASK_AGENT_MAP = {
  ming: {
    coding: 'bingbu',
    review: 'duchayuan',
    devops: 'gongbu',
    finance: 'hubu',
    marketing: 'libu',
    management: 'libu2',
    legal: 'xingbu',
    writing: 'hanlin'
  },
  tang: {
    coding: 'bing_bu',
    review: 'menxia_shilang',
    devops: 'gong_bu',
    finance: 'hu_bu',
    marketing: 'gong_bu',
    management: 'li_bu',
    legal: 'li_bu',
    writing: 'gong_bu'
  },
  modern: {
    coding: 'engineer',
    review: 'cto',
    devops: 'devops',
    finance: 'analyst',
    marketing: 'marketer',
    management: 'ceo',
    legal: 'cfo',
    writing: 'marketer'
  }
};

/**
 * 分析用户意图，识别任务类型
 * @param {string} prompt - 用户输入
 * @returns {string[]} 匹配的任务类型列表
 */
function analyzeIntent(prompt) {
  const matched = [];
  for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(prompt)) {
      matched.push(type);
    }
  }
  return matched.length > 0 ? matched : ['coding']; // 默认走兵部
}

/**
 * 生成执行计划
 * @param {string} prompt - 用户输入
 * @param {string} regimeId - 制度 ID
 * @returns {object} 执行计划
 */
function generatePlan(prompt, regimeId = 'ming') {
  const regime = getRegime(regimeId);
  const taskTypes = analyzeIntent(prompt);
  const agentMap = TASK_AGENT_MAP[regimeId] || TASK_AGENT_MAP.ming;

  const steps = [];
  let stepId = 1;

  // Step 1: 中书省 / 内阁 / CEO 优化 prompt
  const plannerAgent = regime.agents.find(a => a.layer === 'planning' && a.canCall.length > 0);
  steps.push({
    id: stepId++,
    agent: plannerAgent ? plannerAgent.id : regime.agents[0].id,
    task: 'optimize_prompt',
    description: '分析需求 + 优化 Prompt + 生成详细方案',
    input: prompt
  });

  // Step 2+: 六部执行
  const assignedAgents = new Set();
  for (const taskType of taskTypes) {
    const agentId = agentMap[taskType];
    if (agentId && !assignedAgents.has(agentId)) {
      assignedAgents.add(agentId);
      const agent = regime.agents.find(a => a.id === agentId);
      steps.push({
        id: stepId++,
        agent: agentId,
        task: taskType,
        description: agent ? `${agent.name}执行: ${taskType}` : taskType,
        dependencies: [1] // 依赖 prompt 优化步骤
      });
    }
  }

  // 最后: 都察院 / 门下省审查（如果有编码类任务）
  if (taskTypes.includes('coding') || taskTypes.includes('devops')) {
    const reviewer = regime.agents.find(a => a.layer === 'review');
    if (reviewer) {
      steps.push({
        id: stepId++,
        agent: reviewer.id,
        task: 'review',
        description: `${reviewer.name}审查`,
        dependencies: steps.filter(s => s.task !== 'optimize_prompt').map(s => s.id)
      });
    }
  }

  return {
    prompt,
    regime: regimeId,
    taskTypes,
    steps,
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  analyzeIntent,
  generatePlan,
  TASK_PATTERNS,
  TASK_AGENT_MAP
};
