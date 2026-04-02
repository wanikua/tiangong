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
 * 简易 glob 匹配（纯 JS 实现，无需外部依赖）
 * 支持 *, **, ? 通配符
 * @param {string} pattern
 * @param {string} dir
 * @param {number} [maxResults=100]
 * @returns {string[]}
 */
function globMatch(pattern, dir, maxResults = 100) {
  const results = [];

  // 将 glob pattern 转为正则
  function patternToRegex(pat) {
    // 先处理 ** 和 *（避免 . 转义影响 *）
    let regex = pat
      .replace(/\*\*\//g, '\x00GLOBSTAR_SLASH\x00')  // 占位
      .replace(/\*\*/g, '\x00GLOBSTAR\x00')
      .replace(/\*/g, '\x00STAR\x00')
      .replace(/\?/g, '\x00QUESTION\x00')
      .replace(/\./g, '\\.')                          // 转义 .
      .replace(/\x00GLOBSTAR_SLASH\x00/g, '(.*\\/)?') // **/ = 零个或多个目录
      .replace(/\x00GLOBSTAR\x00/g, '.*')             // ** = 任意
      .replace(/\x00STAR\x00/g, '[^/]*')              // * = 非目录分隔符
      .replace(/\x00QUESTION\x00/g, '[^/]');           // ? = 单个字符
    return new RegExp(`^${regex}$`);
  }

  const regex = patternToRegex(pattern);

  function walk(currentDir, relPath) {
    if (results.length >= maxResults) return;

    let entries;
    try {
      entries = fs.readdirSync(currentDir, { withFileTypes: true });
    } catch { return; }

    for (const entry of entries) {
      if (results.length >= maxResults) return;

      // 跳过隐藏目录和 node_modules
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

      const childRel = relPath ? `${relPath}/${entry.name}` : entry.name;
      const childFull = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        walk(childFull, childRel);
      } else if (entry.isFile()) {
        if (regex.test(childRel)) {
          results.push(childFull);
        }
      }
    }
  }

  walk(dir, '');
  return results;
}

/**
 * 所有工具定义
 * 格式兼容 Anthropic tool_use 和 OpenAI function calling
 */
const TOOLS = [
  // ── 兵部：核心作战工具 ──
  {
    name: 'bash',
    description: '执行 Shell 命令。用于运行代码、安装依赖、git 操作、查看系统信息等。',
    ministry: 'bing',
    isReadOnly: false,
    prompt: `# Bash 工具使用指南
- 避免用 bash 做能用专用工具做的事：读文件用 read_file，搜索用 grep/glob，编辑用 edit_file
- 优先用绝对路径，避免 cd 切换目录
- 长命令用 && 串联，不要用换行
- git 操作：绝不跳过 hooks (--no-verify)，绝不 force push 到 main
- 危险操作 (rm -rf, git reset --hard) 会被安全系统拦截或要求确认
- 命令超时默认 120 秒`,
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
    description: '读取文件内容。返回带行号的内容。支持 offset/limit 分段读取。',
    ministry: 'bing',
    isReadOnly: true,
    prompt: `# Read 工具使用指南
- file_path 必须是绝对路径
- 大文件用 offset/limit 分段读取，避免一次读太多
- 先读再改：edit_file 之前必须先 read_file`,
    input_schema: {
      type: 'object',
      properties: {
        file_path: { type: 'string', description: '文件绝对路径' },
        offset: { type: 'number', description: '起始行号（0-based）' },
        limit: { type: 'number', description: '读取行数，默认读全部' }
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
    description: '创建或覆盖文件。写入前会自动创建缺失的父目录。',
    ministry: 'bing',
    isReadOnly: false,
    prompt: `# Write 工具使用指南
- 优先用 edit_file 修改现有文件，write_file 用于创建新文件或完全重写
- 不要创建不必要的文件（README、文档等除非用户要求）
- 不要写入 .env、credentials 等敏感文件`,
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
    description: '编辑文件：将 old_string 替换为 new_string。old_string 必须在文件中唯一匹配，除非设置 replace_all。',
    ministry: 'bing',
    isReadOnly: false,
    prompt: `# Edit 工具使用指南
- 编辑前必须先用 read_file 读取文件内容
- old_string 必须精确匹配文件中的内容（包括缩进）
- old_string 在文件中必须唯一，否则会失败。需要时加更多上下文让它唯一
- 用 replace_all: true 来批量替换（如重命名变量）
- 不要改你没读过的代码`,
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
      // diff 预览（显示在终端供用户可见）
      const chalk = require('chalk');
      const oldLines = input.old_string.split('\n');
      const newLines = input.new_string.split('\n');
      if (process.stdout.isTTY && (oldLines.length > 1 || newLines.length > 1)) {
        console.log(chalk.gray(`    📝 ${path.basename(input.file_path)}:`));
        for (const l of oldLines.slice(0, 3)) console.log(chalk.red(`    - ${l}`));
        if (oldLines.length > 3) console.log(chalk.gray(`    ... (${oldLines.length} 行)`));
        for (const l of newLines.slice(0, 3)) console.log(chalk.green(`    + ${l}`));
        if (newLines.length > 3) console.log(chalk.gray(`    ... (${newLines.length} 行)`));
      }
      const result = editFile(input.file_path, input.old_string, input.new_string, input.replace_all);
      return `已替换 ${result.replaced} 处 (${path.basename(input.file_path)})`;
    }
  },
  {
    name: 'glob',
    description: '按模式搜索文件。支持 **/*.js, src/**/*.ts 等 glob 模式。返回匹配的文件路径列表。',
    ministry: 'bing',
    isReadOnly: true,
    prompt: '# Glob 工具使用指南\n- 用于按文件名模式查找文件，不搜索文件内容（搜内容用 grep）\n- 常用模式: **/*.js, src/**/*.ts, **/test*',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: 'Glob 模式，如 **/*.ts, src/**/*.js' },
        path: { type: 'string', description: '搜索根目录，默认为工作目录' }
      },
      required: ['pattern']
    },
    execute: async (input, context) => {
      const dir = input.path || context.cwd;
      try {
        const matches = globMatch(input.pattern, dir);
        if (matches.length === 0) return '(无匹配)';
        return matches.join('\n');
      } catch (err) {
        return `搜索失败: ${err.message}`;
      }
    }
  },
  {
    name: 'grep',
    description: '在文件中搜索内容。支持正则表达式。返回匹配的行及行号。',
    ministry: 'bing',
    isReadOnly: true,
    prompt: '# Grep 工具使用指南\n- 搜索文件内容（函数名、类名、错误信息等）\n- 支持正则: "function\\s+\\w+", "import.*from"\n- 用 glob 参数过滤文件类型: *.js, *.ts',
    input_schema: {
      type: 'object',
      properties: {
        pattern: { type: 'string', description: '搜索模式（正则）' },
        path: { type: 'string', description: '搜索目录或文件' },
        glob: { type: 'string', description: '文件过滤，如 *.js' },
        context_lines: { type: 'number', description: '显示匹配行前后的行数，默认 0' }
      },
      required: ['pattern']
    },
    execute: async (input, context) => {
      const dir = input.path || context.cwd;
      // 优先用 rg，降级用 grep
      let cmd = `rg --no-heading -n`;
      if (input.context_lines) cmd += ` -C ${input.context_lines}`;
      cmd += ` "${input.pattern}" "${dir}"`;
      if (input.glob) cmd += ` --glob "${input.glob}"`;
      cmd += ' 2>/dev/null | head -80';

      let result = await execBash(cmd, { cwd: context.cwd });
      if (!result.stdout) {
        // 降级到 grep
        let fallback = `grep -rn "${input.pattern}" "${dir}"`;
        if (input.glob) fallback += ` --include="${input.glob}"`;
        fallback += ' 2>/dev/null | head -80';
        result = await execBash(fallback, { cwd: context.cwd });
      }
      return result.stdout || '(无匹配)';
    }
  },
  {
    name: 'list_dir',
    description: '列出目录内容。显示文件类型（📁 目录 / 📄 文件）和文件大小。',
    ministry: 'bing',
    isReadOnly: true,
    prompt: '# List Dir 工具使用指南\n- 快速查看目录结构，比 bash ls 更直观\n- 不递归，只列一层。需要递归用 glob 或 bash tree',
    input_schema: {
      type: 'object',
      properties: {
        path: { type: 'string', description: '目录路径' }
      },
      required: ['path']
    },
    execute: async (input) => {
      if (!fs.existsSync(input.path)) {
        throw new Error(`目录不存在: ${input.path}`);
      }
      const entries = fs.readdirSync(input.path, { withFileTypes: true });
      return entries.map(e => {
        const icon = e.isDirectory() ? '📁' : '📄';
        let size = '';
        if (!e.isDirectory()) {
          try {
            const stat = fs.statSync(path.join(input.path, e.name));
            size = ` (${formatBytes(stat.size)})`;
          } catch { /* ignore */ }
        }
        return `${icon} ${e.name}${size}`;
      }).join('\n');
    }
  }
];

/**
 * 格式化字节数
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
}

/**
 * 获取工具的 API schema（用于发送给 LLM）
 * @param {string[]} [ministries] - 只返回指定部门的工具
 * @returns {Array}
 */
function getToolSchemas(ministries) {
  // 合并内置工具 + 插件工具
  let tools = [...TOOLS];
  try {
    const { pluginManager } = require('../../plugins/loader');
    tools = [...tools, ...pluginManager.getPluginTools()];
  } catch { /* plugins not loaded */ }

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
 * 执行单个工具调用
 * @param {string} toolName
 * @param {object} input
 * @param {object} context - { cwd, agentId }
 * @returns {Promise<string>}
 */
async function executeTool(toolName, input, context) {
  // 搜索内置工具 + 插件工具
  let tool = TOOLS.find(t => t.name === toolName);
  if (!tool) {
    try {
      const { pluginManager } = require('../../plugins/loader');
      tool = pluginManager.getPluginTools().find(t => t.name === toolName);
    } catch { /* ignore */ }
  }
  if (!tool) {
    throw new Error(`未知工具: ${toolName}。可用工具: ${TOOLS.map(t => t.name).join(', ')}`);
  }
  return tool.execute(input, context);
}

/**
 * 批量执行工具调用（read-only 并发，write 串行）
 * 参考 Claude Code 的 toolOrchestration.ts partitionToolCalls 模式
 *
 * @param {Array<{id: string, name: string, input: object}>} toolCalls
 * @param {object} context - { cwd, agentId }
 * @param {function} [onProgress] - 进度回调 (toolName, result)
 * @returns {Promise<Array<{id: string, name: string, result: string}>>}
 */
async function executeToolsBatched(toolCalls, context, onProgress) {
  const results = [];

  // 按 read-only 分组：连续的 read-only 工具并发，遇到 write 工具就串行
  const batches = [];
  let currentBatch = [];
  let currentIsReadOnly = null;

  for (const tc of toolCalls) {
    const tool = TOOLS.find(t => t.name === tc.name);
    const isRO = tool?.isReadOnly ?? false;

    if (currentIsReadOnly === null) {
      currentIsReadOnly = isRO;
      currentBatch.push(tc);
    } else if (isRO && currentIsReadOnly) {
      // 连续 read-only → 同一批
      currentBatch.push(tc);
    } else {
      // 切换了类型 → 新批次
      batches.push({ calls: currentBatch, readOnly: currentIsReadOnly });
      currentBatch = [tc];
      currentIsReadOnly = isRO;
    }
  }
  if (currentBatch.length > 0) {
    batches.push({ calls: currentBatch, readOnly: currentIsReadOnly });
  }

  // 执行每个批次
  for (const batch of batches) {
    const exec = async (tc) => {
      // 支持预设结果（如被安全检查拦截的）
      if (tc._preResult) {
        return { id: tc.id, name: tc.name, result: tc._preResult };
      }
      let result;
      try {
        result = await executeTool(tc.name, tc.input, context);
      } catch (err) {
        result = `工具执行失败: ${err.message}`;
      }
      if (onProgress) onProgress(tc.name, result);
      return { id: tc.id, name: tc.name, result: String(result || '(无结果)') };
    };

    if (batch.readOnly && batch.calls.length > 1) {
      // read-only 并发执行
      results.push(...await Promise.all(batch.calls.map(exec)));
    } else {
      // write 工具或单个 read-only → 串行
      for (const tc of batch.calls) {
        results.push(await exec(tc));
      }
    }
  }

  return results;
}

/**
 * 获取工具的 isReadOnly 属性
 * @param {string} toolName
 * @returns {boolean}
 */
function isToolReadOnly(toolName) {
  const tool = TOOLS.find(t => t.name === toolName);
  return tool?.isReadOnly ?? false;
}

/**
 * 收集所有工具的使用指南 prompt（注入 system prompt）
 * 参考 Claude Code 每个 tool 的 .prompt() 方法
 * @returns {string}
 */
function getToolPrompts() {
  return TOOLS
    .filter(t => t.prompt)
    .map(t => t.prompt)
    .join('\n\n');
}

module.exports = { TOOLS, getToolSchemas, executeTool, executeToolsBatched, isToolReadOnly, getToolPrompts };
