/**
 * 天书降世 — 崩溃日志逆向修复引擎
 *
 * 闻所未闻的功能：
 * 直接粘贴一段错误日志 / 堆栈追踪 / 崩溃报告，
 * 自动分析错误原因，定位到源代码，生成修复 patch。
 *
 * 不只是"解释错误"——是直接生成可应用的修复代码。
 *
 * 工作流：
 *   1. 解析错误日志，提取关键信息（错误类型、堆栈、文件位置）
 *   2. 自动读取相关源文件
 *   3. 分析根因
 *   4. 生成修复 diff / patch
 *   5. （可选）自动应用修复
 *
 * 用法：
 *   /oracle <粘贴错误日志>
 *   /oracle --file crash.log
 *   /oracle --apply    分析并自动应用修复
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const { callLLM } = require('../shangshu/li/api-client');
const { loadConfig } = require('../config/setup');
const { readFile } = require('../shangshu/bing/file-ops');
const { execBash } = require('../shangshu/bing/bash');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { Spinner } = require('../engine/spinner');

/**
 * 错误模式匹配
 */
const ERROR_PATTERNS = {
  // Node.js / JavaScript
  node_module_not_found: {
    pattern: /Cannot find module '([^']+)'/,
    type: 'ModuleNotFound',
    extract: (m) => ({ module: m[1] })
  },
  node_syntax_error: {
    pattern: /SyntaxError: (.+)\n\s+at .+\((.+):(\d+):(\d+)\)/s,
    type: 'SyntaxError',
    extract: (m) => ({ message: m[1], file: m[2], line: parseInt(m[3]), col: parseInt(m[4]) })
  },
  node_type_error: {
    pattern: /TypeError: (.+)\n\s+at .+\((.+):(\d+):(\d+)\)/s,
    type: 'TypeError',
    extract: (m) => ({ message: m[1], file: m[2], line: parseInt(m[3]), col: parseInt(m[4]) })
  },
  node_reference_error: {
    pattern: /ReferenceError: (.+) is not defined\n\s+at .+\((.+):(\d+)/s,
    type: 'ReferenceError',
    extract: (m) => ({ variable: m[1], file: m[2], line: parseInt(m[3]) })
  },
  // Python
  python_traceback: {
    pattern: /File "(.+)", line (\d+).*\n\s+.+\n(\w+Error): (.+)/s,
    type: 'PythonError',
    extract: (m) => ({ file: m[1], line: parseInt(m[2]), errorType: m[3], message: m[4] })
  },
  // 通用堆栈追踪
  generic_stack: {
    pattern: /at .+\((.+):(\d+):(\d+)\)/,
    type: 'StackTrace',
    extract: (m) => ({ file: m[1], line: parseInt(m[2]), col: parseInt(m[3]) })
  },
  // Docker / 容器
  docker_error: {
    pattern: /(Error response from daemon|OCI runtime|container .+ exited with code \d+)/,
    type: 'DockerError',
    extract: (m) => ({ message: m[1] })
  },
  // 数据库
  db_error: {
    pattern: /(ER_\w+|SQLITE_ERROR|relation ".+" does not exist|duplicate key)/i,
    type: 'DatabaseError',
    extract: (m) => ({ message: m[1] })
  }
};

/**
 * 分析崩溃日志并生成修复
 * @param {object} params
 * @param {string} params.errorLog - 错误日志内容
 * @param {boolean} [params.autoApply=false] - 是否自动应用修复
 * @param {string} [params.cwd] - 项目目录
 * @returns {Promise<object>}
 */
async function analyzeAndFix(params) {
  const { errorLog, autoApply = false, cwd = process.cwd() } = params;
  const config = loadConfig() || {};
  const model = config.model;
  const costTracker = new CostTracker();

  console.log();
  console.log(chalk.red('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.red('  ║') + chalk.bold.yellow('    📜  天 书 降 世  📜') + chalk.gray('    Crash Oracle') + '             ' + chalk.red('║'));
  console.log(chalk.red('  ╚══════════════════════════════════════════════════════╝'));
  console.log();

  // ── 第一步：解析错误日志 ──
  const parseSpinner = new Spinner({ color: 'yellow' });
  parseSpinner.start('解析错误日志...');

  const parsed = parseErrorLog(errorLog);

  if (parsed.type === 'unknown') {
    parseSpinner.succeed('错误日志已接收（类型未能自动识别，将交由 AI 分析）');
  } else {
    parseSpinner.succeed(`识别错误类型: ${chalk.red(parsed.type)}`);
  }

  // 显示解析结果
  console.log(chalk.gray(`\n  错误类型: ${chalk.red(parsed.type)}`));
  if (parsed.file) console.log(chalk.gray(`  文件位置: ${chalk.cyan(parsed.file)}:${parsed.line || '?'}`));
  if (parsed.message) console.log(chalk.gray(`  错误消息: ${chalk.white(parsed.message)}`));
  console.log();

  // ── 第二步：读取相关源文件 ──
  const contextFiles = {};

  if (parsed.file && fs.existsSync(parsed.file)) {
    const readSpinner = new Spinner({ color: 'cyan' });
    readSpinner.start(`读取源文件: ${parsed.file}...`);
    try {
      const startLine = Math.max(0, (parsed.line || 1) - 15);
      const result = readFile(parsed.file, { offset: startLine, limit: 40 });
      contextFiles[parsed.file] = result.content;
      readSpinner.succeed(`已读取 ${parsed.file}`);
    } catch (err) {
      readSpinner.fail(`读取失败: ${err.message}`);
    }
  }

  // 也尝试从堆栈中提取其他文件
  const stackFiles = extractStackFiles(errorLog, cwd);
  for (const sf of stackFiles.slice(0, 3)) {
    if (!contextFiles[sf.file] && fs.existsSync(sf.file)) {
      try {
        const startLine = Math.max(0, sf.line - 10);
        const result = readFile(sf.file, { offset: startLine, limit: 25 });
        contextFiles[sf.file] = result.content;
      } catch { /* ignore */ }
    }
  }

  // ── 第三步：AI 分析 + 生成修复 ──
  const fixSpinner = new Spinner({ color: 'green' });
  fixSpinner.start('AI 正在分析根因并生成修复方案...');

  try {
    const analysisPrompt = buildAnalysisPrompt(errorLog, parsed, contextFiles);

    const response = await callLLM({
      model,
      system: `你是一个资深的 bug 修复专家。你的任务是：
1. 分析错误日志的根因
2. 给出明确的修复方案
3. 提供可以直接使用的修复代码

输出格式：
## 根因分析
(简要解释为什么出错)

## 修复方案
(描述怎么修)

## 修复代码
(给出完整的修改后的代码，用 diff 或直接给出修改后的文件内容)

## 预防措施
(如何避免类似问题再次发生)`,
      messages: [{ role: 'user', content: analysisPrompt }],
      maxTokens: 4096
    });

    costTracker.record('oracle', model || 'claude-sonnet-4-6',
      response.usage?.input_tokens || 0, response.usage?.output_tokens || 0);

    fixSpinner.succeed('分析完成');

    const analysis = response.content || '(无分析结果)';

    // 显示分析结果
    console.log();
    console.log(chalk.gray('  ┌─ 天书 ─────────────────────────────────────'));
    for (const line of analysis.split('\n')) {
      // 美化 markdown 标题
      if (line.startsWith('## ')) {
        console.log(chalk.gray('  │ ') + chalk.bold.yellow(line));
      } else if (line.startsWith('```')) {
        console.log(chalk.gray('  │ ') + chalk.gray(line));
      } else {
        console.log(chalk.gray('  │ ') + chalk.white(line));
      }
    }
    console.log(chalk.gray('  └──────────────────────────────────────────────'));

    // ── 第四步：自动应用修复（如果请求） ──
    if (autoApply) {
      console.log(chalk.yellow('\n  ⚠️ 自动应用修复功能暂未实现（安全考虑）'));
      console.log(chalk.gray('  请手动复制上方的修复代码进行修改'));
    }

    const cost = costTracker.getSummary();
    console.log(chalk.gray(`\n  ⚡ 天书消耗: ${cost.total.inputTokens + cost.total.outputTokens} tokens`));
    console.log();

    return {
      parsed,
      analysis,
      contextFiles: Object.keys(contextFiles),
      cost
    };

  } catch (err) {
    fixSpinner.fail(`分析失败: ${err.message}`);
    console.log();
    return { parsed, error: err.message };
  }
}

/**
 * 解析错误日志
 * @private
 */
function parseErrorLog(log) {
  for (const [key, def] of Object.entries(ERROR_PATTERNS)) {
    const match = log.match(def.pattern);
    if (match) {
      return {
        patternId: key,
        type: def.type,
        ...def.extract(match),
        raw: log
      };
    }
  }

  // 尝试提取任何文件路径和行号
  const fileMatch = log.match(/(?:at |File "|in )(.+?\.[jt]sx?|.+?\.py):?(\d+)?/);
  if (fileMatch) {
    return {
      type: 'unknown',
      file: fileMatch[1],
      line: fileMatch[2] ? parseInt(fileMatch[2]) : null,
      message: log.split('\n')[0],
      raw: log
    };
  }

  return { type: 'unknown', message: log.split('\n')[0], raw: log };
}

/**
 * 从堆栈中提取文件列表
 * @private
 */
function extractStackFiles(log, cwd) {
  const files = [];
  const regex = /at .+\((.+):(\d+):(\d+)\)/g;
  let match;
  while ((match = regex.exec(log)) !== null) {
    const file = match[1];
    // 只保留项目文件（排除 node_modules 和 internal）
    if (!file.includes('node_modules') && !file.includes('node:') && !file.startsWith('internal/')) {
      files.push({
        file: path.isAbsolute(file) ? file : path.join(cwd, file),
        line: parseInt(match[2]),
        col: parseInt(match[3])
      });
    }
  }
  return files;
}

/**
 * 构建分析 Prompt
 * @private
 */
function buildAnalysisPrompt(errorLog, parsed, contextFiles) {
  const parts = [];
  parts.push('以下是一个程序崩溃/错误的日志：');
  parts.push('```');
  parts.push(errorLog.slice(0, 3000)); // 限制长度
  parts.push('```');

  if (parsed.type !== 'unknown') {
    parts.push(`\n已识别错误类型: ${parsed.type}`);
    if (parsed.file) parts.push(`出错文件: ${parsed.file}:${parsed.line || '?'}`);
  }

  if (Object.keys(contextFiles).length > 0) {
    parts.push('\n相关源代码：');
    for (const [file, content] of Object.entries(contextFiles)) {
      parts.push(`\n--- ${file} ---`);
      parts.push(content);
    }
  }

  parts.push('\n请分析根因并给出修复方案和代码。');

  return parts.join('\n');
}

module.exports = { analyzeAndFix, parseErrorLog };
