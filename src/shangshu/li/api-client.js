/**
 * 礼部 — LLM API 客户端
 *
 * 统一封装 Anthropic / OpenRouter / OpenAI / DeepSeek 调用
 * 所有 Provider 走 OpenAI 兼容接口（Anthropic 原生接口单独处理）
 *
 * 🧠 UncommonRoute 智能融合:
 *    自动检测本地 UncommonRoute 代理 (localhost:8403)，
 *    检测到后透明劫持 baseUrl，让所有请求走智能路由。
 *    无需用户手动配置，装了就用，没装不影响。
 *    参考: https://github.com/CommonstackAI/UncommonRoute
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');
const { loadConfig } = require('../../config/setup');
const { getProvider, getApiKey } = require('../../config/providers');

// ── UncommonRoute 自动检测 ──────────────────────────────
const UNCOMMON_ROUTE_URL = 'http://localhost:8403';
let _uncommonRouteStatus = null; // null=未检测, true=可用, false=不可用

/**
 * 探测 UncommonRoute 是否在跑（只探一次，缓存结果）
 * @returns {Promise<boolean>}
 */
async function probeUncommonRoute() {
  if (_uncommonRouteStatus !== null) return _uncommonRouteStatus;

  // 环境变量强制关闭
  if (process.env.TIANGONG_NO_UNCOMMON_ROUTE === '1') {
    _uncommonRouteStatus = false;
    return false;
  }

  return new Promise(resolve => {
    const req = http.get(`${UNCOMMON_ROUTE_URL}/health`, { timeout: 800 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        _uncommonRouteStatus = res.statusCode === 200;
        resolve(_uncommonRouteStatus);
      });
    });
    req.on('error', () => { _uncommonRouteStatus = false; resolve(false); });
    req.on('timeout', () => { req.destroy(); _uncommonRouteStatus = false; resolve(false); });
  });
}

/** 重置探测缓存（用于测试或 UncommonRoute 启停后刷新） */
function resetUncommonRouteProbe() { _uncommonRouteStatus = null; }

/** 查看当前 UncommonRoute 状态 */
function isUncommonRouteActive() { return _uncommonRouteStatus === true; }

/**
 * 调用 LLM API
 * @param {object} params
 * @param {string} params.model - 模型名
 * @param {Array} params.messages - 消息列表
 * @param {string} [params.system] - System prompt
 * @param {Array} [params.tools] - 工具定义
 * @param {number} [params.maxTokens=4096]
 * @param {string} [params.providerId] - 指定 Provider
 * @param {object} [params._tiangong] - 天工内部上下文（传给 UncommonRoute 的元信息）
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
  // baseUrl: CLI 指定了不同 provider 时，用该 provider 自带的 baseUrl，
  // 不要用 config 里存的（那是 setup 时的 provider 的 baseUrl）
  const configProviderMatch = providerId === config.provider;
  let baseUrl = (configProviderMatch ? config.baseUrl : null) || provider.baseUrl;

  // ── UncommonRoute 智能路由融合 ──
  //
  // UncommonRoute (github.com/CommonstackAI/UncommonRoute) 是本地 LLM 代理，
  // 用 ML 分类器按 prompt 难度自动选最划算的模型。
  //
  // 融合模式（按 baseUrl 自动判断，无需特殊配置）：
  //
  //   A) 用户 setup 时把 baseUrl 配成 localhost:8403
  //      → 天工发请求到 UncommonRoute → 它选模型 → 转发给它的 upstream
  //      → 用户需自行配好 UncommonRoute 的 upstream 和 API key
  //      → 适合: 想要 UncommonRoute 完全托管模型选择
  //
  //   B) 用户正常配 provider (Anthropic/OpenAI/Qwen 等)
  //      + 同时跑着 UncommonRoute + 设 ANTHROPIC_BASE_URL=localhost:8403
  //      → 天工用用户的 provider 配置 → 请求走 UncommonRoute 代理
  //      → 这是 UncommonRoute 官方推荐的用法
  //      → 适合: 不想改天工配置，只在环境变量层做代理
  //
  //   C) 用户正常配 provider，没装 UncommonRoute
  //      → 天工直连 provider，完全不受影响
  //
  // 天工额外做的事：通过 x-tiangong-* headers 把自己的路由上下文传给 UncommonRoute，
  // 帮它做更精准的路由决策（任务类型、agent 身份、是否简单对话）。
  //
  const tiangongMeta = params._tiangong || {};

  // 自动探测 UncommonRoute（非阻塞，仅用于在 REPL 显示状态提示）
  // 实际路由完全靠用户配的 baseUrl，不做隐式劫持
  probeUncommonRoute().catch(() => {});

  // ── 调用 + 错误自动恢复（参考 Claude Code recovery loops）──
  const callFn = providerId === 'anthropic' ? callAnthropic : callOpenAICompatible;
  const callParams = { ...params, model, apiKey, baseUrl, tiangongMeta, providerId };
  const maxRetries = params._retryCount || 0;

  try {
    return await callFn(callParams);
  } catch (err) {
    const msg = err.message || '';

    // 恢复 1: max_output_tokens → 升级到 64k 重试（最多 3 次）
    if (msg.includes('max_output_tokens') || msg.includes('length') && maxRetries < 3) {
      const biggerTokens = Math.min((params.maxTokens || 4096) * 4, 65536);
      return callLLM({ ...params, maxTokens: biggerTokens, _retryCount: maxRetries + 1 });
    }

    // 恢复 2: prompt_too_long (413) → 截断 messages 保留首尾，重试
    if ((msg.includes('413') || msg.includes('too long') || msg.includes('too large')) && maxRetries < 2) {
      const msgs = params.messages || [];
      if (msgs.length > 4) {
        // 保留第一条（用户原始输入）和最后 2 条（最近上下文），丢弃中间
        const trimmed = [msgs[0], ...msgs.slice(-2)];
        return callLLM({ ...params, messages: trimmed, _retryCount: maxRetries + 1 });
      }
    }

    // 恢复 3: 速率限制 → 等一下重试
    if (msg.includes('429') && maxRetries < 2) {
      await new Promise(r => setTimeout(r, 2000 * (maxRetries + 1)));
      return callLLM({ ...params, _retryCount: maxRetries + 1 });
    }

    throw err;
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

  const headers = {
    'x-api-key': params.apiKey,
    'anthropic-version': '2023-06-01',
    'content-type': 'application/json'
  };

  // 天工元信息 → UncommonRoute 可据此微调路由决策
  if (params.tiangongMeta) {
    const m = params.tiangongMeta;
    if (m.taskType) headers['x-tiangong-task'] = m.taskType;      // chat / coding / review ...
    if (m.agentId)  headers['x-tiangong-agent'] = m.agentId;      // silijian / bingbu ...
    if (m.layer)    headers['x-tiangong-layer'] = m.layer;         // planning / execution / review
    if (m.isSimple) headers['x-tiangong-simple'] = '1';            // 简单对话标记
  }

  const response = await httpPost(`${params.baseUrl}/v1/messages`, body, headers);

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

  // 天工元信息 → UncommonRoute 可据此微调路由决策
  if (params.tiangongMeta) {
    const m = params.tiangongMeta;
    if (m.taskType) headers['x-tiangong-task'] = m.taskType;
    if (m.agentId)  headers['x-tiangong-agent'] = m.agentId;
    if (m.layer)    headers['x-tiangong-layer'] = m.layer;
    if (m.isSimple) headers['x-tiangong-simple'] = '1';
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

/**
 * 流式调用 LLM API（SSE）
 * 参考 Claude Code 的 queryModelWithStreaming
 *
 * @param {object} params - 同 callLLM 参数
 * @param {function} onText - 文本 delta 回调 (text: string)
 * @param {function} [onToolUse] - 工具调用回调 (toolCall: object)
 * @returns {Promise<{ content: string, toolCalls: Array, usage: object }>}
 */
async function callLLMStreaming(params, onText, onToolUse) {
  const config = loadConfig() || {};
  const providerId = params.providerId || config.provider || 'anthropic';
  const provider = getProvider(providerId);
  if (!provider) throw new Error(`未知的 LLM 提供商: ${providerId}`);

  const apiKey = params.apiKey || getApiKey(providerId);
  if (!apiKey && !provider.local) throw new Error(`未配置 API Key，请运行 tiangong setup`);

  const model = params.model || config.model || provider.defaultModel;
  const configProviderMatch = providerId === config.provider;
  const baseUrl = (configProviderMatch ? config.baseUrl : null) || provider.baseUrl;

  // 构建请求体（OpenAI 兼容格式统一处理）
  const body = { model, max_tokens: params.maxTokens || 4096, stream: true };

  if (providerId === 'anthropic') {
    body.messages = params.messages;
    if (params.system) body.system = params.system;
    if (params.tools?.length > 0) body.tools = params.tools;
  } else {
    body.messages = [];
    if (params.system) body.messages.push({ role: 'system', content: params.system });
    body.messages.push(...params.messages);
    if (params.tools?.length > 0) {
      body.tools = params.tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.input_schema } }));
    }
  }

  const url = providerId === 'anthropic'
    ? `${baseUrl}/v1/messages`
    : `${baseUrl}/chat/completions`;

  const headers = { 'content-type': 'application/json' };
  if (providerId === 'anthropic') {
    headers['x-api-key'] = apiKey;
    headers['anthropic-version'] = '2023-06-01';
  } else if (apiKey && apiKey !== 'local') {
    headers['authorization'] = `Bearer ${apiKey}`;
  }
  if (providerId === 'openrouter') {
    headers['http-referer'] = 'https://github.com/wanikua/tiangong';
    headers['x-title'] = 'tiangong';
  }

  // 天工元信息
  const m = params._tiangong || {};
  if (m.taskType) headers['x-tiangong-task'] = m.taskType;
  if (m.agentId) headers['x-tiangong-agent'] = m.agentId;
  if (m.isSimple) headers['x-tiangong-simple'] = '1';

  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const lib = parsed.protocol === 'https:' ? https : http;
    const data = JSON.stringify(body);

    let fullContent = '';
    const toolCalls = [];
    let currentToolCall = null;
    let usage = {};

    const req = lib.request({
      hostname: parsed.hostname,
      port: parsed.port,
      path: parsed.pathname + parsed.search,
      method: 'POST',
      headers: { ...headers, 'content-length': Buffer.byteLength(data) },
      timeout: 120000
    }, (res) => {
      if (res.statusCode >= 400) {
        let errData = '';
        res.on('data', c => errData += c);
        res.on('end', () => reject(new Error(`API ${res.statusCode}: ${errData.slice(0, 200)}`)));
        return;
      }

      let buffer = '';
      res.on('data', (chunk) => {
        buffer += chunk.toString();
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // 保留未完成的行

        for (const line of lines) {
          if (!line.startsWith('data: ') || line === 'data: [DONE]') continue;
          let event;
          try { event = JSON.parse(line.slice(6)); } catch { continue; }

          if (providerId === 'anthropic') {
            // Anthropic SSE 格式
            if (event.type === 'content_block_delta') {
              if (event.delta?.type === 'text_delta' && event.delta.text) {
                fullContent += event.delta.text;
                if (onText) onText(event.delta.text);
              } else if (event.delta?.type === 'input_json_delta' && currentToolCall) {
                currentToolCall._jsonBuf = (currentToolCall._jsonBuf || '') + (event.delta.partial_json || '');
              }
            } else if (event.type === 'content_block_start' && event.content_block?.type === 'tool_use') {
              currentToolCall = { id: event.content_block.id, name: event.content_block.name, _jsonBuf: '' };
            } else if (event.type === 'content_block_stop' && currentToolCall) {
              currentToolCall.input = safeJsonParse(currentToolCall._jsonBuf);
              delete currentToolCall._jsonBuf;
              toolCalls.push(currentToolCall);
              if (onToolUse) onToolUse(currentToolCall);
              currentToolCall = null;
            } else if (event.type === 'message_delta' && event.usage) {
              usage = { ...usage, ...event.usage };
            } else if (event.usage) {
              usage = { ...usage, ...event.usage };
            }
          } else {
            // OpenAI SSE 格式
            const delta = event.choices?.[0]?.delta;
            if (delta?.content) {
              fullContent += delta.content;
              if (onText) onText(delta.content);
            }
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls) {
                if (tc.index !== undefined) {
                  if (!toolCalls[tc.index]) {
                    toolCalls[tc.index] = { id: tc.id || '', name: tc.function?.name || '', _argBuf: '' };
                  }
                  if (tc.function?.arguments) {
                    toolCalls[tc.index]._argBuf += tc.function.arguments;
                  }
                }
              }
            }
            if (event.usage) usage = event.usage;
          }
        }
      });

      res.on('end', () => {
        // 解析 OpenAI 格式的工具调用参数
        const finalToolCalls = toolCalls.map(tc => {
          if (tc._argBuf !== undefined) {
            tc.input = safeJsonParse(tc._argBuf);
            delete tc._argBuf;
          }
          return tc;
        }).filter(tc => tc.name);

        if (finalToolCalls.length > 0 && onToolUse) {
          // OpenAI 格式的 tool calls 在流结束时一次性通知
          for (const tc of finalToolCalls) {
            if (!tc._notified) onToolUse(tc);
          }
        }

        resolve({ content: fullContent, toolCalls: finalToolCalls, usage });
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('API 流式请求超时')); });
    req.write(data);
    req.end();
  });
}

module.exports = { callLLM, callLLMStreaming, probeUncommonRoute, resetUncommonRouteProbe, isUncommonRouteActive };
