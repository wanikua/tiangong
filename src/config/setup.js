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

const { HOME, CONFIG_PATH } = require('./index');

// （ASCII art 已精简，登基动画改为简洁版）

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
  // 允许通过环境变量跳过动画（CI/测试环境）
  if (process.env.TIANGONG_SKIP_ANIMATION === '1') {
    console.log(chalk.yellow('\n  天工开物 — 登基大典\n'));
    return;
  }

  clearScreen();

  // 简洁版：一屏搞定，快速有气势
  const banner = `
${chalk.yellow('    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}

${chalk.red.bold('                    天 工 开 物')}
${chalk.gray('                 TianGong · AI Agents')}
${chalk.gray('                    by 菠萝菠菠')}

${chalk.yellow('                    登 基 大 典')}

${chalk.yellow('    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')}
`;
  console.log(banner);
  await sleep(400);

  // 快速步骤（不用进度条，直接打勾）
  const steps = [
    ['yellow',  '鸣钟开朝'],
    ['white',   '百官就位'],
    ['cyan',    '宣读诏书'],
    ['red',     '龙袍加身'],
    ['yellow',  '授天子剑'],
    ['magenta', '三省六部各就其位'],
    ['green',   '天工元年，朝廷初立'],
  ];

  for (const [color, text] of steps) {
    const colorFn = chalk[color] || chalk.white;
    console.log(`    ${chalk.green('✓')} ${colorFn(text)}`);
    await sleep(120);
  }

  console.log();
  console.log(chalk.red.bold('    「天工元年，朕御极天下，百工听命！」'));
  console.log();
  await sleep(300);

  console.log(chalk.yellow('    ──────────────────────────────────────────'));
  console.log(chalk.white('    司礼监：陛下，臣为您备好了朝廷章程。'));
  console.log(chalk.white('           请御览并钦定以下事项：'));
  console.log();
}

// ─── 登基完成动画 ────────────────────────────────────

async function playCoronationComplete(config, providerName, model, regime) {
  clearScreen();

  console.log();
  console.log(chalk.yellow('    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log(chalk.green.bold('              登 基 大 成 ！ 天 下 太 平 ！'));
  console.log(chalk.yellow('    ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'));
  console.log();
  console.log(chalk.white('    年号:  ') + chalk.cyan.bold('天工'));
  console.log(chalk.white('    制度:  ') + chalk.cyan.bold(regime));
  console.log(chalk.white('    模型:  ') + chalk.cyan.bold(model));
  console.log(chalk.white('    军师:  ') + chalk.cyan.bold(providerName));
  console.log(chalk.gray('    配置:  ~/.tiangong/config.json'));
  console.log();
  console.log(chalk.yellow('    司礼监：陛下，朝廷已立，可以下旨了。'));
  console.log();
  console.log(chalk.white('    用法：'));
  console.log(chalk.gray('      tiangong "帮朕写一个登录页面"'));
  console.log(chalk.gray('      tiangong --regime tang "以唐制审查此代码"'));
  console.log(chalk.gray('      tiangong                       <- 交互模式'));
  console.log();
}

// ─── 检查是否需要配置 ────────────────────────────────

function needsSetup() {
  if (!fs.existsSync(CONFIG_PATH)) return true;
  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    if (!config.provider) return true;
    // 本地模型 (Ollama/LM Studio) 不需要 API Key
    const { getProvider } = require('./providers');
    const provider = getProvider(config.provider);
    if (provider?.local) return false;
    return !config.apiKeys?.[config.provider];
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
    deepseek: 'https://platform.deepseek.com/api_keys',
    qwen: 'https://dashscope.console.aliyun.com/apiKey'
  };
  if (keyUrls[providerId]) {
    console.log(chalk.gray(`      获取: ${keyUrls[providerId]}`));
    console.log();
  }

  let apiKey;
  let baseUrl = provider.baseUrl;

  if (provider.local) {
    // 本地模型不需要 API Key
    console.log(chalk.green(`    ✓ ${provider.name} 无需 API Key，自动连接本地服务\n`));
    apiKey = 'local'; // 占位

    // 尝试探测 Ollama 本地服务和可用模型
    if (providerId === 'ollama') {
      console.log(chalk.gray('    正在探测 Ollama 服务...'));
      try {
        const http = require('http');
        const detected = await new Promise((resolve, reject) => {
          const req = http.get('http://localhost:11434/api/tags', { timeout: 3000 }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
              try {
                const json = JSON.parse(data);
                resolve(json.models || []);
              } catch { resolve([]); }
            });
          });
          req.on('error', () => resolve([]));
          req.on('timeout', () => { req.destroy(); resolve([]); });
        });

        if (detected.length > 0) {
          console.log(chalk.green(`    ✓ Ollama 已就绪，发现 ${detected.length} 个本地模型:`));
          for (const m of detected.slice(0, 10)) {
            const size = m.size ? chalk.gray(` (${(m.size / 1e9).toFixed(1)}GB)`) : '';
            console.log(`      ${chalk.cyan('•')} ${m.name}${size}`);
          }
          // 动态更新可用模型列表（不修改全局 PROVIDERS）
          const detectedModels = detected.map(m => m.name);
          provider = { ...provider, models: detectedModels };
          if (!provider.models.includes(provider.defaultModel)) {
            provider.defaultModel = provider.models[0];
          }
        } else {
          console.log(chalk.yellow('    Ollama 服务未运行或无模型。请先运行:'));
          console.log(chalk.gray('      ollama serve'));
          console.log(chalk.gray('      ollama pull qwen2.5-coder:7b'));
        }
        console.log();
      } catch {
        console.log(chalk.yellow('    无法连接 Ollama 服务'));
      }
    }

    // LM Studio 自定义端口
    if (providerId === 'lmstudio') {
      const customPort = await ask(chalk.yellow('    LM Studio 端口 (默认 1234): '));
      if (customPort.trim()) {
        baseUrl = `http://localhost:${customPort.trim()}/v1`;
      }
    }
  } else {
    // 云端服务需要 API Key
    apiKey = await ask(chalk.yellow('    API Key: '));
    if (!apiKey.trim()) {
      console.log(chalk.red('    API Key 不能为空'));
      rl.close();
      process.exit(1);
    }
  }

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
  } else if (!model) {
    // Provider 没有预设模型列表（如 custom/lmstudio），必须手动输入模型名
    console.log();
    console.log(chalk.bold('    【肆】输入模型名称\n'));
    console.log(chalk.gray('      该 Provider 没有预设模型列表，请手动输入模型名'));
    console.log(chalk.gray('      例如: gpt-4o, llama3.1:8b, qwen2.5-coder:7b'));
    console.log();
    while (!model) {
      model = (await ask(chalk.yellow('    模型名称: '))).trim();
      if (!model) console.log(chalk.red('    模型名称不能为空'));
    }
  }

  rl.close();

  // 保存配置
  if (!fs.existsSync(HOME)) {
    fs.mkdirSync(HOME, { recursive: true });
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
 * 加载已有配置（委托给 config/index.js 单例）
 */
function loadConfig() {
  return require('./index').loadConfig();
}

module.exports = { needsSetup, runSetup, loadConfig, CONFIG_PATH };
