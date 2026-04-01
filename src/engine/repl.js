/**
 * 交互式 REPL — 朝堂议事
 */

const readline = require('readline');
const chalk = require('chalk');
const { startSession } = require('./query-loop');

/**
 * 启动交互式 REPL
 * @param {object} options - CLI 选项
 */
async function startRepl(options) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: chalk.yellow('天子 > ')
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();

    if (!input) {
      rl.prompt();
      return;
    }

    // 内置命令
    if (input === '/exit' || input === '/退朝') {
      console.log(chalk.yellow('\n退朝。\n'));
      rl.close();
      return;
    }

    if (input === '/cost' || input === '/账目') {
      console.log(chalk.gray('（户部报账功能开发中）'));
      rl.prompt();
      return;
    }

    if (input === '/court' || input === '/朝廷') {
      const { getRegime } = require('../config/regimes');
      const regime = getRegime(options.regime || 'ming');
      console.log(`\n${regime.diagram}\n`);
      rl.prompt();
      return;
    }

    if (input === '/regime' || input === '/制度') {
      const { listRegimes } = require('../config/regimes');
      for (const r of listRegimes()) {
        console.log(`  ${chalk.cyan(r.id)} — ${r.name}`);
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input.startsWith('/help') || input === '/帮助') {
      console.log(`
  ${chalk.bold('朝堂指令：')}
    /court    显示朝廷架构
    /regime   切换制度
    /cost     户部报账
    /exit     退朝
      `);
      rl.prompt();
      return;
    }

    // 执行旨意
    try {
      await startSession(input, options);
    } catch (err) {
      console.error(chalk.red(`\n出错: ${err.message}\n`));
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}

module.exports = { startRepl };
