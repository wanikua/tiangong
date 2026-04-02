/**
 * Vim 模式 — 终端输入支持基础 vim 快捷键
 *
 * 简化版：通过 readline keypress 事件实现 normal/insert 模式切换
 * 按 Esc 进入 normal 模式，按 i 回到 insert 模式
 *
 * Normal 模式快捷键：
 *   i     → insert 模式
 *   dd    → 清空当前行
 *   0/$   → 行首/行尾
 *   w     → 下一个词
 *   b     → 上一个词
 *   x     → 删除光标字符
 */

const chalk = require('chalk');

let vimEnabled = false;
let mode = 'insert'; // 'normal' | 'insert'
let keyBuffer = '';

/**
 * 启用/禁用 Vim 模式
 * @param {boolean} enable
 */
function setVimMode(enable) {
  vimEnabled = enable;
  mode = 'insert';
  keyBuffer = '';
}

/**
 * 获取当前 Vim 状态
 */
function getVimStatus() {
  if (!vimEnabled) return null;
  return { mode, indicator: mode === 'normal' ? chalk.blue('[N]') : chalk.green('[I]') };
}

/**
 * 是否启用了 Vim 模式
 */
function isVimEnabled() {
  return vimEnabled;
}

module.exports = { setVimMode, getVimStatus, isVimEnabled };
