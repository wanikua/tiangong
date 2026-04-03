/**
 * 天工开物 — 分级日志系统
 *
 * 分 4 级：error > warn > info > debug
 * --verbose 模式显示 debug，默认只显示 warn+error
 * 所有日志带时间戳和来源标签
 */

const chalk = require('chalk');

const LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };

let _level = LEVELS.warn; // 默认级别

/**
 * 设置日志级别
 * @param {'debug'|'info'|'warn'|'error'} level
 */
function setLevel(level) {
  if (LEVELS[level] !== undefined) {
    _level = LEVELS[level];
  }
}

/**
 * 启用 verbose 模式（等同于 setLevel('debug')）
 */
function setVerbose() {
  _level = LEVELS.debug;
}

/**
 * 创建带标签的 logger
 * @param {string} tag - 来源标签（如 'dispatcher', 'api-client'）
 * @returns {{ debug, info, warn, error }}
 */
function createLogger(tag) {
  const prefix = chalk.gray(`[${tag}]`);

  return {
    debug(...args) {
      if (_level <= LEVELS.debug) {
        console.log(prefix, chalk.gray(...args));
      }
    },
    info(...args) {
      if (_level <= LEVELS.info) {
        console.log(prefix, ...args);
      }
    },
    warn(...args) {
      if (_level <= LEVELS.warn) {
        console.warn(prefix, chalk.yellow('⚠'), ...args);
      }
    },
    error(...args) {
      if (_level <= LEVELS.error) {
        console.error(prefix, chalk.red('✗'), ...args);
      }
    }
  };
}

module.exports = { createLogger, setLevel, setVerbose, LEVELS };
