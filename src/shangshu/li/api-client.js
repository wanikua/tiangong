/**
 * 礼部 — LLM API 客户端
 *
 * 统一封装 Anthropic / OpenRouter / OpenAI / DeepSeek 调用
 * 所有 Provider 走 OpenAI 兼容接口（Anthropic 原生接口单独处理）
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { loadConfig } = require('../../config/setup');
const { getProvider, getApiKey } = require('../../config/providers');

/**
 * 调用 LLM API
 * @param {object} params
 * @param {string} params.model - 模型名
 * @param {Array} params.messages - 消息列表
 * @param {string} [params.system] - System prompt
 * @param {Array} [params.tools] - 工具定义
 * @param {number} [params.maxTokens=4096]
 * @param {string} [params.providerId] - 指定 Provider
 * @returns {Promise<{ content: string, toolCalls: Array, usage: object, stopReason: string }>}
 */
async function callLLM(params) {
  const config = loadConfig() || {};
  const providerId = params.providerId || config.provider || 'anthropic';
  const provider = getProvider(providerId);

  if (!provider) {
    throw new Error(`未知的 LLM 提供商: ${providerId}。请运行 tiangong setup 重新配置`);
  }

  const apiKey = params.apiKey || getApiKey(providerId);

  // 本地模型不强制要求 API Key
  if (!apiKey && !provider.local) {
    throw new Error(`未配置 ${provider.name} API Key，请运行 tiangong setup`);
  }

  const model = params.model || config.model || provider.defaultModel;
  const baseUrl = config.baseUrl || provider.baseUrl;

  if (providerId === 'anthropic') {
    return callAnthropic({ ...params, model, apiKey, baseUrl });
  } else {
    return callOpenAICompatible({ ...params, model, apiKey, baseUrl, providerId });
  }
}

/**
 * Anthropic 原生 API
 * @private
 */
async function callAnthropic(params) {
  const body = {
    model: params.model,
    max_tokens: params.maxTokens || 4096,
    messages: params.messages
  };

  if (params.system) body.system = params.system;
  if (params.tools && params.tools.length > 0) body.tools = params.tools;

  const response = await httpPost(`${params.baseUrl}/v1/messages`, body, {
    'x-api-key': params.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  });

  // 解析响应
  const textBlocks = (response.content || []).filter(b => b.type === 'text');
  const toolBlocks = (response.content || []).filter(b => b.type === 'tool_use');

  return {
    content: textBlocks.map(b => b.text).join('\n'),
    toolCalls: toolBlocks.map(b => ({
      id: b.id,
      name: b.name,
      input: b.input
    })),
    usage: response.usage || { input_tokens: 0, output_tokens: 0 },
    stopReason: response.stop_reason
  };
}

/**
 * OpenAI 兼容 API（OpenRouter / OpenAI / DeepSeek / 自定义）
 * @private
 */
async function callOpenAICompatible(params) {
  const body = {
    model: params.model,
    max_tokens: params.maxTokens || 4096,
    messages: []
  };

  // system prompt 作为第一条消息
  if (params.system) {
    body.messages.push({ role: 'system', content: params.system });
  }
  body.messages.push(...params.messages);

  // 工具转为 OpenAI 格式
  if (params.tools && params.tools.length > 0) {
    body.tools = params.tools.map(t => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.input_schema
      }
    }));
  }

  const headers = {
    'content-type': 'application/json'
  };

  // 本地模型不需要 auth header
  if (params.apiKey && params.apiKey !== 'local') {
    headers['authorization'] = `Bearer ${params.apiKey}`;
  }

  // OpenRouter 额外 headers
  if (params.providerId === 'openrouter') {
    headers['http-referer'] = 'https://github.com/wanikua/tiangong';
    headers['x-title'] = 'tiangong';
  }

  const response = await httpPost(`${params.baseUrl}/chat/completions`, body, headers);

  const choice = response.choices?.[0] || {};
  const message = choice.message || {};

  // 解析工具调用
  const toolCalls = (message.tool_calls || []).map((tc, i) => ({
    id: tc.id || `call_${Date.now()}_${i}`,  // Ollama 有时不返回 id
    name: tc.function?.name,
    input: typeof tc.function?.arguments === 'string'
      ? safeJsonParse(tc.function.arguments)
      : tc.function?.arguments || {}
  }));

  return {
    content: message.content || '',
    toolCalls,
    usage: response.usage || { prompt_tokens: 0, completion_tokens: 0 },
    stopReason: choice.finish_reason
  };
}

/**
 * HTTP POST 请求（含自动重试）
 * @private
 */
async function httpPost(url, body, headers, retries = 2) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await _httpPostOnce(url, body, headers);
    } catch (err) {
      lastError = err;
      // 仅对可重试的错误进行重试（超时、5xx、网络错误）
      const isRetryable = err.message.includes('超时')
        || err.message.includes('ECONNRESET')
        || err.message.includes('ECONNREFUSED')
        || err.message.match(/API 5\d\d/);
      if (!isRetryable || attempt === retries) break;
      // 指数退避
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
    }
  }
  throw lastError;
}

function _httpPostOnce(url, body, headers) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;

    const data = JSON.stringify(body);

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: {
        ...headers,
        'content-length': Buffer.byteLength(data)
      },
      timeout: 120000
    }, (res) => {
      let chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try {
          const json = JSON.parse(raw);
          if (res.statusCode >= 400) {
            const errMsg = json.error?.message || json.message || raw;
            // 友好的错误消息
            if (res.statusCode === 401) {
              reject(new Error(`API Key 无效或已过期。请运行 tiangong setup 重新配置`));
            } else if (res.statusCode === 429) {
              reject(new Error(`API 请求频率超限，请稍后重试`));
            } else if (res.statusCode === 529 || res.statusCode === 503) {
              reject(new Error(`API ${res.statusCode}: 服务暂时过载，稍后重试`));
            } else {
              reject(new Error(`API ${res.statusCode}: ${errMsg}`));
            }
          } else {
            resolve(json);
          }
        } catch {
          reject(new Error(`API 响应解析失败: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', (err) => {
      if (err.code === 'ECONNREFUSED') {
        reject(new Error(`无法连接到 API 服务器 (${parsed.hostname})。请检查网络或 Base URL 配置`));
      } else {
        reject(err);
      }
    });
    req.on('timeout', () => { req.destroy(); reject(new Error('API 请求超时 (120s)，请检查网络连接')); });
    req.write(data);
    req.end();
  });
}

/** @private */
function safeJsonParse(str) {
  try { return JSON.parse(str); } catch { return {}; }
}

module.exports = { callLLM };
