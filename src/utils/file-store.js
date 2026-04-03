/**
 * 天工开物 — 通用文件持久化
 *
 * 封装 JSON 文件读写，解决：
 * 1. 原子写（write-to-temp + rename，防竞态）
 * 2. 统一错误处理（不再 silent catch）
 * 3. 批量回写（dirty 标记 + flush）
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createLogger } = require('./logger');

const log = createLogger('file-store');

class FileStore {
  /**
   * @param {string} filePath - JSON 文件路径
   * @param {*} [defaultValue=[]] - 文件不存在时的默认值
   */
  constructor(filePath, defaultValue = []) {
    this.filePath = filePath;
    this.defaultValue = defaultValue;
    this._dirty = false;
    this._cache = null;
    this._flushTimer = null;
  }

  /**
   * 读取数据（带缓存）
   * @returns {*}
   */
  load() {
    if (this._cache !== null) return this._cache;

    try {
      if (fs.existsSync(this.filePath)) {
        this._cache = JSON.parse(fs.readFileSync(this.filePath, 'utf-8'));
        return this._cache;
      }
    } catch (err) {
      log.warn(`读取失败 ${path.basename(this.filePath)}: ${err.message}`);
    }

    this._cache = typeof this.defaultValue === 'function'
      ? this.defaultValue()
      : JSON.parse(JSON.stringify(this.defaultValue)); // deep clone
    return this._cache;
  }

  /**
   * 写入数据（原子写：先写临时文件再 rename）
   * @param {*} data - 要保存的数据，省略则保存当前缓存
   */
  save(data) {
    if (data !== undefined) {
      this._cache = data;
    }
    if (this._cache === null) return;

    const dir = path.dirname(this.filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // 原子写：先写临时文件，再 rename
    const tmpPath = this.filePath + `.tmp.${crypto.randomBytes(4).toString('hex')}`;
    try {
      fs.writeFileSync(tmpPath, JSON.stringify(this._cache, null, 2));
      fs.renameSync(tmpPath, this.filePath);
      this._dirty = false;
    } catch (err) {
      log.error(`写入失败 ${path.basename(this.filePath)}: ${err.message}`);
      // 清理临时文件
      try { fs.unlinkSync(tmpPath); } catch { /* ignore cleanup */ }
    }
  }

  /**
   * 标记数据已变更（配合延迟 flush 使用）
   */
  markDirty() {
    this._dirty = true;
  }

  /**
   * 如果有脏数据，立即写盘
   */
  flush() {
    if (this._dirty && this._cache !== null) {
      this.save();
    }
  }

  /**
   * 启动定时自动 flush（如每 5 秒）
   * @param {number} [intervalMs=5000]
   */
  startAutoFlush(intervalMs = 5000) {
    this.stopAutoFlush();
    this._flushTimer = setInterval(() => this.flush(), intervalMs);
    // 不阻止进程退出
    if (this._flushTimer.unref) this._flushTimer.unref();
  }

  /**
   * 停止自动 flush 并立即写盘
   */
  stopAutoFlush() {
    if (this._flushTimer) {
      clearInterval(this._flushTimer);
      this._flushTimer = null;
    }
    this.flush();
  }

  /**
   * 使缓存失效（下次 load 重新从磁盘读）
   */
  invalidate() {
    this._cache = null;
  }
}

module.exports = { FileStore };
