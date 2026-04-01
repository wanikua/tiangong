/**
 * 门下省 — 权限审查门
 *
 * 所有操作在执行前必须经过门下省审核
 * 从当皇上项目的 permission-guard.js 移植并适配三省架构
 */

const { getRegime } = require('../config/regimes');

/**
 * 操作类型
 */
const ActionType = {
  AGENT_CALL: 'agent_call',
  TOOL_EXEC: 'tool_exec',
  FILE_ACCESS: 'file_access'
};

/**
 * PermissionGate — 门下省权限门
 */
class PermissionGate {
  constructor(regimeId = 'ming') {
    this.regime = getRegime(regimeId);
    this.auditLog = [];
  }

  /**
   * 检查 Agent 调用权限
   * @param {string} callerId
   * @param {string} targetId
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkAgentCall(callerId, targetId) {
    const caller = this.regime.agents.find(a => a.id === callerId);
    if (!caller) {
      return { allowed: false, reason: `未知 Agent: ${callerId}` };
    }

    const allowed = caller.canCall.includes('*')
      || caller.canCall.includes(targetId)
      || caller.canCall.some(p => p.endsWith('*') && targetId.startsWith(p.slice(0, -1)));

    this._audit(callerId, ActionType.AGENT_CALL, { target: targetId }, allowed);

    return allowed
      ? { allowed: true }
      : { allowed: false, reason: `${caller.name} (${callerId}) 无权调度 ${targetId}` };
  }

  /**
   * 检查工具执行权限
   * @param {string} agentId
   * @param {string} toolName
   * @returns {{ allowed: boolean, reason?: string }}
   */
  checkToolExec(agentId, toolName) {
    const agent = this.regime.agents.find(a => a.id === agentId);
    if (!agent) {
      return { allowed: false, reason: `未知 Agent: ${agentId}` };
    }

    // 执行层可以用工具，决策层和审核层受限
    const dangerousTools = ['bash', 'file_write', 'file_edit'];
    const readOnlyLayers = ['review'];

    if (readOnlyLayers.includes(agent.layer) && dangerousTools.includes(toolName)) {
      this._audit(agentId, ActionType.TOOL_EXEC, { tool: toolName }, false);
      return { allowed: false, reason: `${agent.name} 属于审核层，不能使用 ${toolName}` };
    }

    this._audit(agentId, ActionType.TOOL_EXEC, { tool: toolName }, true);
    return { allowed: true };
  }

  /**
   * 唐制特色：封驳权
   * 门下省可以打回中书省的方案
   * @param {string} reviewerId - 审核者 ID
   * @param {string} planId - 方案 ID
   * @param {string} reason - 驳回理由
   * @returns {{ rejected: boolean, returnTo: string }}
   */
  reject(reviewerId, planId, reason) {
    if (!this.regime.canReject) {
      return { rejected: false, returnTo: null };
    }

    const canRejectTo = this.regime.canReject[reviewerId];
    if (!canRejectTo || canRejectTo.length === 0) {
      return { rejected: false, returnTo: null };
    }

    this._audit(reviewerId, 'reject', { planId, reason, returnTo: canRejectTo[0] }, true);
    return { rejected: true, returnTo: canRejectTo[0] };
  }

  /**
   * 获取审计日志
   * @param {number} [limit=50]
   * @returns {Array}
   */
  getAuditLog(limit = 50) {
    return this.auditLog.slice(-limit);
  }

  /** @private */
  _audit(agentId, action, details, allowed) {
    this.auditLog.push({
      timestamp: new Date().toISOString(),
      agentId,
      action,
      details,
      allowed
    });
    if (this.auditLog.length > 500) this.auditLog.shift();
  }
}

module.exports = { PermissionGate, ActionType };
