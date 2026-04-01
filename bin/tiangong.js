#!/usr/bin/env node
/**
 * 天工开物 — CLI 入口
 *
 * 用法：
 *   tiangong "帮我写一个登录页面"
 *   tiangong --regime ming "重构这个模块"
 *   tiangong --regime tang "审查这段代码"
 *   tiangong --regime modern "做一个市场分析"
 *   tiangong export --format agentpark
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { version } = require('../package.json');
const { startSession } = require('../src/engine/query-loop');
const { listRegimes, getRegime } = require('../src/config/regimes');

const program = new Command();

program
  .name('tiangong')
  .description('天工开物 — AI Agent 朝廷框架')
  .version(version)
  .option('-r, --regime <type>', '制度选择: ming | tang | modern', 'ming')
  .option('-m, --model <model>', '模型覆盖 (默认 claude-sonnet-4-6)')
  .option('--verbose', '详细输出')
  .option('--dry-run', '只显示执行计划，不实际执行')
  .argument('[prompt...]', '给朝廷的旨意')
  .action(async (promptParts, options) => {
    const prompt = promptParts.join(' ');

    if (!prompt) {
      // 交互模式
      console.log(chalk.yellow('┌─────────────────────────────────┐'));
      console.log(chalk.yellow('│  天工开物 v' + version.padEnd(23) + '│'));
      console.log(chalk.yellow('│  三省六部，听旨办差              │'));
      console.log(chalk.yellow('└─────────────────────────────────┘'));
      console.log();
      console.log(`制度: ${chalk.cyan(options.regime)}`);
      console.log(`输入旨意，或 ${chalk.gray('Ctrl+C')} 退朝\n`);

      const { startRepl } = require('../src/engine/repl');
      await startRepl(options);
      return;
    }

    // 单次执行模式
    await startSession(prompt, options);
  });

// 子命令：列出制度
program
  .command('regimes')
  .description('列出所有可用制度')
  .action(() => {
    const regimes = listRegimes();
    console.log(chalk.bold('\n可用制度：\n'));
    for (const r of regimes) {
      console.log(`  ${chalk.cyan(r.id.padEnd(10))} ${r.name} — ${r.description}`);
      console.log(`  ${''.padEnd(10)} Agent 数: ${r.agentCount}  制度特点: ${r.style}\n`);
    }
  });

// 子命令：显示朝廷架构
program
  .command('court')
  .description('显示当前朝廷架构')
  .option('-r, --regime <type>', '制度', 'ming')
  .action((options) => {
    const regime = getRegime(options.regime);
    console.log(chalk.bold(`\n${regime.name} 架构：\n`));
    console.log(regime.diagram);
    console.log(chalk.bold('\n百官名册：\n'));
    for (const agent of regime.agents) {
      console.log(`  ${agent.emoji} ${chalk.cyan(agent.name.padEnd(8))} (${agent.id}) — ${agent.role}`);
    }
  });

// 子命令：导出朝廷班子
program
  .command('export')
  .description('导出训练好的朝廷班子')
  .option('-f, --format <type>', '格式: agentpark | openclaw | json', 'json')
  .option('-o, --output <path>', '输出路径')
  .option('-r, --regime <type>', '制度', 'ming')
  .action(async (options) => {
    const { exportCourt } = require('../src/export/exporter');
    await exportCourt(options);
  });

// 子命令：从 AgentPark 导入
program
  .command('import <source>')
  .description('从 AgentPark 导入 Agent')
  .action(async (source, options) => {
    const { importAgent } = require('../src/export/importer');
    await importAgent(source, options);
  });

program.parse();
