/**
 * 交互式 REPL — 朝堂议事
 *
 * 支持命令：
 *   /court     显示朝廷架构
 *   /cost      户部报账
 *   /regime    查看/切换制度
 *   /memory    太史局记忆概况
 *   /history   查看最近旨意
 *   /clear     清屏
 *   /help      帮助
 *   /exit      退朝
 */

const readline = require('readline');
const chalk = require('chalk');
const { startSession } = require('./query-loop');
const { version } = require('../../package.json');

// ─── 美化 Banner ────────────────────────────────────────

function makeBanner(regimeId) {
  const regimeLabels = {
    ming: ['🏮', '明朝内阁制'],
    tang: ['🐉', '唐朝三省制'],
    modern: ['🏢', '现代企业制']
  };
  const [icon, label] = regimeLabels[regimeId] || regimeLabels.ming;

  // 随机古文慧根
  let wisdomLine = '';
  try {
    const { getRandomWisdom } = require('../zhongshu/wisdom');
    const w = getRandomWisdom();
    wisdomLine = chalk.italic.gray(`  「${w.text}」—— ${w.source}`);
  } catch { /* ignore */ }

  return `
${chalk.yellow('  ╔══════════════════════════════════════════════════════╗')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.bold.yellow('天 工 开 物')} ${chalk.gray('v' + version)}                                ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${icon} ${chalk.white(label)}                                      ${chalk.yellow('║')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/court  朝廷架构    /cost   户部账目')}           ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/regime 制度切换    /viking 记忆文件系统')}       ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/clear  清屏        /help   帮助')}               ${chalk.yellow('║')}
${chalk.yellow('  ║')}   ${chalk.gray('/history 历史旨意   /exit   退朝')}               ${chalk.yellow('║')}
${chalk.yellow('  ║')}                                                      ${chalk.yellow('║')}
${chalk.yellow('  ╚══════════════════════════════════════════════════════╝')}
${wisdomLine ? '\n' + wisdomLine + '\n' : ''}`;
}

/**
 * 启动交互式 REPL
 */
async function startRepl(options) {
  let currentRegime = options.regime || 'ming';
  const history = []; // 旨意历史
  let sessionCosts = { totalUsd: 0, inputTokens: 0, outputTokens: 0, sessions: 0 };
  let isProcessing = false; // 防止并发

  console.log(makeBanner(currentRegime));

  const promptIcons = { ming: '👑', tang: '🐉', modern: '💼' };
  const promptNames = { ming: '天子', tang: '天子', modern: 'CEO' };

  function getPrompt() {
    const icon = promptIcons[currentRegime] || '👑';
    const name = promptNames[currentRegime] || '天子';
    return chalk.yellow(`  ${name} ${icon} > `);
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(),
    historySize: 100
  });

  rl.prompt();

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // 防止重复提交
    if (isProcessing) {
      console.log(chalk.gray('  （上一道旨意正在执行中，请稍候）'));
      return;
    }

    // ── 内置命令 ──

    if (input === '/exit' || input === '/退朝' || input === '/quit') {
      console.log();
      console.log(chalk.yellow('  ┌──────────────────────────────────────┐'));
      console.log(chalk.yellow('  │') + chalk.white('  退朝。天下太平。百官跪安。            ') + chalk.yellow('│'));
      if (sessionCosts.sessions > 0) {
        const costStr = `$${sessionCosts.totalUsd.toFixed(4)}`;
        console.log(chalk.yellow('  │') + chalk.gray(`  本朝会 ${sessionCosts.sessions} 道旨意，花费 ${costStr}`.padEnd(38)) + chalk.yellow('│'));
      }
      console.log(chalk.yellow('  └──────────────────────────────────────┘'));
      console.log();
      rl.close();
      return;
    }

    if (input === '/clear' || input === '/清屏') {
      process.stdout.write('\x1B[2J\x1B[0f');
      console.log(makeBanner(currentRegime));
      rl.prompt();
      return;
    }

    if (input === '/cost' || input === '/账目') {
      printCostReport(sessionCosts);
      rl.prompt();
      return;
    }

    if (input === '/court' || input === '/朝廷') {
      const { getRegime } = require('../config/regimes');
      const regime = getRegime(currentRegime);
      console.log();
      console.log(chalk.bold(`  ${regime.name}`));
      console.log(regime.diagram);

      // 分层展示
      const layers = { planning: '决策层', review: '审核层', execution: '执行层' };
      for (const [layerId, layerName] of Object.entries(layers)) {
        const agents = regime.agents.filter(a => a.layer === layerId);
        if (agents.length > 0) {
          console.log(chalk.bold(`  ${layerName}：`));
          for (const agent of agents) {
            console.log(`    ${agent.emoji} ${chalk.cyan(agent.name.padEnd(8))} (${chalk.gray(agent.id)}) — ${agent.role}`);
          }
          console.log();
        }
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/regime') || input.startsWith('/制度')) {
      const parts = input.split(/\s+/);
      if (parts.length >= 2 && ['ming', 'tang', 'modern'].includes(parts[1])) {
        // 切换制度
        const oldRegime = currentRegime;
        currentRegime = parts[1];
        options.regime = currentRegime;
        const names = { ming: '🏮 明朝内阁制', tang: '🐉 唐朝三省制', modern: '🏢 现代企业制' };
        console.log(chalk.green(`\n  制度已切换: ${names[oldRegime]} → ${chalk.bold(names[currentRegime])}\n`));
        rl.setPrompt(getPrompt());
      } else {
        // 列出可用制度
        const { listRegimes } = require('../config/regimes');
        console.log(chalk.bold('\n  可用制度：\n'));
        for (const r of listRegimes()) {
          const active = r.id === currentRegime ? chalk.green(' ← 当前') : '';
          console.log(`    ${chalk.cyan(r.id.padEnd(10))} ${r.name} — ${r.description}${active}`);
        }
        console.log(chalk.gray('\n  切换示例: /regime tang\n'));
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/viking') || input.startsWith('/记忆文件')) {
      const { vikingStore } = require('../memory/viking-store');
      const args = input.replace(/^\/(viking|记忆文件)\s*/, '').trim();

      if (args.startsWith('ls')) {
        const uri = args.replace('ls', '').trim() || 'viking://';
        const items = vikingStore.ls(uri);
        console.log(chalk.bold(`\n  📂 ${uri}\n`));
        if (items.length === 0) {
          console.log(chalk.gray('  (空)'));
        } else {
          for (const item of items) {
            const icon = item.type === 'directory' ? '📁' : '📄';
            console.log(`    ${icon} ${chalk.cyan(item.name || item.uri)} — ${chalk.gray(item.l0 || '')}`);
          }
        }
        console.log();
      } else if (args.startsWith('find ')) {
        const query = args.replace('find ', '').trim();
        const results = vikingStore.find(query);
        console.log(chalk.bold(`\n  🔍 搜索: "${query}"\n`));
        if (results.length === 0) {
          console.log(chalk.gray('  (无匹配)'));
        } else {
          for (const r of results) {
            console.log(`    ${chalk.cyan(r.uri)} ${chalk.gray(`(${r.relevanceScore}分)`)}`);
            console.log(`      ${chalk.white(r.l0)}`);
          }
        }
        console.log();
      } else if (args.startsWith('read ')) {
        const uri = args.replace('read ', '').trim();
        const entry = vikingStore.read(uri);
        if (entry) {
          console.log(chalk.bold(`\n  📄 ${uri}\n`));
          console.log(chalk.gray(`  L0: ${entry.l0}`));
          console.log(chalk.gray(`  L1: ${(entry.l1 || '').slice(0, 200)}`));
          console.log(chalk.white(`  L2: ${(entry.l2 || '').slice(0, 500)}`));
        } else {
          console.log(chalk.red(`\n  找不到: ${uri}\n`));
        }
      } else if (args === 'stats') {
        const stats = vikingStore.getStats();
        console.log(chalk.bold('\n  📊 Viking 存储统计\n'));
        console.log(`  总条目: ${chalk.cyan(stats.total)}`);
        console.log(`  资源: ${stats.byRoot.resources}  用户: ${stats.byRoot.user}  Agent: ${stats.byRoot.agent}`);
        if (Object.keys(stats.byType).length > 0) {
          console.log(`  类型: ${Object.entries(stats.byType).map(([k,v]) => `${k}(${v})`).join(' ')}`);
        }
        console.log();
      } else if (args.startsWith('index')) {
        console.log(chalk.yellow('\n  正在索引当前项目到 Viking 文件系统...\n'));
        vikingStore.indexProject(process.cwd());
        console.log(chalk.green('  ✓ 索引完成\n'));
      } else {
        console.log(chalk.bold('\n  📂 Viking 上下文文件系统（OpenViking 架构）\n'));
        console.log(chalk.gray('  viking://resources/  项目资源'));
        console.log(chalk.gray('  viking://user/       用户偏好'));
        console.log(chalk.gray('  viking://agent/      Agent 经验\n'));
        console.log(chalk.gray('  命令:'));
        console.log(chalk.gray('    /viking ls [uri]       列出目录'));
        console.log(chalk.gray('    /viking find <关键词>  搜索'));
        console.log(chalk.gray('    /viking read <uri>     读取条目'));
        console.log(chalk.gray('    /viking stats          存储统计'));
        console.log(chalk.gray('    /viking index          索引当前项目'));
        console.log();
      }
      rl.prompt();
      return;
    }

    if (input === '/memory' || input === '/记忆') {
      const { memoryStore } = require('../memory/store');
      const data = memoryStore.exportAllMemories();
      const agentCount = Object.keys(data.agents).length;
      const totalMem = Object.values(data.agents).reduce((s, a) => s + a.length, 0) + data.court.length;
      console.log();
      console.log(chalk.bold(`  📜 太史局 — 记忆总览`));
      console.log(chalk.gray(`  ─────────────────────────────`));
      console.log(`  ${chalk.white('大臣数:')} ${chalk.cyan(agentCount)}   ${chalk.white('记忆总条数:')} ${chalk.cyan(totalMem)}`);
      console.log();
      for (const [id, mems] of Object.entries(data.agents)) {
        if (mems.length > 0) {
          const bar = '█'.repeat(Math.min(mems.length, 20)) + '░'.repeat(Math.max(0, 20 - mems.length));
          console.log(`    ${chalk.cyan(id.padEnd(16))} ${chalk.green(bar)} ${mems.length} 条`);
        }
      }
      if (data.court.length > 0) {
        console.log(`    ${chalk.yellow('朝廷共识'.padEnd(14))} ${'█'.repeat(Math.min(data.court.length, 20))} ${data.court.length} 条`);
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/history' || input === '/历史') {
      if (history.length === 0) {
        console.log(chalk.gray('\n  （本朝会暂无旨意记录）\n'));
      } else {
        console.log(chalk.bold('\n  📋 旨意记录：\n'));
        const recent = history.slice(-10);
        for (let i = 0; i < recent.length; i++) {
          const h = recent[i];
          const status = h.success ? chalk.green('✓') : chalk.red('✗');
          const time = new Date(h.time).toLocaleTimeString();
          console.log(`    ${status} ${chalk.gray(time)} ${chalk.white(h.prompt.slice(0, 60))}`);
        }
        console.log();
      }
      rl.prompt();
      return;
    }

    // ── 创新功能命令 ──

    if (input.startsWith('/pk') || input.startsWith('/武举')) {
      const { runPK } = require('../features/pk-arena');
      const args = input.replace(/^\/(pk|武举)\s*/, '').trim();
      const parts = args.split(/\s+/);

      let judgeId = null;
      let contestants = [];
      let pkPrompt = '';

      // 解析参数
      let i = 0;
      if (parts[i] === '--judge' && parts[i + 1]) {
        judgeId = parts[i + 1];
        i += 2;
      }

      // 收集 contestant IDs（非引号包裹的参数）
      while (i < parts.length && !parts[i].startsWith('"') && !parts[i].startsWith("'")) {
        contestants.push(parts[i]);
        i++;
      }

      pkPrompt = parts.slice(i).join(' ').replace(/^["']|["']$/g, '');

      if (contestants.length < 2 || !pkPrompt) {
        console.log(chalk.yellow('\n  用法: /pk [--judge 主考官] <Agent1> <Agent2> "题目"'));
        console.log(chalk.gray('  示例: /pk bingbu gongbu "写一个快速排序"'));
        console.log(chalk.gray('  示例: /pk --judge duchayuan bingbu gongbu "实现 HTTP 服务器"\n'));
        rl.prompt();
        return;
      }

      isProcessing = true;
      try {
        await runPK({ prompt: pkPrompt, contestants, judgeId, regimeId: currentRegime });
      } catch (err) {
        console.error(chalk.red(`\n  PK 执行失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/debate') || input.startsWith('/廷议')) {
      const { runDebate } = require('../features/court-debate');
      const args = input.replace(/^\/(debate|廷议)\s*/, '').trim();

      let rounds = 2;
      let topic = args;

      // 解析 --rounds
      const roundsMatch = args.match(/--rounds?\s+(\d+)/);
      if (roundsMatch) {
        rounds = parseInt(roundsMatch[1]);
        topic = args.replace(/--rounds?\s+\d+/, '').trim();
      }

      if (!topic) {
        console.log(chalk.yellow('\n  用法: /debate [--rounds N] "议题"'));
        console.log(chalk.gray('  示例: /debate "我们应该用 PostgreSQL 还是 MongoDB？"'));
        console.log(chalk.gray('  示例: /debate --rounds 3 "微服务 vs 单体架构"\n'));
        rl.prompt();
        return;
      }

      isProcessing = true;
      try {
        await runDebate({ topic, rounds, regimeId: currentRegime });
      } catch (err) {
        console.error(chalk.red(`\n  廷议失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/rank') || input.startsWith('/功勋')) {
      const { reputationManager } = require('../features/reputation');
      const args = input.replace(/^\/(rank|功勋)\s*/, '').trim();

      if (args) {
        reputationManager.printAgentDetail(args);
      } else {
        reputationManager.printLeaderboard();
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/replay') || input.startsWith('/回放')) {
      const { sessionRecorder } = require('../features/time-travel');
      const args = input.replace(/^\/(replay|回放)\s*/, '').trim();

      if (args === '--weekly' || args === '周报') {
        sessionRecorder.generateWeeklyReport();
      } else if (args) {
        const index = parseInt(args);
        if (!isNaN(index)) {
          sessionRecorder.printReplay(index);
        } else {
          console.log(chalk.yellow('\n  用法: /replay [序号] | --weekly\n'));
        }
      } else {
        sessionRecorder.printSessionList();
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/dream') || input.startsWith('/梦境')) {
      const { runDreamEngine } = require('../features/dream-engine');
      const args = input.replace(/^\/(dream|梦境)\s*/, '').trim();
      const deep = args.includes('--deep');

      isProcessing = true;
      try {
        const premonitions = await runDreamEngine({ cwd: process.cwd(), deep });
        // 处理 --act
        const actMatch = args.match(/--act\s+(\d+)/);
        if (actMatch && premonitions.length > 0) {
          const actIndex = parseInt(actMatch[1]) - 1;
          if (actIndex >= 0 && actIndex < premonitions.length) {
            const p = premonitions[actIndex];
            console.log(chalk.green(`  执行预感 #${actIndex + 1}: ${p.actionable || p.title}`));
            await startSession(p.actionable || p.title, { ...options, regime: currentRegime });
          }
        }
      } catch (err) {
        console.error(chalk.red(`\n  梦境引擎失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/collab') || input.startsWith('/协同')) {
      const { runCollaborativeCoding } = require('../features/collaborative-coding');
      const args = input.replace(/^\/(collab|协同)\s*/, '').trim();

      if (!args) {
        console.log(chalk.yellow('\n  用法: /collab "任务描述"'));
        console.log(chalk.gray('  示例: /collab "写一个用户认证模块"'));
        console.log(chalk.gray('  六部同时协作：架构设计 + 编码 + 安全审计 + 测试 + Code Review\n'));
        rl.prompt();
        return;
      }

      isProcessing = true;
      try {
        await runCollaborativeCoding({ task: args.replace(/^["']|["']$/g, ''), regimeId: currentRegime });
      } catch (err) {
        console.error(chalk.red(`\n  协同失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/oracle') || input.startsWith('/天书')) {
      const { analyzeAndFix } = require('../features/crash-oracle');
      let errorLog = input.replace(/^\/(oracle|天书)\s*/, '').trim();

      // 从文件读取
      const fileMatch = errorLog.match(/--file\s+(\S+)/);
      if (fileMatch) {
        const fs = require('fs');
        try {
          errorLog = fs.readFileSync(fileMatch[1], 'utf-8');
        } catch (err) {
          console.log(chalk.red(`\n  无法读取文件: ${err.message}\n`));
          rl.prompt();
          return;
        }
      }

      if (!errorLog) {
        console.log(chalk.yellow('\n  用法: /oracle <粘贴错误日志>'));
        console.log(chalk.gray('  示例: /oracle TypeError: Cannot read properties of undefined'));
        console.log(chalk.gray('  示例: /oracle --file crash.log'));
        console.log(chalk.gray('  天书会自动分析根因并生成修复代码\n'));
        rl.prompt();
        return;
      }

      const autoApply = errorLog.includes('--apply');
      errorLog = errorLog.replace('--apply', '').trim();

      isProcessing = true;
      try {
        await analyzeAndFix({ errorLog, autoApply, cwd: process.cwd() });
      } catch (err) {
        console.error(chalk.red(`\n  天书分析失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/evolve-self') || input.startsWith('/自进化')) {
      const { analyzeEvolutionOpportunities, evolvePrompt, evolveMemory, printEvolutionHistory } = require('../features/self-evolution');
      const args = input.replace(/^\/(evolve-self|自进化)\s*/, '').trim();

      isProcessing = true;
      try {
        if (args === '--history' || args === '历史') {
          printEvolutionHistory();
        } else if (args === '--memory' || args === '记忆') {
          evolveMemory();
        } else if (args.startsWith('--prompt')) {
          const agentId = args.replace('--prompt', '').trim();
          if (agentId) {
            await evolvePrompt(agentId);
          } else {
            console.log(chalk.yellow('\n  用法: /evolve-self --prompt <AgentId>\n'));
          }
        } else {
          await analyzeEvolutionOpportunities();
        }
      } catch (err) {
        console.error(chalk.red(`\n  自进化失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/evolve') || input.startsWith('/更迭')) {
      const { analyzeAndRecommend } = require('../features/regime-evolution');
      const result = analyzeAndRecommend({ currentRegime, cwd: process.cwd() });

      // --auto 自动切换
      if (input.includes('--auto') && result.shouldSwitch) {
        const oldRegime = currentRegime;
        currentRegime = result.recommended;
        options.regime = currentRegime;
        rl.setPrompt(getPrompt());
        console.log(chalk.green.bold(`  ⚡ 已自动更迭为 ${currentRegime}`));
      }

      rl.prompt();
      return;
    }

    if (input.startsWith('/exam') || input.startsWith('/科举')) {
      const { runExam } = require('../features/imperial-exam');
      const args = input.replace(/^\/(exam|科举)\s*/, '').trim();
      const parts = args.split(/\s+/);

      let agentId = parts[0];
      let subject = null;
      const subjectMatch = args.match(/--subject\s+(\S+)/);
      if (subjectMatch) {
        subject = subjectMatch[1];
        agentId = args.replace(/--subject\s+\S+/, '').trim().split(/\s+/)[0];
      }

      if (!agentId) {
        console.log(chalk.yellow('\n  用法: /exam <AgentId> [--subject 科目]'));
        console.log(chalk.gray('  示例: /exam bingbu'));
        console.log(chalk.gray('  示例: /exam bingbu --subject 算术'));
        console.log(chalk.gray('  科目: 明经 / 明法 / 策论 / 诗赋 / 算术\n'));
        rl.prompt();
        return;
      }

      isProcessing = true;
      try {
        await runExam({ agentId, subject, regimeId: currentRegime });
      } catch (err) {
        console.error(chalk.red(`\n  科举失败: ${err.message}\n`));
      }
      isProcessing = false;
      rl.prompt();
      return;
    }

    if (input.startsWith('/autopsy') || input.startsWith('/验尸')) {
      const { printAutopsy, printFailureStats } = require('../features/autopsy');
      const args = input.replace(/^\/(autopsy|验尸)\s*/, '').trim();

      if (args === '--all') {
        printFailureStats();
      } else if (args) {
        printAutopsy(parseInt(args));
      } else {
        printAutopsy();
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/treasure') || input.startsWith('/寻宝')) {
      const { treasureManager } = require('../features/treasure-hunt');
      const args = input.replace(/^\/(treasure|寻宝)\s*/, '').trim();

      if (args === 'hunt' || args === '探索') {
        treasureManager.hunt();
      } else if (args === 'riddle' || args === '谜语') {
        treasureManager.getRiddle();
      } else if (args.startsWith('answer ')) {
        treasureManager.answerRiddle(args.replace('answer ', ''));
      } else if (args === 'share' || args === '分享') {
        treasureManager.share();
      } else if (args === 'star') {
        treasureManager.markStarred();
      } else if (args.startsWith('redeem ')) {
        treasureManager.redeem(args.replace('redeem ', '').trim());
      } else {
        treasureManager.printCollection();
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/personality') || input.startsWith('/性格')) {
      const { personalityManager } = require('../features/agent-personality');
      const args = input.replace(/^\/(personality|性格)\s*/, '').trim();
      const parts = args.split(/\s+/);

      if (parts[0] === 'chemistry' && parts[1] && parts[2]) {
        personalityManager.printChemistry(parts[1], parts[2]);
      } else if (parts[0] === 'random') {
        // 清除数据重新随机
        console.log(chalk.yellow('\n  已重新随机分配所有大臣性格\n'));
        // 清空已有性格数据，下次访问时重新随机分配
        const fs = require('fs');
        const pPath = require('path').join(process.env.HOME || '/tmp', '.tiangong', 'personality', 'agents.json');
        try { fs.unlinkSync(pPath); } catch { /* ignore */ }
        // 重新加载
        const { PersonalityManager } = require('../features/agent-personality');
        const freshPM = new PersonalityManager();
        freshPM.printAll(currentRegime);
      } else if (parts[1] === 'set' && parts[2] && parts[3]) {
        try {
          personalityManager.setPersonality(parts[0], parts[2], parts[3]);
          console.log(chalk.green(`\n  ✓ 已设置 ${parts[0]} 的性格: ${parts[2]} ${parts[3]}\n`));
        } catch (err) {
          console.log(chalk.red(`\n  设置失败: ${err.message}\n`));
        }
      } else if (parts[0] && parts[0] !== '') {
        personalityManager.printDetail(parts[0]);
      } else {
        personalityManager.printAll(currentRegime);
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/help') || input === '/帮助') {
      console.log(`
  ${chalk.bold.yellow('朝堂指令：')}

  ${chalk.gray('── 基础 ──')}
    ${chalk.cyan('/court')}          显示朝廷架构 + 百官名册
    ${chalk.cyan('/regime [id]')}    查看/切换制度 (ming/tang/modern)
    ${chalk.cyan('/memory')}         太史局记忆概况
    ${chalk.cyan('/viking')}         📂 Viking 上下文文件系统 (OpenViking)
    ${chalk.cyan('/cost')}           户部报账
    ${chalk.cyan('/history')}        旨意历史

  ${chalk.gray('── 独创功能 (Claude Code 没有的) ──')}
    ${chalk.cyan('/dream')}          🔮 朝堂梦境 — AI 预判你下一步需要什么
    ${chalk.cyan('/collab')}         📋 六部联名 — 多 Agent 协同编码
    ${chalk.cyan('/oracle')}         📜 天书降世 — 粘贴错误日志自动修复
    ${chalk.cyan('/pk')}             ⚔️  武举殿试 — Agent 对决擂台
    ${chalk.cyan('/debate')}         📣 廷议 — 多 Agent 朝堂辩论
    ${chalk.cyan('/exam')}           📝 科举考试 — Agent 能力基准测试
    ${chalk.cyan('/rank')}           🏆 功勋榜 — Agent 经验值 + 品阶
    ${chalk.cyan('/evolve-self')}     🧬 自进化 — Agent 自我改进系统
    ${chalk.cyan('/evolve')}         👑 朝代更迭 — 智能制度自适应推荐
    ${chalk.cyan('/replay')}         📜 奏折回放 — 会话时间旅行
    ${chalk.cyan('/autopsy')}        🔍 大理寺 — 故障验尸报告
    ${chalk.cyan('/replay --weekly')} 📊 自动生成周报

  ${chalk.gray('── 社交 & 趣味 ──')}
    ${chalk.cyan('/treasure')}       🗺️  寻宝奇缘 — 提示词寻宝游戏
    ${chalk.cyan('/personality')}    🧬 性格档案 — MBTI × 星座 × 合拍度

  ${chalk.gray('── 系统 ──')}
    ${chalk.cyan('/clear')}          清屏
    ${chalk.cyan('/help')}           帮助
    ${chalk.cyan('/exit')}           退朝
      `);
      rl.prompt();
      return;
    }

    // ── 执行旨意 ──

    isProcessing = true;
    const startTime = Date.now();

    try {
      console.log();
      await startSession(input, { ...options, regime: currentRegime, _onCost: (cost) => {
        sessionCosts.totalUsd += cost.total.totalCostUsd;
        sessionCosts.inputTokens += cost.total.inputTokens;
        sessionCosts.outputTokens += cost.total.outputTokens;
        sessionCosts.sessions++;
      }});

      history.push({ prompt: input, success: true, time: Date.now(), duration: Date.now() - startTime });
    } catch (err) {
      console.error(chalk.red(`\n  出错: ${err.message}\n`));
      history.push({ prompt: input, success: false, time: Date.now(), error: err.message });
    }

    isProcessing = false;
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

/**
 * 打印户部账目
 */
function printCostReport(costs) {
  console.log();
  console.log(chalk.bold('  💰 户部账目 — 本朝会花费汇总'));
  console.log(chalk.gray('  ─────────────────────────────────'));

  if (costs.sessions === 0) {
    console.log(chalk.gray('  （尚无花费记录）'));
  } else {
    console.log(`  ${chalk.white('旨意数:')}       ${chalk.cyan(costs.sessions)}`);
    console.log(`  ${chalk.white('输入 Token:')}   ${chalk.cyan(costs.inputTokens.toLocaleString())}`);
    console.log(`  ${chalk.white('输出 Token:')}   ${chalk.cyan(costs.outputTokens.toLocaleString())}`);
    console.log(`  ${chalk.white('总花费:')}       ${chalk.yellow('$' + costs.totalUsd.toFixed(4))}`);

    // 预算可视化
    const budgetMax = 5.0;
    const used = Math.min(costs.totalUsd / budgetMax, 1);
    const barLen = 25;
    const filled = Math.round(barLen * used);
    const barColor = used < 0.5 ? chalk.green : used < 0.8 ? chalk.yellow : chalk.red;
    const bar = barColor('█'.repeat(filled)) + chalk.gray('░'.repeat(barLen - filled));
    console.log(`  ${chalk.white('预算:')}         ${bar} ${Math.round(used * 100)}%`);
  }
  console.log();
}

module.exports = { startRepl };
