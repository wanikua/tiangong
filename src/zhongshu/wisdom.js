/**
 * 慧根系统 — 思维框架 × 古文智慧
 *
 * 将 thinking-frameworks 的结构化思考方法
 * 与中国古典文献的智慧融合，植入 Agent 的 System Prompt 中。
 *
 * 每个 Agent 根据其职能匹配不同的思维框架和古文慧根，
 * 让大臣们既有结构化思考能力，又有古人的智慧加持。
 *
 * 来源：https://github.com/wanikua/thinking-frameworks
 */

// ─── 思维框架库 ─────────────────────────────────────

const THINKING_FRAMEWORKS = {
  // ── 战略思考 ──
  first_principles: {
    name: '第一性原理',
    category: 'strategic',
    prompt: `运用第一性原理思考：
1. 明确问题本质，剥离一切假设
2. 将问题分解到最基础的事实
3. 从基础事实重新推导解决方案
不要因为"大家都这么做"就沿用旧方案。`,
    bestFor: ['planning', 'execution'],
    agentAffinity: ['neige', 'ceo', 'cto', 'zhongshu_ling']
  },
  swot: {
    name: 'SWOT 分析',
    category: 'strategic',
    prompt: `对方案进行 SWOT 分析：
S(优势): 方案的核心优点
W(劣势): 潜在的弱点和风险
O(机会): 可以利用的外部条件
T(威胁): 需要警惕的外部风险`,
    bestFor: ['planning'],
    agentAffinity: ['neige', 'ceo', 'zhongshu_ling']
  },

  // ── 问题分析 ──
  five_whys: {
    name: '5 Whys',
    category: 'analytical',
    prompt: `使用 5 Whys 法追根溯源：
连续追问五次"为什么"，直到找到根本原因。
不要停留在表面症状，要深入到系统性原因。`,
    bestFor: ['review', 'execution'],
    agentAffinity: ['duchayuan', 'xingbu', 'jishizhong', 'cto']
  },
  mece: {
    name: 'MECE 原则',
    category: 'analytical',
    prompt: `运用 MECE 原则（相互独立，完全穷尽）：
确保分析的维度之间不重叠、不遗漏。
列举时检查：是否有交叉？是否有遗漏？`,
    bestFor: ['planning', 'review'],
    agentAffinity: ['neige', 'duchayuan', 'ceo', 'zhongshu_ling']
  },
  systems_thinking: {
    name: '系统思考',
    category: 'analytical',
    prompt: `运用系统思考：
不要只看局部，要看整个系统的反馈回路。
思考：这个改动会影响哪些上下游？有无副作用？`,
    bestFor: ['planning', 'review'],
    agentAffinity: ['neige', 'duchayuan', 'cto', 'zhongshu_ling']
  },

  // ── 决策框架 ──
  decision_matrix: {
    name: '决策矩阵',
    category: 'decision',
    prompt: `使用决策矩阵评估方案：
列出所有候选方案，按多个维度（正确性、性能、可维护性、成本）打分，
选择综合得分最高的方案。`,
    bestFor: ['planning'],
    agentAffinity: ['neige', 'ceo', 'zhongshu_ling']
  },
  risk_matrix: {
    name: '风险矩阵',
    category: 'decision',
    prompt: `构建风险矩阵：
按"可能性"和"影响程度"两个维度评估每个风险点。
高可能×高影响 = 必须立即处理。`,
    bestFor: ['review'],
    agentAffinity: ['duchayuan', 'xingbu', 'jishizhong']
  },

  // ── 创新思维 ──
  reverse_thinking: {
    name: '逆向思考',
    category: 'creative',
    prompt: `尝试逆向思考：
不想"怎么做对"，先想"怎么做一定会错"。
找到所有可能的失败路径，然后逐一规避。`,
    bestFor: ['review', 'execution'],
    agentAffinity: ['duchayuan', 'xingbu', 'jishizhong']
  },
  six_hats: {
    name: '六顶思考帽',
    category: 'creative',
    prompt: `用六顶思考帽多角度分析：
🤍 白帽(事实): 客观数据和事实是什么？
🔴 红帽(直觉): 直觉告诉你什么？
⚫ 黑帽(谨慎): 有什么风险和问题？
🟡 黄帽(乐观): 有什么好处和机会？
🟢 绿帽(创新): 有没有更好的创新方案？
🔵 蓝帽(全局): 总结判断，最终方案是什么？`,
    bestFor: ['planning'],
    agentAffinity: ['neige', 'ceo', 'zhongshu_ling']
  }
};

// ─── 古文慧根库 ─────────────────────────────────────

const ANCIENT_WISDOM = {
  // ── 决策层慧根 ──
  planning: [
    { text: '凡事预则立，不预则废。', source: '《礼记·中庸》', meaning: '谋定而后动' },
    { text: '运筹帷幄之中，决胜千里之外。', source: '《史记》', meaning: '深思远虑' },
    { text: '不谋全局者，不足谋一域。', source: '陈澹然', meaning: '全局观' },
    { text: '知彼知己，百战不殆。', source: '《孙子兵法》', meaning: '充分调研' },
    { text: '善战者，求之于势，不责于人。', source: '《孙子兵法》', meaning: '借势而为' },
    { text: '工欲善其事，必先利其器。', source: '《论语》', meaning: '准备充分' },
  ],

  // ── 审核层慧根 ──
  review: [
    { text: '千里之堤，毁于蚁穴。', source: '《韩非子》', meaning: '细节决定成败' },
    { text: '明察秋毫之末，而不见舆薪。', source: '《孟子》', meaning: '警惕盲点' },
    { text: '流水不腐，户枢不蠹。', source: '《吕氏春秋》', meaning: '保持审视' },
    { text: '防民之口，甚于防川。', source: '《国语》', meaning: '堵不如疏' },
    { text: '兼听则明，偏信则暗。', source: '《资治通鉴》', meaning: '多方验证' },
  ],

  // ── 执行层慧根 ──
  execution: [
    { text: '天下大事，必作于细。', source: '《道德经》', meaning: '注重细节' },
    { text: '九层之台，起于累土。', source: '《道德经》', meaning: '循序渐进' },
    { text: '不积跬步，无以至千里。', source: '《荀子》', meaning: '积少成多' },
    { text: '锲而不舍，金石可镂。', source: '《荀子》', meaning: '坚持不懈' },
    { text: '纸上得来终觉浅，绝知此事要躬行。', source: '陆游', meaning: '实践为先' },
    { text: '删繁就简三秋树，领异标新二月花。', source: '郑板桥', meaning: '简洁创新' },
  ],

  // ── 通用慧根 ──
  universal: [
    { text: '学而不思则罔，思而不学则殆。', source: '《论语》', meaning: '学思结合' },
    { text: '大道至简。', source: '《道德经》', meaning: '简单即力量' },
    { text: '穷则变，变则通，通则久。', source: '《易经》', meaning: '灵活应变' },
    { text: '知其然，知其所以然。', source: '朱熹', meaning: '深入理解' },
    { text: '博观而约取，厚积而薄发。', source: '苏轼', meaning: '深厚积累' },
  ]
};

// ─── 慧根注入 ────────────────────────────────────────

/**
 * 为 Agent 生成思维框架 + 古文慧根 Prompt
 *
 * @param {string} agentId - Agent ID
 * @param {string} layer - 层级 (planning / review / execution)
 * @param {object} [options]
 * @param {string} [options.taskType] - 任务类型（用于匹配最佳框架）
 * @param {boolean} [options.includeWisdom=true] - 是否包含古文慧根
 * @returns {string}
 */
function buildWisdomPrompt(agentId, layer, options = {}) {
  const parts = [];

  // 1. 匹配思维框架
  const frameworks = Object.values(THINKING_FRAMEWORKS)
    .filter(f => {
      // 按层级和 Agent 匹配
      if (f.bestFor.includes(layer)) return true;
      if (f.agentAffinity.includes(agentId)) return true;
      return false;
    })
    .slice(0, 2); // 每次最多注入 2 个框架

  if (frameworks.length > 0) {
    parts.push('\n## 思维框架\n');
    parts.push('在回答前，请运用以下思维框架：\n');
    for (const fw of frameworks) {
      parts.push(`### ${fw.name}`);
      parts.push(fw.prompt);
      parts.push('');
    }
  }

  // 2. 注入古文慧根
  if (options.includeWisdom !== false) {
    const wisdomPool = [
      ...(ANCIENT_WISDOM[layer] || []),
      ...ANCIENT_WISDOM.universal
    ];

    // 根据 agentId 确定性选 2 条（每个 Agent 的慧根固定，形成"性格"）
    const hash = Array.from(agentId).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const w1 = wisdomPool[Math.abs(hash) % wisdomPool.length];
    const w2 = wisdomPool[Math.abs(hash * 3 + 7) % wisdomPool.length];

    if (w1) {
      parts.push('\n## 慧根\n');
      parts.push(`「${w1.text}」—— ${w1.source}`);
      parts.push(`释义：${w1.meaning}。将此智慧融入你的工作中。`);
      if (w2 && w2.text !== w1.text) {
        parts.push(`「${w2.text}」—— ${w2.source}`);
      }
    }
  }

  return parts.join('\n');
}

/**
 * 获取随机慧根（用于 REPL 启动时显示）
 * @returns {object}
 */
function getRandomWisdom() {
  const all = [
    ...ANCIENT_WISDOM.planning,
    ...ANCIENT_WISDOM.review,
    ...ANCIENT_WISDOM.execution,
    ...ANCIENT_WISDOM.universal
  ];
  return all[Math.floor(Math.random() * all.length)];
}

module.exports = {
  THINKING_FRAMEWORKS,
  ANCIENT_WISDOM,
  buildWisdomPrompt,
  getRandomWisdom
};
