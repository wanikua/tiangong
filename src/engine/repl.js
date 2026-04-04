/**
 * 交互式 REPL — 朝堂议事
 *
 * 支持命令：
 *   /court     显示朝廷架构
 *   /cost      户部报账
 *   /regime    查看/切换制度
 *   /memory    太史局记忆概况
 *   /history   查看最近旨意
 *   /edit      打开编辑器（多行/长文本）
 *   /clear     清屏
 *   /help      帮助
 *   /exit      退朝
 */

const readline = require('readline');
const chalk = require('chalk');
const { startSession } = require('./query-loop');
const { version } = require('../../package.json');

// ─── 美化 Banner ────────────────────────────────────────

/**
 * 计算字符串的终端显示宽度（CJK/emoji = 2列，其他 = 1列）
 */
function displayWidth(str) {
  // 先去掉 ANSI escape codes
  const clean = str.replace(/\x1b\[[0-9;]*m/g, '');
  let w = 0;
  for (const ch of clean) {
    const code = ch.codePointAt(0);
    if (
      (code >= 0x1100 && code <= 0x115f) ||
      (code >= 0x2e80 && code <= 0x9fff) ||
      (code >= 0xac00 && code <= 0xd7af) ||
      (code >= 0xf900 && code <= 0xfaff) ||
      (code >= 0xfe30 && code <= 0xfe6f) ||
      (code >= 0xff01 && code <= 0xff60) ||
      (code >= 0x1f000 && code <= 0x1ffff) ||
      (code >= 0x20000 && code <= 0x2ffff)
    ) {
      w += 2;
    } else {
      w += 1;
    }
  }
  return w;
}

/** 生成 Banner 行：内容 + 右填充到固定宽度 + 右边框 */
function bannerLine(content, innerWidth) {
  const pad = Math.max(0, innerWidth - displayWidth(content));
  return chalk.yellow('  ║') + content + ' '.repeat(pad) + chalk.yellow('║');
}

function makeBanner(regimeId) {
  const regimeLabels = {
    ming: ['🏮', '明朝内阁制'],
    tang: ['🐉', '唐朝三省制'],
    modern: ['🏢', '现代企业制']
  };
  const [icon, label] = regimeLabels[regimeId] || regimeLabels.ming;

  // 时辰问候
  const hour = new Date().getHours();
  let timeGreeting = '';
  if (regimeId === 'modern') {
    if (hour < 6) timeGreeting = '🌙 Late night session';
    else if (hour < 12) timeGreeting = '☀️ Good morning';
    else if (hour < 18) timeGreeting = '🌤️ Good afternoon';
    else timeGreeting = '🌙 Evening session';
  } else {
    if (hour < 6) timeGreeting = '🌙 夜深了，陛下还在批奏折';
    else if (hour < 8) timeGreeting = '🌅 卯时早朝，百官觐见';
    else if (hour < 12) timeGreeting = '☀️ 日出东方，万象更新';
    else if (hour < 14) timeGreeting = '🍵 午时已到，陛下先用膳';
    else if (hour < 18) timeGreeting = '📜 午后朝议，处理奏折';
    else if (hour < 22) timeGreeting = '🏮 华灯初上，挑灯夜战';
    else timeGreeting = '🌙 子时了，陛下保重龙体';
  }

  // 随机古文慧根
  let wisdomLine = '';
  try {
    const { getRandomWisdom } = require('../zhongshu/wisdom');
    const w = getRandomWisdom();
    wisdomLine = chalk.italic.gray(`  「${w.text}」—— ${w.source}`);
  } catch { /* ignore */ }

  const W = 54; // 框内宽度（与 ═ 数量一致）
  const border = '═'.repeat(W);

  return `
${chalk.yellow('  ╔' + border + '╗')}
${bannerLine('', W)}
${bannerLine('   ' + chalk.bold.yellow('天 工 开 物') + ' ' + chalk.gray('v' + version) + '    ' + chalk.gray('by 菠萝菠菠'), W)}
${bannerLine('   ' + icon + ' ' + chalk.white(label), W)}
${bannerLine('', W)}
${bannerLine('   ' + chalk.gray('/court  朝廷架构    /cost   户部账目'), W)}
${bannerLine('   ' + chalk.gray('/regime 制度切换    /model  模型切换'), W)}
${bannerLine('   ' + chalk.gray('/viking 记忆文件    /clear  清屏'), W)}
${bannerLine('   ' + chalk.gray('/edit 编辑器   /history 历史   /help 帮助  /exit 退朝'), W)}
${bannerLine('', W)}
${chalk.yellow('  ╚' + border + '╝')}
${wisdomLine ? '\n' + wisdomLine : ''}
${chalk.gray('  ' + timeGreeting)}
`;
}

/**
 * 启动交互式 REPL
 */
async function startRepl(options) {
  let currentRegime = options.regime || 'ming';
  const history = []; // 旨意历史
  let sessionCosts = { inputTokens: 0, outputTokens: 0, sessions: 0 };
  let isProcessing = false; // 防止并发
  let isFirstSession = history.length === 0; // 新手标记
  let sessionMessages = []; // 对话连续性：跨轮次保持 messages

  console.log(makeBanner(currentRegime));

  // ── UncommonRoute 状态检测 ──
  try {
    const { probeUncommonRoute } = require('../shangshu/li/api-client');
    const hasUR = await probeUncommonRoute();
    if (hasUR) {
      // 检查用户的 baseUrl 是否指向 UncommonRoute
      const config = require('../config/setup').loadConfig() || {};
      const baseUrl = config.baseUrl || '';
      const isRouted = baseUrl.includes('localhost:8403') || baseUrl.includes('127.0.0.1:8403');

      if (isRouted) {
        console.log(chalk.green('  UncommonRoute 已启用 — 按 prompt 难度自动选模型'));
      } else {
        console.log(chalk.gray('  检测到 UncommonRoute (localhost:8403)，但未启用'));
        console.log(chalk.gray('     启用方式: tiangong setup 时 baseUrl 填 http://localhost:8403'));
        console.log(chalk.gray('     或设环境变量: ANTHROPIC_BASE_URL=http://localhost:8403'));
      }
      console.log();
    }
  } catch { /* ignore */ }

  // ── 新手引导（符合制度人设） ──
  if (isFirstSession) {
    if (currentRegime === 'modern') {
      console.log(chalk.gray('  Welcome! Try these:'));
      console.log(chalk.white('     Just type naturally: ') + chalk.cyan('"Build a login page"'));
      console.log(chalk.white('     Ask questions:       ') + chalk.cyan('"What is REST API?"'));
      console.log(chalk.gray('     /dream  — AI predicts what you need next'));
      console.log(chalk.gray('     /pk     — Pit agents against each other'));
      console.log(chalk.gray('     /help   — See all commands'));
    } else {
      console.log(chalk.gray('  司礼监提示陛下：'));
      console.log(chalk.white('     直接说话即可：') + chalk.cyan('"帮朕写一个登录页面"'));
      console.log(chalk.white('     问问题也行：  ') + chalk.cyan('"什么是 REST API？"'));
      console.log(chalk.gray('     /dream    — 朝堂梦境，AI 揣摩圣意'));
      console.log(chalk.gray('     /pk       — 武举殿试，Agent 对决'));
      console.log(chalk.gray('     /treasure — 寻宝奇缘，解锁隐藏能力'));
      console.log(chalk.gray('     /help     — 查看全部朝堂指令'));
    }
    console.log();
  }

  const promptIcons = { ming: '👑', tang: '🐉', modern: '💼' };
  const promptNames = { ming: '天子', tang: '天子', modern: 'CEO' };

  function getPrompt() {
    // 宝藏效果：龙袍合成后主题变化
    try {
      const { treasureManager } = require('../features/treasure-hunt');
      const theme = treasureManager.getThemeOverrides();
      if (theme) {
        const colorFn = chalk[theme.color] || chalk.yellow;
        return colorFn(`  ${theme.name} ${theme.icon} > `);
      }
    } catch { /* ignore */ }

    const icon = promptIcons[currentRegime] || '👑';
    const name = promptNames[currentRegime] || '天子';
    return chalk.yellow(`  ${name} ${icon} > `);
  }

  // ── 候选列表提示 ──────────────────────────
  let suggestLineCount = 0; // 当前显示了多少行候选

  /**
   * 清除候选列表（光标从输入行往下擦）
   */
  function clearSuggestions() {
    if (suggestLineCount > 0) {
      process.stdout.write('\x1b[s'); // 保存光标
      for (let i = 0; i < suggestLineCount; i++) {
        process.stdout.write('\x1b[1B\x1b[2K'); // 下移一行 + 清行
      }
      process.stdout.write('\x1b[u'); // 恢复光标
      suggestLineCount = 0;
    }
  }

  /**
   * 在输入行下方绘制候选列表
   */
  function drawSuggestions(hits) {
    clearSuggestions();
    if (hits.length === 0) return;

    process.stdout.write('\x1b[s'); // 保存光标
    for (const h of hits) {
      const cmdStr = h.cmd.padEnd(22);
      process.stdout.write('\n\x1b[2K \x1b[36m' + cmdStr + '\x1b[90m' + h.desc + '\x1b[0m');
    }
    process.stdout.write('\x1b[u'); // 恢复光标
    suggestLineCount = hits.length;
  }

  /**
   * 获取匹配的命令（带描述）
   */
  function getHits(line) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith('/') || trimmed.length < 2) return [];
    const parts = trimmed.split(/\s+/);
    if (parts.length !== 1) return [];

    const prefix = parts[0];
    return commandDefs.filter(d => d.cmd.startsWith(prefix) && d.cmd !== prefix);
  }

  // ── 命令列表（Tab 补全 + 候选提示共用） ──
  const commandDefs = [
    { cmd: '/court', desc: '显示朝廷架构 + 百官名册' },
    { cmd: '/cost', desc: '户部报账' },
    { cmd: '/regime', desc: '查看/切换制度 (ming/tang/modern)' },
    { cmd: '/model', desc: '模型切换' },
    { cmd: '/provider', desc: '切换 AI 提供商' },
    { cmd: '/memory', desc: '太史局记忆概况' },
    { cmd: '/viking', desc: 'Viking 上下文文件系统' },
    { cmd: '/history', desc: '旨意历史' },
    { cmd: '/edit', desc: '打开编辑器 — 多行/长文本编辑' },
    { cmd: '/clear', desc: '清屏' },
    { cmd: '/help', desc: '帮助' },
    { cmd: '/exit', desc: '退朝' },
    { cmd: '/dream', desc: '朝堂梦境 — AI 预判下一步' },
    { cmd: '/collab', desc: '六部联名 — 多 Agent 协同编码' },
    { cmd: '/oracle', desc: '天书降世 — 粘贴错误日志自动修复' },
    { cmd: '/pk', desc: '武举殿试 — Agent 对决擂台' },
    { cmd: '/debate', desc: '廷议 — 多 Agent 朝堂辩论' },
    { cmd: '/exam', desc: '科举考试 — Agent 能力基准测试' },
    { cmd: '/rank', desc: '功勋榜 — Agent 经验值 + 品阶' },
    { cmd: '/auto-optimize', desc: '自动 Prompt 优化' },
    { cmd: '/evolve-self', desc: '自进化 — Agent 自我改进系统' },
    { cmd: '/evolve', desc: '朝代更迭 — 智能制度自适应推荐' },
    { cmd: '/replay', desc: '奏折回放 — 会话时间旅行' },
    { cmd: '/autopsy', desc: '大理寺 — 故障验尸报告' },
    { cmd: '/treasure', desc: '寻宝奇缘 — 提示词寻宝游戏' },
    { cmd: '/personality', desc: '性格档案 — MBTI × 星座 × 合拍度' },
  ];
  const commands = commandDefs.map(d => d.cmd);

  // ── Tab 命令补全 ──
  function completer(line) {
    // commands 使用上方共享数组

    const trimmed = line.trimStart();
    if (!trimmed.startsWith('/')) return [[], line];

    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];

    // 还在输入命令名
    if (parts.length === 1) {
      const hits = commands.filter(c => c.startsWith(cmd));
      if (hits.length === 1) return [hits, cmd]; // 唯一匹配：让 readline 补全
      return [[], cmd]; // 多个匹配或无匹配：让自绘列表处理
    }

    // 补全参数
    const lastWord = parts[parts.length - 1] || '';

    // Agent ID 补全
    if (['/pk', '/exam', '/personality', '/rank'].includes(cmd)) {
      try {
        const regime = require('../config/regimes').getRegime(currentRegime);
        const ids = regime.agents.map(a => a.id);
        if (cmd === '/pk' && lastWord.startsWith('-')) return [['--judge'], lastWord];
        return [ids.filter(id => id.startsWith(lastWord)), lastWord];
      } catch { return [[], lastWord]; }
    }

    if (cmd === '/regime') {
      return [['ming', 'tang', 'modern'].filter(r => r.startsWith(lastWord)), lastWord];
    }

    if (cmd === '/model') {
      try {
        const { getProvider } = require('../config/providers');
        const cfg = require('../config/index').loadConfig() || {};
        const provider = getProvider(options.provider || cfg.provider || 'anthropic');
        return [(provider?.models || []).filter(m => m.startsWith(lastWord)), lastWord];
      } catch { return [[], lastWord]; }
    }

    if (cmd === '/provider') {
      const ids = ['anthropic', 'openrouter', 'openai', 'deepseek', 'qwen', 'ollama', 'lmstudio', 'uncommonroute', 'custom'];
      return [ids.filter(p => p.startsWith(lastWord)), lastWord];
    }

    return [[], lastWord];
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: getPrompt(),
    historySize: 100,
    completer
  });

  rl.prompt();

  // ── 候选列表 + Ctrl+G ──
  readline.emitKeypressEvents(process.stdin);
  if (process.stdin.isTTY && !process.stdin.listenerCount('keypress')) {
    readline.emitKeypressEvents(process.stdin);
  }
  if (process.stdin.isTTY) {
    process.stdin.on('keypress', (ch, key) => {
      // Ctrl+G → 编辑器
      if (key && key.ctrl && key.name === 'g' && !isProcessing) {
        clearSuggestions();
        rl.write(null, { ctrl: true, name: 'u' });
        rl.emit('line', '/edit');
        return;
      }

      // Tab → 唯一匹配时自动补全
      if (key && key.name === 'tab') {
        const line = rl.line || '';
        const hits = getHits(line);
        if (hits.length === 1) {
          clearSuggestions();
          const suffix = hits[0].cmd.slice(line.trimStart().length);
          rl.write(suffix);
        }
        return;
      }

      // Enter → 清掉候选
      if (key && key.name === 'return') {
        clearSuggestions();
        return;
      }

      // 普通按键 → 更新候选列表
      setImmediate(() => {
        const line = rl.line || '';
        const hits = getHits(line);
        drawSuggestions(hits);
      });
    });
  }

  rl.on('line', async (line) => {
    const input = line.trim();
    if (!input) { rl.prompt(); return; }

    // 防止重复提交
    if (isProcessing) {
      console.log(chalk.gray('  （上一道旨意正在执行中，请稍候）'));
      return;
    }

    // ── 隐藏彩蛋 🍍 ──
    if (input === '菠萝菠菠' || input === 'boluo' || input === '🍍') {
      console.log();
      console.log(chalk.yellow('  🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍'));
      console.log();
      console.log(chalk.bold.yellow('     这是菠萝王朝皇帝'));
      console.log();
      console.log(chalk.white('     天工开物 — by 菠萝菠菠'));
      console.log(chalk.gray('     「代码如诗，架构如朝。」'));
      console.log(chalk.gray('     「一个人也可以建一座朝廷。」'));
      console.log();
      console.log(chalk.yellow('  🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍🍍'));
      console.log();
      rl.prompt();
      return;
    }

    if (input === '桃子桃桃' || input === '🍑') {
      console.log();
      console.log(chalk.magenta('  🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑'));
      console.log();
      console.log(chalk.bold.magenta('     菠萝王朝皇后，听说是个很漂亮的姑娘'));
      console.log();
      console.log(chalk.magenta('  🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑🍑'));
      console.log();
      rl.prompt();
      return;
    }

    if (input === '万岁' || input === '万岁万岁万万岁') {
      console.log();
      console.log(chalk.red('  ╔══════════════════════════════════════╗'));
      console.log(chalk.red('  ║') + chalk.bold.yellow('   🍍 菠萝王朝向友邦发来贺电！       ') + chalk.red('║'));
      console.log(chalk.red('  ║') + chalk.yellow('   吾皇万岁万岁万万岁！               ') + chalk.red('║'));
      console.log(chalk.red('  ║') + chalk.gray('   国泰民安，风调雨顺，千秋万代       ') + chalk.red('║'));
      console.log(chalk.red('  ╚══════════════════════════════════════╝'));
      console.log();
      rl.prompt();
      return;
    }

    // ── 内置命令 ──

    if (input === '/exit' || input === '/退朝' || input === '/quit') {
      console.log();
      const { displayWidth } = require('../utils/terminal');
      const W = 38;
      const exitLine = (content) => {
        const p = Math.max(0, W - displayWidth(content));
        return chalk.yellow('  │') + content + ' '.repeat(p) + chalk.yellow('│');
      };
      console.log(chalk.yellow('  ┌' + '─'.repeat(W) + '┐'));
      console.log(exitLine(chalk.white('  退朝。天下太平。百官跪安。')));
      if (sessionCosts.sessions > 0) {
        const totalTokens = (sessionCosts.inputTokens + sessionCosts.outputTokens).toLocaleString();
        console.log(exitLine(chalk.gray(`  本朝会 ${sessionCosts.sessions} 道旨意，${totalTokens} tokens`)));
      }
      console.log(chalk.yellow('  └' + '─'.repeat(W) + '┘'));
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

    if (input.startsWith('/model') || input.startsWith('/模型')) {
      const parts = input.split(/\s+/);
      if (parts.length >= 2) {
        const arg = parts[1];
        const { getProvider } = require('../config/providers');
        const config = require('../config/setup').loadConfig() || {};
        const providerId = options.provider || config.provider || 'anthropic';
        const provider = getProvider(providerId);
        const models = provider?.models || [];

        // 支持序号选择
        let newModel;
        const idx = parseInt(arg);
        if (!isNaN(idx) && idx >= 1 && idx <= models.length) {
          newModel = models[idx - 1];
        } else {
          newModel = parts.slice(1).join(' ');
        }

        options.model = newModel;
        // 写入配置文件
        try {
          const { loadConfig: lc, CONFIG_PATH } = require('../config/setup');
          const cfg = lc() || {};
          cfg.model = newModel;
          require('fs').writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2), { mode: 0o600 });
        } catch { /* ignore */ }
        console.log(chalk.green(`\n  模型已切换: ${chalk.bold(newModel)}\n`));
      } else {
        const { getProvider } = require('../config/providers');
        const config = require('../config/setup').loadConfig() || {};
        const providerId = options.provider || config.provider || 'anthropic';
        const provider = getProvider(providerId);
        const currentModel = options.model || config.model || provider?.defaultModel || '(未设置)';

        console.log(chalk.bold(`\n  当前模型: ${chalk.cyan(currentModel)}`));
        console.log(chalk.gray(`  Provider: ${provider?.name || providerId}\n`));

        const models = provider?.models || [];
        if (models.length > 0) {
          console.log(chalk.bold('  可选模型：\n'));
          models.forEach((m, i) => {
            const active = m === currentModel ? chalk.green(' <-- 当前') : '';
            const isDefault = m === provider.defaultModel ? chalk.gray(' (推荐)') : '';
            const num = chalk.cyan(String(i + 1).padStart(2));
            console.log('    ' + num + ') ' + m + isDefault + active);
          });
          console.log(chalk.gray('\n  切换: /model <序号>  或  /model <模型名>'));
        } else {
          console.log(chalk.gray('  切换: /model <模型名>'));
        }
        // 显示其他 provider 的模型
        const { listProviders: lp, getProvider: gp } = require('../config/providers');
        const otherProviders = lp().filter(p => p.id !== providerId && p.modelCount > 0);
        if (otherProviders.length > 0) {
          console.log(chalk.bold('\n  其他 Provider 可用模型：\n'));
          for (const op of otherProviders.slice(0, 4)) {
            const opModels = (gp(op.id)?.models || []).slice(0, 3).join(', ');
            console.log(`    ${chalk.gray(op.id.padEnd(16))} ${opModels}${gp(op.id)?.models?.length > 3 ? ' ...' : ''}`);
          }
          console.log(chalk.gray('\n  切换 Provider: /provider <名称>'));
        }
        console.log();
      }
      rl.prompt();
      return;
    }

    if (input.startsWith('/provider') || input.startsWith('/服务商')) {
      const parts = input.split(/\s+/);
      if (parts.length >= 2) {
        const newProvider = parts[1];
        const { getProvider } = require('../config/providers');
        if (!getProvider(newProvider)) {
          console.log(chalk.red(`\n  未知 provider: ${newProvider}`));
          console.log(chalk.gray('  可用: anthropic, openrouter, openai, deepseek, qwen, ollama\n'));
        } else {
          options.provider = newProvider;
          try {
            const { loadConfig, CONFIG_PATH } = require('../config/setup');
            const config = loadConfig() || {};
            config.provider = newProvider;
            require('fs').writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });
          } catch { /* ignore */ }
          console.log(chalk.green(`\n  Provider 已切换: ${chalk.bold(newProvider)}\n`));
        }
      } else {
        const config = require('../config/setup').loadConfig() || {};
        console.log(chalk.bold(`\n  当前 provider: ${chalk.cyan(config.provider || '(默认)')}`));
        const { listProviders } = require('../config/providers');
        console.log(chalk.gray('\n  可用 providers:'));
        for (const p of listProviders()) {
          const active = p.id === config.provider ? chalk.green(' ← 当前') : '';
          console.log(`    ${chalk.cyan(p.id.padEnd(12))} ${p.name}${active}`);
        }
        console.log(chalk.gray('\n  切换示例: /provider openrouter\n'));
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
        console.log(chalk.bold(`\n  ${uri}\n`));
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
        console.log(chalk.bold(`\n  搜索: "${query}"\n`));
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
          console.log(chalk.bold(`\n  ${uri}\n`));
          console.log(chalk.gray(`  L0: ${entry.l0}`));
          console.log(chalk.gray(`  L1: ${(entry.l1 || '').slice(0, 200)}`));
          console.log(chalk.white(`  L2: ${(entry.l2 || '').slice(0, 500)}`));
        } else {
          console.log(chalk.red(`\n  找不到: ${uri}\n`));
        }
      } else if (args === 'stats') {
        const stats = vikingStore.getStats();
        console.log(chalk.bold('\n  Viking 存储统计\n'));
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
        console.log(chalk.bold('\n  Viking 上下文文件系统（OpenViking 架构）\n'));
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
      console.log(chalk.bold(`  太史局 — 记忆总览`));
      console.log(chalk.gray(`  ─────────────────────────────`));
      console.log(`  ${chalk.white('大臣数:')} ${chalk.cyan(agentCount)}   ${chalk.white('记忆总条数:')} ${chalk.cyan(totalMem)}`);
      console.log();
      const { padEndCJK } = require('../utils/terminal');
      for (const [id, mems] of Object.entries(data.agents)) {
        if (mems.length > 0) {
          const bar = '█'.repeat(Math.min(mems.length, 20)) + '░'.repeat(Math.max(0, 20 - mems.length));
          console.log(`    ${chalk.cyan(padEndCJK(id, 16))} ${chalk.green(bar)} ${mems.length} 条`);
        }
      }
      if (data.court.length > 0) {
        console.log(`    ${chalk.yellow(padEndCJK('朝廷共识', 16))} ${'█'.repeat(Math.min(data.court.length, 20))} ${data.court.length} 条`);
      }
      console.log();
      rl.prompt();
      return;
    }

    if (input === '/history' || input === '/历史') {
      if (history.length === 0) {
        console.log(chalk.gray('\n  （本朝会暂无旨意记录）\n'));
      } else {
        console.log(chalk.bold('\n  旨意记录：\n'));
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

    // ── 会话持久化 ──
    if (input === '/resume' || input === '/继续') {
      const { loadSession } = require('./session-store');
      const session = loadSession();
      if (!session) {
        console.log(chalk.gray('\n  没有可恢复的会话\n'));
      } else {
        console.log(chalk.green(`\n  ✓ 恢复会话: ${session.prompt?.slice(0, 50) || '(未知)'}`));
        console.log(chalk.gray(`    ${session.messages?.length || 0} 条消息 | ${session.savedAt}\n`));
        // 将上次的 messages 加载到当前对话上下文
        sessionMessages = session.messages || [];
        console.log(chalk.gray('  对话上下文已恢复，请继续输入旨意。\n'));
      }
      rl.prompt();
      return;
    }

    if (input === '/sessions' || input === '/会话') {
      const { listSessions } = require('./session-store');
      const sessions = listSessions(10);
      if (sessions.length === 0) {
        console.log(chalk.gray('\n  暂无保存的会话\n'));
      } else {
        console.log(chalk.bold('\n  最近会话：\n'));
        for (const s of sessions) {
          console.log(`    ${chalk.gray(s.savedAt?.slice(0, 16) || '?')} ${chalk.white(s.prompt || '(无)')} ${chalk.gray(`(${s.messageCount} 条)`)}`);
        }
        console.log(chalk.gray('\n  输入 /resume 恢复最近会话\n'));
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

      // 收集 contestant IDs（遇到引号开头的参数时停止）
      const QUOTE_CHARS = '"\'"\u201c\u201d\u2018\u2019\u300c\u300d';
      while (i < parts.length && !QUOTE_CHARS.includes(parts[i][0])) {
        contestants.push(parts[i]);
        i++;
      }

      // Strip surrounding quotes (ASCII + Unicode: "" '' \u201c\u201d \u2018\u2019 \u300c\u300d)
      pkPrompt = parts.slice(i).join(' ').replace(/^[""''\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f]+|[""''\u201c\u201d\u2018\u2019\u300c\u300d\u300e\u300f]+$/g, '');

      if (contestants.length < 2 || !pkPrompt) {
        console.log(chalk.yellow('\n  用法: /pk [--judge 主考官] <Agent1> <Agent2> "题目"'));
        console.log(chalk.gray('  示例: /pk bingbu gongbu "写一个快速排序"'));
        console.log(chalk.gray('  示例: /pk --judge duchayuan bingbu gongbu "实现 HTTP 服务器"\n'));
        rl.prompt();
        return;
      }

      isProcessing = true;
      try {
        await runPK({
          prompt: pkPrompt, contestants, judgeId, regimeId: currentRegime,
          onAskUser: (question) => new Promise(resolve => {
            rl.question(question, answer => resolve(answer.trim()));
          })
        });
        console.log(chalk.gray('  💡 想看谁升官了？试试 /rank | 想考考他们？试试 /exam ' + contestants[0]));
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
        console.log(chalk.gray('  💡 意犹未尽？让他们 PK: /pk bingbu hubu "同一任务" | 看合拍度: /personality chemistry bingbu hubu'));
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
        console.log(chalk.gray(`  💡 考考他: /exam ${args} | 看性格: /personality ${args} | 让他 PK: /pk ${args} hubu "任务"`));
      } else {
        reputationManager.printLeaderboard();
        console.log(chalk.gray('  💡 点名看详情: /rank bingbu | 科举考核: /exam bingbu | 让他们 PK: /pk bingbu hubu "任务"'));
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
        if (premonitions && premonitions.length > 0 && !actMatch) {
          console.log(chalk.gray('  💡 执行预感: /dream --act 1 | 看看谁能干: /rank | 寻宝: /treasure hunt'));
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
        if (currentRegime === 'modern') {
          console.log(chalk.yellow('\n  Usage: /collab "task description"'));
          console.log(chalk.gray('  Example: /collab "Build a user auth module"'));
          console.log(chalk.gray('  Team Sprint: Architecture + Code + Security + QA + Review\n'));
        } else if (currentRegime === 'tang') {
          console.log(chalk.yellow('\n  用法: /collab "任务描述"'));
          console.log(chalk.gray('  示例: /collab "写一个用户认证模块"'));
          console.log(chalk.gray('  三省会审：中书起草 + 门下审核 + 尚书执行\n'));
        } else {
          console.log(chalk.yellow('\n  用法: /collab "任务描述"'));
          console.log(chalk.gray('  示例: /collab "写一个用户认证模块"'));
          console.log(chalk.gray('  六部联名：内阁督办 + 六部协同办差\n'));
        }
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

    if (input.startsWith('/auto-optimize') || input.startsWith('/自动优化')) {
      const { optimizeAgentPrompt, optimizeAll, printOptimizationStatus, rollbackOverlay } = require('../features/auto-prompt-optimizer');
      const args = input.replace(/^\/(auto-optimize|自动优化)\s*/, '').trim();

      isProcessing = true;
      try {
        if (args === '--status' || args === '状态') {
          printOptimizationStatus();
        } else if (args.startsWith('--rollback')) {
          const agentId = args.replace('--rollback', '').trim();
          if (agentId) {
            const ok = rollbackOverlay(agentId);
            console.log(ok ? chalk.green(`\n  ✓ 已回滚 ${agentId} 的 Prompt 优化\n`) : chalk.yellow(`\n  无可回滚的备份\n`));
          } else {
            console.log(chalk.yellow('\n  用法: /auto-optimize --rollback <AgentId>\n'));
          }
        } else if (args) {
          const result = await optimizeAgentPrompt(args);
          if (result.skipped) {
            console.log(chalk.gray(`\n  跳过: ${result.reason}\n`));
          } else if (result.success) {
            console.log(chalk.green(`\n  ✓ ${args} Prompt 已优化！`));
            console.log(chalk.gray(`  之前成功率: ${result.perfData.successRate}`));
            console.log(chalk.gray(`  优化内容: ${result.overlay.slice(0, 100)}...\n`));
          }
        } else {
          await optimizeAll(currentRegime);
        }
      } catch (err) {
        console.error(chalk.red(`\n  优化失败: ${err.message}\n`));
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
        console.log(chalk.gray(`  💡 不服？让两个大臣 PK: /pk ${agentId} hubu "同一道题" | 查看性格: /personality ${agentId}`));
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
        const pPath = require('path').join(require('../config/index').HOME, 'personality', 'agents.json');
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

    // ── 文本编辑器模式 ──────────────────────────────────────
    if (input === '/edit' || input.startsWith('/edit ')) {
      const { launchEditor } = require('./editor-launcher');
      const args = input.replace(/^\/edit\s*/, '').trim();

      isProcessing = true;
      try {
        const content = await launchEditor({
          initialContent: args,
          cwd: process.cwd()
        });

        if (content === null) {
          console.log(chalk.gray('\n  已取消编辑\n'));
        } else if (!content.trim()) {
          console.log(chalk.gray('\n  编辑内容为空\n'));
        } else {
          // 关键：先解除 isProcessing，再走正常输入流程
          isProcessing = false;
          console.log(chalk.gray('\n  ── 编辑内容 ──'));
          const lines = content.trimEnd().split('\n');
          for (const ln of lines) {
            console.log(chalk.white('  │ ') + ln);
          }
          console.log(chalk.gray('  ────────────\n'));
          console.log(chalk.gray('\n  已提交编辑内容，开始处理...\n'));
          rl.emit('line', content);
          return;
        }
      } catch (err) {
        console.error(chalk.red(`\n  编辑器错误: ${err.message}\n`));
      }
      isProcessing = false;
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
    ${chalk.cyan('/viking')}         Viking 上下文文件系统 (OpenViking)
    ${chalk.cyan('/cost')}           户部报账
    ${chalk.cyan('/history')}        旨意历史

  ${chalk.gray('── 进阶功能 ──')}
    ${chalk.cyan('/dream')}          朝堂梦境 — AI 预判你下一步需要什么
    ${chalk.cyan('/collab')}         六部联名 — 多 Agent 协同编码
    ${chalk.cyan('/oracle')}         天书降世 — 粘贴错误日志自动修复
    ${chalk.cyan('/pk')}             武举殿试 — Agent 对决擂台
    ${chalk.cyan('/debate')}         廷议 — 多 Agent 朝堂辩论
    ${chalk.cyan('/exam')}           科举考试 — Agent 能力基准测试
    ${chalk.cyan('/rank')}           功勋榜 — Agent 经验值 + 品阶
    ${chalk.cyan('/auto-optimize')}   自动 Prompt 优化 — AGI 核心引擎
    ${chalk.cyan('/evolve-self')}     自进化 — Agent 自我改进系统
    ${chalk.cyan('/evolve')}         朝代更迭 — 智能制度自适应推荐
    ${chalk.cyan('/replay')}         奏折回放 — 会话时间旅行
    ${chalk.cyan('/autopsy')}        大理寺 — 故障验尸报告
    ${chalk.cyan('/replay --weekly')} 自动生成周报

  ${chalk.gray('── 趣味 ──')}
    ${chalk.cyan('/treasure')}       寻宝奇缘 — 提示词寻宝游戏
    ${chalk.cyan('/personality')}    性格档案 — MBTI × 星座 × 合拍度

  ${chalk.gray('── 系统 ──')}
    ${chalk.cyan('/edit')}          打开编辑器 — 多行/长文本编辑
    ${chalk.cyan('/clear')}          清屏
    ${chalk.cyan('/help')}           帮助
    ${chalk.cyan('/exit')}           退朝
      `);
      rl.prompt();
      return;
    }

    // ── LLM 语义意图路由（tool-use 驱动，取代 regex 匹配） ──
    {
      const { routeIntent } = require('./intent-router');
      const { Spinner } = require('./spinner');
      const intentSpinner = new Spinner({ color: 'gray' });
      intentSpinner.start('揣摩圣意...');
      try {
        const routed = await routeIntent(input, currentRegime);
        intentSpinner.stop();
        if (routed) {
          rl.emit('line', routed);
          return;
        }
      } catch {
        intentSpinner.stop();
      }
    }

    // ── 模糊输入引导（分制度语气） ──
    if (isVagueInput(input)) {
      const guides = {
        ming: {
          opener: '  司礼监：陛下旨意不够明确，臣斗胆请陛下详述。例如：',
          examples: [
            '"帮朕写一个用户登录页面，要用 JWT 认证"',
            '"审查这段代码有没有 SQL 注入漏洞"',
            '"把这个应用部署到 Docker 里"',
          ]
        },
        tang: {
          opener: '  中书令：陛下圣意未明，臣恭请陛下赐示详情。例如：',
          examples: [
            '"令兵部编写一套用户认证系统"',
            '"门下省审核此段代码之安全隐患"',
            '"工部将此应用以 Docker 部署上线"',
          ]
        },
        modern: {
          opener: '  System: Could you be more specific? For example:',
          examples: [
            '"Build a user login page with JWT authentication"',
            '"Review this code for SQL injection vulnerabilities"',
            '"Deploy the application using Docker"',
          ]
        }
      };
      const g = guides[currentRegime] || guides.ming;
      console.log(chalk.yellow('\n' + g.opener));
      for (const ex of g.examples) {
        console.log(chalk.cyan('    ' + ex));
      }
      console.log();
      rl.prompt();
      return;
    }

    // ── 执行旨意 ──

    isProcessing = true;
    const startTime = Date.now();

    try {
      console.log();
      const result = await startSession(input, {
        ...options,
        regime: currentRegime,
        _messages: sessionMessages.length > 0 ? sessionMessages : undefined,
        _onCost: (cost) => {
          sessionCosts.inputTokens += cost.total.inputTokens || 0;
          sessionCosts.outputTokens += cost.total.outputTokens || 0;
          sessionCosts.sessions++;
        }
      });

      // 保持对话连续性：累积 messages
      if (result && result.messages) {
        sessionMessages = result.messages;
      }

      history.push({ prompt: input, success: true, time: Date.now(), duration: Date.now() - startTime });

      // 里程碑庆祝 + 解锁提示
      const successCount = history.filter(h => h.success).length;
      if (successCount === 1) {
        console.log(chalk.yellow('  🎉 首道旨意完成！输入 /rank 查看大臣功勋榜'));
      } else if (successCount === 5) {
        console.log(chalk.yellow('  🎊 五道旨意！试试 /dream 让 AI 揣摩你下一步需要什么'));
      } else if (successCount === 10) {
        console.log(chalk.yellow('  ⚔️ 十道旨意！试试 /pk bingbu hubu "任务" 让大臣们对决'));
      } else if (successCount === 20) {
        console.log(chalk.yellow('  🏆 二十道旨意！输入 /rank 看看谁升官最快'));
      }

      // 随机朝堂事件 — 用叙事引导功能发现
      if (successCount > 2 && successCount % 3 === 0 && ![5, 10, 20].includes(successCount)) {
        const events = currentRegime === 'modern' ? [
          { text: '📊 HR Report: Your agents have been growing. Check their progress.', cmd: '/rank' },
          { text: '🔮 The AI forecaster has new predictions for you.', cmd: '/dream' },
          { text: '⚡ Two engineers are arguing over the best approach...', cmd: '/debate "which is better"' },
          { text: '🎯 Time for quarterly performance reviews!', cmd: '/exam engineer' },
          { text: '🎁 There might be hidden power-ups waiting for you.', cmd: '/treasure hunt' },
          { text: '📋 Your weekly report is ready to generate.', cmd: '/replay --weekly' },
        ] : [
          { text: '📣 太监来报：兵部与户部在朝堂争功！', cmd: '/pk bingbu hubu "写排序算法"' },
          { text: '🔮 钦天监夜观星象，有所发现...', cmd: '/dream' },
          { text: '📜 都察院奏请：科举选才，以正朝纲！', cmd: '/exam bingbu' },
          { text: '💬 朝野热议：该用何等利器方为上策？', cmd: '/debate "React vs Vue"' },
          { text: '🗺️ 有探子来报：发现一处藏宝洞穴！', cmd: '/treasure hunt' },
          { text: '📊 太史局提醒：月底了，该写周报了。', cmd: '/replay --weekly' },
          { text: '🏆 吏部呈上百官功勋录，请陛下过目。', cmd: '/rank' },
          { text: '🎭 司礼监密奏：兵部性格档案已就绪。', cmd: '/personality bingbu' },
          { text: '💀 大理寺呈报：上次案件验尸报告已出。', cmd: '/autopsy' },
          { text: '🧠 翰林院进言：可让大臣自我精进。', cmd: '/evolve-self' },
        ];
        const event = events[Math.floor(Math.random() * events.length)];
        console.log(chalk.yellow(`\n  ${event.text}`));
        console.log(chalk.gray(`  → ${chalk.cyan(event.cmd)}`));
      }

    } catch (err) {
      console.error(chalk.red(`\n  出错: ${err.message}\n`));
      history.push({ prompt: input, success: false, time: Date.now(), error: err.message });

      // 失败时引导 — 把失败变成探索入口
      const failCount = history.filter(h => !h.success).length;
      if (failCount === 1) {
        console.log(chalk.gray('  💡 大理寺可以帮你分析原因：/autopsy'));
      } else if (failCount <= 3) {
        const failTips = [
          { cmd: '/oracle ' + err.message.slice(0, 30), desc: '天书降世 — 自动分析修复' },
          { cmd: '/autopsy', desc: '大理寺验尸 — 分析故障根因' },
          { cmd: '/evolve-self --prompt ' + 'bingbu', desc: '给大臣进修 — 优化 Agent 能力' },
        ];
        const tip = failTips[Math.floor(Math.random() * failTips.length)];
        console.log(chalk.gray(`  💡 试试: ${chalk.cyan(tip.cmd)} — ${tip.desc}`));
      }
    }

    isProcessing = false;
    rl.prompt();
  });

  rl.on('close', () => process.exit(0));
}

// routeNaturalLanguage 已被 LLM 语义意图路由器取代
// 详见 src/engine/intent-router.js


/**
 * 判断输入是否过于模糊（需要引导用户补充细节）
 * @param {string} input
 * @returns {boolean}
 */
function isVagueInput(input) {
  const vague = [
    /^(?:帮我|帮忙)(?:弄|做|搞|整|来)?(?:一下|个|点)?(?:东西|事情|事儿)?[吧呗啊哦]?$/,
    /^(?:弄一下|做一下|搞一下|来一个|整一个|做个|弄个|搞个)(?:东西|事情|事儿)?[吧呗啊哦]?$/,
    /^(?:help me|do something|make something|fix it|do it)$/i,
    /^(?:开始|start|go|run|执行|干活)[吧呗啊哦!！]?$/,
    /^(?:快|赶紧|马上)[吧呗啊哦]?$/,
    /^.{1,2}[吧呗啊]$/,  // 极短+语气词，如"写吧"、"来呗"（放宽到3字，避免误杀"部署吧"等）
  ];
  return vague.some(p => p.test(input));
}

/**
 * 打印户部账目
 */
function printCostReport(costs) {
  console.log();
  console.log(chalk.bold('  户部账目 — 本朝会 Token 消耗'));
  console.log(chalk.gray('  ─────────────────────────────────'));

  if (costs.sessions === 0) {
    console.log(chalk.gray('  （尚无消耗记录）'));
  } else {
    const total = costs.inputTokens + costs.outputTokens;
    console.log(`  ${chalk.white('旨意数:')}       ${chalk.cyan(costs.sessions)}`);
    console.log(`  ${chalk.white('输入 Token:')}   ${chalk.cyan(costs.inputTokens.toLocaleString())}`);
    console.log(`  ${chalk.white('输出 Token:')}   ${chalk.cyan(costs.outputTokens.toLocaleString())}`);
    console.log(`  ${chalk.white('合计:')}         ${chalk.yellow(total.toLocaleString() + ' tokens')}`);
  }
  console.log();
}

module.exports = { startRepl };
