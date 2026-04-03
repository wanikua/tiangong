/**
 * 会话持久化 — 退出后能 resume 上次对话
 *
 * 保存: 每轮对话结束后自动序列化 messages 到磁盘
 * 恢复: /resume 命令加载上次会话的 messages 继续对话
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { SESSION_DIR } = require('../config/index');
const { createLogger } = require('../utils/logger');
const log = createLogger('session-store');

/**
 * 确保目录存在
 */
function ensureDir() {
  if (!fs.existsSync(SESSION_DIR)) {
    fs.mkdirSync(SESSION_DIR, { recursive: true });
  }
}

/**
 * 保存会话
 * @param {string} sessionId
 * @param {object} data - { messages, prompt, model, regime, timestamp }
 */
function saveSession(sessionId, data) {
  ensureDir();
  const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
  fs.writeFileSync(filePath, JSON.stringify({
    ...data,
    savedAt: new Date().toISOString()
  }, null, 2));

  // 同时更新 latest 指针
  fs.writeFileSync(path.join(SESSION_DIR, 'latest.json'), JSON.stringify({
    sessionId,
    prompt: (data.prompt || '').slice(0, 100),
    savedAt: new Date().toISOString()
  }));
}

/**
 * 加载会话
 * @param {string} [sessionId] - 不传则加载最近的
 * @returns {object|null}
 */
function loadSession(sessionId) {
  ensureDir();
  try {
    if (!sessionId) {
      const latestPath = path.join(SESSION_DIR, 'latest.json');
      if (!fs.existsSync(latestPath)) return null;
      const latest = JSON.parse(fs.readFileSync(latestPath, 'utf-8'));
      sessionId = latest.sessionId;
    }
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch (err) { log.warn('加载会话失败:', err.message); return null; }
}

/**
 * 列出最近的会话
 * @param {number} [limit=10]
 * @returns {Array}
 */
function listSessions(limit = 10) {
  ensureDir();
  try {
    const files = fs.readdirSync(SESSION_DIR)
      .filter(f => f.endsWith('.json') && f !== 'latest.json')
      .map(f => {
        const data = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), 'utf-8'));
        return {
          id: path.basename(f, '.json'),
          prompt: (data.prompt || '').slice(0, 60),
          savedAt: data.savedAt,
          messageCount: (data.messages || []).length
        };
      })
      .sort((a, b) => (b.savedAt || '').localeCompare(a.savedAt || ''))
      .slice(0, limit);
    return files;
  } catch (err) { log.warn('列出会话失败:', err.message); return []; }
}

/**
 * 生成会话 ID
 * @returns {string}
 */
function generateSessionId() {
  return `s-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
}

module.exports = { saveSession, loadSession, listSessions, generateSessionId };
