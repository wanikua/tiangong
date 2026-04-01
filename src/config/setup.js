/**
 * 首次安装引导 — 登基大典
 *
 * 安装时交互式提示用户：
 * 1. 选择 LLM Provider
 * 2. 输入 API Key
 * 3. 选择制度
 * 4. 选择默认模型
 */

const readline = require('readline');
const chalk = require('chalk');
const fs = require('fs');
const path = require('path');
const { PROVIDERS, listProviders, saveApiKey, getApiKey } = require('./providers');

const CONFIG_DIR = path.join(process.env.HOME || '/tmp', '.tiangong');
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json');

/**
 * 检查是否需要首次配置
 * @returns {boolean}
 */
function needsSetup() {
  if (!fs.existsSync(CONFIG_PATH)) return true;

  try {
    const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
    return !config.provider || !config.apiKeys?.[config.provider];
  } catch {
    return true;
  }
}

/**
 * 交互式引导配置
 * @returns {Promise<object>} 配置结果
 */
async function runSetup() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const ask = (question) => new Promise(resolve => rl.question(question, resolve));

  console.log();
  console.log(chalk.yellow('╔═══════════════════════════════════════╗'));
  console.log(chalk.yellow('║     天工开物 — 登基大典               ║'));
  console.log(chalk.yellow('║     首次使用，请完成以下配置           ║'));
  console.log(chalk.yellow('╚═══════════════════════════════════════╝'));
  console.log();

  // 1. 选择 Provider
  const providers = listProviders();
  console.log(chalk.bold('第一步：选择 LLM 提供商\n'));
  providers.forEach((p, i) => {
    console.log(`  ${chalk.cyan(i + 1)}) ${p.name}${p.defaultModel ? ` (默认: ${p.defaultModel})` : ''}`);
  });
  console.log();

  let providerIdx;
  while (true) {
    const input = await ask(chalk.yellow('请选择 (1-' + providers.length + '，推荐 2 OpenRouter): '));
    providerIdx = parseInt(input) - 1;
    if (providerIdx >= 0 && providerIdx < providers.length) break;
    console.log(chalk.red('无效选择'));
  }
  const selectedProvider = providers[providerIdx];
  const providerId = selectedProvider.id;
  const provider = PROVIDERS[providerId];

  // 2. 输入 API Key
  console.log();
  console.log(chalk.bold(`第二步：输入 ${provider.name} API Key\n`));

  if (providerId === 'openrouter') {
    console.log(chalk.gray('  获取 Key: https://openrouter.ai/keys'));
  } else if (providerId === 'anthropic') {
    console.log(chalk.gray('  获取 Key: https://console.anthropic.com/settings/keys'));
  } else if (providerId === 'openai') {
    console.log(chalk.gray('  获取 Key: https://platform.openai.com/api-keys'));
  } else if (providerId === 'deepseek') {
    console.log(chalk.gray('  获取 Key: https://platform.deepseek.com/api_keys'));
  }
  console.log();

  const apiKey = await ask(chalk.yellow('API Key: '));
  if (!apiKey.trim()) {
    console.log(chalk.red('API Key 不能为空'));
    rl.close();
    process.exit(1);
  }

  // 自定义 Provider 需要输入 Base URL
  let baseUrl = provider.baseUrl;
  if (providerId === 'custom') {
    baseUrl = await ask(chalk.yellow('Base URL (OpenAI 兼容): '));
  }

  // 3. 选择制度
  console.log();
  console.log(chalk.bold('第三步：选择默认制度\n'));
  console.log(`  ${chalk.cyan('1')}) 明朝内阁制 — 快速迭代，集权高效`);
  console.log(`  ${chalk.cyan('2')}) 唐朝三省制 — 三权制衡，严谨审核`);
  console.log(`  ${chalk.cyan('3')}) 现代企业制 — 国际化，扁平高效`);
  console.log();

  const regimeInput = await ask(chalk.yellow('请选择 (1-3，默认 1): '));
  const regimeMap = { '1': 'ming', '2': 'tang', '3': 'modern' };
  const regime = regimeMap[regimeInput] || 'ming';

  // 4. 选择模型
  let model = provider.defaultModel;
  if (provider.models.length > 1) {
    console.log();
    console.log(chalk.bold('第四步：选择默认模型\n'));
    provider.models.forEach((m, i) => {
      const isDefault = m === provider.defaultModel ? chalk.gray(' (推荐)') : '';
      console.log(`  ${chalk.cyan(i + 1)}) ${m}${isDefault}`);
    });
    console.log();

    const modelInput = await ask(chalk.yellow(`请选择 (1-${provider.models.length}，回车用默认): `));
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

  console.log();
  console.log(chalk.green('╔═══════════════════════════════════════╗'));
  console.log(chalk.green('║     登基完成！天下太平。               ║'));
  console.log(chalk.green('╚═══════════════════════════════════════╝'));
  console.log();
  console.log(`  提供商: ${chalk.cyan(provider.name)}`);
  console.log(`  模型:   ${chalk.cyan(model)}`);
  console.log(`  制度:   ${chalk.cyan(regime)}`);
  console.log(`  配置:   ${chalk.gray(CONFIG_PATH)}`);
  console.log();
  console.log(chalk.yellow('现在可以下旨了：'));
  console.log(chalk.gray('  tiangong "帮我写一个登录页面"'));
  console.log();

  return config;
}

/**
 * 加载已有配置
 * @returns {object|null}
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
