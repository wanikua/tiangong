/**
 * 记忆存储 — 太史局
 *
 * @fileoverview 每个 Agent 都有自己的记忆库，朝廷也有共享记忆
 *
 * 记忆分三层：
 * 1. 个人记忆（Agent Memory）— 某个大臣学到的经验
 * 2. 部门记忆（Ministry Memory）— 整个部门积累的知识
 * 3. 朝廷记忆（Court Memory）— 全朝共享的决策和上下文
 *
 * 记忆分五类：
 * - skill: 技能经验（"用 jest 测试比 vitest 快"）
 * - mistake: 犯过的错（"rm -rf 前一定要确认路径"）
 * - preference: 用户偏好（"陛下喜欢简洁输出"）
 * - decision: 重要决策（"这个项目用 TypeScript"）
 * - context: 项目上下文（"这个 repo 用 monorepo 结构"）
 *
 * 存储路径：
 *   ~/.tiangong/memory/
 *   ├── court.json           # 朝廷共享记忆
 *   ├── agents/
 *   │   ├── bingbu.json      # 兵部个人记忆
 *   │   ├── duchayuan.json   # 都察院个人记忆
 *   │   └── ...
 *   └── projects/
 *       └── {project-hash}.json  # 项目级记忆
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── 配置 ────────────────────────────────────────────

const { MEMORY_DIR: MEMORY_ROOT } = require('../config/index');

const MEMORY_TYPES = ['skill', 'mistake', 'preference', 'decision', 'context'];

const MAX_MEMORIES_PER_AGENT = 500;
const MAX_COURT_MEMORIES = 200;

function validateId(id, label = 'ID') {
  // 允许中文/日文/韩文等 Unicode 字符，禁止路径穿越和特殊符号
  if (typeof id !== 'string' || id.length === 0 || id.length > 64 || /[\/\\:*?"<>|.\s]/.test(id)) {
    throw new Error(`[太史局] 非法${label}: ${id}`);
  }
}

// ─── 确保目录存在 ────────────────────────────────────

function ensureDirs() {
  const dirs = [
    MEMORY_ROOT,
    path.join(MEMORY_ROOT, 'agents'),
    path.join(MEMORY_ROOT, 'projects')
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }
}

// ─── 记忆条目 ────────────────────────────────────────

/**
 * @typedef {object} MemoryEntry
 * @property {string} id - 唯一 ID
 * @property {string} type - 类型 (skill/mistake/preference/decision/context)
 * @property {string} content - 记忆内容
 * @property {string} [why] - 为什么记住这个
 * @property {string} source - 来源 Agent ID
 * @property {string} createdAt - 创建时间
 * @property {string} [updatedAt] - 最后更新时间
 * @property {number} weight - 重要性权重 (0-10)
 * @property {number} accessCount - 被检索次数
 * @property {string[]} tags - 标签
 * @property {string} [projectId] - 关联项目 ID
 */

/**
 * 创建记忆条目
 * @param {object} params
 * @returns {MemoryEntry}
 */
function createEntry(params) {
  return {
    id: `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
    type: params.type || 'context',
    content: params.content,
    why: params.why || null,
    source: params.source || 'unknown',
    createdAt: new Date().toISOString(),
    updatedAt: null,
    weight: params.weight || 5,
    accessCount: 0,
    tags: params.tags || [],
    projectId: params.projectId || null
  };
}

// ─── MemoryStore 类 ──────────────────────────────────

class MemoryStore {
  constructor() {
    ensureDirs();
  }

  // ── Agent 个人记忆 ──────────────────────────────

  /**
   * 保存 Agent 记忆
   * @param {string} agentId
   * @param {object} params - { type, content, why, weight, tags, projectId }
   * @returns {MemoryEntry}
   */
  saveAgentMemory(agentId, params) {
    validateId(agentId, 'Agent ID');
    const memories = this._loadAgentMemories(agentId);
    const entry = createEntry({ ...params, source: agentId });

    // 去重：如果内容高度相似，更新而非新增
    const existing = this._findSimilar(memories, entry.content);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      existing.accessCount++;
      existing.weight = Math.min(10, existing.weight + 1); // 重复出现 → 更重要
      if (params.why) existing.why = params.why;
      this._saveAgentMemories(agentId, memories);
      return existing;
    }

    memories.push(entry);

    // 容量控制：淘汰最不重要的
    if (memories.length > MAX_MEMORIES_PER_AGENT) {
      memories.sort((a, b) => this._score(b) - this._score(a));
      memories.length = MAX_MEMORIES_PER_AGENT;
    }

    this._saveAgentMemories(agentId, memories);
    return entry;
  }

  /**
   * 检索 Agent 记忆
   * @param {string} agentId
   * @param {object} [query]
   * @param {string} [query.type] - 按类型筛选
   * @param {string[]} [query.tags] - 按标签筛选
   * @param {string} [query.keyword] - 关键词搜索
   * @param {string} [query.projectId] - 按项目筛选
   * @param {number} [query.limit=20] - 返回数量
   * @returns {MemoryEntry[]}
   */
  recallAgentMemory(agentId, query = {}) {
    validateId(agentId, 'Agent ID');
    let memories = this._loadAgentMemories(agentId);

    // 筛选
    if (query.type) {
      memories = memories.filter(m => m.type === query.type);
    }
    if (query.tags && query.tags.length > 0) {
      memories = memories.filter(m => query.tags.some(t => m.tags.includes(t)));
    }
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      memories = memories.filter(m =>
        m.content.toLowerCase().includes(kw) ||
        (m.why && m.why.toLowerCase().includes(kw)) ||
        m.tags.some(t => t.toLowerCase().includes(kw))
      );
    }
    if (query.projectId) {
      memories = memories.filter(m => m.projectId === query.projectId || m.projectId === null);
    }

    // 按相关性排序
    memories.sort((a, b) => this._score(b) - this._score(a));

    // 更新访问计数
    const limit = query.limit || 20;
    const result = memories.slice(0, limit);

    // 在原始数据中更新 accessCount 后回写
    const allMemories = this._loadAgentMemories(agentId);
    const resultIds = new Set(result.map(m => m.id));
    for (const m of allMemories) {
      if (resultIds.has(m.id)) {
        m.accessCount++;
      }
    }
    this._saveAgentMemories(agentId, allMemories);

    return result;
  }

  /**
   * 获取 Agent 的所有记忆摘要
   * @param {string} agentId
   * @returns {object}
   */
  getAgentMemorySummary(agentId) {
    validateId(agentId, 'Agent ID');
    const memories = this._loadAgentMemories(agentId);
    const byType = {};
    for (const type of MEMORY_TYPES) {
      byType[type] = memories.filter(m => m.type === type).length;
    }
    return {
      agentId,
      total: memories.length,
      byType,
      oldestMemory: memories.length > 0
        ? memories.reduce((a, b) => a.createdAt < b.createdAt ? a : b).createdAt
        : null,
      newestMemory: memories.length > 0
        ? memories.reduce((a, b) => a.createdAt > b.createdAt ? a : b).createdAt
        : null
    };
  }

  // ── 朝廷共享记忆 ───────────────────────────────

  /**
   * 保存朝廷共享记忆
   * @param {object} params
   * @returns {MemoryEntry}
   */
  saveCourtMemory(params) {
    const memories = this._loadCourtMemories();
    const entry = createEntry({ ...params, source: params.source || 'court' });

    const existing = this._findSimilar(memories, entry.content);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      existing.accessCount++;
      this._saveCourtMemories(memories);
      return existing;
    }

    memories.push(entry);
    if (memories.length > MAX_COURT_MEMORIES) {
      memories.sort((a, b) => this._score(b) - this._score(a));
      memories.length = MAX_COURT_MEMORIES;
    }

    this._saveCourtMemories(memories);
    return entry;
  }

  /**
   * 检索朝廷共享记忆
   * @param {object} [query]
   * @returns {MemoryEntry[]}
   */
  recallCourtMemory(query = {}) {
    let memories = this._loadCourtMemories();

    if (query.type) memories = memories.filter(m => m.type === query.type);
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      memories = memories.filter(m => m.content.toLowerCase().includes(kw));
    }

    memories.sort((a, b) => this._score(b) - this._score(a));
    return memories.slice(0, query.limit || 20);
  }

  // ── 项目记忆 ──────────────────────────────────

  /**
   * 获取项目 ID（基于目录路径 hash）
   * @param {string} projectPath
   * @returns {string}
   */
  getProjectId(projectPath) {
    return crypto.createHash('sha256').update(projectPath).digest('hex').slice(0, 12);
  }

  /**
   * 保存项目记忆
   * @param {string} projectPath
   * @param {object} params
   * @returns {MemoryEntry}
   */
  saveProjectMemory(projectPath, params) {
    const projectId = this.getProjectId(projectPath);
    const memories = this._loadProjectMemories(projectId);
    const entry = createEntry({ ...params, projectId });

    const existing = this._findSimilar(memories, entry.content);
    if (existing) {
      existing.updatedAt = new Date().toISOString();
      existing.accessCount++;
      this._saveProjectMemories(projectId, memories);
      return existing;
    }

    memories.push(entry);
    this._saveProjectMemories(projectId, memories);
    return entry;
  }

  /**
   * 检索项目记忆
   * @param {string} projectPath
   * @param {object} [query]
   * @returns {MemoryEntry[]}
   */
  recallProjectMemory(projectPath, query = {}) {
    const projectId = this.getProjectId(projectPath);
    let memories = this._loadProjectMemories(projectId);

    if (query.type) memories = memories.filter(m => m.type === query.type);
    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      memories = memories.filter(m => m.content.toLowerCase().includes(kw));
    }

    memories.sort((a, b) => this._score(b) - this._score(a));
    return memories.slice(0, query.limit || 20);
  }

  // ── 构建上下文注入 Prompt ─────────────────────

  /**
   * 为某个 Agent 构建记忆 Prompt
   * 这是关键方法：把记忆注入到 system prompt 中
   *
   * @param {string} agentId
   * @param {object} [options]
   * @param {string} [options.projectPath] - 当前项目路径
   * @param {string} [options.taskContext] - 当前任务描述（用于相关性匹配）
   * @returns {string} 可直接拼接到 system prompt 的记忆文本
   */
  buildMemoryPrompt(agentId, options = {}) {
    const parts = [];

    // 1. Agent 个人记忆
    const agentMemories = this.recallAgentMemory(agentId, {
      keyword: options.taskContext,
      limit: 10
    });
    if (agentMemories.length > 0) {
      parts.push(`## 你的经验记忆（${agentId}）\n`);
      for (const m of agentMemories) {
        const typeLabel = { skill: '技能', mistake: '教训', preference: '偏好', decision: '决策', context: '上下文' };
        parts.push(`- [${typeLabel[m.type] || m.type}] ${m.content}`);
        if (m.why) parts.push(`  原因: ${m.why}`);
      }
    }

    // 2. 朝廷共享记忆
    const courtMemories = this.recallCourtMemory({
      keyword: options.taskContext,
      limit: 5
    });
    if (courtMemories.length > 0) {
      parts.push(`\n## 朝廷共识\n`);
      for (const m of courtMemories) {
        parts.push(`- ${m.content}`);
      }
    }

    // 3. 项目记忆
    if (options.projectPath) {
      const projectMemories = this.recallProjectMemory(options.projectPath, {
        keyword: options.taskContext,
        limit: 5
      });
      if (projectMemories.length > 0) {
        parts.push(`\n## 项目记忆\n`);
        for (const m of projectMemories) {
          parts.push(`- ${m.content}`);
        }
      }
    }

    return parts.join('\n');
  }

  // ── 导出/导入 ─────────────────────────────────

  /**
   * 导出 Agent 的全部记忆
   * @param {string} agentId
   * @returns {object}
   */
  exportAgentMemory(agentId) {
    validateId(agentId, 'Agent ID');
    return {
      format: 'tiangong-memory/v1',
      agentId,
      memories: this._loadAgentMemories(agentId),
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * 导出朝廷全部记忆
   * @returns {object}
   */
  exportAllMemories() {
    const agentDir = path.join(MEMORY_ROOT, 'agents');
    const agents = {};

    if (fs.existsSync(agentDir)) {
      for (const file of fs.readdirSync(agentDir)) {
        if (file.endsWith('.json')) {
          const agentId = file.replace('.json', '');
          agents[agentId] = this._loadAgentMemories(agentId);
        }
      }
    }

    return {
      format: 'tiangong-memory/v1',
      court: this._loadCourtMemories(),
      agents,
      exportedAt: new Date().toISOString()
    };
  }

  /**
   * 导入记忆
   * @param {object} data - 导出的数据
   * @param {object} [options]
   * @param {boolean} [options.merge=true] - 合并还是覆盖
   */
  importMemories(data, options = { merge: true }) {
    if (data.format !== 'tiangong-memory/v1') {
      throw new Error(`不支持的记忆格式: ${data.format}`);
    }

    // Agent 记忆
    if (data.agents) {
      for (const [agentId, memories] of Object.entries(data.agents)) {
        if (options.merge) {
          const existing = this._loadAgentMemories(agentId);
          for (const m of memories) {
            if (!this._findSimilar(existing, m.content)) {
              existing.push(m);
            }
          }
          this._saveAgentMemories(agentId, existing);
        } else {
          this._saveAgentMemories(agentId, memories);
        }
      }
    }

    // 朝廷记忆
    if (data.court) {
      if (options.merge) {
        const existing = this._loadCourtMemories();
        for (const m of data.court) {
          if (!this._findSimilar(existing, m.content)) {
            existing.push(m);
          }
        }
        this._saveCourtMemories(existing);
      } else {
        this._saveCourtMemories(data.court);
      }
    }

    // 单个 Agent 记忆
    if (data.agentId && data.memories) {
      const agentId = data.agentId;
      if (options.merge) {
        const existing = this._loadAgentMemories(agentId);
        for (const m of data.memories) {
          if (!this._findSimilar(existing, m.content)) {
            existing.push(m);
          }
        }
        this._saveAgentMemories(agentId, existing);
      } else {
        this._saveAgentMemories(agentId, data.memories);
      }
    }
  }

  // ── 遗忘（删除记忆） ─────────────────────────

  /**
   * 删除 Agent 的某条记忆
   * @param {string} agentId
   * @param {string} memoryId
   */
  forgetAgentMemory(agentId, memoryId) {
    validateId(agentId, 'Agent ID');
    const memories = this._loadAgentMemories(agentId);
    const filtered = memories.filter(m => m.id !== memoryId);
    this._saveAgentMemories(agentId, filtered);
  }

  /**
   * 清空 Agent 的全部记忆
   * @param {string} agentId
   */
  wipeAgentMemory(agentId) {
    validateId(agentId, 'Agent ID');
    this._saveAgentMemories(agentId, []);
  }

  // ── 内部方法 ──────────────────────────────────

  /** @private 加载 Agent 记忆 */
  _loadAgentMemories(agentId) {
    validateId(agentId, 'Agent ID');
    const filePath = path.join(MEMORY_ROOT, 'agents', `${agentId}.json`);
    return this._loadJSON(filePath);
  }

  /** @private 保存 Agent 记忆 */
  _saveAgentMemories(agentId, memories) {
    validateId(agentId, 'Agent ID');
    const filePath = path.join(MEMORY_ROOT, 'agents', `${agentId}.json`);
    this._saveJSON(filePath, memories);
  }

  /** @private 加载朝廷记忆 */
  _loadCourtMemories() {
    return this._loadJSON(path.join(MEMORY_ROOT, 'court.json'));
  }

  /** @private 保存朝廷记忆 */
  _saveCourtMemories(memories) {
    this._saveJSON(path.join(MEMORY_ROOT, 'court.json'), memories);
  }

  /** @private 加载项目记忆 */
  _loadProjectMemories(projectId) {
    return this._loadJSON(path.join(MEMORY_ROOT, 'projects', `${projectId}.json`));
  }

  /** @private 保存项目记忆 */
  _saveProjectMemories(projectId, memories) {
    this._saveJSON(path.join(MEMORY_ROOT, 'projects', `${projectId}.json`), memories);
  }

  /** @private */
  _loadJSON(filePath) {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(MEMORY_ROOT))) {
      throw new Error(`[太史局] 路径越界: ${filePath}`);
    }
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return [];
  }

  /** @private */
  _saveJSON(filePath, data) {
    const resolved = path.resolve(filePath);
    if (!resolved.startsWith(path.resolve(MEMORY_ROOT))) {
      throw new Error(`[太史局] 路径越界: ${filePath}`);
    }
    ensureDirs();
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  }

  /**
   * 查找内容相似的记忆（简单子串匹配，未来可换向量搜索）
   * @private
   */
  _findSimilar(memories, content) {
    const normalized = content.toLowerCase().trim();
    return memories.find(m => {
      const existing = m.content.toLowerCase().trim();
      // 完全相同，或一方包含另一方 80% 以上
      if (existing === normalized) return true;
      if (normalized.length > 20 && existing.includes(normalized.slice(0, Math.floor(normalized.length * 0.8)))) return true;
      if (existing.length > 20 && normalized.includes(existing.slice(0, Math.floor(existing.length * 0.8)))) return true;
      return false;
    });
  }

  /**
   * 记忆评分（用于排序和淘汰）
   * @private
   */
  _score(entry) {
    const ageMs = Date.now() - new Date(entry.createdAt).getTime();
    const ageDays = ageMs / (1000 * 60 * 60 * 24);

    // 权重 × 访问频率 × 时间衰减
    const weightScore = entry.weight * 10;
    const accessScore = Math.log2(entry.accessCount + 1) * 5;
    const recencyScore = Math.max(0, 50 - ageDays); // 50天内的记忆有加分

    // mistake 类型记忆不容易遗忘（教训要记住）
    const typeBonus = entry.type === 'mistake' ? 20 : 0;

    return weightScore + accessScore + recencyScore + typeBonus;
  }
}

// ─── 单例 ────────────────────────────────────────────

const memoryStore = new MemoryStore();

module.exports = { MemoryStore, memoryStore, MEMORY_TYPES, MEMORY_ROOT };
