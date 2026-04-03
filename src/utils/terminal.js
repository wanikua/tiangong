/**
 * 终端显示工具 — CJK 宽度感知
 *
 * 中文/emoji 在终端占 2 列，ASCII 占 1 列。
 * 所有需要对齐边框的 Banner 都应使用这里的函数。
 */

const chalk = require('chalk');

/**
 * 计算字符串的终端显示宽度（CJK/emoji = 2列，其他 = 1列）
 * @param {string} str - 可含 ANSI escape codes
 * @returns {number}
 */
function displayWidth(str) {
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  let w = 0;
  for (const ch of clean) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0x1f000 && code <= 0x1ffff) ||
      (code >= 0x20000 && code <= 0x2ffff)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

/** 默认框宽（═ 数量） */
const BOX_WIDTH = 54;

/**
 * 生成一行 Banner 内容：║ + 内容 + 右填充 + ║
 * @param {string} content - 含 chalk 格式的内容
 * @param {object} [opts]
 * @param {number} [opts.width=54] - 框内宽度
 * @param {function} [opts.color] - chalk color function for ║
 * @returns {string}
 */
function bannerLine(content, opts = {}) {
  const width = opts.width || BOX_WIDTH;
  const colorFn = opts.color || chalk.yellow;
  const pad = Math.max(0, width - displayWidth(content));
  return colorFn('  ║') + content + ' '.repeat(pad) + colorFn('║');
}

/**
 * 生成完整 3 行 Banner（顶框 + 标题行 + 底框）
 * @param {string} title - 标题内容（含 chalk）
 * @param {object} [opts]
 * @param {number} [opts.width=54]
 * @param {function} [opts.color] - chalk color function
 * @returns {string}
 */
function bannerBox(title, opts = {}) {
  const width = opts.width || BOX_WIDTH;
  const colorFn = opts.color || chalk.yellow;
  const border = '═'.repeat(width);
  return [
    colorFn('  ╔' + border + '╗'),
    bannerLine(title, { width, color: colorFn }),
    colorFn('  ╚' + border + '╝')
  ].join('\n');
}

module.exports = { displayWidth, bannerLine, bannerBox, BOX_WIDTH };
