/**
 * 制度配置 — 三种可选体制
 *
 * 明朝内阁制 / 唐朝三省制 / 现代企业制
 * 每种制度定义了：Agent 列表、层级关系、审批流程、权限矩阵
 */

// ─── 明朝内阁制 ─────────────────────────────────────

const MING_REGIME = {
  id: 'ming',
  name: '🏮 明朝内阁制',
  description: '司礼监接旨 → 内阁优化 → 六部执行 → 都察院审查',
  style: '快速迭代，集权高效',
  agentCount: 10,
  diagram: `
    天子（用户）
      ▼
    司礼监 ──→ 内阁 ──→ 六部
    (接旨)     (优化)    (执行)
              └──→ 都察院（独立监察）
  `,
  layers: {
    planning: 'zhongshu',   // 中书省 = 司礼监 + 内阁
    review: 'menxia',       // 门下省 = 都察院
    execution: 'shangshu'   // 尚书省 = 六部
  },
  agents: [
    { id: 'silijian', name: '司礼监', emoji: '🏛️', role: '接旨调度', layer: 'planning', canCall: ['*'] },
    { id: 'neige', name: '内阁', emoji: '📜', role: 'Prompt 优化 + 执行计划', layer: 'planning', canCall: [] },
    { id: 'bingbu', name: '兵部', emoji: '⚔️', role: '软件工程 + 编码', layer: 'execution', canCall: [] },
    { id: 'hubu', name: '户部', emoji: '💰', role: '财务分析 + 数据', layer: 'execution', canCall: [] },
    { id: 'libu', name: '礼部', emoji: '🎭', role: '品牌营销 + 内容', layer: 'execution', canCall: [] },
    { id: 'gongbu', name: '工部', emoji: '🔧', role: 'DevOps + 运维', layer: 'execution', canCall: [] },
    { id: 'libu2', name: '吏部', emoji: '📋', role: '项目管理', layer: 'execution', canCall: [] },
    { id: 'xingbu', name: '刑部', emoji: '⚖️', role: '法务合规', layer: 'execution', canCall: [] },
    { id: 'duchayuan', name: '都察院', emoji: '🔍', role: '独立审查', layer: 'review', canCall: [] },
    { id: 'hanlin', name: '翰林院', emoji: '✍️', role: '文书创作', layer: 'execution', canCall: ['hanlin_*'] }
  ],
  flow: ['silijian', 'neige', '{六部}', 'duchayuan'],
  permissions: 'ming' // 引用 permission-guard 的明制权限矩阵
};

// ─── 唐朝三省制 ─────────────────────────────────────

const TANG_REGIME = {
  id: 'tang',
  name: '🐉 唐朝三省制',
  description: '中书起草 → 门下审核 → 尚书执行，三权制衡',
  style: '严谨审核，制衡防错',
  agentCount: 9,
  diagram: `
    天子（用户）
      ▼
    中书省 ──→ 门下省 ──→ 尚书省
    (起草)     (审核)     (执行)
      ↑                     │
      └─── 封驳退回 ←───────┘
  `,
  layers: {
    planning: 'zhongshu',
    review: 'menxia',
    execution: 'shangshu'
  },
  agents: [
    { id: 'zhongshu_ling', name: '中书令', emoji: '📝', role: '起草方案 + 分析需求', layer: 'planning', canCall: ['menxia_shilang'] },
    { id: 'zhongshu_sheren', name: '中书舍人', emoji: '🖊️', role: 'Prompt 优化', layer: 'planning', canCall: [] },
    { id: 'menxia_shilang', name: '门下侍郎', emoji: '🛡️', role: '审核方案 + 权限检查', layer: 'review', canCall: ['shangshu_ling'] },
    { id: 'jishizhong', name: '给事中', emoji: '⚡', role: '封驳权 — 驳回不合理方案', layer: 'review', canCall: ['zhongshu_ling'] },
    { id: 'shangshu_ling', name: '尚书令', emoji: '🏗️', role: '调度六部执行', layer: 'execution', canCall: ['*_bu'] },
    { id: 'li_bu', name: '吏部', emoji: '📋', role: '项目管理', layer: 'execution', canCall: [] },
    { id: 'hu_bu', name: '户部', emoji: '💰', role: '资源管理', layer: 'execution', canCall: [] },
    { id: 'bing_bu', name: '兵部', emoji: '⚔️', role: '编码开发', layer: 'execution', canCall: [] },
    { id: 'gong_bu', name: '工部', emoji: '🔧', role: '运维部署', layer: 'execution', canCall: [] }
  ],
  flow: ['zhongshu_ling', 'zhongshu_sheren', 'menxia_shilang', 'jishizhong?', 'shangshu_ling', '{六部}'],
  // 唐制特色：门下省有封驳权，可以打回中书省
  canReject: { 'jishizhong': ['zhongshu_ling'] },
  permissions: 'tang'
};

// ─── 现代企业制 ─────────────────────────────────────

const MODERN_REGIME = {
  id: 'modern',
  name: '🏢 现代企业制',
  description: 'CEO 决策 → CTO/CFO/CMO 分管 → 团队执行',
  style: '国际化，扁平高效',
  agentCount: 8,
  diagram: `
    CEO（用户 or AI）
    ├── CTO ──→ Engineering Team
    ├── CFO ──→ Finance Team
    ├── CMO ──→ Marketing Team
    └── COO ──→ Operations Team
  `,
  layers: {
    planning: 'zhongshu',
    review: 'menxia',
    execution: 'shangshu'
  },
  agents: [
    { id: 'ceo', name: 'CEO', emoji: '👔', role: '战略决策 + 任务分配', layer: 'planning', canCall: ['*'] },
    { id: 'cto', name: 'CTO', emoji: '💻', role: '技术决策 + 架构', layer: 'planning', canCall: ['engineer', 'devops'] },
    { id: 'cfo', name: 'CFO', emoji: '📊', role: '财务分析 + 预算', layer: 'planning', canCall: ['analyst'] },
    { id: 'cmo', name: 'CMO', emoji: '📢', role: '市场策略 + 品牌', layer: 'planning', canCall: ['marketer'] },
    { id: 'engineer', name: 'Engineer', emoji: '⚙️', role: '编码开发', layer: 'execution', canCall: [] },
    { id: 'devops', name: 'DevOps', emoji: '🔧', role: '运维部署', layer: 'execution', canCall: [] },
    { id: 'analyst', name: 'Analyst', emoji: '📈', role: '数据分析', layer: 'execution', canCall: [] },
    { id: 'marketer', name: 'Marketer', emoji: '🎨', role: '内容创作', layer: 'execution', canCall: [] }
  ],
  flow: ['ceo', '{CXO}', '{teams}'],
  permissions: 'modern'
};

// ─── 注册表 ──────────────────────────────────────────

const REGIMES = {
  ming: MING_REGIME,
  tang: TANG_REGIME,
  modern: MODERN_REGIME
};

/**
 * 列出所有可用制度
 * @returns {Array}
 */
function listRegimes() {
  return Object.values(REGIMES);
}

/**
 * 获取指定制度
 * @param {string} id
 * @returns {object}
 */
function getRegime(id) {
  const regime = REGIMES[id];
  if (!regime) {
    throw new Error(`未知制度: ${id}，可选: ${Object.keys(REGIMES).join(', ')}`);
  }
  return regime;
}

module.exports = {
  REGIMES,
  MING_REGIME,
  TANG_REGIME,
  MODERN_REGIME,
  listRegimes,
  getRegime
};
