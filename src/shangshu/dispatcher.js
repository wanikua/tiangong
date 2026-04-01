/**
 * 尚书省 — 六部调度器
 *
 * 接收执行计划，按步骤调度六部工具执行
 */

const { PermissionGate } = require('../menxia/permission-gate');

/**
 * Dispatcher — 尚书省调度器
 */
class Dispatcher {
  /**
   * @param {object} options
   * @param {string} options.regimeId - 制度 ID
   * @param {object} options.toolRegistry - 工具注册表
   * @param {Function} options.onProgress - 进度回调
   */
  constructor(options = {}) {
    this.regimeId = options.regimeId || 'ming';
    this.toolRegistry = options.toolRegistry || {};
    this.onProgress = options.onProgress || (() => {});
    this.gate = new PermissionGate(this.regimeId);
    this.results = new Map();
  }

  /**
   * 执行计划
   * @param {object} plan - 执行计划（来自 planner.generatePlan）
   * @returns {Promise<object>} 执行结果
   */
  async executePlan(plan) {
    const { steps } = plan;
    const results = {};

    for (const step of steps) {
      this.onProgress({
        type: 'step_start',
        step: step.id,
        agent: step.agent,
        task: step.description
      });

      try {
        // 检查依赖是否完成
        if (step.dependencies) {
          for (const depId of step.dependencies) {
            if (!results[depId] || results[depId].status === 'failed') {
              throw new Error(`依赖步骤 #${depId} 未完成或失败`);
            }
          }
        }

        // 收集上游输出
        const upstreamOutputs = {};
        if (step.dependencies) {
          for (const depId of step.dependencies) {
            upstreamOutputs[depId] = results[depId];
          }
        }

        // 执行
        const result = await this._executeStep(step, upstreamOutputs);
        results[step.id] = { status: 'success', output: result, completedAt: new Date().toISOString() };

        this.onProgress({
          type: 'step_complete',
          step: step.id,
          agent: step.agent,
          status: 'success'
        });
      } catch (err) {
        results[step.id] = { status: 'failed', error: err.message, completedAt: new Date().toISOString() };

        this.onProgress({
          type: 'step_failed',
          step: step.id,
          agent: step.agent,
          error: err.message
        });
      }
    }

    return {
      plan,
      results,
      completedAt: new Date().toISOString(),
      success: Object.values(results).every(r => r.status === 'success')
    };
  }

  /**
   * 执行单个步骤
   * @private
   */
  async _executeStep(step, upstreamOutputs) {
    // 这里将来对接 Claude API 或本地工具
    // 目前返回占位结果
    return {
      agent: step.agent,
      task: step.task,
      message: `[${step.agent}] 已完成: ${step.description}`,
      upstreamCount: Object.keys(upstreamOutputs).length
    };
  }
}

module.exports = { Dispatcher };
