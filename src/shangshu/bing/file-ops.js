/**
 * 兵部 — 文件操作工具
 *
 * 文件读写编辑，对应 Claude Code 的 FileRead/Write/Edit
 */

const fs = require('fs');
const path = require('path');

// ─── 安全：路径校验 ────────────────────────────────────

/** 工作目录白名单（运行时设置） */
let _allowedRoots = [process.cwd()];

/**
 * 设置允许操作的根目录
 * @param {string[]} roots
 */
function setAllowedRoots(roots) {
  _allowedRoots = roots.map(r => path.resolve(r));
}

/**
 * 校验路径是否在允许范围内，防止目录穿越
 * @param {string} filePath
 * @throws {Error} 如果路径非法
 */
function validatePath(filePath, { isWrite = false } = {}) {
  const resolved = path.resolve(filePath);

  // 阻止访问敏感路径
  const forbidden = ['/etc/shadow', '/etc/passwd', '/etc/sudoers'];
  if (forbidden.some(f => resolved.startsWith(f))) {
    throw new Error(`[刑部] 禁止访问系统敏感文件: ${resolved}`);
  }

  // 阻止写入 SSH 私钥、环境变量文件等
  const basename = path.basename(resolved);
  const sensitivePatterns = ['.env', 'id_rsa', 'id_ed25519', '.pem', 'credentials.json'];
  if (isWrite && sensitivePatterns.some(p => basename === p || basename.startsWith('.env.'))) {
    throw new Error(`[刑部] 禁止写入敏感文件: ${basename}`);
  }

  // 路径中不能包含 .. 穿越
  if (filePath.includes('..')) {
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath !== resolved) {
      throw new Error(`[刑部] 检测到路径穿越: ${filePath}`);
    }
  }
}

// ─── 文件操作 ───────────────────────────────────────────

/**
 * 读取文件
 * @param {string} filePath - 绝对路径
 * @param {object} [options]
 * @param {number} [options.offset] - 起始行号（0-based）
 * @param {number} [options.limit] - 读取行数
 * @returns {{ content: string, lines: number, totalLines: number }}
 */
function readFile(filePath, options = {}) {
  validatePath(filePath);

  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  const stat = fs.statSync(filePath);
  if (stat.isDirectory()) {
    throw new Error(`路径是目录而非文件: ${filePath}`);
  }

  // 限制读取大小（防止内存溢出）
  const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
  if (stat.size > MAX_FILE_SIZE) {
    throw new Error(`文件过大 (${(stat.size / 1024 / 1024).toFixed(1)}MB)，请使用 offset + limit 分段读取`);
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n');

  if (options.offset !== undefined || options.limit) {
    const start = Math.max(0, options.offset || 0);
    const end = options.limit ? Math.min(start + options.limit, allLines.length) : allLines.length;
    const lines = allLines.slice(start, end);
    content = lines.map((line, i) => `${start + i + 1}\t${line}`).join('\n');
    return { content, lines: lines.length, totalLines: allLines.length };
  }

  return {
    content: allLines.map((line, i) => `${i + 1}\t${line}`).join('\n'),
    lines: allLines.length,
    totalLines: allLines.length
  };
}

/**
 * 写入文件
 * @param {string} filePath
 * @param {string} content
 */
function writeFile(filePath, content) {
  validatePath(filePath, { isWrite: true });

  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf-8');
}

/**
 * 编辑文件（字符串替换）
 * @param {string} filePath
 * @param {string} oldString
 * @param {string} newString
 * @param {boolean} [replaceAll=false]
 * @returns {{ replaced: number }}
 */
function editFile(filePath, oldString, newString, replaceAll = false) {
  validatePath(filePath, { isWrite: true });

  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes(oldString)) {
    const preview = oldString.length > 60 ? oldString.slice(0, 60) + '...' : oldString;
    throw new Error(`未找到要替换的文本: "${preview}"`);
  }

  let replaced = 0;
  if (replaceAll) {
    const parts = content.split(oldString);
    replaced = parts.length - 1;
    content = parts.join(newString);
  } else {
    // 确保唯一性
    const count = content.split(oldString).length - 1;
    if (count > 1) {
      throw new Error(`找到 ${count} 处匹配，请提供更多上下文使其唯一`);
    }
    content = content.replace(oldString, newString);
    replaced = 1;
  }

  fs.writeFileSync(filePath, content, 'utf-8');

  // 生成简洁 diff 信息
  const diffInfo = `${path.basename(filePath)}: ${replaced} 处替换`;
  return { replaced, diffInfo };
}

/**
 * 生成彩色 diff 预览文本
 * @param {string} oldStr
 * @param {string} newStr
 * @param {string} filePath
 * @returns {string}
 */
function generateDiffPreview(oldStr, newStr, filePath) {
  const lines = [];
  lines.push(`--- ${filePath}`);
  lines.push(`+++ ${filePath}`);

  const oldLines = oldStr.split('\n');
  const newLines = newStr.split('\n');

  for (const line of oldLines) {
    lines.push(`- ${line}`);
  }
  for (const line of newLines) {
    lines.push(`+ ${line}`);
  }

  return lines.join('\n');
}

module.exports = { readFile, writeFile, editFile, validatePath, setAllowedRoots, generateDiffPreview };
