/**
 * 天工开物 — Feature Runner
 *
 * 统一封装 feature 执行模式：
 * - Spinner 生命周期管理
 * - callLLM + 自动费用追踪
 * - 错误处理 + 日志
 * - 功勋奖励
 */

const { callLLM } = require('../shangshu/li/api-client');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
const { reputationManager } = require('../features/reputation');
const Spinner = require('./spinner');
const { createLogger } = require('../utils/logger');

const log = createLogger('feature-runner');

class FeatureRunner {
  /**
   * @param {object} options
   * @param {string} options.featureName - 功能名（用于日志和 spinner）
   * @param {string} [options.regimeId='ming']
   * @param {string} [options.model]
   * @param {CostTracker} [options.costTracker]
   */
  constructor(options = {}) {
    this.featureName = options.featureName || 'feature';
    this.regimeId = options.regimeId || 'ming';
    this.model = options.model;
    this.costTracker = options.costTracker || new CostTracker();
  }

  /**
   * 调用 LLM 并自动记录费用
   * @param {object} params - callLLM 参数
   * @param {string} [agentId] - Agent ID（用于费用归属）
   * @returns {Promise<{ content: string, toolCalls: Array, usage: object }>}
   */
  async callLLM(params, agentId) {
    const model = params.model || this.model;
    const response = await callLLM({ ...params, model });

    // 自动记录费用
    if (response.usage && agentId) {
      const inputTokens = response.usage.input_tokens || response.usage.prompt_tokens || 0;
      const outputTokens = response.usage.output_tokens || response.usage.completion_tokens || 0;
      this.costTracker.record(agentId, model || 'unknown', inputTokens, outputTokens);
    }

    return response;
  }

  /**
   * 为 Agent 构建 system prompt
   * @param {string} agentId
   * @returns {string}
   */
  buildPrompt(agentId) {
    return buildSystemPrompt(agentId, this.regimeId);
  }

  /**
   * 带 spinner 执行异步操作
   * @param {string} message - spinner 显示文字
   * @param {Function} fn - 异步函数
   * @param {object} [options]
   * @param {string} [options.color='yellow']
   * @param {string} [options.successMsg] - 成功后显示
   * @param {string} [options.failMsg] - 失败后显示
   * @returns {Promise<*>} fn 的返回值
   */
  async withSpinner(message, fn, options = {}) {
    const spinner = new Spinner({ color: options.color || 'yellow' });
    spinner.start(message);
    try {
      const result = await fn();
      spinner.succeed(options.successMsg || message + ' ✓');
      return result;
    } catch (err) {
      spinner.fail(options.failMsg || `${message} 失败: ${err.message}`);
      log.error(`[${this.featureName}] ${err.message}`);
      throw err;
    }
  }

  /**
   * 奖励 Agent 功勋
   * @param {string} agentId
   * @param {string} reason
   */
  reward(agentId, reason) {
    try {
      reputationManager.reward(agentId, reason);
    } catch (err) {
      log.debug(`功勋奖励失败: ${err.message}`);
    }
  }

  /**
   * 获取费用摘要
   * @returns {object}
   */
  getCostSummary() {
    return this.costTracker.getSummary();
  }
}

module.exports = { FeatureRunner };
