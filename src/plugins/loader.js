/**
 * 插件系统 — 第三方扩展机制
 *
 * 从 ~/.tiangong/plugins/ 加载 JS 插件
 * 每个插件是一个 JS 文件，导出 { name, version, tools?, commands?, agents? }
 *
 * 用法:
 *   ~/.tiangong/plugins/my-plugin.js
 *   module.exports = {
 *     name: 'my-plugin',
 *     version: '1.0.0',
 *     tools: [{ name: 'my_tool', description: '...', input_schema: {...}, execute: async (input) => {...} }],
 *     commands: [{ name: '/my-cmd', description: '...', handler: (args) => {...} }],
 *   }
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const { PLUGIN_DIR } = require('../config/index');

class PluginManager {
  constructor() {
    this.plugins = [];
    this.tools = [];
    this.commands = [];
  }

  /**
   * 加载所有插件
   */
  loadAll() {
    if (!fs.existsSync(PLUGIN_DIR)) {
      fs.mkdirSync(PLUGIN_DIR, { recursive: true });
      return;
    }

    const files = fs.readdirSync(PLUGIN_DIR).filter(f => f.endsWith('.js'));

    for (const file of files) {
      try {
        const pluginPath = path.join(PLUGIN_DIR, file);
        const plugin = require(pluginPath);

        if (!plugin.name) {
          console.log(chalk.yellow(`  插件 ${file} 缺少 name 字段，跳过`));
          continue;
        }

        this.plugins.push({
          name: plugin.name,
          version: plugin.version || '0.0.0',
          file,
          description: plugin.description || ''
        });

        // 注册工具
        if (plugin.tools && Array.isArray(plugin.tools)) {
          for (const tool of plugin.tools) {
            this.tools.push({
              ...tool,
              ministry: 'plugin',
              isReadOnly: tool.isReadOnly ?? false,
              _pluginName: plugin.name
            });
          }
        }

        // 注册命令
        if (plugin.commands && Array.isArray(plugin.commands)) {
          for (const cmd of plugin.commands) {
            this.commands.push({ ...cmd, _pluginName: plugin.name });
          }
        }
      } catch (err) {
        console.log(chalk.red(`  插件 ${file} 加载失败: ${err.message}`));
      }
    }
  }

  /**
   * 获取插件注册的工具（合并到主工具列表）
   * @returns {Array}
   */
  getPluginTools() {
    return this.tools;
  }

  /**
   * 获取插件注册的命令
   * @returns {Array}
   */
  getPluginCommands() {
    return this.commands;
  }

  /**
   * 打印已加载插件列表
   */
  printPlugins() {
    console.log();
    if (this.plugins.length === 0) {
      console.log(chalk.gray('  没有安装插件'));
      console.log(chalk.gray(`  插件目录: ${PLUGIN_DIR}`));
      console.log(chalk.gray('  放一个 .js 文件到该目录即可'));
    } else {
      console.log(chalk.bold('  已安装插件：\n'));
      for (const p of this.plugins) {
        console.log(`  ${chalk.cyan(p.name)} ${chalk.gray('v' + p.version)} — ${p.description || p.file}`);
        const pTools = this.tools.filter(t => t._pluginName === p.name);
        const pCmds = this.commands.filter(c => c._pluginName === p.name);
        if (pTools.length) console.log(chalk.gray(`    工具: ${pTools.map(t => t.name).join(', ')}`));
        if (pCmds.length) console.log(chalk.gray(`    命令: ${pCmds.map(c => c.name).join(', ')}`));
      }
    }
    console.log();
  }
}

const pluginManager = new PluginManager();

module.exports = { PluginManager, pluginManager, PLUGIN_DIR };
