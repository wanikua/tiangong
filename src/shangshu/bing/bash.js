/**
 * 兵部 — Bash 工具
 *
 * 执行 Shell 命令，经过门下省安全检查
 */

const { execFile } = require('child_process');
const { promisify } = require('util');
const { checkCommandSafety } = require('../../menxia/security-check');

const execFileAsync = promisify(execFile);

const DEFAULT_TIMEOUT_MS = 120_000; // 2 分钟
const MAX_OUTPUT_BYTES = 1024 * 1024; // 1MB

/**
 * 执行 Bash 命令
 * @param {string} command - 命令
 * @param {object} [options]
 * @param {string} [options.cwd] - 工作目录
 * @param {number} [options.timeout] - 超时(ms)
 * @param {string} [options.agentId] - 执行者 Agent ID
 * @returns {Promise<{ stdout: string, stderr: string, exitCode: number }>}
 */
async function execBash(command, options = {}) {
  const { cwd = process.cwd(), timeout = DEFAULT_TIMEOUT_MS } = options;

  // 门下省安全检查
  const safety = checkCommandSafety(command);
  if (safety.blocked) {
    throw new Error(`[刑部] 命令被拦截: ${safety.risks.map(r => r.desc).join(', ')}`);
  }

  try {
    const { stdout, stderr } = await execFileAsync('sh', ['-c', command], {
      cwd,
      timeout,
      maxBuffer: MAX_OUTPUT_BYTES,
      env: { ...process.env, TERM: 'dumb' }
    });

    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || err.message,
      exitCode: err.code || 1
    };
  }
}

module.exports = { execBash };
