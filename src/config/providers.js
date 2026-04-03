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
  qwen: {
    name: 'Qwen 通义千问 (阿里云)',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    envKey: 'DASHSCOPE_API_KEY',
    models: ['qwen-max', 'qwen-plus', 'qwen-turbo', 'qwen-long'],
    defaultModel: 'qwen-max'
  },
  ollama: {
    name: 'Ollama (本地模型)',
    baseUrl: 'http://localhost:11434/v1',
    envKey: 'OLLAMA_API_KEY',
    models: [
      'llama3.1:8b',
      'llama3.1:70b',
      'qwen2.5:7b',
      'qwen2.5:32b',
      'qwen2.5-coder:7b',
      'qwen2.5-coder:32b',
      'deepseek-r1:7b',
      'deepseek-r1:32b',
      'codellama:13b',
      'mistral:7b',
      'mixtral:8x7b',
      'phi3:medium',
      'gemma2:9b'
    ],
    defaultModel: 'qwen2.5-coder:7b',
    local: true // 标记为本地模型
  },
  lmstudio: {
    name: 'LM Studio (本地模型)',
    baseUrl: 'http://localhost:1234/v1',
    envKey: 'LMSTUDIO_API_KEY',
    models: [],
    defaultModel: null,
    local: true
  },
  uncommonroute: {
    name: 'UncommonRoute (智能路由)',
    baseUrl: 'http://localhost:8403/v1',
    envKey: 'UNCOMMON_ROUTE_API_KEY',
    models: [
      'auto',
      'anthropic/claude-sonnet-4-6',
      'anthropic/claude-opus-4-6',
      'openai/gpt-4o',
      'deepseek/deepseek-chat',
      'google/gemini-2.5-pro'
    ],
    defaultModel: 'auto',
    local: true
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

  // 1. 环境变量优先
  if (process.env[provider.envKey]) {
    return process.env[provider.envKey];
  }

  // 2. 配置文件（走 config 单例缓存）
  const { loadConfig } = require('./index');
  const config = loadConfig();
  return config?.apiKeys?.[providerId] || null;
}

/**
 * 保存 API Key 到配置文件
 * @param {string} providerId
 * @param {string} apiKey
 */
function saveApiKey(providerId, apiKey) {
  const { loadConfig, saveConfig } = require('./index');
  const config = loadConfig() || {};
  if (!config.apiKeys) config.apiKeys = {};
  config.apiKeys[providerId] = apiKey;
  saveConfig(config);
}

module.exports = { PROVIDERS, getProvider, listProviders, getApiKey, saveApiKey };
