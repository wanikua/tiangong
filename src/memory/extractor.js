/**
 * 记忆自动提取 — 起居注官
 *
 * 从对话中自动识别值得记住的信息，存入记忆库
 * 对应 Claude Code 的 extractMemories 服务
 */

const { memoryStore } = require('./store');

/**
 * 记忆提取模式
 */
const EXTRACTION_PATTERNS = [
  // 用户纠正 → mistake
  {
    type: 'mistake',
    patterns: [
      /不要|别|不对|错了|不是这样|stop|don't|wrong|no not/i,
    ],
    weight: 8
  },
  // 用户确认 → skill
  {
    type: 'skill',
    patterns: [
      /对|没错|就这样|很好|完美|perfect|exactly|yes|好的/i,
    ],
    weight: 6
  },
  // 用户偏好 → preference
  {
    type: 'preference',
    patterns: [
      /我喜欢|我习惯|我更倾向|我想要|i prefer|i like|i want|以后都/i,
    ],
    weight: 7
  },
  // 技术决策 → decision
  {
    type: 'decision',
    patterns: [
      /我们用|决定用|选择|采用|we use|let's use|switch to|migrate to/i,
    ],
    weight: 9
  },
  // 项目信息 → context
  {
    type: 'context',
    patterns: [
      /这个项目|这个仓库|这个 repo|this project|this repo|架构是|tech stack/i,
    ],
    weight: 5
  }
];

/**
 * 从用户消息中提取潜在的记忆
 * @param {string} userMessage - 用户消息
 * @param {string} assistantMessage - Agent 回复
 * @param {string} agentId - Agent ID
 * @param {object} [options]
 * @param {string} [options.projectPath] - 项目路径
 * @returns {Array<{ type: string, content: string, weight: number }>}
 */
function extractMemories(userMessage, assistantMessage, agentId, options = {}) {
  const extracted = [];

  for (const rule of EXTRACTION_PATTERNS) {
    for (const pattern of rule.patterns) {
      if (pattern.test(userMessage)) {
        // 提取关键句子（包含匹配的那一句）
        const sentences = userMessage.split(/[。！？\n.!?]/).filter(s => s.trim().length > 5);
        const matchedSentence = sentences.find(s => pattern.test(s));

        if (matchedSentence) {
          extracted.push({
            type: rule.type,
            content: matchedSentence.trim(),
            weight: rule.weight,
            agentId,
            projectPath: options.projectPath
          });
        }
        break; // 每个规则只匹配一次
      }
    }
  }

  return extracted;
}

/**
 * 处理对话并自动保存记忆
 * 在每轮对话后调用
 *
 * @param {string} userMessage
 * @param {string} assistantMessage
 * @param {string} agentId
 * @param {object} [options]
 */
function processConversation(userMessage, assistantMessage, agentId, options = {}) {
  const memories = extractMemories(userMessage, assistantMessage, agentId, options);

  for (const mem of memories) {
    // 根据类型决定存储层级
    if (mem.type === 'preference' || mem.type === 'decision') {
      // 偏好和决策存到朝廷共享记忆
      memoryStore.saveCourtMemory({
        type: mem.type,
        content: mem.content,
        source: agentId,
        weight: mem.weight
      });
    }

    if (mem.type === 'context' && mem.projectPath) {
      // 项目上下文存到项目记忆
      memoryStore.saveProjectMemory(mem.projectPath, {
        type: mem.type,
        content: mem.content,
        source: agentId,
        weight: mem.weight
      });
    }

    // 所有类型都存到 Agent 个人记忆
    memoryStore.saveAgentMemory(agentId, {
      type: mem.type,
      content: mem.content,
      weight: mem.weight,
      tags: [mem.type]
    });
  }

  return memories;
}

module.exports = { extractMemories, processConversation, EXTRACTION_PATTERNS };
