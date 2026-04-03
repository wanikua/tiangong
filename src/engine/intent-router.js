/**
 * LLM 语义意图路由器 — Tool-use 驱动
 *
 * 参考 Claude Code 的 tool-use 路由方式：
 * 用 LLM 的 tool_use 能力判断用户自然语言是否匹配某个功能命令。
 *
 * 优势（vs 正则匹配）：
 * - "兵部和吏部配吗" → 识别为性格/合拍度查询，不会误判为 PK
 * - "花了多少钱" vs "帮我分析成本" → 前者是 /cost，后者是工作任务
 * - 自然理解中英文混合、口语化表达
 */

const { callLLM } = require('../shangshu/li/api-client');
const { loadConfig } = require('../config/index');
const { getRegime } = require('../config/regimes');
const { createLogger } = require('../utils/logger');
const log = createLogger('intent-router');

// 意图分类超时（ms）— 不值得等太久
const INTENT_TIMEOUT_MS = 8000;

/**
 * 构建命令工具定义（Anthropic tool 格式）
 * @param {string} regimeId
 * @returns {Array}
 */
function buildCommandTools(regimeId) {
  let agentList;
  try {
    const regime = getRegime(regimeId);
    agentList = regime.agents.map(a => `${a.id}(${a.name})`).join(', ');
  } catch {
    agentList = 'bingbu(兵部), gongbu(工部), hubu(户部), libu(礼部), duchayuan(都察院)';
  }

  return [
    {
      name: 'cmd_pk',
      description: `发起 Agent PK 对决，让两个 Agent 对同一任务各自完成并比较。可用 Agent: ${agentList}`,
      input_schema: {
        type: 'object',
        properties: {
          agent1: { type: 'string', description: '第一个参赛 Agent ID' },
          agent2: { type: 'string', description: '第二个参赛 Agent ID' },
          topic: { type: 'string', description: 'PK 题目' },
          judge: { type: 'string', description: '评判 Agent ID（可选）' }
        },
        required: ['agent1', 'agent2', 'topic']
      }
    },
    {
      name: 'cmd_debate',
      description: '发起廷议/辩论，多 Agent 就话题多轮讨论',
      input_schema: {
        type: 'object',
        properties: {
          topic: { type: 'string', description: '讨论话题' },
          rounds: { type: 'number', description: '轮数，默认2' }
        },
        required: ['topic']
      }
    },
    {
      name: 'cmd_exam',
      description: `科举考试，测试 Agent 能力。可用 Agent: ${agentList}`,
      input_schema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent ID' }
        },
        required: ['agent']
      }
    },
    {
      name: 'cmd_rank',
      description: '查看功勋排行榜/战绩',
      input_schema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: '某 Agent 详细战绩（可选）' }
        }
      }
    },
    {
      name: 'cmd_cost',
      description: '查看本次会话花费/token 消耗/户部账目',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cmd_collab',
      description: '多 Agent 协同编码任务',
      input_schema: {
        type: 'object',
        properties: {
          task: { type: 'string', description: '协同任务描述' }
        },
        required: ['task']
      }
    },
    {
      name: 'cmd_court',
      description: '查看朝廷架构/所有大臣/百官列表',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cmd_personality',
      description: `查看 Agent 性格档案(MBTI/星座)，或查两个 Agent 的合拍度/兼容性。可用 Agent: ${agentList}`,
      input_schema: {
        type: 'object',
        properties: {
          agent: { type: 'string', description: 'Agent ID' },
          agent2: { type: 'string', description: '第二个 Agent ID，查合拍度时用（可选）' }
        }
      }
    },
    {
      name: 'cmd_treasure',
      description: '寻宝游戏',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cmd_dream',
      description: '朝堂梦境/项目分析预测',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cmd_regime',
      description: '切换朝代制度（ming=明朝内阁制, tang=唐朝三省制, modern=现代企业制）',
      input_schema: {
        type: 'object',
        properties: {
          regime: { type: 'string', enum: ['ming', 'tang', 'modern'] }
        },
        required: ['regime']
      }
    },
    {
      name: 'cmd_help',
      description: '显示帮助/可用命令列表',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cmd_exit',
      description: '退朝/退出程序',
      input_schema: { type: 'object', properties: {} }
    },
    {
      name: 'cmd_clear',
      description: '清屏',
      input_schema: { type: 'object', properties: {} }
    }
  ];
}

const SYSTEM_PROMPT = `你是天工开物 CLI 的意图路由器。判断用户输入是否要执行某个功能命令。

规则：
- 用户明确想用某功能（PK/考试/排行/看性格等）→ 调用对应工具
- 用户在提问、聊天、或下达编码/分析等工作任务 → 不调用任何工具，只回复 "pass"
- 关键区分：
  - "让兵部和工部PK写排序" → cmd_pk
  - "兵部和吏部配吗" → cmd_personality（查合拍度）
  - "花了多少钱" → cmd_cost
  - "帮我写个登录页" → 不调用工具（工作任务）
  - "你能帮我做什么" → 不调用工具（普通提问）
只做分类，不要生成完整回答。`;

/**
 * LLM 语义意图识别
 *
 * @param {string} input - 用户自然语言输入
 * @param {string} regimeId - 当前制度 ID
 * @returns {Promise<string|null>} 路由后的 /command 字符串，或 null（走正常对话）
 */
async function routeIntent(input, regimeId) {
  const config = loadConfig() || {};
  const tools = buildCommandTools(regimeId);

  try {
    const result = await Promise.race([
      callLLM({
        model: config.model,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: input }],
        tools,
        maxTokens: 150,
        _tiangong: { taskType: 'intent', isSimple: true }
      }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('intent_timeout')), INTENT_TIMEOUT_MS)
      )
    ]);

    if (result.toolCalls && result.toolCalls.length > 0) {
      const cmd = toolCallToCommand(result.toolCalls[0]);
      if (cmd) log.debug(`意图识别: "${input}" → ${cmd}`);
      return cmd;
    }

    return null;
  } catch (err) {
    log.debug('意图识别跳过:', err.message);
    return null;
  }
}

/**
 * 工具调用 → /command 字符串
 * @param {{ name: string, input: object }} toolCall
 * @returns {string|null}
 */
function toolCallToCommand(toolCall) {
  const { name, input: p } = toolCall;
  if (!p) return null;

  switch (name) {
    case 'cmd_pk': {
      const judge = p.judge ? `--judge ${p.judge} ` : '';
      return `/pk ${judge}${p.agent1} ${p.agent2} "${p.topic}"`;
    }
    case 'cmd_debate': {
      const rounds = p.rounds ? ` --rounds ${p.rounds}` : '';
      return `/debate "${p.topic}"${rounds}`;
    }
    case 'cmd_exam':
      return `/exam ${p.agent}`;
    case 'cmd_rank':
      return p.agent ? `/rank ${p.agent}` : '/rank';
    case 'cmd_cost':
      return '/cost';
    case 'cmd_collab':
      return `/collab "${p.task}"`;
    case 'cmd_court':
      return '/court';
    case 'cmd_personality': {
      if (p.agent && p.agent2) return `/personality chemistry ${p.agent} ${p.agent2}`;
      return p.agent ? `/personality ${p.agent}` : '/personality';
    }
    case 'cmd_treasure':
      return '/treasure hunt';
    case 'cmd_dream':
      return '/dream';
    case 'cmd_regime':
      return `/regime ${p.regime}`;
    case 'cmd_help':
      return '/help';
    case 'cmd_exit':
      return '/exit';
    case 'cmd_clear':
      return '/clear';
    default:
      return null;
  }
}

module.exports = { routeIntent };
