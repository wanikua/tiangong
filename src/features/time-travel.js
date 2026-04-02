/**
 * 奏折回放 — 会话时间旅行
 *
 * Claude Code 没有的独创功能：
 * 自动保存每次会话的完整执行过程（奏折），
 * 事后可以回放、对比、分析历史会话。
 *
 * 场景：
 *  - "昨天我让兵部写的那个函数，跟今天的比哪个好？"
 *  - "上次部署失败了，帮我回放一下过程"
 *  - "最近一周做了哪些事？帮我生成周报"
 *
 * 用法：
 *   /replay            列出最近的奏折
 *   /replay 3          回放第3号奏折
 *   /replay --diff 3 5 对比第3和第5号奏折
 *   /replay --weekly   生成本周周报
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const SESSION_DIR = path.join(process.env.HOME || '/tmp', '.tiangong', 'sessions');

class SessionRecorder {
  constructor() {
    if (!fs.existsSync(SESSION_DIR)) {
      fs.mkdirSync(SESSION_DIR, { recursive: true });
    }
  }

  /**
   * 开始记录一个新会话
   * @param {string} prompt - 用户旨意
   * @param {object} options - 制度、模型等
   * @returns {string} sessionId
   */
  startSession(prompt, options = {}) {
    const sessionId = `s_${Date.now()}`;
    const session = {
      id: sessionId,
      prompt,
      regime: options.regime || 'ming',
      model: options.model || '(默认)',
      startedAt: new Date().toISOString(),
      endedAt: null,
      success: null,
      steps: [],
      toolCalls: [],
      outputs: [],
      cost: null,
      cwd: process.cwd()
    };

    this._save(sessionId, session);
    return sessionId;
  }

  /**
   * 记录步骤事件
   * @param {string} sessionId
   * @param {object} event
   */
  recordEvent(sessionId, event) {
    const session = this._load(sessionId);
    if (!session) return;

    event.timestamp = new Date().toISOString();

    switch (event.type) {
      case 'step_start':
      case 'step_complete':
      case 'step_failed':
        session.steps.push(event);
        break;
      case 'tool_call':
        session.toolCalls.push(event);
        break;
      case 'output':
        session.outputs.push(event);
        break;
    }

    this._save(sessionId, session);
  }

  /**
   * 结束会话
   * @param {string} sessionId
   * @param {object} result
   */
  endSession(sessionId, result) {
    const session = this._load(sessionId);
    if (!session) return;

    session.endedAt = new Date().toISOString();
    session.success = result.success;
    session.cost = result.cost;

    // 收集输出
    if (result.results) {
      for (const [stepId, stepResult] of Object.entries(result.results)) {
        if (stepResult.output?.content) {
          session.outputs.push({
            stepId,
            agent: stepResult.output.agent,
            content: stepResult.output.content
          });
        }
      }
    }

    this._save(sessionId, session);
  }

  /**
   * 列出最近的会话
   * @param {number} [limit=20]
   * @returns {Array}
   */
  listSessions(limit = 20) {
    const files = fs.readdirSync(SESSION_DIR)
      .filter(f => f.endsWith('.json'))
      .sort()
      .reverse()
      .slice(0, limit);

    return files.map((f, i) => {
      try {
        const session = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), 'utf-8'));
        return { index: i + 1, ...session };
      } catch { /* corrupted session file, skip */ return null; }
    }).filter(Boolean);
  }

  /**
   * 获取指定会话
   * @param {number|string} indexOrId
   * @returns {object|null}
   */
  getSession(indexOrId) {
    if (typeof indexOrId === 'number') {
      const sessions = this.listSessions(Math.max(indexOrId, 100));
      return sessions[indexOrId - 1] || null;
    }
    return this._load(indexOrId);
  }

  /**
   * 打印会话列表
   */
  printSessionList() {
    const sessions = this.listSessions(15);

    console.log();
    console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
    console.log(chalk.yellow('  ║') + chalk.bold.yellow('    📜  奏 折 归 档  📜') + chalk.gray('    Session Archive') + '         ' + chalk.yellow('║'));
    console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
    console.log();

    if (sessions.length === 0) {
      console.log(chalk.gray('  （暂无奏折记录）'));
      console.log();
      return;
    }

    console.log(chalk.gray('  序号  状态  时间               旨意                          费用'));
    console.log(chalk.gray('  ' + '─'.repeat(70)));

    for (const s of sessions) {
      const status = s.success === true ? chalk.green('✓') : s.success === false ? chalk.red('✗') : chalk.yellow('…');
      const time = new Date(s.startedAt).toLocaleString().slice(0, -3);
      const prompt = s.prompt.slice(0, 30) + (s.prompt.length > 30 ? '…' : '');
      const cost = s.cost?.total?.totalCostUsd
        ? chalk.gray(`$${s.cost.total.totalCostUsd.toFixed(4)}`)
        : chalk.gray('-');

      console.log(`  ${chalk.cyan(String(s.index).padStart(3))}   ${status}  ${chalk.gray(time)}  ${chalk.white(prompt.padEnd(30))}  ${cost}`);
    }

    console.log();
    console.log(chalk.gray('  回放: /replay <序号>    对比: /replay --diff <序号1> <序号2>'));
    console.log();
  }

  /**
   * 回放一个会话
   * @param {number} index
   */
  printReplay(index) {
    const session = this.getSession(index);
    if (!session) {
      console.log(chalk.red(`  找不到第 ${index} 号奏折`));
      return;
    }

    console.log();
    console.log(chalk.yellow(`  ═══ 奏折 #${index} 回放 ${'═'.repeat(35)}`));
    console.log();
    console.log(`  ${chalk.white('旨意:')}   ${chalk.bold(session.prompt)}`);
    console.log(`  ${chalk.white('制度:')}   ${session.regime}`);
    console.log(`  ${chalk.white('模型:')}   ${session.model}`);
    console.log(`  ${chalk.white('时间:')}   ${new Date(session.startedAt).toLocaleString()}`);
    console.log(`  ${chalk.white('状态:')}   ${session.success ? chalk.green('成功') : chalk.red('失败')}`);
    console.log(`  ${chalk.white('目录:')}   ${chalk.gray(session.cwd)}`);

    // 步骤回放
    if (session.steps.length > 0) {
      console.log(chalk.bold('\n  执行步骤:'));
      for (const step of session.steps) {
        const icon = step.type === 'step_complete' ? chalk.green('✓')
          : step.type === 'step_failed' ? chalk.red('✗')
          : chalk.cyan('→');
        console.log(`    ${icon} [${step.agent}] ${step.task || step.status || ''}`);
      }
    }

    // 工具调用
    if (session.toolCalls.length > 0) {
      console.log(chalk.bold('\n  工具调用:'));
      for (const tc of session.toolCalls.slice(0, 20)) {
        console.log(chalk.gray(`    🔧 [${tc.agent}] ${tc.tool}(${JSON.stringify(tc.input || {}).slice(0, 60)})`));
      }
      if (session.toolCalls.length > 20) {
        console.log(chalk.gray(`    ... 还有 ${session.toolCalls.length - 20} 个工具调用`));
      }
    }

    // 输出
    if (session.outputs.length > 0) {
      console.log(chalk.bold('\n  输出:'));
      for (const out of session.outputs) {
        console.log(chalk.gray(`  ┌─ ${out.agent || '未知'} ─────────────`));
        const lines = (out.content || '').split('\n').slice(0, 15);
        for (const line of lines) {
          console.log(chalk.gray('  │ ') + chalk.white(line));
        }
        console.log(chalk.gray('  └──────────────────────'));
      }
    }

    // 费用
    if (session.cost) {
      console.log(chalk.gray(`\n  💰 费用: $${session.cost.total?.totalCostUsd?.toFixed(4) || '-'}`));
    }

    console.log();
  }

  /**
   * 生成周报
   * @returns {string} 周报内容
   */
  generateWeeklyReport() {
    const oneWeekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    const sessions = this.listSessions(100)
      .filter(s => new Date(s.startedAt).getTime() > oneWeekAgo);

    const totalSessions = sessions.length;
    const successSessions = sessions.filter(s => s.success).length;
    const totalCost = sessions.reduce((sum, s) => sum + (s.cost?.total?.totalCostUsd || 0), 0);

    // 按 Agent 统计
    const agentStats = {};
    for (const s of sessions) {
      for (const step of s.steps) {
        if (!agentStats[step.agent]) agentStats[step.agent] = { tasks: 0, success: 0 };
        agentStats[step.agent].tasks++;
        if (step.type === 'step_complete') agentStats[step.agent].success++;
      }
    }

    // 按日统计
    const dailyStats = {};
    for (const s of sessions) {
      const day = new Date(s.startedAt).toLocaleDateString();
      if (!dailyStats[day]) dailyStats[day] = 0;
      dailyStats[day]++;
    }

    console.log();
    console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
    console.log(chalk.yellow('  ║') + chalk.bold.yellow('    📊  本 周 周 报  📊') + '                               ' + chalk.yellow('║'));
    console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
    console.log();
    console.log(`  ${chalk.white('总旨意数:')}  ${chalk.cyan(totalSessions)}`);
    console.log(`  ${chalk.white('成功率:')}    ${totalSessions > 0 ? chalk.green(Math.round(successSessions / totalSessions * 100) + '%') : '-'}`);
    console.log(`  ${chalk.white('总花费:')}    ${chalk.yellow('$' + totalCost.toFixed(4))}`);

    console.log(chalk.bold('\n  每日工作量:'));
    for (const [day, count] of Object.entries(dailyStats)) {
      const bar = chalk.green('█'.repeat(Math.min(count, 30)));
      console.log(`    ${chalk.gray(day)} ${bar} ${count}`);
    }

    if (Object.keys(agentStats).length > 0) {
      console.log(chalk.bold('\n  大臣工作量排名:'));
      const sorted = Object.entries(agentStats).sort((a, b) => b[1].tasks - a[1].tasks);
      for (const [agent, stats] of sorted.slice(0, 10)) {
        const rate = stats.tasks > 0 ? Math.round(stats.success / stats.tasks * 100) : 0;
        console.log(`    ${chalk.cyan(agent.padEnd(14))} ${stats.tasks} 任务  成功率 ${rate}%`);
      }
    }

    // 本周旨意摘要
    if (sessions.length > 0) {
      console.log(chalk.bold('\n  本周旨意摘要:'));
      for (const s of sessions.slice(0, 10)) {
        const status = s.success ? chalk.green('✓') : chalk.red('✗');
        console.log(`    ${status} ${chalk.gray(new Date(s.startedAt).toLocaleDateString())} ${s.prompt.slice(0, 50)}`);
      }
      if (sessions.length > 10) {
        console.log(chalk.gray(`    ... 还有 ${sessions.length - 10} 条`));
      }
    }

    console.log();
  }

  /** @private */
  _save(sessionId, session) {
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
    fs.writeFileSync(filePath, JSON.stringify(session, null, 2));
  }

  /** @private */
  _load(sessionId) {
    const filePath = path.join(SESSION_DIR, `${sessionId}.json`);
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
      }
    } catch { /* ignore */ }
    return null;
  }
}

const sessionRecorder = new SessionRecorder();

module.exports = { SessionRecorder, sessionRecorder };
