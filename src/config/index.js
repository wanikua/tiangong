/**
 * 天工开物 — 配置中心（单例）
 *
 * 统一管理：
 * 1. 配置文件路径（不再散落各处）
 * 2. 配置加载（只读一次，缓存）
 * 3. 环境变量覆盖（TIANGONG_* 优先）
 * 4. 常量集中定义（不再有魔法数字）
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── 路径常量 ────────────────────────────────────────

const HOME = process.env.TIANGONG_HOME || path.join(os.homedir(), '.tiangong');
const CONFIG_PATH = path.join(HOME, 'config.json');
const MEMORY_DIR = process.env.TIANGONG_MEMORY_DIR || path.join(HOME, 'memory');
const SESSION_DIR = process.env.TIANGONG_SESSION_DIR || path.join(HOME, 'sessions');
const PLUGIN_DIR = process.env.TIANGONG_PLUGIN_DIR || path.join(HOME, 'plugins');
const VIKING_DIR = process.env.TIANGONG_VIKING_DIR || path.join(HOME, 'viking');
const MCP_CONFIG_PATH = process.env.TIANGONG_MCP_CONFIG || path.join(HOME, 'mcp.json');

// ─── 运行时常量 ──────────────────────────────────────

const CONSTANTS = {
  // Agent Loop
  MAX_TOOL_ROUNDS: parseInt(process.env.TIANGONG_MAX_TOOL_ROUNDS) || 30,
  MAX_QUERY_ROUNDS: parseInt(process.env.TIANGONG_MAX_QUERY_ROUNDS) || 15,
  DEFAULT_MAX_TOKENS: parseInt(process.env.TIANGONG_MAX_TOKENS) || 4096,
  MAX_OUTPUT_TRUNCATION: parseInt(process.env.TIANGONG_MAX_OUTPUT) || 50000,
  CONTEXT_COMPRESS_THRESHOLD: 20,

  // Timeouts
  DEFAULT_TIMEOUT_MS: parseInt(process.env.TIANGONG_TIMEOUT) || 120_000,
  BASH_MAX_OUTPUT_BYTES: 1024 * 1024, // 1MB

  // Memory
  MAX_MEMORIES_PER_AGENT: 500,
  MAX_COURT_MEMORIES: 200,

  // Viking
  MAX_L0_CHARS: 200,
  MAX_L1_CHARS: 4000,

  // Budget
  DEFAULT_MAX_BUDGET_USD: parseFloat(process.env.TIANGONG_MAX_BUDGET) || 5.0,

  // File ops
  MAX_FILE_SIZE: 10 * 1024 * 1024, // 10MB

  // Audit
  MAX_AUDIT_LOG: 500,

  // Retry
  MAX_RETRY_TOKENS: 16384, // 重试时 token 上限（不再无限翻倍到 65k）
  RETRY_BACKOFF_BASE_MS: 2000,
};

// ─── 配置缓存 ────────────────────────────────────────

let _configCache = null;
let _configMtime = 0;

/**
 * 加载配置（带缓存，文件变更时自动刷新）
 * @returns {object|null}
 */
function loadConfig() {
  try {
    if (!fs.existsSync(CONFIG_PATH)) return null;

    const stat = fs.statSync(CONFIG_PATH);
    const mtime = stat.mtimeMs;

    // 文件没变，用缓存
    if (_configCache && mtime === _configMtime) {
      return _configCache;
    }

    _configCache = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    _configMtime = mtime;
    return _configCache;
  } catch {
    return null;
  }
}

/**
 * 保存配置
 * @param {object} config
 */
function saveConfig(config) {
  ensureDir(HOME);
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
  _configCache = config;
  _configMtime = Date.now();
}

/**
 * 使配置缓存失效（重新从磁盘读取）
 */
function invalidateConfig() {
  _configCache = null;
  _configMtime = 0;
}

// ─── 路径辅助 ────────────────────────────────────────

/**
 * 确保目录存在
 * @param {string} dir
 */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

module.exports = {
  // 路径
  HOME,
  CONFIG_PATH,
  MEMORY_DIR,
  SESSION_DIR,
  PLUGIN_DIR,
  VIKING_DIR,
  MCP_CONFIG_PATH,

  // 常量
  CONSTANTS,

  // 配置操作
  loadConfig,
  saveConfig,
  invalidateConfig,

  // 辅助
  ensureDir,
};
