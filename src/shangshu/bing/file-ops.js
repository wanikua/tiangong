/**
 * 兵部 — 文件操作工具
 *
 * 文件读写编辑，对应 Claude Code 的 FileRead/Write/Edit
 */

const fs = require('fs');
const path = require('path');

/**
 * 读取文件
 * @param {string} filePath - 绝对路径
 * @param {object} [options]
 * @param {number} [options.offset] - 起始行号
 * @param {number} [options.limit] - 读取行数
 * @returns {{ content: string, lines: number }}
 */
function readFile(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  let content = fs.readFileSync(filePath, 'utf-8');
  const allLines = content.split('\n');

  if (options.offset || options.limit) {
    const start = options.offset || 0;
    const end = options.limit ? start + options.limit : allLines.length;
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
  if (!fs.existsSync(filePath)) {
    throw new Error(`文件不存在: ${filePath}`);
  }

  let content = fs.readFileSync(filePath, 'utf-8');

  if (!content.includes(oldString)) {
    throw new Error(`未找到要替换的文本`);
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
  return { replaced };
}

module.exports = { readFile, writeFile, editFile };
