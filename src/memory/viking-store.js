/**
 * VikingStore — OpenViking 式上下文文件系统
 *
 * 借鉴字节跳动 OpenViking 的架构，用文件系统范式管理 Agent 记忆。
 * 把传统的"碎片化向量存储"替换为结构化的虚拟文件系统。
 *
 * 核心概念：
 *   viking://resources/  — 项目资源（代码、文档、配置）
 *   viking://user/       — 用户信息（偏好、历史、上下文）
 *   viking://agent/      — Agent 能力（技能、经验、教训）
 *
 * L0/L1/L2 三层上下文（按需加载，节省 80%+ token）：
 *   L0 (摘要)   — <100 tokens，一句话描述，用于快速定位
 *   L1 (概览)   — <2000 tokens，核心信息+使用场景，用于规划决策
 *   L2 (详情)   — 完整内容，仅在实际执行时按需加载
 *
 * 自进化循环：
 *   每次会话结束后，自动分析执行结果和用户反馈，
 *   将经验写入 viking://agent/ 和 viking://user/
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// ─── 配置 ────────────────────────────────────────────

const VIKING_ROOT = process.env.TIANGONG_VIKING_DIR
  || path.join(process.env.HOME || '/tmp', '.tiangong', 'viking');

const MAX_L0_CHARS = 200;   // L0 摘要最大字符数
const MAX_L1_CHARS = 4000;  // L1 概览最大字符数

// ─── URI 解析 ────────────────────────────────────────

/**
 * 解析 viking:// URI 为本地路径
 * @param {string} uri - viking://resources/project/readme
 * @returns {string} 本地文件系统路径
 */
function resolveURI(uri) {
  if (!uri.startsWith('viking://')) {
    throw new Error(`无效的 Viking URI: ${uri}（必须以 viking:// 开头）`);
  }
  const relativePath = uri.slice('viking://'.length);
  return path.join(VIKING_ROOT, relativePath);
}

/**
 * 将本地路径转为 viking:// URI
 * @param {string} localPath
 * @returns {string}
 */
function toURI(localPath) {
  const relative = path.relative(VIKING_ROOT, localPath);
  return `viking://${relative.replace(/\\/g, '/')}`;
}

// ─── 上下文条目 ──────────────────────────────────────

/**
 * @typedef {object} ContextEntry
 * @property {string} uri          - viking:// URI
 * @property {string} l0           - L0 摘要 (<100 tokens)
 * @property {string} l1           - L1 概览 (<2000 tokens)
 * @property {string} l2           - L2 完整内容
 * @property {string} type         - 类型: memory | resource | skill
 * @property {string[]} tags       - 标签
 * @property {number} weight       - 重要性 (0-10)
 * @property {number} accessCount  - 访问次数
 * @property {string} createdAt    - 创建时间
 * @property {string} updatedAt    - 最后更新时间
 */

// ─── VikingStore 类 ──────────────────────────────────

class VikingStore {
  constructor() {
    this._ensureDirs();
  }

  // ═══ 文件系统操作（ls / find / read / write） ═══

  /**
   * ls — 列出目录内容（返回 L0 摘要）
   * @param {string} uri - viking://resources/ 或 viking://agent/bingbu/
   * @returns {object[]} 条目列表（仅含 L0）
   */
  ls(uri = 'viking://') {
    const dirPath = resolveURI(uri);
    if (!fs.existsSync(dirPath)) return [];

    const stat = fs.statSync(dirPath);
    if (!stat.isDirectory()) {
      // 如果是文件，返回 L0
      return [this._readEntry(dirPath, 0)];
    }

    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    const results = [];

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // 目录：返回子项数量
        const children = fs.readdirSync(fullPath).length;
        results.push({
          uri: toURI(fullPath),
          type: 'directory',
          name: entry.name,
          children,
          l0: `目录，包含 ${children} 个子项`
        });
      } else if (entry.name.endsWith('.json')) {
        // 文件：返回 L0
        const data = this._readEntry(fullPath, 0);
        if (data) results.push(data);
      }
    }

    return results;
  }

  /**
   * find — 在虚拟文件系统中搜索（基于关键词匹配 L0+L1）
   * @param {string} query - 搜索关键词
   * @param {string} [scope='viking://'] - 搜索范围
   * @param {number} [limit=10] - 最大结果数
   * @returns {object[]} 匹配的条目（含 L0 + 相关度评分）
   */
  find(query, scope = 'viking://', limit = 10) {
    const scopePath = resolveURI(scope);
    if (!fs.existsSync(scopePath)) return [];

    const results = [];
    const queryLower = query.toLowerCase();
    const queryTerms = queryLower.split(/\s+/).filter(Boolean);

    this._walkDir(scopePath, (filePath) => {
      if (!filePath.endsWith('.json')) return;

      const entry = this._readEntry(filePath, 1); // 读到 L1 做匹配
      if (!entry) return;

      // 计算相关度
      const searchText = `${entry.l0 || ''} ${entry.l1 || ''} ${(entry.tags || []).join(' ')}`.toLowerCase();
      let score = 0;
      for (const term of queryTerms) {
        if (searchText.includes(term)) score += 10;
      }

      // 加权：权重高的条目更相关
      score += (entry.weight || 0) * 2;
      // 加权：访问频率
      score += Math.log2((entry.accessCount || 0) + 1) * 3;

      if (score > 0) {
        results.push({ ...entry, relevanceScore: score });
      }
    });

    // 按相关度排序
    results.sort((a, b) => b.relevanceScore - a.relevanceScore);
    return results.slice(0, limit);
  }

  /**
   * read — 读取条目（指定层级）
   * @param {string} uri - viking:// URI
   * @param {number} [level=2] - 读取层级 (0=L0, 1=L1, 2=L2)
   * @returns {object|null}
   */
  read(uri, level = 2) {
    const filePath = resolveURI(uri);
    if (!filePath.endsWith('.json')) {
      // 尝试加 .json
      return this._readEntry(filePath + '.json', level);
    }
    return this._readEntry(filePath, level);
  }

  /**
   * overview — 获取目录概览（聚合所有子项的 L0）
   * @param {string} uri
   * @returns {string}
   */
  overview(uri) {
    const items = this.ls(uri);
    if (items.length === 0) return '(空目录)';

    const parts = [`目录 ${uri} 包含 ${items.length} 个项目：`];
    for (const item of items.slice(0, 20)) {
      parts.push(`- ${item.name || item.uri}: ${item.l0 || '(无摘要)'}`);
    }
    if (items.length > 20) {
      parts.push(`... 还有 ${items.length - 20} 个项目`);
    }
    return parts.join('\n');
  }

  // ═══ 写入操作 ═══

  /**
   * 写入上下文条目（自动生成 L0/L1/L2）
   * @param {string} uri - 目标 URI
   * @param {object} data
   * @param {string} data.content - 完整内容 (L2)
   * @param {string} [data.type='memory']
   * @param {string[]} [data.tags=[]]
   * @param {number} [data.weight=5]
   * @param {string} [data.source] - 来源 Agent
   */
  write(uri, data) {
    const filePath = resolveURI(uri.endsWith('.json') ? uri : uri + '.json');
    const dir = path.dirname(filePath);

    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const content = data.content || '';

    // 自动生成 L0/L1/L2
    const l0 = data.l0 || this._generateL0(content);
    const l1 = data.l1 || this._generateL1(content);

    const entry = {
      uri: uri.endsWith('.json') ? uri : uri,
      l0,
      l1,
      l2: content,
      type: data.type || 'memory',
      tags: data.tags || [],
      weight: data.weight || 5,
      source: data.source || 'unknown',
      accessCount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // 如果文件已存在，合并访问计数
    if (fs.existsSync(filePath)) {
      try {
        const existing = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
        entry.accessCount = (existing.accessCount || 0);
        entry.createdAt = existing.createdAt || entry.createdAt;
      } catch { /* ignore */ }
    }

    fs.writeFileSync(filePath, JSON.stringify(entry, null, 2));
    return entry;
  }

  /**
   * 删除条目
   * @param {string} uri
   */
  remove(uri) {
    const filePath = resolveURI(uri.endsWith('.json') ? uri : uri + '.json');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }

  // ═══ 高级：为 Agent 构建上下文 Prompt ═══

  /**
   * 构建 Agent 的上下文注入 prompt
   * 这是核心方法：根据任务描述，智能检索相关记忆，
   * 用 L0 快速定位 → L1 规划决策 → L2 按需加载
   *
   * @param {string} agentId - Agent ID
   * @param {object} options
   * @param {string} [options.taskContext] - 当前任务描述
   * @param {string} [options.projectPath] - 项目路径
   * @param {number} [options.maxTokens=3000] - 最大 token 预算
   * @returns {string}
   */
  buildContextPrompt(agentId, options = {}) {
    const parts = [];
    let tokenBudget = options.maxTokens || 3000;

    // 1. Agent 个人记忆（L1 级别）
    const agentMemories = this.find(
      options.taskContext || '',
      `viking://agent/${agentId}/`,
      5
    );
    if (agentMemories.length > 0) {
      parts.push(`## 你的经验记忆\n`);
      for (const m of agentMemories) {
        const text = `- [${m.type}] ${m.l1 || m.l0}`;
        if (text.length > tokenBudget) break;
        parts.push(text);
        tokenBudget -= text.length;
      }
    }

    // 2. 用户偏好（L0 概览）
    const userPrefs = this.find(
      options.taskContext || '',
      'viking://user/',
      3
    );
    if (userPrefs.length > 0) {
      parts.push(`\n## 用户偏好\n`);
      for (const p of userPrefs) {
        const text = `- ${p.l0}`;
        if (text.length > tokenBudget) break;
        parts.push(text);
        tokenBudget -= text.length;
      }
    }

    // 3. 项目资源（L0 索引）
    if (options.projectPath) {
      const projectId = this._hashPath(options.projectPath);
      const projectResources = this.find(
        options.taskContext || '',
        `viking://resources/${projectId}/`,
        3
      );
      if (projectResources.length > 0) {
        parts.push(`\n## 项目上下文\n`);
        for (const r of projectResources) {
          const text = `- ${r.l0}`;
          if (text.length > tokenBudget) break;
          parts.push(text);
          tokenBudget -= text.length;
        }
      }
    }

    return parts.join('\n');
  }

  // ═══ 自进化：会话结束后自动提取记忆 ═══

  /**
   * 从会话结果中提取记忆并写入 Viking 文件系统
   * @param {string} agentId - Agent ID
   * @param {string} userMessage - 用户原始输入
   * @param {string} agentOutput - Agent 输出
   * @param {object} result - 执行结果 { success, error, toolCalls }
   */
  evolveFromSession(agentId, userMessage, agentOutput, result = {}) {
    const timestamp = Date.now();

    // 1. 提取技能经验
    if (result.success && agentOutput && agentOutput.length > 10) {
      const skillId = `skill_${timestamp}`;
      this.write(`viking://agent/${agentId}/skills/${skillId}`, {
        content: `任务: ${userMessage}\n结果: 成功\n方法: ${agentOutput.slice(0, 500)}`,
        type: 'skill',
        tags: ['auto-extracted', 'success'],
        weight: 6,
        source: agentId
      });
    }

    // 2. 提取教训（失败时）
    if (!result.success && result.error) {
      const lessonId = `lesson_${timestamp}`;
      this.write(`viking://agent/${agentId}/lessons/${lessonId}`, {
        content: `任务: ${userMessage}\n失败原因: ${result.error}\n教训: 避免同类错误`,
        type: 'lesson',
        tags: ['auto-extracted', 'failure'],
        weight: 8, // 教训权重更高
        source: agentId
      });
    }

    // 3. 提取用户偏好（从用户输入的关键词）
    const prefPatterns = [
      { pattern: /我喜欢|我习惯|我更倾向|我想要|i prefer|i like/i, type: 'preference' },
      { pattern: /我们用|决定用|选择|采用|we use|let's use/i, type: 'decision' },
    ];

    for (const { pattern, type } of prefPatterns) {
      if (pattern.test(userMessage)) {
        const prefId = `${type}_${timestamp}`;
        this.write(`viking://user/memories/${prefId}`, {
          content: userMessage,
          type,
          tags: ['auto-extracted', type],
          weight: 7,
          source: agentId
        });
        break;
      }
    }
  }

  /**
   * 索引项目资源到 Viking 文件系统
   * @param {string} projectPath - 项目根目录
   * @param {object} [options]
   */
  indexProject(projectPath, options = {}) {
    const projectId = this._hashPath(projectPath);
    const resourceBase = `viking://resources/${projectId}`;

    // 索引 package.json
    const pkgPath = path.join(projectPath, 'package.json');
    if (fs.existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        this.write(`${resourceBase}/package`, {
          content: JSON.stringify(pkg, null, 2),
          l0: `${pkg.name}@${pkg.version}: ${pkg.description || '(无描述)'}`,
          l1: `项目: ${pkg.name}\n版本: ${pkg.version}\n描述: ${pkg.description}\n依赖: ${Object.keys(pkg.dependencies || {}).join(', ')}\n脚本: ${Object.keys(pkg.scripts || {}).join(', ')}`,
          type: 'resource',
          tags: ['project', 'package.json'],
          weight: 8
        });
      } catch { /* ignore */ }
    }

    // 索引 README
    for (const readme of ['README.md', 'readme.md', 'README.MD']) {
      const readmePath = path.join(projectPath, readme);
      if (fs.existsSync(readmePath)) {
        const content = fs.readFileSync(readmePath, 'utf-8');
        this.write(`${resourceBase}/readme`, {
          content,
          type: 'resource',
          tags: ['project', 'readme'],
          weight: 7
        });
        break;
      }
    }

    // 索引目录结构
    const structure = this._getProjectStructure(projectPath, 3);
    this.write(`${resourceBase}/structure`, {
      content: structure,
      l0: `项目目录结构 (${projectPath})`,
      type: 'resource',
      tags: ['project', 'structure'],
      weight: 6
    });
  }

  // ═══ 统计 ═══

  /**
   * 获取 Viking 存储统计
   * @returns {object}
   */
  getStats() {
    const stats = { total: 0, byType: {}, byRoot: {} };
    const roots = ['resources', 'user', 'agent'];

    for (const root of roots) {
      const rootPath = path.join(VIKING_ROOT, root);
      stats.byRoot[root] = 0;
      if (fs.existsSync(rootPath)) {
        this._walkDir(rootPath, (filePath) => {
          if (filePath.endsWith('.json')) {
            stats.total++;
            stats.byRoot[root]++;
            try {
              const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
              const type = data.type || 'unknown';
              stats.byType[type] = (stats.byType[type] || 0) + 1;
            } catch { /* ignore */ }
          }
        });
      }
    }

    return stats;
  }

  // ═══ 内部方法 ═══

  /** @private 读取条目到指定层级 */
  _readEntry(filePath, level = 2) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

      // 更新访问计数
      data.accessCount = (data.accessCount || 0) + 1;
      data.lastAccessedAt = new Date().toISOString();
      // 异步回写（不阻塞）
      try { fs.writeFileSync(filePath, JSON.stringify(data, null, 2)); } catch { /* ignore */ }

      // 按层级返回
      const result = {
        uri: data.uri || toURI(filePath),
        l0: data.l0 || '',
        type: data.type || 'unknown',
        tags: data.tags || [],
        weight: data.weight || 0,
        accessCount: data.accessCount,
        name: path.basename(filePath, '.json')
      };

      if (level >= 1) result.l1 = data.l1 || '';
      if (level >= 2) result.l2 = data.l2 || '';

      return result;
    } catch { return null; }
  }

  /** @private 自动生成 L0 摘要 */
  _generateL0(content) {
    if (!content) return '(空内容)';
    // 取第一句话或前 200 字符
    const firstLine = content.split(/[。\n.!！?？]/).find(s => s.trim().length > 5);
    const summary = (firstLine || content).trim().slice(0, MAX_L0_CHARS);
    return summary + (content.length > MAX_L0_CHARS ? '...' : '');
  }

  /** @private 自动生成 L1 概览 */
  _generateL1(content) {
    if (!content) return '(空内容)';
    if (content.length <= MAX_L1_CHARS) return content;

    // 提取关键段落
    const paragraphs = content.split(/\n\n+/).filter(p => p.trim().length > 20);
    let l1 = '';
    for (const p of paragraphs) {
      if (l1.length + p.length > MAX_L1_CHARS) break;
      l1 += p + '\n\n';
    }
    return l1.trim() || content.slice(0, MAX_L1_CHARS);
  }

  /** @private 遍历目录 */
  _walkDir(dir, callback) {
    if (!fs.existsSync(dir)) return;
    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          this._walkDir(fullPath, callback);
        } else {
          callback(fullPath);
        }
      }
    } catch { /* ignore permission errors */ }
  }

  /** @private 路径 hash */
  _hashPath(p) {
    return crypto.createHash('sha256').update(p).digest('hex').slice(0, 12);
  }

  /** @private 获取项目目录结构 */
  _getProjectStructure(dir, maxDepth, depth = 0) {
    if (depth >= maxDepth) return '';
    const indent = '  '.repeat(depth);
    let result = '';

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true })
        .filter(e => !e.name.startsWith('.') && e.name !== 'node_modules' && e.name !== 'dist' && e.name !== 'build');

      for (const entry of entries) {
        if (entry.isDirectory()) {
          result += `${indent}📁 ${entry.name}/\n`;
          result += this._getProjectStructure(path.join(dir, entry.name), maxDepth, depth + 1);
        } else {
          result += `${indent}📄 ${entry.name}\n`;
        }
      }
    } catch { /* ignore */ }

    return result;
  }

  /** @private 确保目录结构存在 */
  _ensureDirs() {
    const dirs = [
      VIKING_ROOT,
      path.join(VIKING_ROOT, 'resources'),
      path.join(VIKING_ROOT, 'user'),
      path.join(VIKING_ROOT, 'user', 'memories'),
      path.join(VIKING_ROOT, 'agent'),
    ];
    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
}

// ─── 单例 ────────────────────────────────────────────

const vikingStore = new VikingStore();

module.exports = { VikingStore, vikingStore, resolveURI, toURI, VIKING_ROOT };
