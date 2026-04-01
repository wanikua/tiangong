/**
 * 朝廷班子导出系统
 *
 * 把训练好的 Agent 朝廷打包导出为：
 * 1. AgentPark 格式 — 上架到 Agent 劳务市场
 * 2. OpenClaw 格式 — 直接导入当皇上项目
 * 3. JSON 格式 — 通用格式
 */

const fs = require('fs');
const path = require('path');
const { getRegime } = require('../config/regimes');

/**
 * 导出朝廷班子
 * @param {object} options
 * @param {string} options.format - 格式: agentpark | openclaw | json
 * @param {string} options.output - 输出路径
 * @param {string} options.regime - 制度 ID
 */
async function exportCourt(options) {
  const { format = 'json', output, regime: regimeId = 'ming' } = options;
  const regime = getRegime(regimeId);

  let exported;

  switch (format) {
    case 'agentpark':
      exported = exportAsAgentPark(regime);
      break;
    case 'openclaw':
      exported = exportAsOpenClaw(regime);
      break;
    case 'json':
    default:
      exported = exportAsJSON(regime);
      break;
  }

  const outputPath = output || `tiangong-${regimeId}-${format}.json`;
  fs.writeFileSync(outputPath, JSON.stringify(exported, null, 2));
  console.log(`✅ 已导出: ${outputPath} (${format} 格式)`);
  console.log(`   制度: ${regime.name}`);
  console.log(`   Agent 数: ${regime.agents.length}`);
}

/**
 * 导出为 AgentPark 格式
 * 适配 AgentPark 的 Agent Protocol 规范
 */
function exportAsAgentPark(regime) {
  return {
    protocol: 'agent-park/v1',
    type: 'agent-team',
    metadata: {
      name: `tiangong-${regime.id}`,
      displayName: `天工 ${regime.name}`,
      description: `${regime.description}。训练好的 AI 朝廷班子，可直接部署执行任务。`,
      version: '0.1.0',
      author: 'tiangong',
      tags: ['multi-agent', 'chinese-governance', regime.id],
      pricing: {
        model: 'per-task',
        tier: 'M'  // AgentPark S/M/L/XL 分级
      }
    },
    capabilities: {
      taskTypes: ['coding', 'review', 'devops', 'finance', 'marketing', 'management', 'legal', 'writing'],
      maxConcurrentAgents: regime.agents.filter(a => a.layer === 'execution').length,
      supportedModels: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5']
    },
    agents: regime.agents.map(a => ({
      id: a.id,
      name: a.name,
      role: a.role,
      layer: a.layer,
      canCall: a.canCall,
      // AgentPark Agent Protocol 字段
      runtime: 'node',
      entrypoint: `agents/${a.id}/handler.js`,
      memory: {
        type: 'persistent',
        backend: 'sqlite'
      },
      sandbox: a.layer === 'execution' ? 'wasm' : 'none'
    })),
    flow: {
      type: 'hierarchical',
      layers: regime.layers,
      pipeline: regime.flow,
      canReject: regime.canReject || null
    },
    // AgentPark 特有：Agent 间通信协议
    communication: {
      protocol: 'json-rpc',
      topics: [
        'task.assigned',
        'task.completed',
        'task.failed',
        'review.approved',
        'review.rejected',
        'budget.warning'
      ]
    }
  };
}

/**
 * 导出为 OpenClaw 格式
 * 直接可用于当皇上项目
 */
function exportAsOpenClaw(regime) {
  return {
    agents: {
      defaults: {
        workspace: '$HOME/clawd-$AGENT_ID',
        model: { primary: 'your-provider/fast-model' },
        sandbox: { mode: 'non-main', scope: 'agent' },
        skipBootstrap: false
      },
      list: regime.agents.map(a => ({
        id: a.id,
        name: a.name,
        model: { primary: 'your-provider/fast-model' },
        identity: {
          theme: `你是${a.name}，职责是${a.role}。`,
          name: a.name,
          emoji: a.emoji
        },
        sandbox: {
          mode: a.layer === 'review' ? 'all' : 'non-main',
          scope: 'agent'
        },
        workspace: `$HOME/clawd-${a.id}`,
        subagents: {
          allowAgents: a.canCall.includes('*')
            ? regime.agents.map(ag => ag.id)
            : a.canCall,
          maxConcurrent: 4
        },
        runTimeoutSeconds: 600
      }))
    }
  };
}

/**
 * 导出为通用 JSON
 */
function exportAsJSON(regime) {
  return {
    format: 'tiangong/v1',
    regime: {
      id: regime.id,
      name: regime.name,
      description: regime.description,
      style: regime.style
    },
    agents: regime.agents,
    flow: regime.flow,
    layers: regime.layers,
    permissions: regime.permissions,
    canReject: regime.canReject || null,
    exportedAt: new Date().toISOString()
  };
}

module.exports = { exportCourt, exportAsAgentPark, exportAsOpenClaw, exportAsJSON };
