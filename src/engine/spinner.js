/**
 * 终端 Loading 动画 — 御前太监报时
 *
 * 在 LLM 请求期间显示旋转动画
 */

const chalk = require('chalk');

// 古风旋转帧
const SPINNER_FRAMES_CLASSIC = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const SPINNER_FRAMES_DRAGON = ['🐉', '🔥', '🐉', '✨', '🐉', '⚡', '🐉', '🌟'];
const SPINNER_FRAMES_COURT = ['◐', '◓', '◑', '◒'];

class Spinner {
  constructor(options = {}) {
    this.frames = options.frames || SPINNER_FRAMES_CLASSIC;
    this.interval = options.interval || 80;
    this.color = options.color || 'yellow';
    this.timer = null;
    this.frameIndex = 0;
    this.text = '';
    this.startTime = null;
  }

  /**
   * 开始旋转
   * @param {string} text - 显示文字
   */
  start(text = '') {
    this.text = text;
    this.startTime = Date.now();
    this.frameIndex = 0;

    if (this.timer) this.stop();

    this.timer = setInterval(() => {
      const frame = this.frames[this.frameIndex % this.frames.length];
      const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
      const colorFn = chalk[this.color] || chalk.yellow;

      process.stdout.write(`\r  ${colorFn(frame)} ${this.text} ${chalk.gray(`(${elapsed}s)`)}`);
      process.stdout.write('\x1B[K'); // 清除行尾

      this.frameIndex++;
    }, this.interval);
  }

  /**
   * 更新文字
   * @param {string} text
   */
  update(text) {
    this.text = text;
  }

  /**
   * 停止并显示完成
   * @param {string} [doneText] - 完成文字
   */
  succeed(doneText) {
    this.stop();
    const elapsed = this.startTime ? ((Date.now() - this.startTime) / 1000).toFixed(1) : '0';
    console.log(`\r  ${chalk.green('✓')} ${doneText || this.text} ${chalk.gray(`(${elapsed}s)`)}\x1B[K`);
  }

  /**
   * 停止并显示失败
   * @param {string} [failText]
   */
  fail(failText) {
    this.stop();
    console.log(`\r  ${chalk.red('✗')} ${failText || this.text}\x1B[K`);
  }

  /**
   * 静默停止
   */
  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      process.stdout.write('\r\x1B[K'); // 清除整行
    }
  }
}

/**
 * 进度条
 * @param {number} current
 * @param {number} total
 * @param {number} [width=30]
 * @returns {string}
 */
function progressBar(current, total, width = 30) {
  const ratio = Math.min(current / total, 1);
  const filled = Math.round(width * ratio);
  const empty = width - filled;
  const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(empty));
  const pct = Math.round(ratio * 100);
  return `${bar} ${pct}%`;
}

/**
 * 格式化耗时
 * @param {number} ms
 * @returns {string}
 */
function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  const min = Math.floor(ms / 60000);
  const sec = Math.round((ms % 60000) / 1000);
  return `${min}m${sec}s`;
}

module.exports = { Spinner, progressBar, formatDuration, SPINNER_FRAMES_CLASSIC, SPINNER_FRAMES_DRAGON, SPINNER_FRAMES_COURT };
