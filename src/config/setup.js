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

// ─── 登基动画素材 ────────────────────────────────────

// 第一幕：午门（宫门大开）
const PALACE_GATE = () => `
${chalk.red('      ╔══════════════════════════════════════════════════╗')}
${chalk.red('      ║')}${chalk.yellow('  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░')}${chalk.red('║')}
${chalk.red('      ║')}${chalk.yellow('  ░░')}${chalk.red.bold('██████████████████  午门  ██████████████████')}${chalk.yellow('░░')}${chalk.red('║')}
${chalk.red('      ║')}${chalk.yellow('  ░░')}${chalk.red('██')}                                      ${chalk.red('██')}${chalk.yellow('░░')}${chalk.red('║')}
${chalk.red('      ║')}${chalk.yellow('  ░░')}${chalk.red('██')}    ${chalk.bold.yellow('~ ~ ~ 登 基 大 典 ~ ~ ~')}         ${chalk.red('██')}${chalk.yellow('░░')}${chalk.red('║')}
${chalk.red('      ║')}${chalk.yellow('  ░░')}${chalk.red('██')}                                      ${chalk.red('██')}${chalk.yellow('░░')}${chalk.red('║')}
${chalk.red('      ║')}${chalk.yellow('  ░░')}${chalk.red('██████████████████████████████████████████')}${chalk.yellow('░░')}${chalk.red('║')}
${chalk.red('      ║')}${chalk.yellow('  ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░')}${chalk.red('║')}
${chalk.red('      ╚══════════════════════════════════════════════════╝')}
`;

// 第二幕：皇帝坐上龙椅（核心画面）
const EMPEROR_ON_THRONE = () => `
${chalk.yellow('                          _===_')}
${chalk.yellow('                         /  |  \\')}
${chalk.yellow('                        | ') + chalk.red.bold('crown') + chalk.yellow(' |')}
${chalk.yellow('                         \\__') + chalk.red.bold('V') + chalk.yellow('__/')}
${chalk.yellow('                          |') + chalk.red.bold(':') + chalk.yellow('|')}
${chalk.yellow('                     _____|') + chalk.red.bold(':') + chalk.yellow('|_____')}
${chalk.yellow('                    |') + chalk.red('  龙 袍 龙 袍 ') + chalk.yellow('|')}
${chalk.yellow('                    |') + chalk.red('    天  子    ') + chalk.yellow('|')}
${chalk.yellow('                    |') + chalk.red(' 御 极 天 下 ') + chalk.yellow('|')}
${chalk.yellow('                    |_____________|')}
${chalk.yellow('                       /     \\')}
${chalk.yellow('                      /       \\')}

${chalk.yellow('         ╔═══════════════════════════════════╗')}
${chalk.yellow('         ║') + chalk.red.bold('    天 工 开 物  ·  三 省 六 部     ') + chalk.yellow('║')}
${chalk.yellow('         ╚═══════════════════════════════════╝')}
`;

// 第三幕：金銮殿全景
const COURT_SCENE = () => `
${chalk.yellow('    ════════════════════════════════════════════════════')}
${chalk.yellow('    ║') + chalk.red.bold('                    金   銮   殿                   ') + chalk.yellow('║')}
${chalk.yellow('    ════════════════════════════════════════════════════')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ║')}          ${chalk.yellow('龙')}                          ${chalk.yellow('龙')}          ${chalk.yellow('║')}
${chalk.yellow('    ║')}          ${chalk.yellow('柱')}      ${chalk.red.bold(' ___________')}       ${chalk.yellow('柱')}          ${chalk.yellow('║')}
${chalk.yellow('    ║')}          ${chalk.yellow('|')}      ${chalk.red.bold('|  ') + chalk.yellow.bold('天  子') + chalk.red.bold('   |')}       ${chalk.yellow('|')}          ${chalk.yellow('║')}
${chalk.yellow('    ║')}          ${chalk.yellow('|')}      ${chalk.red.bold('|  ') + chalk.yellow.bold('龙  椅') + chalk.red.bold('   |')}       ${chalk.yellow('|')}          ${chalk.yellow('║')}
${chalk.yellow('    ║')}          ${chalk.yellow('|')}      ${chalk.red.bold('|___________|')}       ${chalk.yellow('|')}          ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ║')}     ${chalk.cyan('[ 中书省 ]')}    ${chalk.blue('[ 门下省 ]')}    ${chalk.magenta('[ 尚书省 ]')}     ${chalk.yellow('║')}
${chalk.yellow('    ║')}     ${chalk.cyan('  起 草')}       ${chalk.blue('  审 核')}       ${chalk.magenta('  执 行')}        ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ║')}  ${chalk.white('[吏]')} ${chalk.yellow('[户]')} ${chalk.magenta('[礼]')} ${chalk.red('[兵]')} ${chalk.blue('[刑]')} ${chalk.green('[工]')}    ${chalk.gray('<-- 六部候旨')}  ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ║')}  ${chalk.gray('  臣  臣  臣  臣  臣  臣  臣  臣  臣  臣  臣')}    ${chalk.yellow('║')}
${chalk.yellow('    ║')}  ${chalk.gray('  oo  oo  oo  oo  oo  oo  oo  oo  oo  oo  oo')}    ${chalk.yellow('║')}
${chalk.yellow('    ║')}          ${chalk.gray('「 百 官 跪 拜  恭 迎 圣 驾 」')}            ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ════════════════════════════════════════════════════')}
`;

// 第四幕：龙印玉玺
const IMPERIAL_SEAL = () => `
${chalk.red('                  ┌─────────────────┐')}
${chalk.red('                  │  ╔═══════════╗  │')}
${chalk.red('                  │  ║') + chalk.yellow.bold(' 天 工 之 ') + chalk.red('║  │')}
${chalk.red('                  │  ║') + chalk.yellow.bold('   玺     ') + chalk.red('║  │')}
${chalk.red('                  │  ╚═══════════╝  │')}
${chalk.red('                  └─────────────────┘')}
`;

const CORONATION_STEPS = [
  { text: '  鸣钟九响，午门大开 ........', delay: 500, color: 'yellow' },
  { text: '  文武百官，入殿候旨 ........', delay: 400, color: 'white' },
  { text: '  宣读诏书，改元天工 ........', delay: 400, color: 'cyan' },
  { text: '  龙袍加身，冕旒垂珠 ........', delay: 400, color: 'red' },
  { text: '  授天子剑，赐传国玺 ........', delay: 400, color: 'yellow' },
  { text: '  三省六部，各就其位 ........', delay: 400, color: 'magenta' },
  { text: '  天工元年，朝廷初立 ........', delay: 500, color: 'green' },
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

  // 第一幕：午门大开
  await sleep(300);
  await fadeInLines(PALACE_GATE(), 100);
  await sleep(1200);

  // 第二幕：百官列阵，金銮殿全景
  clearScreen();
  await fadeInLines(COURT_SCENE(), 50);
  await sleep(1000);

  // 第三幕：登基仪式逐步推进
  clearScreen();
  console.log();
  console.log(chalk.yellow.bold('    ╔════════════════════════════════════════╗'));
  console.log(chalk.yellow.bold('    ║         登  基  仪  式  进  行         ║'));
  console.log(chalk.yellow.bold('    ╚════════════════════════════════════════╝'));
  console.log();

  for (const step of CORONATION_STEPS) {
    const colorFn = chalk[step.color] || chalk.white;
    await typewrite(colorFn(`    ${step.text}`), 35);
    // 模拟进度条
    process.stdout.write(colorFn('    '));
    const barLen = 20;
    for (let i = 0; i < barLen; i++) {
      process.stdout.write(colorFn('█'));
      await sleep(step.delay / barLen);
    }
    console.log(chalk.green(' ✓'));
    await sleep(100);
  }

  await sleep(500);

  // 第四幕：皇帝坐上龙椅
  clearScreen();
  await fadeInLines(EMPEROR_ON_THRONE(), 60);
  await sleep(800);

  // 第五幕：盖玉玺
  await fadeInLines(IMPERIAL_SEAL(), 80);
  await sleep(600);

  // 第六幕：圣旨宣读
  console.log();
  await typewrite(chalk.bold.red('      「天工元年，朕御极天下，百工听命！」'), 70);
  console.log();
  await typewrite(chalk.bold.yellow('      「三省六部各司其职，违令者斩！」'), 70);
  console.log();
  await sleep(600);

  // 过渡到配置
  console.log(chalk.yellow('    ──────────────────────────────────────────'));
  console.log();
  await typewrite(chalk.white('    司礼监：陛下，臣为您备好了朝廷章程。'), 25);
  await typewrite(chalk.white('           请御览并钦定以下事项：'), 25);
  console.log();
}

// ─── 登基完成动画 ────────────────────────────────────

async function playCoronationComplete(config, providerName, model, regime) {
  clearScreen();

  const COMPLETE_ART = `
${chalk.yellow('    ════════════════════════════════════════════════════')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ║')}     ${chalk.red.bold('★')} ${chalk.bold.yellow('登 基 大 成 ！  天 下 太 平 ！')} ${chalk.red.bold('★')}        ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ║')}        ${chalk.yellow('_===_')}                                      ${chalk.yellow('║')}
${chalk.yellow('    ║')}       ${chalk.yellow('/     \\')}     ${chalk.white('年号:  ')}${chalk.cyan.bold('天工')}                   ${chalk.yellow('║')}
${chalk.yellow('    ║')}      ${chalk.yellow('| ') + chalk.red.bold('V V') + chalk.yellow(' |')}     ${chalk.white('制度:  ')}${chalk.cyan.bold(regime)}${' '.repeat(Math.max(0, 19 - regime.length))}${chalk.yellow('║')}
${chalk.yellow('    ║')}       ${chalk.yellow('\\') + chalk.red(' _ ') + chalk.yellow('/')}      ${chalk.white('模型:  ')}${chalk.cyan.bold(model)}${' '.repeat(Math.max(0, 19 - model.length))}${chalk.yellow('║')}
${chalk.yellow('    ║')}       ${chalk.yellow(' |') + chalk.red(':') + chalk.yellow('|')}       ${chalk.white('军师:  ')}${chalk.cyan.bold(providerName)}${' '.repeat(Math.max(0, 19 - providerName.length))}${chalk.yellow('║')}
${chalk.yellow('    ║')}     ${chalk.red('__|') + chalk.red(':') + chalk.red('|__')}                                      ${chalk.yellow('║')}
${chalk.yellow('    ║')}    ${chalk.red('|  龙袍  |')}    ${chalk.gray('~/.tiangong/config.json')}       ${chalk.yellow('║')}
${chalk.yellow('    ║')}    ${chalk.red('|_______|')}                                      ${chalk.yellow('║')}
${chalk.yellow('    ║')}                                                    ${chalk.yellow('║')}
${chalk.yellow('    ════════════════════════════════════════════════════')}
`;

  await fadeInLines(COMPLETE_ART, 50);

  console.log();
  await typewrite(chalk.yellow('    司礼监：陛下，朝廷已立，可以下旨了。'), 25);
  console.log();
  console.log(chalk.white('    用法：'));
  console.log(chalk.gray('      tiangong "帮朕写一个登录页面"'));
  console.log(chalk.gray('      tiangong --regime tang "以唐制审查此代码"'));
  console.log(chalk.gray('      tiangong court                 <- 查看朝廷架构'));
  console.log(chalk.gray('      tiangong memory --agent bingbu  <- 查看兵部记忆'));
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
