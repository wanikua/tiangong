/**
 * MCP (Model Context Protocol) 客户端
 *
 * 连接外部 MCP Server（通过 stdio），获取其工具列表，注册为天工工具。
 *
 * 配置: ~/.tiangong/mcp.json
 * {
 *   "servers": {
 *     "filesystem": {
 *       "command": "npx",
 *       "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
 *     }
 *   }
 * }
 *
 * 用法:
 *   /mcp            查看已连接的 MCP 服务
 *   /mcp connect    连接配置的所有服务
 *   /mcp tools      列出所有 MCP 工具
 */

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const MCP_CONFIG = path.join(process.env.HOME || '/tmp', '.tiangong', 'mcp.json');

class McpClient {
  constructor() {
    this.servers = new Map(); // name → { process, tools }
    this.tools = [];
  }

  /**
   * 加载 MCP 配置
   * @returns {object}
   */
  loadConfig() {
    try {
      if (fs.existsSync(MCP_CONFIG)) {
        return JSON.parse(fs.readFileSync(MCP_CONFIG, 'utf-8'));
      }
    } catch { /* ignore */ }
    return { servers: {} };
  }

  /**
   * 连接一个 MCP Server（通过 stdio JSON-RPC）
   * @param {string} name
   * @param {object} config - { command, args, env }
   */
  async connectServer(name, config) {
    if (this.servers.has(name)) {
      console.log(chalk.gray(`  MCP ${name} 已连接`));
      return;
    }

    try {
      const proc = spawn(config.command, config.args || [], {
        stdio: ['pipe', 'pipe', 'pipe'],
        env: { ...process.env, ...(config.env || {}) }
      });

      // 初始化握手
      const initResult = await this._rpc(proc, 'initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'tiangong', version: '0.1.0' }
      });

      // 获取工具列表
      const toolsResult = await this._rpc(proc, 'tools/list', {});
      const tools = (toolsResult.tools || []).map(t => ({
        name: `mcp_${name}_${t.name}`,
        description: `[MCP:${name}] ${t.description || t.name}`,
        input_schema: t.inputSchema || { type: 'object', properties: {} },
        ministry: 'mcp',
        isReadOnly: false,
        _mcpServer: name,
        _mcpToolName: t.name,
        execute: async (input) => {
          const result = await this._rpc(proc, 'tools/call', {
            name: t.name,
            arguments: input
          });
          // 提取文本内容
          if (result.content) {
            return result.content
              .filter(c => c.type === 'text')
              .map(c => c.text)
              .join('\n') || JSON.stringify(result.content);
          }
          return JSON.stringify(result);
        }
      }));

      this.servers.set(name, { process: proc, tools, config });
      this.tools.push(...tools);

      // 发送 initialized 通知
      this._notify(proc, 'notifications/initialized', {});

      console.log(chalk.green(`  ✓ MCP ${name} 已连接 (${tools.length} 个工具)`));
      for (const t of tools) {
        console.log(chalk.gray(`    • ${t.name}`));
      }
    } catch (err) {
      console.log(chalk.red(`  ✗ MCP ${name} 连接失败: ${err.message}`));
    }
  }

  /**
   * 连接所有配置的 MCP Server
   */
  async connectAll() {
    const config = this.loadConfig();
    for (const [name, serverConfig] of Object.entries(config.servers || {})) {
      await this.connectServer(name, serverConfig);
    }
  }

  /**
   * 获取所有 MCP 工具
   */
  getTools() {
    return this.tools;
  }

  /**
   * 断开所有连接
   */
  disconnectAll() {
    for (const [name, server] of this.servers) {
      try { server.process.kill(); } catch { /* ignore */ }
    }
    this.servers.clear();
    this.tools = [];
  }

  /**
   * 打印状态
   */
  printStatus() {
    console.log();
    if (this.servers.size === 0) {
      console.log(chalk.gray('  没有连接的 MCP 服务'));
      console.log(chalk.gray(`  配置文件: ${MCP_CONFIG}`));
      console.log(chalk.gray('  用 /mcp connect 连接'));
    } else {
      console.log(chalk.bold('  🔌 MCP 服务：\n'));
      for (const [name, server] of this.servers) {
        console.log(`  ${chalk.green('●')} ${chalk.cyan(name)} — ${server.tools.length} 个工具`);
        for (const t of server.tools) {
          console.log(chalk.gray(`    • ${t.name}: ${t.description.slice(0, 60)}`));
        }
      }
    }
    console.log();
  }

  /** @private JSON-RPC 请求 */
  _rpc(proc, method, params) {
    return new Promise((resolve, reject) => {
      const id = Date.now();
      const msg = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

      const timeout = setTimeout(() => reject(new Error('MCP RPC 超时')), 10000);

      let buffer = '';
      const onData = (data) => {
        buffer += data.toString();
        const lines = buffer.split('\n');
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const resp = JSON.parse(line);
            if (resp.id === id) {
              clearTimeout(timeout);
              proc.stdout.removeListener('data', onData);
              if (resp.error) reject(new Error(resp.error.message || 'MCP error'));
              else resolve(resp.result || {});
              return;
            }
          } catch { /* not complete JSON yet */ }
        }
        buffer = lines[lines.length - 1] || '';
      };

      proc.stdout.on('data', onData);
      proc.stdin.write(msg);
    });
  }

  /** @private JSON-RPC 通知 */
  _notify(proc, method, params) {
    const msg = JSON.stringify({ jsonrpc: '2.0', method, params }) + '\n';
    try { proc.stdin.write(msg); } catch { /* ignore */ }
  }
}

const mcpClient = new McpClient();

module.exports = { McpClient, mcpClient, MCP_CONFIG };
