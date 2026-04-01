/**
 * 交互式 REPL — 朝堂议事
 */

const readline = require('readline');
const chalk = require('chalk');
const { startSession } = require('./query-loop');
const { version } = require('../../package.json');

const REPL_BANNER = `
${chalk.yellow('  ╔══════════════════════════════════════════════════════╗')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.bold.yellow('天 工 开 物')} ${chalk.gray(`v${version}`)}                                ${chalk.yellow('║')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.red('🐉')} ${chalk.white('三省六部，听旨办差')}                            ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.red('👑')} ${chalk.white('养好班子，派去打工')}                            ${chalk.yellow('║')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/court  朝廷架构    /cost   户部账目')}           ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/regime 切换制度    /memory 太史局')}             ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/help   帮助        /exit   退朝')}               ${chalk.yellow('║')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ╚══════════════════════════════════════════════════════╝')}
`;

/**
 * 启动交互式 REPL
 */
async function startRepl(options) {
  console.log(REPL_BANNER);

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.yellow('  天子 👑 > ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // 内置命令
    if (input === '/exit' || input === '/退朝') {
      console.log(chalk.yellow('\n  退朝。天下太平。\n'));
      rl.close();
      return;
    }

    if (input === '/cost' || input === '/账目') {
      console.log(chalk.gray('  （户部报账功能开发中）'));
      rl.prompt(); return;
    }

    if (input === '/court' || input === '/朝廷') {
      const { getRegime } = require('../config/regimes');
      const regime = getRegime(options.regime || 'ming');
      console.log(chalk.bold(`\n  ${regime.name}\n`));
      console.log(regime.diagram);
      console.log(chalk.bold('  百官名册：\n'));
      for (const agent of regime.agents) {
        console.log(`    ${agent.emoji} ${chalk.cyan(agent.name.padEnd(8))} (${agent.id}) — ${agent.role}`);
      }
      console.log();
      rl.prompt(); return;
    }

    if (input === '/regime' || input === '/制度') {
      const { listRegimes } = require('../config/regimes');
      console.log();
      for (const r of listRegimes()) {
        console.log(`    ${chalk.cyan(r.id.padEnd(10))} ${r.name} — ${r.description}`);
      }
      console.log();
      rl.prompt(); return;
    }

    if (input === '/memory' || input === '/记忆') {
      const { memoryStore } = require('../memory/store');
      const data = memoryStore.exportAllMemories();
      const agentCount = Object.keys(data.agents).length;
      const totalMem = Object.values(data.agents).reduce((s, a) => s + a.length, 0) + data.court.length;
      console.log(chalk.bold(`\n  太史局：${agentCount} 位大臣，共 ${totalMem} 条记忆\n`));
      for (const [id, mems] of Object.entries(data.agents)) {
        if (mems.length > 0) console.log(`    ${chalk.cyan(id)}: ${mems.length} 条`);
      }
      if (data.court.length > 0) console.log(`    ${chalk.yellow('朝廷共识')}: ${data.court.length} 条`);
      console.log();
      rl.prompt(); return;
    }

    if (input.startsWith('/help') || input === '/帮助') {
      console.log(`
  ${chalk.bold.yellow('朝堂指令：')}

    ${chalk.cyan('/court')}     显示朝廷架构 + 百官名册
    ${chalk.cyan('/regime')}    查看可选制度
    ${chalk.cyan('/memory')}    太史局记忆概况
    ${chalk.cyan('/cost')}      户部报账
    ${chalk.cyan('/help')}      帮助
    ${chalk.cyan('/exit')}      退朝
      `);
      rl.prompt(); return;
    }

    // 执行旨意
    try {
      await startSession(input, options);
    } catch (err) {
      console.error(chalk.red(`\n  出错: ${err.message}\n`));
    }

    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

module.exports = { startRepl };
