/**
 * 户部 — Token 消耗统计
 */

class CostTracker {
  constructor() {
    this.usage = { inputTokens: 0, outputTokens: 0 };
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
    this.usage.inputTokens += inputTokens;
    this.usage.outputTokens += outputTokens;

    if (!this.perAgent[agentId]) {
      this.perAgent[agentId] = { inputTokens: 0, outputTokens: 0, calls: 0 };
    }
    this.perAgent[agentId].inputTokens += inputTokens;
    this.perAgent[agentId].outputTokens += outputTokens;
    this.perAgent[agentId].calls++;
  }

  /** 检查是否超限（基于 token 总量） */
  isOverBudget() {
    const maxTokens = parseInt(process.env.TIANGONG_MAX_TOKENS_TOTAL) || 2_000_000;
    return (this.usage.inputTokens + this.usage.outputTokens) >= maxTokens;
  }

  /** 获取汇总 */
  getSummary() {
    return {
      total: { ...this.usage },
      perAgent: this.perAgent
    };
  }
}

module.exports = { CostTracker };
