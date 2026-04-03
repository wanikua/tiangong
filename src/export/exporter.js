/**
 * 朝廷班子导出系统
 *
 * 把训练好的 Agent 朝廷打包导出为：
 * 1. OpenClaw 格式 — 直接导入当皇上项目
 * 2. JSON 格式 — 通用格式
 */

const fs = require('fs');
const path = require('path');
const { getRegime } = require('../config/regimes');

/**
 * 导出朝廷班子
 * @param {object} options
 * @param {string} options.format - 格式: openclaw | json
 * @param {string} options.output - 输出路径
 * @param {string} options.regime - 制度 ID
 */
async function exportCourt(options) {
  const { format = 'json', output, regime: regimeId = 'ming' } = options;
  const regime = getRegime(regimeId);

  let exported;

  switch (format) {
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

module.exports = { exportCourt, exportAsOpenClaw, exportAsJSON };
