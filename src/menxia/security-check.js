/**
 * 门下省 — 安全检查
 *
 * 对 Bash 命令进行安全分析，借鉴 Claude Code 的 AST 解析思路
 */

/**
 * 危险命令模式
 */
const DANGEROUS_PATTERNS = [
  { pattern: /rm\s+(-rf?|--recursive)\s+[\/~]/, risk: 'critical', desc: '递归删除根目录或家目录' },
  { pattern: /rm\s+-rf?\s+\*/, risk: 'critical', desc: '递归删除通配符' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\};\s*:/, risk: 'critical', desc: 'Fork bomb' },
  { pattern: /dd\s+.*of=\/dev\//, risk: 'critical', desc: '直接写入设备' },
  { pattern: /mkfs/, risk: 'critical', desc: '格式化文件系统' },
  { pattern: />(\/dev\/sda|\/dev\/nvme)/, risk: 'critical', desc: '覆写磁盘' },
  { pattern: /chmod\s+-R\s+777\s+\//, risk: 'high', desc: '递归开放根目录权限' },
  { pattern: /curl.*\|\s*(bash|sh|zsh)/, risk: 'high', desc: '从网络下载并直接执行' },
  { pattern: /wget.*\|\s*(bash|sh|zsh)/, risk: 'high', desc: '从网络下载并直接执行' },
  { pattern: /eval\s*\$/, risk: 'medium', desc: 'eval 动态执行' },
  { pattern: /git\s+push.*--force/, risk: 'medium', desc: 'Force push' },
  { pattern: /git\s+reset\s+--hard/, risk: 'medium', desc: 'Hard reset' },
  { pattern: /DROP\s+(TABLE|DATABASE)/i, risk: 'high', desc: 'SQL 删除操作' },
  { pattern: /TRUNCATE\s+TABLE/i, risk: 'high', desc: 'SQL 清空表' }
];

/**
 * 检查命令安全性
 * @param {string} command - Shell 命令
 * @returns {{ safe: boolean, risks: Array<{ risk: string, desc: string }> }}
 */
function checkCommandSafety(command) {
  const risks = [];

  for (const { pattern, risk, desc } of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      risks.push({ risk, desc });
    }
  }

  const hasCritical = risks.some(r => r.risk === 'critical');
  const hasHigh = risks.some(r => r.risk === 'high');

  return {
    safe: !hasCritical && !hasHigh,
    risks,
    requiresConfirmation: risks.length > 0 && !hasCritical,
    blocked: hasCritical
  };
}

module.exports = { checkCommandSafety, DANGEROUS_PATTERNS };
