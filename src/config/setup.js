/**
 * 首次安装引导 — 登基大典
 *
 * 安装时交互式提示用户：
 * 1. 播放登基动画
 * 2. 选择 LLM Provider
 * 3. 输入 API Key
 * 4. 选择制度
 * 5. 选择默认模型
 */

const readline = require('readline');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { PROVIDERS, listProviders, saveApiKey, getApiKey } = require('./providers');

const CONFIG_DIR = path.join(process.env.HOME || '/tmp', '.tiangong');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

// ─── 登基动画帧 ─────────────────────────────────────

const DRAGON_ART = [
  chalk.yellow(`
                          ⠀⠀⠀⠀⠀⣀⣤⣶⣿⣿⣶⣤⡀
                       ⠀⠀⠀⣠⣾⣿⣿⣿⣿⣿⣿⣿⣿⣷⣄
                      ⠀⠀⣴⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣦
                     ⠀⢀⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡀
                     ⠀⢸⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⡇
                      ⠀⠻⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⣿⠟
                       ⠀⠀⠉⠛⠿⣿⣿⣿⣿⣿⠿⠛⠉
  `),
];

const THRONE = chalk.yellow(`
        ██████████████████████████████████████████
        ██                                      ██
        ██    ╔══════════════════════════════╗   ██
        ██    ║                              ║   ██
        ██    ║      👑  天  工  开  物       ║   ██
        ██    ║                              ║   ██
        ██    ║    三 省 六 部 听 旨 办 差    ║   ██
        ██    ║                              ║   ██
        ██    ╚══════════════════════════════╝   ██
        ██                                      ██
        ██████████████████████████████████████████
                    ████████████████
                  ██████████████████████
`);

const PALACE_GATE = `
${chalk.red('    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░')}
${chalk.red('    ░░')}${chalk.yellow('████████████████████████████████████████████')}${chalk.red('░░')}
${chalk.red('    ░░')}${chalk.yellow('██')}${chalk.red('░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░')}${chalk.yellow('██')}${chalk.red('░░')}
${chalk.red('    ░░')}${chalk.yellow('██')}${chalk.red('░░')}  ${chalk.bold.yellow('⚡ 登 基 大 典 ⚡')}                    ${chalk.red('░░')}${chalk.yellow('██')}${chalk.red('░░')}
${chalk.red('    ░░')}${chalk.yellow('██')}${chalk.red('░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░')}${chalk.yellow('██')}${chalk.red('░░')}
${chalk.red('    ░░')}${chalk.yellow('████████████████████████████████████████████')}${chalk.red('░░')}
${chalk.red('    ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░')}
`;

const COURT_SCENE = `
${chalk.gray('  ┌───────────────────────────────────────────────────┐')}
${chalk.gray('  │')} ${chalk.yellow.bold('                   金 銮 殿')}                      ${chalk.gray('│')}
${chalk.gray('  │')}                                                   ${chalk.gray('│')}
${chalk.gray('  │')}         ${chalk.yellow('🐉')}                       ${chalk.yellow('🐉')}              ${chalk.gray('│')}
${chalk.gray('  │')}                   ${chalk.red.bold('👑 天 子 👑')}                   ${chalk.gray('│')}
${chalk.gray('  │')}                   ${chalk.yellow('━━━━━━━━━')}                    ${chalk.gray('│')}
${chalk.gray('  │')}                                                   ${chalk.gray('│')}
${chalk.gray('  │')}     ${chalk.cyan('🏛️ 中书省')}      ${chalk.blue('🛡️ 门下省')}      ${chalk.magenta('⚔️ 尚书省')}     ${chalk.gray('│')}
${chalk.gray('  │')}     ${chalk.cyan('(起 草)')}       ${chalk.blue('(审 核)')}       ${chalk.magenta('(执 行)')}      ${chalk.gray('│')}
${chalk.gray('  │')}                                                   ${chalk.gray('│')}
${chalk.gray('  │')}  ${chalk.white('📋吏')} ${chalk.yellow('💰户')} ${chalk.magenta('🎭礼')} ${chalk.red('⚔️兵')} ${chalk.blue('⚖️刑')} ${chalk.green('🔧工')}  ${chalk.gray('← 六部候旨')}   ${chalk.gray('│')}
${chalk.gray('  │')}                                                   ${chalk.gray('│')}
${chalk.gray('  │')}           ${chalk.gray('「百官跪拜，恭迎天子登基」')}              ${chalk.gray('│')}
${chalk.gray('  │')}                                                   ${chalk.gray('│')}
${chalk.gray('  └───────────────────────────────────────────────────┘')}
`;

const CORONATION_STEPS = [
  { text: '⏳ 宣读登基诏书...', delay: 400 },
  { text: '🔔 鸣钟九响...', delay: 300 },
  { text: '🐉 龙袍加身...', delay: 300 },
  { text: '👑 冠冕加冠...', delay: 300 },
  { text: '📜 颁布年号「天工」...', delay: 400 },
  { text: '⚔️ 授天子剑...', delay: 300 },
  { text: '🏛️ 开朝设府...', delay: 300 },
];

// ─── 动画工具 ────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function clearScreen() {
  process.stdout.write('\x1B[2J\x1B[0f');
}

async function typewrite(text, speed = 30) {
  for (const char of text) {
    process.stdout.write(char);
    await sleep(speed);
  }
  console.log();
}

async function fadeInLines(text, lineDelay = 60) {
  const lines = text.split('\n');
  for (const line of lines) {
    console.log(line);
    await sleep(lineDelay);
  }
}

// ─── 登基动画 ────────────────────────────────────────

async function playCoronation() {
  clearScreen();

  // 第一幕：宫门
  await fadeInLines(PALACE_GATE, 80);
  await sleep(800);

  // 第二幕：金銮殿
  clearScreen();
  await fadeInLines(COURT_SCENE, 40);
  await sleep(600);

  // 第三幕：登基步骤
  console.log();
  for (const step of CORONATION_STEPS) {
    await typewrite(chalk.yellow(`    ${step.text}`), 40);
    await sleep(step.delay);
  }

  await sleep(300);
  console.log();

  // 第四幕：龙椅
  clearScreen();
  await fadeInLines(THRONE, 30);
  await sleep(500);

  // 第五幕：宣布
  console.log();
  await typewrite(chalk.bold.red('    「天工元年，朕御极天下，百工听命！」'), 60);
  console.log();
  await sleep(800);

  // 过渡到配置
  console.log(chalk.gray('  ─────────────────────────────────────────────────'));
  console.log();
  await typewrite(chalk.white('    陛下，臣等恭候圣旨。请先配置朝廷：'), 30);
  console.log();
}

// ─── 登基完成动画 ────────────────────────────────────

async function playCoronationComplete(config, providerName, model, regime) {
  console.log();

  const COMPLETE_ART = `
${chalk.yellow('    ╔════════════════════════════════════════════════╗')}
${chalk.yellow('    ║')}                                                ${chalk.yellow('║')}
${chalk.yellow('    ║')}   ${chalk.bold.red('⚡')} ${chalk.bold.yellow('登 基 大 成 ！ 天 下 太 平 ！')} ${chalk.bold.red('⚡')}       ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                ${chalk.yellow('║')}
${chalk.yellow('    ║')}   ${chalk.white(`提供商: ${chalk.cyan(providerName)}`)}${' '.repeat(Math.max(0, 39 - 10 - providerName.length))}${chalk.yellow('║')}
${chalk.yellow('    ║')}   ${chalk.white(`模  型: ${chalk.cyan(model)}`)}${' '.repeat(Math.max(0, 39 - 10 - model.length))}${chalk.yellow('║')}
${chalk.yellow('    ║')}   ${chalk.white(`制  度: ${chalk.cyan(regime)}`)}${' '.repeat(Math.max(0, 39 - 10 - regime.length))}${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                ${chalk.yellow('║')}
${chalk.yellow('    ║')}   ${chalk.gray(`配  置: ~/.tiangong/config.json`)}              ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                ${chalk.yellow('║')}
${chalk.yellow('    ╚════════════════════════════════════════════════╝')}
`;

  await fadeInLines(COMPLETE_ART, 40);

  console.log();
  await typewrite(chalk.yellow('    陛下现在可以下旨了：'), 30);
  console.log();
  console.log(chalk.gray('      tiangong "帮朕写一个登录页面"'));
  console.log(chalk.gray('      tiangong --regime tang "审查这段代码"'));
  console.log(chalk.gray('      tiangong court                          ← 查看朝廷架构'));
  console.log(chalk.gray('      tiangong memory --agent bingbu          ← 查看兵部记忆'));
  console.log();
}

// ─── 检查是否需要配置 ────────────────────────────────

function needsSetup() {
  if (!fs.existsSync(CONFIG_PATH)) return true;
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return !config.provider || !config.apiKeys?.[config.provider];
  } catch { return true; }
}

// ─── 主配置流程 ──────────────────────────────────────

async function runSetup() {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = (q) => new Promise(resolve => rl.question(q, resolve));

  // 播放登基动画
  await playCoronation();

  // 1. 选择 Provider
  const providers = listProviders();
  console.log(chalk.bold('    【壹】选择 LLM 提供商\n'));
  providers.forEach((p, i) => {
    const rec = i === 1 ? chalk.green(' ← 推荐') : '';
    console.log(`      ${chalk.cyan(i + 1)}) ${p.name}${p.defaultModel ? chalk.gray(` (${p.defaultModel})`) : ''}${rec}`);
  });
  console.log();

  let providerIdx;
  while (true) {
    const input = await ask(chalk.yellow('    请选择 (1-' + providers.length + '): '));
    providerIdx = parseInt(input) - 1;
    if (providerIdx >= 0 && providerIdx < providers.length) break;
    console.log(chalk.red('    无效选择'));
  }
  const selectedProvider = providers[providerIdx];
  const providerId = selectedProvider.id;
  const provider = PROVIDERS[providerId];

  // 2. 输入 API Key
  console.log();
  console.log(chalk.bold(`    【贰】输入 ${provider.name} API Key\n`));

  const keyUrls = {
    openrouter: 'https://openrouter.ai/keys',
    anthropic: 'https://console.anthropic.com/settings/keys',
    openai: 'https://platform.openai.com/api-keys',
    deepseek: 'https://platform.deepseek.com/api_keys'
  };
  if (keyUrls[providerId]) {
    console.log(chalk.gray(`      获取: ${keyUrls[providerId]}`));
    console.log();
  }

  const apiKey = await ask(chalk.yellow('    API Key: '));
  if (!apiKey.trim()) {
    console.log(chalk.red('    API Key 不能为空'));
    rl.close();
    process.exit(1);
  }

  let baseUrl = provider.baseUrl;
  if (providerId === 'custom') {
    baseUrl = await ask(chalk.yellow('    Base URL (OpenAI 兼容): '));
  }

  // 3. 选择制度
  console.log();
  console.log(chalk.bold('    【叁】选择治国方略\n'));
  console.log(`      ${chalk.cyan('1')}) ${chalk.yellow('🏮 明朝内阁制')} — 司礼监+内阁+六部，快速迭代`);
  console.log(`      ${chalk.cyan('2')}) ${chalk.yellow('🐉 唐朝三省制')} — 中书→门下→尚书，三权制衡`);
  console.log(`      ${chalk.cyan('3')}) ${chalk.yellow('🏢 现代企业制')} — CEO/CTO/CFO，国际化扁平`);
  console.log();

  const regimeInput = await ask(chalk.yellow('    请选择 (1-3，默认 1): '));
  const regimeMap = { '1': 'ming', '2': 'tang', '3': 'modern' };
  const regimeNames = { ming: '明朝内阁制', tang: '唐朝三省制', modern: '现代企业制' };
  const regime = regimeMap[regimeInput] || 'ming';

  // 4. 选择模型
  let model = provider.defaultModel;
  if (provider.models.length > 1) {
    console.log();
    console.log(chalk.bold('    【肆】选择御用模型\n'));
    provider.models.forEach((m, i) => {
      const isDefault = m === provider.defaultModel ? chalk.green(' ← 推荐') : '';
      console.log(`      ${chalk.cyan(i + 1)}) ${m}${isDefault}`);
    });
    console.log();

    const modelInput = await ask(chalk.yellow(`    请选择 (1-${provider.models.length}，回车用默认): `));
    const modelIdx = parseInt(modelInput) - 1;
    if (modelIdx >= 0 && modelIdx < provider.models.length) {
      model = provider.models[modelIdx];
    }
  }

  rl.close();

  // 保存配置
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  const config = {
    provider: providerId,
    baseUrl: baseUrl,
    model: model,
    regime: regime,
    apiKeys: {},
    setupAt: new Date().toISOString()
  };
  config.apiKeys[providerId] = apiKey.trim();

  fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), { mode: 0o600 });

  // 播放完成动画
  await playCoronationComplete(config, provider.name, model, regimeNames[regime] || regime);

  return config;
}

/**
 * 加载已有配置
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    }
  } catch { /* ignore */ }
  return null;
}

module.exports = { needsSetup, runSetup, loadConfig, CONFIG_PATH };
