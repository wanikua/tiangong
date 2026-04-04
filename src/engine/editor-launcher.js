/**
 * 外部编辑器启动器
 *
 * 用 $EDITOR（vim/nano/code --wait）打开临时文件，
 * 用户保存退出后读取文件内容返回。
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

/**
 * @param {object} options
 * @param {string} [options.initialContent] - 初始内容
 * @param {string} [options.cwd] - 工作目录
 * @param {string} [options.suffix] - 文件后缀，默认 .md
 * @returns {Promise<string|null>} 编辑后的内容，null=取消
 */
async function launchEditor({ initialContent = '', cwd = process.cwd(), suffix = '.md' } = {}) {
  const editor = process.env.EDITOR
    || process.env.VISUAL
    || (os.platform() === 'win32' ? 'notepad' : 'vim');

  const tmpFile = path.join(os.tmpdir(), `tiangong-edit-${Date.now()}${suffix}`);
  fs.writeFileSync(tmpFile, initialContent, 'utf-8');

  try {
    // 拆分命令和参数（支持 "open -e -W" / "code --wait" 等带空格的 $EDITOR）
    const editorParts = editor.split(/\s+/);
    const editorCmd = editorParts[0];
    const editorArgs = [...editorParts.slice(1), tmpFile];

    const result = spawnSync(editorCmd, editorArgs, {
      cwd,
      stdio: 'inherit',
      env: process.env
    });

    if (result.status === null && result.signal) {
      // 被信号中断（Ctrl+C）
      return null;
    }

    let content = '';
    try {
      content = fs.readFileSync(tmpFile, 'utf-8');
    } catch {
      // file gone, return empty
    }

    return content;
  } finally {
    try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
  }
}

module.exports = { launchEditor };
