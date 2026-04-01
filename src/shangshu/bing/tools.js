/**
 * 兵部 — 工具定义 (Tool Schemas)
 *
 * 定义给 LLM 的工具 schema + 执行逻辑
 * 对应 Claude Code 的 tools/ 目录
 */

const { execBash } = require('./bash');
const { readFile, writeFile, editFile } = require('./file-ops');
const fs = require('fs');
const path = require('path');

/**
 * 所有工具定义
 * 格式兼容 Anthropic tool_use 和 OpenAI function calling
 */
const TOOLS = [
  // ── 兵部：核心作战工具 ──
  {
    name: 'bash',
    description: '执行 Shell 命令。用于运行代码、安装依赖、git 操作等。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        command: { type: 'string', description: '要执行的命令' },
        timeout: { type: 'number', description: '超时(ms)，默认 120000' }
      },
      required: ['command']
    },
    execute: async (input, context) => {
      const result = await execBash(input.command, {
        cwd: context.cwd,
        timeout: input.timeout
      });
      const output = [result.stdout, result.stderr].filter(Boolean).join('\n').trim();
      return output || '(无输出)';
    }
  },
  {
    name: 'read_file',
    description: '读取文件内容。返回带行号的内容。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件绝对路径' },
        offset: { type: 'number', description: '起始行号' },
        limit: { type: 'number', description: '读取行数' }
      },
      required: ['file_path']
    },
    execute: async (input) => {
      const result = readFile(input.file_path, { offset: input.offset, limit: input.limit });
      return result.content;
    }
  },
  {
    name: 'write_file',
    description: '创建或覆盖文件。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件绝对路径' },
        content: { type: 'string', description: '文件内容' }
      },
      required: ['file_path', 'content']
    },
    execute: async (input) => {
      writeFile(input.file_path, input.content);
      return `已写入: ${input.file_path}`;
    }
  },
  {
    name: 'edit_file',
    description: '编辑文件：将 old_string 替换为 new_string。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件绝对路径' },
        old_string: { type: 'string', description: '要替换的文本' },
        new_string: { type: 'string', description: '替换后的文本' },
        replace_all: { type: 'boolean', description: '是否全部替换，默认 false' }
      },
      required: ['file_path', 'old_string', 'new_string']
    },
    execute: async (input) => {
      const result = editFile(input.file_path, input.old_string, input.new_string, input.replace_all);
      return `已替换 ${result.replaced} 处`;
    }
  },
  {
    name: 'glob',
    description: '按模式搜索文件。支持 **/*.js 等 glob 模式。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式，如 **/*.ts' },
        path: { type: 'string', description: '搜索目录' }
      },
      required: ['pattern']
    },
    execute: async (input, context) => {
      // 用 find 模拟 glob（简化版，后续可换 fast-glob）
      const dir = input.path || context.cwd;
      const result = await execBash(
        `find "${dir}" -name "${input.pattern.replace('**/', '')}" -type f 2>/dev/null | head -50`,
        { cwd: dir }
      );
      return result.stdout || '(无匹配)';
    }
  },
  {
    name: 'grep',
    description: '在文件中搜索内容。支持正则表达式。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式（正则）' },
        path: { type: 'string', description: '搜索目录或文件' },
        glob: { type: 'string', description: '文件过滤，如 *.js' }
      },
      required: ['pattern']
    },
    execute: async (input, context) => {
      const dir = input.path || context.cwd;
      let cmd = `rg --no-heading -n "${input.pattern}" "${dir}"`;
      if (input.glob) cmd += ` --glob "${input.glob}"`;
      cmd += ' 2>/dev/null | head -50';

      const result = await execBash(cmd, { cwd: context.cwd });
      return result.stdout || '(无匹配)';
    }
  },
  {
    name: 'list_dir',
    description: '列出目录内容。',
    ministry: 'bing',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' }
      },
      required: ['path']
    },
    execute: async (input) => {
      const entries = fs.readdirSync(input.path, { withFileTypes: true });
      return entries.map(e => `${e.isDirectory() ? '📁' : '📄'} ${e.name}`).join('\n');
    }
  }
];

/**
 * 获取工具的 API schema（用于发送给 LLM）
 * @param {string[]} [ministries] - 只返回指定部门的工具
 * @returns {Array}
 */
function getToolSchemas(ministries) {
  let tools = TOOLS;
  if (ministries) {
    tools = tools.filter(t => ministries.includes(t.ministry));
  }
  return tools.map(t => ({
    name: t.name,
    description: t.description,
    input_schema: t.input_schema
  }));
}

/**
 * 执行工具调用
 * @param {string} toolName
 * @param {object} input
 * @param {object} context - { cwd, agentId }
 * @returns {Promise<string>}
 */
async function executeTool(toolName, input, context) {
  const tool = TOOLS.find(t => t.name === toolName);
  if (!tool) {
    throw new Error(`未知工具: ${toolName}`);
  }
  return tool.execute(input, context);
}

module.exports = { TOOLS, getToolSchemas, executeTool };
