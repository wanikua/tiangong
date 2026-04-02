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

  // ── Step 1: 决策层（中书省/内阁/CEO）分析需求 ──
  const plannerAgent = regime.agents.find(a => a.layer === 'planning' && a.canCall.length > 0);
  const plannerId = plannerAgent ? plannerAgent.id : regime.agents[0].id;
  steps.push({
    id: stepId++,
    agent: plannerId,
    task: 'optimize_prompt',
    description: '分析需求 + 优化 Prompt + 生成详细方案',
    input: prompt
  });

  // ── 唐制特色：中书令 → 门下侍郎（审核） → 尚书令（调度） ──
  // 唐制流程必须经过门下省审核，再由尚书令调度六部
  let executionDependency = 1; // 六部执行依赖的步骤 ID

  if (regimeId === 'tang') {
    // Step 2: 门下侍郎审核方案
    const menxia = regime.agents.find(a => a.id === 'menxia_shilang');
    if (menxia) {
      steps.push({
        id: stepId++,
        agent: 'menxia_shilang',
        task: 'review_plan',
        description: '门下侍郎审核方案',
        dependencies: [1]
      });
    }

    // Step 3: 尚书令调度六部
    const shangshu = regime.agents.find(a => a.id === 'shangshu_ling');
    if (shangshu) {
      const shangshuStepId = stepId++;
      steps.push({
        id: shangshuStepId,
        agent: 'shangshu_ling',
        task: 'dispatch',
        description: '尚书令调度六部执行',
        dependencies: [stepId - 2] // 依赖门下侍郎审核
      });
      executionDependency = shangshuStepId;
    }
  }

  // ── 六部执行 ──
  const assignedAgents = new Set();
  const executionStepIds = [];
  for (const taskType of taskTypes) {
    const agentId = agentMap[taskType];
    if (agentId && !assignedAgents.has(agentId)) {
      // 唐制：跳过已在流程中的 Agent（门下侍郎、尚书令）
      if (regimeId === 'tang' && (agentId === 'menxia_shilang' || agentId === 'shangshu_ling')) {
        continue;
      }
      assignedAgents.add(agentId);
      const agent = regime.agents.find(a => a.id === agentId);
      const sid = stepId++;
      steps.push({
        id: sid,
        agent: agentId,
        task: taskType,
        description: agent ? `${agent.name}执行${taskType}任务` : taskType,
        dependencies: [executionDependency]
      });
      executionStepIds.push(sid);
    }
  }

  // ── 审查步骤 ──
  if (taskTypes.includes('coding') || taskTypes.includes('devops')) {
    // 找审查 Agent（唐制用给事中，明制用都察院，现代制无独立审查）
    let reviewAgent;
    if (regimeId === 'tang') {
      // 唐制：给事中做最终审查（门下侍郎已在流程中审核过方案）
      reviewAgent = regime.agents.find(a => a.id === 'jishizhong');
    } else {
      reviewAgent = regime.agents.find(a => a.layer === 'review');
    }

    if (reviewAgent && executionStepIds.length > 0) {
      steps.push({
        id: stepId++,
        agent: reviewAgent.id,
        task: 'review',
        description: `${reviewAgent.name}审查`,
        dependencies: executionStepIds
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
