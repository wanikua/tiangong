/**
 * LLM Provider 配置
 *
 * 支持多种 API 提供商，安装时提示用户输入 API Key
 */

const PROVIDERS = {
  anthropic: {
    name: 'Anthropic (Claude)',
    baseUrl: 'https://api.anthropic.com',
    envKey: 'ANTHROPIC_API_KEY',
    models: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
    defaultModel: 'claude-sonnet-4-6'
  },
  openrouter: {
    name: 'OpenRouter (多模型)',
    baseUrl: 'https://openrouter.ai/api/v1',
    envKey: 'OPENROUTER_API_KEY',
    models: [
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-opus-4-6',
      'openai/gpt-4o',
      'google/gemini-2.5-pro',
      'deepseek/deepseek-r1',
      'meta-llama/llama-4-maverick'
    ],
    defaultModel: 'anthropic/claude-sonnet-4-6'
  },
  openai: {
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    envKey: 'OPENAI_API_KEY',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'],
    defaultModel: 'gpt-4o'
  },
  deepseek: {
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    envKey: 'DEEPSEEK_API_KEY',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    defaultModel: 'deepseek-chat'
  },
  custom: {
    name: '自定义 (OpenAI 兼容)',
    baseUrl: null, // 用户自己输入
    envKey: 'CUSTOM_API_KEY',
    models: [],
    defaultModel: null
  }
};

/**
 * 获取 provider 配置
 * @param {string} id
 * @returns {object}
 */
function getProvider(id) {
  return PROVIDERS[id] || null;
}

/**
 * 列出所有 provider
 * @returns {Array}
 */
function listProviders() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({
    id,
    name: p.name,
    defaultModel: p.defaultModel,
    modelCount: p.models.length
  }));
}

/**
 * 从环境变量或配置文件获取当前 API Key
 * @param {string} providerId
 * @returns {string|null}
 */
function getApiKey(providerId) {
  const provider = PROVIDERS[providerId];
  if (!provider) return null;

  // 1. 环境变量
  if (process.env[provider.envKey]) {
    return process.env[provider.envKey];
  }

  // 2. 配置文件
  const fs = require('fs');
  const path = require('path');
  const configPath = path.join(process.env.HOME || '/tmp', '.tiangong', 'config.json');

  try {
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return config.apiKeys?.[providerId] || null;
    }
  } catch { /* ignore */ }

  return null;
}

/**
 * 保存 API Key 到配置文件
 * @param {string} providerId
 * @param {string} apiKey
 */
function saveApiKey(providerId, apiKey) {
  const fs = require('fs');
  const path = require('path');
  const configDir = path.join(process.env.HOME || '/tmp', '.tiangong');
  const configPath = path.join(configDir, 'config.json');

  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  let config = {};
  try {
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
    }
  } catch { /* ignore */ }

  if (!config.apiKeys) config.apiKeys = {};
  config.apiKeys[providerId] = apiKey;

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), { mode: 0o600 });
}

module.exports = { PROVIDERS, getProvider, listProviders, getApiKey, saveApiKey };
