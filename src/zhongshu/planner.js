/**
 * 中书省 — 起草执行计划
 *
 * 双模式路由：
 *   L0 快速路由 — 简单对话 / 单步任务，正则匹配直接分发
 *   L1 LLM 路由 — 复杂任务，用 LLM 做真正的任务分解 + Agent 选择
 *
 * 这是 AGI 闭环的起点：智能规划 → 多 Agent 执行 → 自动评估 → 自进化
 */

const { getRegime } = require('../config/regimes');
const { callLLM } = require('../shangshu/li/api-client');
const { loadConfig } = require('../config/index');
const { createLogger } = require('../utils/logger');
const { execBash } = require('../shangshu/bing/bash');

const log = createLogger('planner');

// ─── 简单对话识别（L0 快速路由）─────────────────────

/**
 * 判断是否走快速路径（单 Agent + 工具，像 Claude Code）
 *
 * 快速路径条件（满足任一）：
 *   1. 非祈使句（问答/闲聊）
 *   2. 单领域任务（只匹配 1 个 TASK_PATTERN）
 *
 * 多 Agent 条件：
 *   - 祈使句 + 跨领域（匹配 2+ 个 TASK_PATTERN）
 */
function isSimpleChat(prompt) {
  const trimmed = prompt.trim();

  // 非祈使句 → 快速路径
  const IMPERATIVE = /^(帮|请|麻烦|给我|替我|为我|需要你|你来|你去|开始|立刻|马上)?.{0,4}(写|编|实现|开发|创建|重构|修复|部署|发布|搭建|生成|做|改|删|加|添加|移除|执行|运行|启动|构建|设计|优化|迁移|升级|配置|安装|测试)/;
  if (!IMPERATIVE.test(trimmed)) {
    return true;
  }

  // 祈使句但单领域 → 快速路径（一个 Agent 就够了）
  const matchedDomains = Object.values(TASK_PATTERNS).filter(p => p.test(trimmed));
  if (matchedDomains.length <= 1) {
    return true;
  }

  // 跨领域（2+ 域）→ 多 Agent
  return false;
}

// ─── 任务类型识别（正则，用于 fallback + L1 辅助）────

const TASK_PATTERNS = {
  coding: /写(代码|函数|方法|脚本|程序|接口|组件|模块|页面|工具)|编(程|写|码)|实现|开发|创建|重构|修复|bug|代码|function|class|api|接口|组件/i,
  review: /审查|review|检查|评审|安全/i,
  devops: /部署|运维|docker|ci|cd|发布|服务器|监控/i,
  finance: /财务|预算|成本|分析|数据|报表|报告/i,
  marketing: /营销|品牌|文案|推广|内容|社交|设计/i,
  management: /项目|管理|计划|进度|排期|任务/i,
  legal: /合规|法律|合同|协议|license|隐私/i,
  writing: /写作|小说|文章|文档|翻译/i
};

const TASK_AGENT_MAP = {
  ming: {
    coding: 'bingbu', review: 'duchayuan', devops: 'gongbu',
    finance: 'hubu', marketing: 'libu', management: 'libu2',
    legal: 'xingbu', writing: 'hanlin'
  },
  tang: {
    coding: 'bing_bu', review: 'menxia_shilang', devops: 'gong_bu',
    finance: 'hu_bu', marketing: 'gong_bu', management: 'li_bu',
    legal: 'li_bu', writing: 'gong_bu'
  },
  modern: {
    coding: 'engineer', review: 'cto', devops: 'devops',
    finance: 'analyst', marketing: 'marketer', management: 'ceo',
    legal: 'cfo', writing: 'marketer'
  }
};

function analyzeIntent(prompt) {
  const matched = [];
  for (const [type, pattern] of Object.entries(TASK_PATTERNS)) {
    if (pattern.test(prompt)) matched.push(type);
  }
  return matched.length > 0 ? matched : ['coding'];
}

// ─── 项目上下文采集 ──────────────────────────────────

/**
 * 快速采集当前项目上下文（给 LLM planner 用）
 * @param {string} cwd
 * @returns {Promise<string>}
 */
async function gatherProjectContext(cwd) {
  const parts = [];

  try {
    // Git 状态（最有信息量）
    const git = await execBash('git status --short 2>/dev/null && echo "---" && git log --oneline -5 2>/dev/null', { cwd, timeout: 5000 });
    if (git.stdout.trim()) {
      parts.push(`## Git 状态\n${git.stdout.trim()}`);
    }

    // 项目结构（顶层 + src 一层）
    const tree = await execBash('ls -1 2>/dev/null && echo "---src/---" && ls -1 src/ 2>/dev/null', { cwd, timeout: 3000 });
    if (tree.stdout.trim()) {
      parts.push(`## 项目结构\n${tree.stdout.trim()}`);
    }

    // package.json 关键信息
    const pkg = await execBash('cat package.json 2>/dev/null | head -20', { cwd, timeout: 3000 });
    if (pkg.stdout.trim()) {
      parts.push(`## package.json (前20行)\n${pkg.stdout.trim()}`);
    }
  } catch (err) {
    log.debug('采集项目上下文失败:', err.message);
  }

  return parts.join('\n\n');
}

// ─── L1 LLM 智能规划 ────────────────────────────────

/**
 * 用 LLM 做真正的任务分解
 * @param {string} prompt - 用户原始输入
 * @param {string} regimeId
 * @param {object} [options]
 * @param {string} [options.cwd]
 * @returns {Promise<object>} 执行计划
 */
async function generateSmartPlan(prompt, regimeId = 'ming', options = {}) {
  const config = loadConfig() || {};
  const regime = getRegime(regimeId);
  const agentList = regime.agents.map(a =>
    `  - ${a.id} (${a.name}): ${a.role} [${a.layer}层]`
  ).join('\n');

  // 采集项目上下文
  const projectContext = options.cwd
    ? await gatherProjectContext(options.cwd)
    : '';

  const systemPrompt = `你是天工开物的中书省规划引擎。你的任务是分析用户需求，将其分解为可执行的步骤，并分配给合适的 Agent。

## 可用 Agent
${agentList}

## 规则
1. 每个 step 必须有: agent(从上面选), task(任务类型), description(具体描述，告诉 agent 要做什么)
2. 简单任务（1个 agent 能完成的）只需 1 个 step
3. 复杂任务要拆成多步，用 dependencies 表示先后顺序
4. coding 或 devops 任务结束后要加 review 步骤
5. 第一个 step 通常是 planning 层的 agent 做需求分析
6. description 要具体！不要写"执行任务"，要写"读取 src/auth.js，找到登录函数，修复 token 过期不刷新的问题"

## 输出格式（严格 JSON）
\`\`\`json
{
  "taskTypes": ["coding"],
  "steps": [
    {"id": 1, "agent": "silijian", "task": "analyze", "description": "具体描述..."},
    {"id": 2, "agent": "bingbu", "task": "coding", "description": "具体描述...", "dependencies": [1]},
    {"id": 3, "agent": "duchayuan", "task": "review", "description": "审查步骤2的代码", "dependencies": [2]}
  ]
}
\`\`\`

只输出 JSON，不要输出其他内容。`;

  const userContent = projectContext
    ? `用户需求: ${prompt}\n\n${projectContext}`
    : `用户需求: ${prompt}`;

  try {
    const response = await callLLM({
      model: config.model,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
      maxTokens: 1024,
      _tiangong: { taskType: 'planning', agentId: 'planner', layer: 'planning', isSimple: false }
    });

    const content = response.content || '';

    // 从响应中提取 JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      log.warn('LLM planner 未返回有效 JSON，降级到正则规划');
      return null; // fallback to regex
    }

    const parsed = JSON.parse(jsonMatch[0]);

    // 校验 plan 结构
    if (!parsed.steps || !Array.isArray(parsed.steps) || parsed.steps.length === 0) {
      log.warn('LLM plan 结构无效，降级到正则规划');
      return null;
    }

    // 校验每个 step 的 agent 是否存在
    const agentIds = new Set(regime.agents.map(a => a.id));
    for (const step of parsed.steps) {
      if (!agentIds.has(step.agent)) {
        log.warn(`LLM 选择了不存在的 agent: ${step.agent}，降级到正则规划`);
        return null;
      }
    }

    return {
      prompt,
      regime: regimeId,
      taskTypes: parsed.taskTypes || analyzeIntent(prompt),
      steps: parsed.steps,
      planMethod: 'llm', // 标记是 LLM 规划的
      createdAt: new Date().toISOString()
    };
  } catch (err) {
    log.warn('LLM 规划失败，降级到正则规划:', err.message);
    return null; // fallback
  }
}

// ─── 主入口：generatePlan ────────────────────────────

/**
 * 生成执行计划（双模式）
 *
 * L0: 简单对话 → 单 agent 直答
 * L1: 复杂任务 → 先尝试 LLM 规划，失败则降级正则规划
 *
 * @param {string} prompt
 * @param {string} regimeId
 * @param {object} [options]
 * @param {string} [options.cwd] - 工作目录（传入则自动采集项目上下文）
 * @param {boolean} [options.forceLLM=false] - 强制用 LLM 规划
 * @returns {Promise<object>|object} 执行计划
 */
async function generatePlan(prompt, regimeId = 'ming', options = {}) {
  const regime = getRegime(regimeId);

  // ── L0: 简单对话 → 快速直答 ──
  if (!options.forceLLM && isSimpleChat(prompt)) {
    const plannerAgent = regime.agents.find(a => a.layer === 'planning' && a.canCall.length > 0);
    return {
      prompt,
      regime: regimeId,
      taskTypes: ['chat'],
      planMethod: 'fast',
      steps: [{
        id: 1,
        agent: plannerAgent ? plannerAgent.id : regime.agents[0].id,
        task: 'chat',
        description: '直接回答',
        input: prompt
      }],
      createdAt: new Date().toISOString()
    };
  }

  // ── L1: 复杂任务 → 尝试 LLM 智能规划 ──
  const smartPlan = await generateSmartPlan(prompt, regimeId, options);
  if (smartPlan) {
    log.info(`LLM 规划成功: ${smartPlan.steps.length} 步`);
    return smartPlan;
  }

  // ── Fallback: 正则规划 ──
  log.info('使用正则 fallback 规划');
  return generateRegexPlan(prompt, regimeId);
}

/**
 * 正则 fallback 规划（原 generatePlan 逻辑）
 * @private
 */
function generateRegexPlan(prompt, regimeId) {
  const regime = getRegime(regimeId);
  const taskTypes = analyzeIntent(prompt);
  const agentMap = TASK_AGENT_MAP[regimeId] || TASK_AGENT_MAP.ming;

  const steps = [];
  let stepId = 1;

  // 决策层分析需求
  const plannerAgent = regime.agents.find(a => a.layer === 'planning' && a.canCall.length > 0);
  const plannerId = plannerAgent ? plannerAgent.id : regime.agents[0].id;
  steps.push({
    id: stepId++,
    agent: plannerId,
    task: 'optimize_prompt',
    description: '分析需求 + 优化 Prompt + 生成详细方案',
    input: prompt
  });

  let executionDependency = 1;

  // 唐制特色：中书令 → 门下侍郎 → 尚书令
  if (regimeId === 'tang') {
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
    const shangshu = regime.agents.find(a => a.id === 'shangshu_ling');
    if (shangshu) {
      const shangshuStepId = stepId++;
      steps.push({
        id: shangshuStepId,
        agent: 'shangshu_ling',
        task: 'dispatch',
        description: '尚书令调度六部执行',
        dependencies: [stepId - 2]
      });
      executionDependency = shangshuStepId;
    }
  }

  // 六部执行
  const assignedAgents = new Set();
  const executionStepIds = [];
  for (const taskType of taskTypes) {
    const agentId = agentMap[taskType];
    if (agentId && !assignedAgents.has(agentId)) {
      if (regimeId === 'tang' && (agentId === 'menxia_shilang' || agentId === 'shangshu_ling')) continue;
      assignedAgents.add(agentId);
      const agent = regime.agents.find(a => a.id === agentId);
      const sid = stepId++;
      steps.push({
        id: sid, agent: agentId, task: taskType,
        description: agent ? `${agent.name}执行${taskType}任务` : taskType,
        dependencies: [executionDependency]
      });
      executionStepIds.push(sid);
    }
  }

  // 审查步骤
  if (taskTypes.includes('coding') || taskTypes.includes('devops')) {
    let reviewAgent;
    if (regimeId === 'tang') {
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
    prompt, regime: regimeId, taskTypes, steps,
    planMethod: 'regex',
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  analyzeIntent,
  generatePlan,
  generateSmartPlan,
  gatherProjectContext,
  isSimpleChat,
  TASK_PATTERNS,
  TASK_AGENT_MAP
};
