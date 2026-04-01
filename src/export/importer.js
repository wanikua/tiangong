/**
 * Agent 导入系统
 *
 * 从 AgentPark 或其他来源导入 Agent 到朝廷
 */

const fs = require('fs');
const chalk = require('chalk');

/**
 * 从外部来源导入 Agent
 * @param {string} source - 来源（文件路径 / AgentPark URL / npm 包名）
 * @param {object} options
 */
async function importAgent(source, options = {}) {
  // 本地文件
  if (fs.existsSync(source)) {
    const data = JSON.parse(fs.readFileSync(source, 'utf-8'));
    return importFromJSON(data);
  }

  // AgentPark URL
  if (source.startsWith('agentpark://') || source.startsWith('https://agentpark.')) {
    return importFromAgentPark(source);
  }

  // npm 包
  if (!source.includes('/') && !source.includes('.')) {
    return importFromNpm(source);
  }

  console.error(chalk.red(`无法识别来源: ${source}`));
  console.log('支持的格式:');
  console.log('  本地文件:   tiangong import ./exported-agents.json');
  console.log('  AgentPark:  tiangong import agentpark://team/coding-squad');
  console.log('  npm 包:     tiangong import @tiangong/agent-bingbu');
}

/** @private */
function importFromJSON(data) {
  if (data.protocol === 'agent-park/v1') {
    console.log(chalk.green(`导入 AgentPark 团队: ${data.metadata.displayName}`));
    console.log(`Agent 数: ${data.agents.length}`);
    // TODO: 注册到本地 Agent 池
    return data.agents;
  }

  if (data.format === 'tiangong/v1') {
    console.log(chalk.green(`导入天工班子: ${data.regime.name}`));
    console.log(`Agent 数: ${data.agents.length}`);
    return data.agents;
  }

  console.log(chalk.yellow('未知格式，尝试直接导入 agents 字段'));
  return data.agents || [];
}

/** @private */
async function importFromAgentPark(url) {
  console.log(chalk.yellow(`从 AgentPark 导入: ${url}`));
  console.log(chalk.gray('（AgentPark API 集成开发中）'));
  // TODO: 调用 AgentPark API 获取 Agent 定义
}

/** @private */
async function importFromNpm(packageName) {
  console.log(chalk.yellow(`从 npm 导入: ${packageName}`));
  console.log(chalk.gray('（npm Agent 包规范开发中）'));
  // TODO: npm install + 动态加载
}

module.exports = { importAgent };
