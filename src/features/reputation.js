/**
 * 功勋系统 — Agent 经验值 & 声望
 *
 * Claude Code 没有的独创功能：
 * 每个 Agent 根据任务完成情况获得经验值，
 * 积累到一定程度可以"升官"（提升能力配置）。
 *
 * 品阶体系（明制）：
 *   从九品 → 正一品 → 太师/太傅/太保
 *   每升一级，增加更多的 maxTokens、并发数等
 *
 * 用法：
 *   /rank            查看百官功勋排行榜
 *   /rank bingbu     查看兵部详细战绩
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

// ─── 品阶定义 ─────────────────────────────────────────

const RANKS = [
  { level: 1,  title: '从九品',  emoji: '🟫', xpRequired: 0,     maxTokens: 2048,  bonus: '' },
  { level: 2,  title: '正九品',  emoji: '🟫', xpRequired: 50,    maxTokens: 2048,  bonus: '' },
  { level: 3,  title: '从八品',  emoji: '🟨', xpRequired: 120,   maxTokens: 3072,  bonus: '' },
  { level: 4,  title: '正八品',  emoji: '🟨', xpRequired: 200,   maxTokens: 3072,  bonus: '' },
  { level: 5,  title: '从七品',  emoji: '🟩', xpRequired: 350,   maxTokens: 4096,  bonus: '县令级' },
  { level: 6,  title: '正七品',  emoji: '🟩', xpRequired: 500,   maxTokens: 4096,  bonus: '知县级' },
  { level: 7,  title: '从六品',  emoji: '🟦', xpRequired: 750,   maxTokens: 6144,  bonus: '' },
  { level: 8,  title: '正六品',  emoji: '🟦', xpRequired: 1000,  maxTokens: 6144,  bonus: '' },
  { level: 9,  title: '从五品',  emoji: '🟪', xpRequired: 1500,  maxTokens: 8192,  bonus: '可开启并行' },
  { level: 10, title: '正五品',  emoji: '🟪', xpRequired: 2000,  maxTokens: 8192,  bonus: '' },
  { level: 11, title: '从四品',  emoji: '🟧', xpRequired: 3000,  maxTokens: 8192,  bonus: '' },
  { level: 12, title: '正四品',  emoji: '🟧', xpRequired: 4000,  maxTokens: 8192,  bonus: '知府级' },
  { level: 13, title: '从三品',  emoji: '🔴', xpRequired: 6000,  maxTokens: 16384, bonus: '' },
  { level: 14, title: '正三品',  emoji: '🔴', xpRequired: 8000,  maxTokens: 16384, bonus: '部院级' },
  { level: 15, title: '从二品',  emoji: '⭐', xpRequired: 12000, maxTokens: 16384, bonus: '' },
  { level: 16, title: '正二品',  emoji: '⭐', xpRequired: 16000, maxTokens: 32768, bonus: '总督级' },
  { level: 17, title: '从一品',  emoji: '🌟', xpRequired: 25000, maxTokens: 32768, bonus: '' },
  { level: 18, title: '正一品',  emoji: '🌟', xpRequired: 35000, maxTokens: 65536, bonus: '太子太师' },
  { level: 19, title: '太师',    emoji: '👑', xpRequired: 50000, maxTokens: 65536, bonus: '位极人臣' },
];

// ─── XP 奖惩规则 ──────────────────────────────────────

const XP_REWARDS = {
  task_complete: 10,       // 完成一个任务
  task_fast: 5,            // 快速完成（<10s）
  task_complex: 15,        // 复杂任务（多步骤）
  review_pass: 8,          // 通过审查
  debate_participate: 5,   // 参与廷议
  pk_win: 20,              // PK 获胜
  pk_participate: 5,       // 参与 PK
  streak_3: 10,            // 连续3次成功
  streak_5: 25,            // 连续5次成功
  first_tool: 3,           // 首次使用新工具
};

const XP_PENALTIES = {
  task_fail: -5,           // 任务失败
  security_blocked: -10,   // 被安全系统拦截
  over_budget: -8,         // 超预算
  timeout: -3,             // 超时
};

// ─── 存储路径 ─────────────────────────────────────────

const REPUTATION_DIR = path.join(process.env.HOME || '/tmp', '.tiangong', 'reputation');
const REPUTATION_FILE = path.join(REPUTATION_DIR, 'agents.json');

// ─── ReputationManager 类 ─────────────────────────────

class ReputationManager {
  constructor() {
    if (!fs.existsSync(REPUTATION_DIR)) {
      fs.mkdirSync(REPUTATION_DIR, { recursive: true });
    }
    this.data = this._load();
    this._cleanupInvalidIds();
  }

  /**
   * 校验 agent ID 是否合法（只允许英文、数字、下划线、连字符）
   */
  _isValidAgentId(id) {
    return typeof id === 'string' && id.length >= 2 && /^[a-zA-Z][a-zA-Z0-9_-]*$/.test(id);
  }

  /**
   * 清理非法 ID 条目（如中文名、截断字符等）
   */
  _cleanupInvalidIds() {
    let changed = false;
    for (const key of Object.keys(this.data)) {
      if (!this._isValidAgentId(key)) {
        delete this.data[key];
        changed = true;
      }
    }
    if (changed) this._save();
  }

  /**
   * 获取 Agent 的当前状态
   * @param {string} agentId
   * @returns {object}
   */
  getAgent(agentId) {
    // 拒绝非法 ID 写入
    if (!this._isValidAgentId(agentId)) {
      return { xp: 0, totalTasks: 0, successTasks: 0, failedTasks: 0, streak: 0, bestStreak: 0, toolsUsed: [], achievements: [], history: [] };
    }
    if (!this.data[agentId]) {
      this.data[agentId] = {
        xp: 0,
        totalTasks: 0,
        successTasks: 0,
        failedTasks: 0,
        streak: 0,
        bestStreak: 0,
        toolsUsed: [],
        achievements: [],
        history: [],
        createdAt: new Date().toISOString()
      };
      this._save();
    }
    return this.data[agentId];
  }

  /**
   * 获取 Agent 品阶
   * @param {string} agentId
   * @returns {object} 当前品阶信息
   */
  getRank(agentId) {
    const agent = this.getAgent(agentId);
    let rank = RANKS[0];
    for (const r of RANKS) {
      if (agent.xp >= r.xpRequired) {
        rank = r;
      } else {
        break;
      }
    }
    const nextRank = RANKS.find(r => r.xpRequired > agent.xp);
    const xpToNext = nextRank ? nextRank.xpRequired - agent.xp : 0;
    const progress = nextRank
      ? (agent.xp - rank.xpRequired) / (nextRank.xpRequired - rank.xpRequired)
      : 1;

    return {
      ...rank,
      xp: agent.xp,
      xpToNext,
      nextRank: nextRank || null,
      progress: Math.min(progress, 1)
    };
  }

  /**
   * 奖励经验值
   * @param {string} agentId
   * @param {string} reason - XP_REWARDS 中的 key
   * @param {object} [meta] - 额外信息
   * @returns {{ xpGained: number, levelUp: boolean, newRank?: object }}
   */
  reward(agentId, reason, meta = {}) {
    const agent = this.getAgent(agentId);
    const oldRank = this.getRank(agentId);
    const xp = XP_REWARDS[reason] || 0;

    agent.xp = (agent.xp || 0) + xp;
    agent.totalTasks++;
    if (reason === 'task_complete' || reason === 'task_fast' || reason === 'review_pass') {
      agent.successTasks++;
      agent.streak++;
      agent.bestStreak = Math.max(agent.bestStreak, agent.streak);

      // 连胜奖励
      if (agent.streak === 3) this.reward(agentId, 'streak_3');
      if (agent.streak === 5) this.reward(agentId, 'streak_5');
    }

    agent.history.push({
      type: 'reward',
      reason,
      xp,
      meta,
      at: new Date().toISOString()
    });

    // 保持历史记录在合理范围
    if (agent.history.length > 200) {
      agent.history = agent.history.slice(-200);
    }

    this._save();

    const newRank = this.getRank(agentId);
    const levelUp = newRank.level > oldRank.level;

    if (levelUp) {
      this._announcePromotion(agentId, oldRank, newRank);
    }

    return { xpGained: xp, levelUp, newRank: levelUp ? newRank : null };
  }

  /**
   * 惩罚经验值
   * @param {string} agentId
   * @param {string} reason
   */
  penalize(agentId, reason, meta = {}) {
    const agent = this.getAgent(agentId);
    const xp = XP_PENALTIES[reason] || 0;

    agent.xp = Math.max(0, (agent.xp || 0) + xp); // 不会降到 0 以下
    agent.failedTasks++;
    agent.streak = 0; // 断连

    agent.history.push({
      type: 'penalty',
      reason,
      xp,
      meta,
      at: new Date().toISOString()
    });

    this._save();
    return { xpLost: Math.abs(xp) };
  }

  /**
   * 打印排行榜
   */
  printLeaderboard() {
    const agents = Object.entries(this.data)
      .map(([id, data]) => ({ id, ...data, rank: this.getRank(id) }))
      .sort((a, b) => b.xp - a.xp);

    console.log();
    console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
    console.log(chalk.yellow('  ║') + chalk.bold.yellow('    🏆  功 勋 排 行 榜  🏆') + '                            ' + chalk.yellow('║'));
    console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
    console.log();

    if (agents.length === 0) {
      console.log(chalk.gray('  （暂无战绩，开始下旨吧！）'));
      console.log();
      return;
    }

    // 表头
    console.log(chalk.gray('  排名  品阶      大臣          XP      胜率    连胜'));
    console.log(chalk.gray('  ' + '─'.repeat(52)));

    for (let i = 0; i < agents.length; i++) {
      const a = agents[i];
      const rank = a.rank;
      const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `  ${i + 1}`;
      const winRate = a.totalTasks > 0
        ? `${Math.round(a.successTasks / a.totalTasks * 100)}%`
        : '-';

      // XP 进度条
      const barLen = 10;
      const filled = Math.round(barLen * rank.progress);
      const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(barLen - filled));

      console.log(
        `  ${medal}  ${rank.emoji} ${chalk.white(rank.title.padEnd(6))} ${chalk.cyan(a.id.padEnd(14))} ${chalk.yellow(String(a.xp).padStart(6))} ${bar}  ${winRate.padStart(4)}  ${a.bestStreak > 0 ? chalk.red('🔥' + a.bestStreak) : chalk.gray('-')}`
      );
    }
    console.log();
  }

  /**
   * 打印某个 Agent 的详细战绩
   * @param {string} agentId
   */
  printAgentDetail(agentId) {
    const agent = this.getAgent(agentId);
    const rank = this.getRank(agentId);

    console.log();
    console.log(chalk.yellow(`  ═══ ${agentId} 战绩 ${'═'.repeat(35)}`));
    console.log();
    console.log(`  ${rank.emoji} 品阶: ${chalk.bold(rank.title)} ${rank.bonus ? chalk.gray(`(${rank.bonus})`) : ''}`);
    console.log(`  ⭐ 经验: ${chalk.yellow(agent.xp)} XP`);

    if (rank.nextRank) {
      const barLen = 20;
      const filled = Math.round(barLen * rank.progress);
      const bar = chalk.green('█'.repeat(filled)) + chalk.gray('░'.repeat(barLen - filled));
      console.log(`  📊 进度: ${bar} → ${rank.nextRank.title} (还需 ${rank.xpToNext} XP)`);
    } else {
      console.log(`  📊 ${chalk.yellow.bold('已达最高品阶！')}`);
    }

    console.log();
    console.log(`  📋 总任务: ${agent.totalTasks}`);
    console.log(`  ✅ 成功: ${chalk.green(agent.successTasks)}`);
    console.log(`  ❌ 失败: ${chalk.red(agent.failedTasks)}`);
    console.log(`  🔥 最佳连胜: ${agent.bestStreak}`);
    console.log(`  🔧 使用工具: ${agent.toolsUsed.length > 0 ? agent.toolsUsed.join(', ') : '(无)'}`);

    // 最近战绩
    const recentHistory = agent.history.slice(-10);
    if (recentHistory.length > 0) {
      console.log(chalk.gray('\n  最近战绩:'));
      for (const h of recentHistory) {
        const icon = h.type === 'reward' ? chalk.green('+') : chalk.red('-');
        const xpStr = h.type === 'reward' ? chalk.green(`+${h.xp}`) : chalk.red(`${h.xp}`);
        console.log(chalk.gray(`    ${icon} ${xpStr} XP  ${h.reason}  ${chalk.gray(new Date(h.at).toLocaleString())}`));
      }
    }
    console.log();
  }

  /** @private 升官公告 */
  _announcePromotion(agentId, oldRank, newRank) {
    console.log();
    console.log(chalk.yellow('  ┌──────────────────────────────────────┐'));
    console.log(chalk.yellow('  │') + chalk.bold.red('  📣  升 官 啦 ！') + '                        ' + chalk.yellow('│'));
    console.log(chalk.yellow('  │') + chalk.white(`  ${agentId}: ${oldRank.title} → ${chalk.bold(newRank.title)}`) + ' '.repeat(Math.max(0, 22 - agentId.length - newRank.title.length)) + chalk.yellow('│'));
    if (newRank.bonus) {
      console.log(chalk.yellow('  │') + chalk.gray(`  特权: ${newRank.bonus}`) + ' '.repeat(Math.max(0, 30 - newRank.bonus.length)) + chalk.yellow('│'));
    }
    console.log(chalk.yellow('  └──────────────────────────────────────┘'));
    console.log();
  }

  /** @private */
  _load() {
    try {
      if (fs.existsSync(REPUTATION_FILE)) {
        return JSON.parse(fs.readFileSync(REPUTATION_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  /** @private */
  _save() {
    fs.writeFileSync(REPUTATION_FILE, JSON.stringify(this.data, null, 2));
  }
}

// 单例
const reputationManager = new ReputationManager();

module.exports = { ReputationManager, reputationManager, RANKS, XP_REWARDS, XP_PENALTIES };
