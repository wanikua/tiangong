/**
 * 户部 — Token 计费 + 预算控制
 */

const PRICING = {
  // Anthropic
  'claude-sonnet-4-6': { input: 3.0, output: 15.0 },   // per 1M tokens
  'claude-opus-4-6': { input: 15.0, output: 75.0 },
  'claude-haiku-4-5': { input: 0.80, output: 4.0 },
  // OpenAI
  'gpt-4o': { input: 2.5, output: 10.0 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  'o3-mini': { input: 1.1, output: 4.4 },
  // DeepSeek
  'deepseek-chat': { input: 0.14, output: 0.28 },
  'deepseek-reasoner': { input: 0.55, output: 2.19 },
  // Qwen
  'qwen-max': { input: 2.0, output: 6.0 },
  'qwen-plus': { input: 0.8, output: 2.0 },
  'qwen-turbo': { input: 0.3, output: 0.6 },
  // OpenRouter (prefix matching in record())
  'anthropic/claude-sonnet-4-6': { input: 3.0, output: 15.0 },
  'anthropic/claude-opus-4-6': { input: 15.0, output: 75.0 },
  'openai/gpt-4o': { input: 2.5, output: 10.0 },
  'google/gemini-2.5-pro': { input: 1.25, output: 10.0 },
  'deepseek/deepseek-r1': { input: 0.55, output: 2.19 },
};

class CostTracker {
  constructor(maxBudgetUsd = 5.0) {
    this.maxBudgetUsd = maxBudgetUsd;
    this.usage = { inputTokens: 0, outputTokens: 0, totalCostUsd: 0 };
    this.perAgent = {};
  }

  /**
   * 记录用量
   * @param {string} agentId
   * @param {string} model
   * @param {number} inputTokens
   * @param {number} outputTokens
   */
  record(agentId, model, inputTokens, outputTokens) {
    const pricing = PRICING[model] || PRICING['claude-sonnet-4-6'];
    const cost = (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;
    this.usage.totalCostUsd += cost;

    if (!this.perAgent[agentId]) {
      this.perAgent[agentId] = { inputTokens: 0, outputTokens: 0, costUsd: 0, calls: 0 };
    }
    this.perAgent[agentId].inputTokens += inputTokens;
    this.perAgent[agentId].outputTokens += outputTokens;
    this.perAgent[agentId].costUsd += cost;
    this.perAgent[agentId].calls++;
  }

  /** 检查是否超预算 */
  isOverBudget() {
    return this.usage.totalCostUsd >= this.maxBudgetUsd;
  }

  /** 剩余预算 */
  remainingBudget() {
    return Math.max(0, this.maxBudgetUsd - this.usage.totalCostUsd);
  }

  /** 获取汇总 */
  getSummary() {
    return {
      total: {
        ...this.usage,
        totalCostUsd: Math.round(this.usage.totalCostUsd * 10000) / 10000
      },
      budget: {
        max: this.maxBudgetUsd,
        remaining: Math.round(this.remainingBudget() * 10000) / 10000,
        used: Math.round((this.usage.totalCostUsd / this.maxBudgetUsd) * 100) + '%'
      },
      perAgent: this.perAgent
    };
  }
}

module.exports = { CostTracker, PRICING };
