/**
 * 门下省 — 安全检查
 *
 * 对 Bash 命令进行安全分析，借鉴 Claude Code 的 AST 解析思路
 */

/**
 * 危险命令模式
 */
const DANGEROUS_PATTERNS = [
  // ── 致命级 (critical) — 直接拦截 ──
  { pattern: /rm\s+(-rf?|--recursive)\s+[\/~]/, risk: 'critical', desc: '递归删除根目录或家目录' },
  { pattern: /rm\s+-rf?\s+\*/, risk: 'critical', desc: '递归删除通配符' },
  { pattern: /:\(\)\s*\{\s*:\|:&\s*\};\s*:/, risk: 'critical', desc: 'Fork bomb' },
  { pattern: /dd\s+.*of=\/dev\//, risk: 'critical', desc: '直接写入设备' },
  { pattern: /mkfs/, risk: 'critical', desc: '格式化文件系统' },
  { pattern: />(\/dev\/sda|\/dev\/nvme)/, risk: 'critical', desc: '覆写磁盘' },
  { pattern: /shutdown|reboot|halt|poweroff/, risk: 'critical', desc: '关机/重启' },
  { pattern: />\s*\/dev\/(sda|nvme|vda)/, risk: 'critical', desc: '覆写磁盘设备' },

  // ── 高危 (high) — 需要确认 ──
  { pattern: /chmod\s+-R\s+777\s+\//, risk: 'high', desc: '递归开放根目录权限' },
  { pattern: /curl.*\|\s*(bash|sh|zsh|python)/, risk: 'high', desc: '从网络下载并直接执行' },
  { pattern: /wget.*\|\s*(bash|sh|zsh|python)/, risk: 'high', desc: '从网络下载并直接执行' },
  { pattern: /DROP\s+(TABLE|DATABASE)/i, risk: 'high', desc: 'SQL 删除操作' },
  { pattern: /TRUNCATE\s+TABLE/i, risk: 'high', desc: 'SQL 清空表' },
  { pattern: /DELETE\s+FROM\s+\w+\s*;/i, risk: 'high', desc: 'SQL 无条件删除' },
  { pattern: /npm\s+publish/, risk: 'high', desc: '发布 npm 包' },
  { pattern: /docker\s+system\s+prune\s+-a/, risk: 'high', desc: '清除所有 Docker 数据' },
  { pattern: /chown\s+-R\s+root/, risk: 'high', desc: '递归修改文件所有者为 root' },

  // ── 中危 (medium) — 警告 ──
  { pattern: /eval\s*\$/, risk: 'medium', desc: 'eval 动态执行' },
  { pattern: /git\s+push.*--force/, risk: 'medium', desc: 'Force push' },
  { pattern: /git\s+reset\s+--hard/, risk: 'medium', desc: 'Hard reset' },
  { pattern: /git\s+clean\s+-[fd]+/, risk: 'medium', desc: 'Git 清理未追踪文件' },
  { pattern: /git\s+branch\s+-D/, risk: 'medium', desc: '强制删除分支' },
  { pattern: /ssh\s+.*@/, risk: 'medium', desc: '远程 SSH 连接' },
  { pattern: /scp\s+/, risk: 'medium', desc: '远程文件拷贝' },
  { pattern: /pkill|killall/, risk: 'medium', desc: '批量杀进程' },
  { pattern: /npm\s+install\s+-g/, risk: 'medium', desc: '全局安装 npm 包' },
];

/**
 * 检查命令安全性
 * @param {string} command - Shell 命令
 * @returns {{ safe: boolean, risks: Array<{ risk: string, desc: string }>, requiresConfirmation: boolean, blocked: boolean }}
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

/**
 * 通用工具权限检查（参考 Claude Code canUseTool 模式）
 *
 * 三级权限：
 *   allow  — 自动放行（read-only 工具）
 *   ask    — 需要确认（write 工具、bash 中高危命令）
 *   deny   — 直接拒绝（critical 级别危险操作）
 *
 * @param {string} toolName - 工具名
 * @param {object} input - 工具输入
 * @param {object} [options] - { autoApprove: boolean }
 * @returns {{ decision: 'allow'|'ask'|'deny', reason?: string }}
 */
function checkToolPermission(toolName, input, options = {}) {
  // read-only 工具自动放行
  const READ_ONLY_TOOLS = ['read_file', 'glob', 'grep', 'list_dir'];
  if (READ_ONLY_TOOLS.includes(toolName)) {
    return { decision: 'allow' };
  }

  // bash 命令走详细安全检查
  if (toolName === 'bash' && input.command) {
    const safety = checkCommandSafety(input.command);
    if (safety.blocked) {
      return { decision: 'deny', reason: safety.risks.map(r => r.desc).join(', ') };
    }
    if (safety.requiresConfirmation && !options.autoApprove) {
      return { decision: 'ask', reason: safety.risks.map(r => r.desc).join(', ') };
    }
    return { decision: 'allow' };
  }

  // write_file: 检查是否写入敏感路径
  if (toolName === 'write_file' || toolName === 'edit_file') {
    const filePath = input.file_path || '';
    const sensitivePatterns = [
      /\.env$/,
      /\.ssh\//,
      /credentials/i,
      /secret/i,
      /\/etc\//,
      /password/i
    ];
    if (sensitivePatterns.some(p => p.test(filePath))) {
      return { decision: 'ask', reason: `写入敏感文件: ${filePath}` };
    }
    return { decision: 'allow' };
  }

  // 未知工具默认放行
  return { decision: 'allow' };
}

module.exports = { checkCommandSafety, checkToolPermission, DANGEROUS_PATTERNS };
