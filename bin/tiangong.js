#!/usr/bin/env node
/**
 * 天工开物 — CLI 入口
 *
 * 用法：
 *   tiangong "帮我写一个登录页面"
 *   tiangong --regime ming "重构这个模块"
 *   tiangong --regime tang "审查这段代码"
 *   tiangong --regime modern "做一个市场分析"
 *   tiangong export --format openclaw
 */

const { Command } = require('commander');
const chalk = require('chalk');
const { version } = require('../package.json');
const { startSession } = require('../src/engine/query-loop');
const { listRegimes, getRegime } = require('../src/config/regimes');

const { needsSetup, runSetup, loadConfig } = require('../src/config/setup');

const program = new Command();

program
  .name('tiangong')
  .description('天工开物 — AI Agent 朝廷框架')
  .version(version)
  .option('-r, --regime <type>', '制度选择: ming | tang | modern')
  .option('-m, --model <model>', '模型覆盖')
  .option('-p, --provider <type>', '提供商: anthropic | openrouter | openai | deepseek')
  .option('--verbose', '详细输出')
  .option('--dry-run', '只显示执行计划，不实际执行')
  .argument('[prompt...]', '给朝廷的旨意')
  .action(async (promptParts, options) => {
    // 合并已保存的配置（setup 已在全局前置完成）
    const savedConfig = loadConfig() || {};
    if (!options.regime) options.regime = savedConfig.regime || 'ming';
    if (!options.model) options.model = savedConfig.model;
    if (!options.provider) options.provider = savedConfig.provider;

    const prompt = promptParts.join(' ');

    if (!prompt) {
      // 交互模式（Banner 由 REPL 显示）

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
  .argument('[regime]', '制度: ming | tang | modern')
  .action((regime) => {
    // 优先用参数，其次用父命令的 --regime，最后用配置文件，兜底 ming
    const savedConfig = loadConfig() || {};
    const regimeId = regime || program.opts().regime || savedConfig.regime || 'ming';
    const r = getRegime(regimeId);
    console.log(chalk.bold('\n' + r.name + ' 架构：\n'));
    console.log(r.diagram);
    console.log(chalk.bold('\n百官名册：\n'));
    for (const agent of r.agents) {
      console.log('  ' + agent.emoji + ' ' + chalk.cyan(agent.name.padEnd(8)) + ' (' + agent.id + ') -- ' + agent.role);
    }
  });

// 子命令：导出朝廷班子
program
  .command('export')
  .description('导出训练好的朝廷班子')
  .option('-f, --format <type>', '格式: openclaw | json', 'json')
  .option('-o, --output <path>', '输出路径')
  .argument('[regime]', '制度: ming | tang | modern')
  .action(async (regime, options) => {
    const savedConfig = loadConfig() || {};
    options.regime = regime || program.opts().regime || savedConfig.regime || 'ming';
    const { exportCourt } = require('../src/export/exporter');
    await exportCourt(options);
  });

// 子命令：导入 Agent
program
  .command('import <source>')
  .description('从外部来源导入 Agent')
  .action(async (source, options) => {
    const { importAgent } = require('../src/export/importer');
    await importAgent(source, options);
  });

// 子命令：模型管理
program
  .command('model [name]')
  .description('查看/切换模型')
  .option('--of <type>', '查看指定 provider 的模型列表')
  .action((name, options) => {
    const { PROVIDERS, getProvider } = require('../src/config/providers');
    const config = loadConfig() || {};
    const providerId = options.of || config.provider || 'anthropic';
    const provider = getProvider(providerId);

    if (!provider) {
      console.log(chalk.red(`\n  未知 provider: ${providerId}\n`));
      process.exit(1);
    }

    if (name) {
      // 切换模型
      config.model = name;
      const fs = require('fs');
      const path = require('path');
      const configDir = path.join(process.env.HOME || '/tmp', '.tiangong');
      const configPath = path.join(configDir, 'config.json');
      if (!fs.existsSync(configDir)) fs.mkdirSync(configDir, { recursive: true });
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
      console.log(chalk.green(`\n  模型已切换: ${chalk.bold(name)}`));
      console.log(chalk.gray(`  Provider: ${provider.name}\n`));
    } else {
      // 列出可选模型
      const currentModel = config.model || provider.defaultModel || '(未设置)';
      console.log(chalk.bold(`\n  当前模型: ${chalk.cyan(currentModel)}`));
      console.log(chalk.gray(`  Provider: ${provider.name}\n`));

      if (provider.models.length > 0) {
        console.log(chalk.bold('  可选模型：\n'));
        provider.models.forEach((m, i) => {
          const active = m === currentModel ? chalk.green(' <-- 当前') : '';
          const isDefault = m === provider.defaultModel ? chalk.gray(' (推荐)') : '';
          const num = chalk.cyan(String(i + 1).padStart(2));
          console.log('    ' + num + ') ' + m + isDefault + active);
        });
        console.log(chalk.gray('\n  切换: tiangong model <模型名>'));
        console.log(chalk.gray('  示例: tiangong model ' + (provider.models[0] || 'model-name')));
        console.log(chalk.gray('  自定义: tiangong model <任意模型名> (不限于列表)'));
      } else {
        console.log(chalk.gray('  该 provider 未预设模型列表，直接指定模型名即可'));
        console.log(chalk.gray('  示例: tiangong model my-model-name'));
      }
      console.log(chalk.gray('  查看其他 provider 的模型: tiangong model --of <provider>'));
      console.log();
    }
  });

// 子命令：重新配置
program
  .command('setup')
  .description('重新运行登基大典（配置 API Key / Provider / 制度）')
  .action(async () => {
    await runSetup();
  });

// 子命令：功勋排行榜
program
  .command('rank [agentId]')
  .description('查看 Agent 功勋排行榜')
  .action((agentId) => {
    const { reputationManager } = require('../src/features/reputation');
    if (agentId) {
      reputationManager.printAgentDetail(agentId);
    } else {
      reputationManager.printLeaderboard();
    }
  });

// 子命令：奏折回放
program
  .command('replay [index]')
  .description('回放历史会话 / 生成周报')
  .option('--weekly', '生成本周周报')
  .option('--diff <n1> <n2>', '对比两次会话')
  .action((index, options) => {
    const { sessionRecorder } = require('../src/features/time-travel');
    if (options.weekly) {
      sessionRecorder.generateWeeklyReport();
    } else if (index) {
      sessionRecorder.printReplay(parseInt(index));
    } else {
      sessionRecorder.printSessionList();
    }
  });

// 子命令：大理寺验尸报告
program
  .command('autopsy [index]')
  .description('故障分析 — 大理寺验尸报告')
  .option('--all', '查看所有失败统计')
  .action((index, options) => {
    const { printAutopsy, printFailureStats } = require('../src/features/autopsy');
    if (options.all) {
      printFailureStats();
    } else if (index) {
      printAutopsy(parseInt(index));
    } else {
      printAutopsy();
    }
  });

// 子命令：记忆管理
program
  .command('memory')
  .description('记忆管理 — 太史局')
  .option('-a, --agent <id>', '查看指定 Agent 的记忆')
  .option('--court', '查看朝廷共享记忆')
  .option('--export', '导出全部记忆')
  .option('--import <path>', '导入记忆')
  .option('--wipe <agentId>', '清空某个 Agent 的记忆')
  .action((options) => {
    const { memoryStore } = require('../src/memory/store');

    if (options.agent) {
      const memories = memoryStore.recallAgentMemory(options.agent, { limit: 30 });
      const summary = memoryStore.getAgentMemorySummary(options.agent);
      console.log(chalk.bold(`\n${options.agent} 的记忆 (${summary.total} 条)：\n`));
      console.log(`  类型分布: ${JSON.stringify(summary.byType)}\n`);
      for (const m of memories) {
        console.log(`  [${m.type}] ${m.content}`);
        if (m.why) console.log(chalk.gray(`         原因: ${m.why}`));
      }
      console.log();
    } else if (options.court) {
      const memories = memoryStore.recallCourtMemory({ limit: 30 });
      console.log(chalk.bold(`\n朝廷共识 (${memories.length} 条)：\n`));
      for (const m of memories) {
        console.log(`  [${m.type}] ${m.content} (来源: ${m.source})`);
      }
      console.log();
    } else if (options.export) {
      const data = memoryStore.exportAllMemories();
      const outPath = 'tiangong-memories.json';
      require('fs').writeFileSync(outPath, JSON.stringify(data, null, 2));
      console.log(chalk.green(`记忆已导出: ${outPath}`));
    } else if (options.import) {
      const data = JSON.parse(require('fs').readFileSync(options.import, 'utf-8'));
      memoryStore.importMemories(data, { merge: true });
      console.log(chalk.green('记忆已导入'));
    } else if (options.wipe) {
      memoryStore.wipeAgentMemory(options.wipe);
      console.log(chalk.yellow(`已清空 ${options.wipe} 的记忆`));
    } else {
      console.log(chalk.bold('\n太史局 — 记忆管理\n'));
      console.log('  tiangong memory --agent bingbu     查看兵部的记忆');
      console.log('  tiangong memory --court             查看朝廷共识');
      console.log('  tiangong memory --export            导出全部记忆');
      console.log('  tiangong memory --import file.json  导入记忆');
      console.log('  tiangong memory --wipe bingbu       清空兵部记忆');
      console.log();
    }
  });

// 全局前置检查：除了 setup/court/regimes/--help/--version 外，未配置时自动触发登基
const NO_SETUP_COMMANDS = ['setup', 'court', 'regimes'];
const args = process.argv.slice(2);
const subCommand = args.find(a => !a.startsWith('-'));

if (needsSetup() && !NO_SETUP_COMMANDS.includes(subCommand) && !args.includes('--help') && !args.includes('-h') && !args.includes('--version') && !args.includes('-V')) {
  (async () => {
    await runSetup();
    // setup 完成后重新 parse
    program.parse();
  })();
} else {
  program.parse();
}
