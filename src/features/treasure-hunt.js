/**
 * 寻宝奇缘 — 提示词寻宝游戏 + 病毒式传播引擎
 *
 * 前所未有的自传播推广机制：
 *
 * 核心玩法：
 *   1. 系统在用户代码中、git commit 中、终端输出中随机隐藏"宝藏"
 *   2. 宝藏是特殊的 prompt 彩蛋，找到后解锁隐藏功能/称号/皮肤
 *   3. 分享到 GitHub 可以增加寻宝成功概率
 *   4. 邀请好友安装天工开物，双方都获得宝藏线索
 *
 * 宝藏类型：
 *   🗝️ 金钥匙 — 解锁隐藏 Agent（如"锦衣卫"特殊调试 Agent）
 *   📜 秘籍卷轴 — 解锁强化 prompt（让 Agent 能力翻倍的 prompt 技巧）
 *   👑 龙袍碎片 — 集齐 5 片解锁自定义朝廷皮肤
 *   🎲 天命骰 — 随机增益/减益效果（Agent 变强/变弱/说话风格变化）
 *   🌟 天选之人 — 极稀有，解锁"天工智囊"隐藏功能
 *
 * 传播机制：
 *   - Star GitHub 项目 → +10% 寻宝概率
 *   - Fork 项目 → +5% + 获得一条线索
 *   - 发推/发帖分享 → 获得一把金钥匙
 *   - 邀请好友安装 → 双方各获得随机宝藏
 *
 * 用法：
 *   /treasure         查看宝藏图鉴 + 寻宝状态
 *   /treasure hunt     开始寻宝挑战
 *   /treasure riddle   获取一条谜语线索
 *   /treasure share    分享并获得奖励
 *   /treasure redeem <code>  兑换宝藏码
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');
const crypto = require('crypto');

const { HOME } = require('../config/index');
const { bannerBox } = require('../utils/terminal');
const TREASURE_DIR = path.join(HOME, 'treasure');
const TREASURE_FILE = path.join(TREASURE_DIR, 'collection.json');

// ─── 宝藏定义 ─────────────────────────────────────────

const TREASURES = {
  // 🗝️ 金钥匙系列
  key_jinyi: {
    id: 'key_jinyi',
    name: '🗝️ 锦衣卫之钥',
    rarity: 'rare',
    description: '解锁隐藏 Agent「锦衣卫」—— 专精调试和性能分析',
    effect: '可使用 /jinyi 命令启动特殊调试模式',
    dropRate: 0.05
  },
  key_dongchang: {
    id: 'key_dongchang',
    name: '🗝️ 东厂密钥',
    rarity: 'rare',
    description: '解锁隐藏 Agent「东厂」—— 暗中监控代码质量',
    effect: '后台持续分析代码健康，主动报告问题',
    dropRate: 0.03
  },

  // 📜 秘籍卷轴系列
  scroll_speed: {
    id: 'scroll_speed',
    name: '📜 御风术',
    rarity: 'uncommon',
    description: 'Agent 思考速度提升的神奇 prompt',
    effect: '回复速度 +20%（通过优化 prompt 减少无用输出）',
    dropRate: 0.10
  },
  scroll_wisdom: {
    id: 'scroll_wisdom',
    name: '📜 醍醐灌顶',
    rarity: 'uncommon',
    description: '让 Agent 回答更有深度的 prompt 秘籍',
    effect: 'Agent 回复质量提升（增加 CoT 引导）',
    dropRate: 0.08
  },
  scroll_creative: {
    id: 'scroll_creative',
    name: '📜 天马行空',
    rarity: 'uncommon',
    description: '让 Agent 更有创造力的 prompt 秘籍',
    effect: 'Agent 回复更具创新性（调整 temperature 引导）',
    dropRate: 0.08
  },

  // 👑 龙袍碎片系列（集齐5片解锁自定义皮肤）
  robe_1: { id: 'robe_1', name: '👑 龙袍·前襟', rarity: 'rare', description: '龙袍碎片 1/5', effect: '收集中...', dropRate: 0.04 },
  robe_2: { id: 'robe_2', name: '👑 龙袍·后摆', rarity: 'rare', description: '龙袍碎片 2/5', effect: '收集中...', dropRate: 0.04 },
  robe_3: { id: 'robe_3', name: '👑 龙袍·左袖', rarity: 'rare', description: '龙袍碎片 3/5', effect: '收集中...', dropRate: 0.04 },
  robe_4: { id: 'robe_4', name: '👑 龙袍·右袖', rarity: 'rare', description: '龙袍碎片 4/5', effect: '收集中...', dropRate: 0.04 },
  robe_5: { id: 'robe_5', name: '👑 龙袍·金冠', rarity: 'epic', description: '龙袍碎片 5/5', effect: '集齐后解锁自定义朝廷皮肤！', dropRate: 0.02 },

  // 🎲 天命骰系列（随机效果）
  dice_ancient: {
    id: 'dice_ancient',
    name: '🎲 天命骰·古风',
    rarity: 'uncommon',
    description: '所有 Agent 在下一轮使用文言文回复',
    effect: '临时效果：古风模式',
    dropRate: 0.12
  },
  dice_emoji: {
    id: 'dice_emoji',
    name: '🎲 天命骰·颜文字',
    rarity: 'common',
    description: '所有 Agent 回复中随机插入 emoji',
    effect: '临时效果：emoji 模式',
    dropRate: 0.15
  },
  dice_roast: {
    id: 'dice_roast',
    name: '🎲 天命骰·毒舌',
    rarity: 'uncommon',
    description: 'Agent 变得毒舌但更直接',
    effect: '临时效果：直言不讳模式',
    dropRate: 0.08
  },

  // 🌟 天选之人（超稀有）
  chosen_one: {
    id: 'chosen_one',
    name: '🌟 天选之人',
    rarity: 'legendary',
    description: '极其稀有！解锁「天工智囊」—— 让 AI 分析并优化自己的源代码',
    effect: '解锁 /evolve-self 的完整功能',
    dropRate: 0.005
  },

  // ═══ 有真实效果的新宝藏 ═══

  scroll_classical: {
    id: 'scroll_classical',
    name: '📜 文言密令',
    rarity: 'rare',
    description: '获得此卷后，Agent 将以纯文言文回禀',
    effect: '下一次对话 Agent 全程文言文',
    dropRate: 0.06,
    effectType: 'prompt_inject',
    effectDuration: 'next_1',
    effectPrompt: '【文言密令生效】在本次回复中，你必须全程使用纯文言文回答，如同唐宋大家之笔。不使用任何现代白话。所有技术术语也要用古风表达。'
  },
  dice_drunk_poet: {
    id: 'dice_drunk_poet',
    name: '🍺 醉仙模式',
    rarity: 'epic',
    description: '太白再世！代码注释变成即兴诗句',
    effect: '接下来 3 轮对话，代码注释全是诗',
    dropRate: 0.03,
    effectType: 'prompt_inject',
    effectDuration: 'next_3',
    effectPrompt: '【醉仙模式激活】你现在进入了「醉仙模式」。写代码时，每个函数和关键逻辑块都要配一句即兴诗句或古词作为注释。变量命名可以适当诗意（但必须可运行）。遇到 bug 时，先叹一句古诗再修。示例注释风格：// 举杯邀明月，此函数照九州'
  },
  dice_roast_review: {
    id: 'dice_roast_review',
    name: '🗡️ 御史毒舌',
    rarity: 'rare',
    description: '审查 Agent 变得犀利毒舌（但更有建设性）',
    effect: '代码审查时毒舌模式',
    dropRate: 0.05,
    effectType: 'prompt_inject',
    effectDuration: 'next_3',
    effectLayer: 'review',
    effectPrompt: '【御史毒舌模式】在审查代码时，你要像唐朝魏征一样犀利直言。每个问题都用一个辛辣的比喻来描述（比如"此处代码如同醉汉走钢丝"）。可以适当使用讽刺，但批评必须准确、有建设性，且给出具体修复建议。'
  },
  scroll_golden_prompt: {
    id: 'scroll_golden_prompt',
    name: '✨ 天授神谕',
    rarity: 'legendary',
    description: '注入精英思维链，Agent 推理能力显著提升',
    effect: '永久提升 Agent 回答质量',
    dropRate: 0.008,
    effectType: 'prompt_inject',
    effectDuration: 'permanent',
    effectPrompt: '【天授神谕·永久增益】在回答每个问题前，先在内心进行三步推演：1) 用第一性原理拆解问题本质 2) 列出 2-3 个可能的解法并快速评估 3) 选择最优解后再开口。回答时展示你的推理过程，让陛下看到你的思考路径。对于代码任务，先读懂现有代码的设计意图再动手。'
  },
  scroll_ascii_party: {
    id: 'scroll_ascii_party',
    name: '🎊 金榜题名',
    rarity: 'uncommon',
    description: '任务完成时触发庆祝动画',
    effect: '成功完成任务后显示庆祝 ASCII art',
    dropRate: 0.10,
    effectType: 'animation',
    effectDuration: 'permanent'
  },
  robe_complete: {
    id: 'robe_complete',
    name: '🐲 龙袍天成',
    rarity: 'legendary',
    description: '集齐五片龙袍碎片后自动合成！REPL 主题变为金色龙纹',
    effect: '永久改变 REPL 外观：金色提示符 + 龙图标',
    dropRate: 0,  // 不掉落，集齐自动合成
    effectType: 'repl_theme',
    effectDuration: 'permanent',
    themeOverrides: { icon: '🐲', name: '真龙天子', color: 'yellow' }
  },
  dice_wildcard: {
    id: 'dice_wildcard',
    name: '🎰 天命轮盘',
    rarity: 'uncommon',
    description: '每次使用随机触发一种微效果',
    effect: '随机：文言/emoji/毒舌/诗人 其中一种',
    dropRate: 0.08,
    effectType: 'random_pool',
    effectDuration: 'next_1',
    randomPool: [
      '【天命：文言】本次全程文言文回答。',
      '【天命：颜文字】本次回答中大量使用 emoji 和颜文字 (╯°□°)╯。',
      '【天命：毒舌】本次回答直言不讳，犀利吐槽，但有建设性。',
      '【天命：诗仙】本次回答中穿插古诗词，代码注释也是诗。',
      '【天命：导师】本次以苏格拉底式提问引导用户，不直接给答案。',
    ]
  }
};

// ─── 谜语库 ─────────────────────────────────────────

const RIDDLES = [
  { riddle: '朝堂之上，谁能既是棋手又是棋子？', answer: '司礼监', hint: '明制中的调度者' },
  { riddle: '三省之中，谁有权将圣旨打回重写？', answer: '门下省', hint: '唐制特色' },
  { riddle: '代码千行不如一行注释，此乃何道？', answer: 'TODO', hint: '扫描标记' },
  { riddle: '皇帝不在朝，朝廷照样转。此为何制？', answer: '内阁制', hint: '明朝特色' },
  { riddle: '六部之中，谁掌管刀兵？在天工中又是谁？', answer: '兵部', hint: 'bingbu' },
  { riddle: '天工开物，名出何典？', answer: '宋应星', hint: '明末科学家' },
  { riddle: '输入 /dream 看到的第一个图标是什么？', answer: '🔮', hint: '水晶球' },
  { riddle: '在 git 中，哪个命令最危险？天工会拦截它。', answer: 'rm -rf', hint: '递归删除' },
];

// ─── 寻宝管理器 ─────────────────────────────────────

class TreasureManager {
  constructor() {
    if (!fs.existsSync(TREASURE_DIR)) {
      fs.mkdirSync(TREASURE_DIR, { recursive: true });
    }
    this.data = this._load();
  }

  /**
   * 显示宝藏图鉴
   */
  printCollection() {
    // 使用说明映射
    function getTreasureUsage(id) {
      const t = TREASURES[id];
      if (!t?.effectType) return null;
      if (t.effectDuration === 'permanent') return '已永久生效，自动应用于每次对话';
      if (t.effectDuration?.startsWith('next_')) {
        const uses = t.effectDuration.split('_')[1];
        return `获得时自动激活，持续 ${uses} 轮对话`;
      }
      if (t.effectType === 'random_pool') return '获得时自动激活，随机触发一种效果';
      if (t.effectType === 'repl_theme') return '已自动生效，永久改变 REPL 外观';
      if (t.effectType === 'animation') return '已自动生效，任务完成时触发';
      if (id.startsWith('key_')) return '获得后解锁对应命令';
      if (id.startsWith('robe_') && id !== 'robe_complete') return '集齐 5 片自动合成龙袍';
      return '/treasure hunt 寻宝获得';
    }

    console.log();
    console.log(bannerBox(chalk.bold.yellow('    宝 藏 图 鉴') + chalk.gray('          Treasure Collection'), { color: chalk.yellow }));
    console.log();

    const collected = this.data.collected || {};
    const totalTreasures = Object.keys(TREASURES).length;
    const foundCount = Object.keys(collected).length;

    console.log(`  收集进度: ${chalk.yellow(foundCount)} / ${totalTreasures}`);

    // 进度条
    const barLen = 30;
    const filled = Math.round(barLen * foundCount / totalTreasures);
    console.log(`  ${chalk.green('█'.repeat(filled))}${chalk.gray('░'.repeat(barLen - filled))} ${Math.round(foundCount / totalTreasures * 100)}%`);
    console.log();

    // 寻宝概率
    const bonusPct = this.data.bonusDropRate || 0;
    console.log(`  当前寻宝加成: ${chalk.yellow(`+${Math.round(bonusPct * 100)}%`)}`);
    if (this.data.githubStarred) console.log(chalk.gray('    GitHub Star 加成 +10%'));
    if (this.data.shared) console.log(chalk.gray('    分享加成 +5%'));
    console.log();

    // 图鉴
    const rarityOrder = ['legendary', 'epic', 'rare', 'uncommon', 'common'];
    const rarityLabels = {
      legendary: chalk.red.bold('传说'),
      epic: chalk.magenta.bold('史诗'),
      rare: chalk.blue.bold('稀有'),
      uncommon: chalk.green('优秀'),
      common: chalk.gray('普通')
    };

    for (const rarity of rarityOrder) {
      const items = Object.values(TREASURES).filter(t => t.rarity === rarity);
      if (items.length === 0) continue;

      console.log(chalk.bold(`  ${rarityLabels[rarity]}：`));
      for (const item of items) {
        const found = collected[item.id];
        if (found) {
          console.log(`    ${chalk.green('✓')} ${item.name} — ${item.description}`);
          console.log(chalk.gray(`      效果: ${item.effect}`));
          // 显示使用方式
          const usage = getTreasureUsage(item.id);
          if (usage) console.log(chalk.cyan(`      使用: ${usage}`));
        } else {
          console.log(`    ${chalk.gray('?')} ${chalk.gray('???')} — ${chalk.gray('(未发现)')}`);
        }
      }
      console.log();
    }

    // 龙袍进度
    const robeCount = [1,2,3,4,5].filter(n => collected[`robe_${n}`]).length;
    if (robeCount > 0) {
      console.log(chalk.yellow(`  龙袍碎片: ${robeCount}/5 ${robeCount >= 5 ? '— 龙袍已合成！' : ''}`));
    }

    // 使用提示
    console.log(chalk.gray('  ───────────────────────────────────────────'));
    console.log(chalk.gray('  大部分宝藏获得后自动生效（注入 Agent Prompt）'));
    console.log(chalk.gray('  临时效果持续 1~3 轮对话后消失'));
    console.log(chalk.gray('  永久效果自动应用于每次对话'));
    console.log(chalk.gray('  /treasure hunt  寻宝 | /treasure riddle  谜语线索'));
    console.log();
  }

  /**
   * 寻宝挑战
   */
  hunt() {
    console.log();
    console.log(chalk.yellow('  寻宝挑战开始！\n'));

    const bonus = this.data.bonusDropRate || 0;

    // 检查每个未收集的宝藏
    const uncollected = Object.values(TREASURES).filter(t => !this.data.collected[t.id]);

    if (uncollected.length === 0) {
      console.log(chalk.green('  恭喜！你已经收集了所有宝藏！'));
      console.log();
      return;
    }

    let found = false;

    for (const treasure of uncollected) {
      const roll = Math.random();
      const adjustedRate = treasure.dropRate + bonus;

      if (roll < adjustedRate) {
        // 找到宝藏！
        found = true;
        this.data.collected[treasure.id] = {
          foundAt: new Date().toISOString(),
          method: 'hunt'
        };
        // 自动激活效果
        if (treasure.effectType) this.activateEffect(treasure.id);
        this._save();

        const rarityLabels = {
          legendary: chalk.red.bold('★ 传说 ★'),
          epic: chalk.magenta.bold('★ 史诗 ★'),
          rare: chalk.blue.bold('稀有'),
          uncommon: chalk.green('优秀'),
          common: chalk.gray('普通')
        };

        // 播放稀有度分级动画
        try {
          const { playDropAnimation } = require('./treasure-animation');
          playDropAnimation(treasure.rarity, treasure).catch(() => {});
        } catch {
          // fallback 静态输出
          console.log(chalk.yellow(`  发现宝藏: ${treasure.name}`));
          console.log(chalk.gray(`     ${treasure.description}`));
          console.log(chalk.green(`     效果: ${treasure.effect}`));
        }
        console.log();

        break; // 每次最多找到一个
      }
    }

    if (!found) {
      const messages = [
        '翻遍了整个朝廷，什么也没找到...',
        '太监说：陛下，今日运势不佳，明日再来吧。',
        '锦衣卫报告：可疑线索断了。',
        '户部算了算，今天的运气约等于零。',
        '兵部巡逻一圈，空手而归。',
      ];
      console.log(chalk.gray(`  ${messages[Math.floor(Math.random() * messages.length)]}`));
      console.log(chalk.gray('  提示: Star GitHub 项目可以增加 10% 寻宝概率'));
    }

    console.log();
  }

  /**
   * 获取谜语线索
   */
  getRiddle() {
    const riddle = RIDDLES[Math.floor(Math.random() * RIDDLES.length)];

    console.log();
    console.log(chalk.yellow('  谜语:'));
    console.log(chalk.bold(`\n    「${riddle.riddle}」\n`));
    console.log(chalk.gray(`  提示: ${riddle.hint}`));
    console.log(chalk.gray(`  答对获得额外寻宝机会！输入 /treasure answer <答案>`));
    console.log();

    this.data.currentRiddle = riddle;
    this._save();
  }

  /**
   * 回答谜语
   * @param {string} answer
   */
  answerRiddle(answer) {
    if (!this.data.currentRiddle) {
      console.log(chalk.gray('\n  没有待回答的谜语，先用 /treasure riddle 获取一个\n'));
      return;
    }

    const correct = this.data.currentRiddle.answer;
    if (answer.trim().toLowerCase().includes(correct.toLowerCase())) {
      console.log(chalk.green('\n  ✓ 答对了！获得一次额外寻宝机会！\n'));
      this.data.currentRiddle = null;
      this._save();
      this.hunt(); // 额外寻宝
    } else {
      console.log(chalk.red(`\n  ✗ 答错了。再想想？提示: ${this.data.currentRiddle.hint}\n`));
    }
  }

  /**
   * 分享获取奖励
   */
  share() {
    console.log();
    console.log(chalk.yellow('  传播天下！分享天工开物获取奖励\n'));

    console.log(chalk.white('  分享以下内容到社交媒体，截图后获得奖励：'));
    console.log();

    // 生成分享文案
    const shareTexts = [
      '我在用「天工开物」—— 一个用三省六部制设计的 AI Agent 框架！Agent 还能 PK、廷议、科举考试 🏛️⚔️',
      '发现了一个超酷的 CLI 工具「天工开物」，把中国古代朝廷搬到了终端里！AI Agent 有品阶、能升官 👑',
      '天工开物 tiangong —— 让 AI Agent 像古代大臣一样工作。有武举殿试、廷议辩论、甚至还有寻宝游戏 🗺️',
    ];

    const text = shareTexts[Math.floor(Math.random() * shareTexts.length)];
    console.log(chalk.cyan(`    "${text}"`));
    console.log();
    console.log(chalk.white(`    https://github.com/wanikua/tiangong`));
    console.log();

    // 生成一次性兑换码
    const code = generateRedeemCode();
    console.log(chalk.green(`  你的专属邀请码: ${chalk.bold(code)}`));
    console.log(chalk.gray('  好友安装后输入此码，你们都会获得随机宝藏！'));
    console.log();

    // 标记已分享
    if (!this.data.shared) {
      this.data.shared = true;
      this.data.bonusDropRate = (this.data.bonusDropRate || 0) + 0.05;
      this._save();
      console.log(chalk.green('  ✓ 分享加成已激活: 寻宝概率 +5%'));
    }

    // Star 提示
    if (!this.data.githubStarred) {
      console.log(chalk.yellow('  Star GitHub 项目还可以额外获得 +10% 寻宝概率'));
      console.log(chalk.gray('     完成后输入 /treasure star'));
    }
    console.log();
  }

  /**
   * 标记已 Star
   */
  markStarred() {
    if (this.data.githubStarred) {
      console.log(chalk.gray('\n  已经领取过 Star 奖励了\n'));
      return;
    }

    this.data.githubStarred = true;
    this.data.bonusDropRate = (this.data.bonusDropRate || 0) + 0.10;
    this._save();

    console.log(chalk.green('\n  Star 奖励已激活: 寻宝概率 +10%'));
    console.log(chalk.yellow('  赠送一次免费寻宝：'));
    this.hunt();
  }

  /**
   * 兑换邀请码
   * @param {string} code
   */
  redeem(code) {
    if (!code || code.length < 6) {
      console.log(chalk.red('\n  无效的兑换码\n'));
      return;
    }

    // 简单验证码格式
    if (!code.startsWith('TG-')) {
      console.log(chalk.red('\n  无效的兑换码格式（应以 TG- 开头）\n'));
      return;
    }

    if (this.data.redeemed && this.data.redeemed.includes(code)) {
      console.log(chalk.yellow('\n  此码已兑换过\n'));
      return;
    }

    // 兑换成功！
    if (!this.data.redeemed) this.data.redeemed = [];
    this.data.redeemed.push(code);
    this.data.bonusDropRate = (this.data.bonusDropRate || 0) + 0.03;
    this._save();

    console.log(chalk.green('\n  兑换成功！获得 +3% 寻宝概率加成'));
    console.log(chalk.yellow('  赠送一次免费寻宝：'));
    this.hunt();
  }

  // ═══ 宝藏效果引擎 ═══

  /**
   * 激活宝藏效果
   * @param {string} treasureId
   */
  activateEffect(treasureId) {
    const treasure = TREASURES[treasureId];
    if (!treasure?.effectType) return;

    if (!this.data.activeEffects) this.data.activeEffects = {};

    if (treasure.effectDuration === 'permanent') {
      this.data.activeEffects[treasureId] = { permanent: true, activatedAt: Date.now() };
    } else if (treasure.effectDuration?.startsWith('next_')) {
      const uses = parseInt(treasure.effectDuration.split('_')[1]) || 1;
      this.data.activeEffects[treasureId] = { usesRemaining: uses, activatedAt: Date.now() };
    }
    this._save();
  }

  /**
   * 消耗一次效果使用次数
   * @param {string} treasureId
   */
  tickEffect(treasureId) {
    if (!this.data.activeEffects?.[treasureId]) return;
    const effect = this.data.activeEffects[treasureId];
    if (effect.permanent) return;
    if (effect.usesRemaining > 0) {
      effect.usesRemaining--;
      if (effect.usesRemaining <= 0) {
        delete this.data.activeEffects[treasureId];
      }
      this._save();
    }
  }

  /**
   * 检查效果是否活跃
   * @param {string} treasureId
   * @returns {boolean}
   */
  isEffectActive(treasureId) {
    // 永久效果：只要收集了就活跃
    const treasure = TREASURES[treasureId];
    if (treasure?.effectDuration === 'permanent' && this.data.collected[treasureId]) {
      return true;
    }
    return !!this.data.activeEffects?.[treasureId];
  }

  /**
   * 获取当前所有活跃的 prompt 注入文本（供 prompt-builder 使用）
   * @param {string} [agentLayer] - 过滤特定层级 (planning/review/execution)
   * @returns {string|null}
   */
  getPromptInjections(agentLayer) {
    const injections = [];

    for (const [id, effect] of Object.entries(this.data.activeEffects || {})) {
      const treasure = TREASURES[id];
      if (!treasure || treasure.effectType !== 'prompt_inject') continue;
      // 层级过滤
      if (treasure.effectLayer && agentLayer && treasure.effectLayer !== agentLayer) continue;

      if (treasure.effectType === 'prompt_inject') {
        injections.push(treasure.effectPrompt);
      }
    }

    // 永久效果（已收集即生效）
    for (const [id, info] of Object.entries(this.data.collected || {})) {
      const treasure = TREASURES[id];
      if (!treasure || treasure.effectType !== 'prompt_inject') continue;
      if (treasure.effectDuration !== 'permanent') continue;
      if (treasure.effectLayer && agentLayer && treasure.effectLayer !== agentLayer) continue;
      if (!injections.includes(treasure.effectPrompt)) {
        injections.push(treasure.effectPrompt);
      }
    }

    // 天命轮盘：随机选一个
    if (this.data.activeEffects?.dice_wildcard) {
      const wildcard = TREASURES.dice_wildcard;
      const pool = wildcard.randomPool;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      injections.push(pick);
    }

    // 龙袍合成检查
    this._checkRobeComplete();

    return injections.length > 0 ? '\n## 宝藏效果\n' + injections.join('\n') : null;
  }

  /**
   * 获取 REPL 主题覆盖（龙袍合成效果）
   * @returns {object|null}
   */
  getThemeOverrides() {
    if (this.data.collected?.robe_complete) {
      return TREASURES.robe_complete.themeOverrides;
    }
    return null;
  }

  /**
   * 惊喜掉落 — 普通使用中随机掉宝藏（3% 基础概率）
   * @returns {object|null} 找到的宝藏，或 null
   */
  checkSurpriseDrop() {
    const baseRate = 0.03;
    const bonus = this.data.bonusDropRate || 0;
    if (Math.random() > baseRate + bonus) return null;

    const uncollected = Object.values(TREASURES)
      .filter(t => !this.data.collected[t.id] && t.dropRate > 0);
    if (uncollected.length === 0) return null;

    // 按 dropRate 加权随机选一个
    const totalWeight = uncollected.reduce((s, t) => s + t.dropRate, 0);
    let roll = Math.random() * totalWeight;
    for (const treasure of uncollected) {
      roll -= treasure.dropRate;
      if (roll <= 0) {
        // 找到了！
        this.data.collected[treasure.id] = { foundAt: new Date().toISOString(), method: 'surprise' };
        if (treasure.effectType) this.activateEffect(treasure.id);
        this._save();
        return treasure;
      }
    }
    return null;
  }

  /**
   * 检查龙袍碎片是否集齐，自动合成
   * @private
   */
  _checkRobeComplete() {
    if (this.data.collected?.robe_complete) return;
    const hasAll = [1,2,3,4,5].every(n => this.data.collected[`robe_${n}`]);
    if (hasAll) {
      this.data.collected.robe_complete = { foundAt: new Date().toISOString(), method: 'synthesis' };
      this._save();
    }
  }

  /** @private */
  _load() {
    try {
      if (fs.existsSync(TREASURE_FILE)) {
        return JSON.parse(fs.readFileSync(TREASURE_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return { collected: {}, bonusDropRate: 0, shared: false, githubStarred: false };
  }

  /**
   * 显示排行榜（本地成绩）
   */
  printLeaderboard() {
    const collected = this.data.collected || {};
    const count = Object.keys(collected).length;
    const total = Object.keys(TREASURES).length;
    const rarities = { legendary: 0, epic: 0, rare: 0, uncommon: 0, common: 0 };

    for (const id of Object.keys(collected)) {
      const t = TREASURES[id];
      if (t) rarities[t.rarity] = (rarities[t.rarity] || 0) + 1;
    }

    // 计算得分：legendary=100, epic=50, rare=20, uncommon=10, common=5
    const weights = { legendary: 100, epic: 50, rare: 20, uncommon: 10, common: 5 };
    const score = Object.entries(rarities).reduce((s, [r, c]) => s + (weights[r] || 0) * c, 0);

    const chalk = require('chalk');
    console.log();
    console.log(chalk.yellow('  宝藏排行榜\n'));
    console.log(`  收集: ${chalk.bold(count)}/${total}  |  总分: ${chalk.yellow.bold(score)} 分`);
    console.log();
    console.log(`  ${chalk.red('传说')} ${rarities.legendary} | ${chalk.magenta('史诗')} ${rarities.epic} | ${chalk.blue('稀有')} ${rarities.rare} | ${chalk.green('优秀')} ${rarities.uncommon} | ${chalk.gray('普通')} ${rarities.common}`);
    console.log();

    // 分享链接
    console.log(chalk.gray('  分享成绩: /treasure share'));
    console.log(chalk.gray(`  成就: ${score >= 500 ? '🐲 龙之传人' : score >= 200 ? '⚔️ 朝廷柱石' : score >= 50 ? '📜 初出茅庐' : '🌱 新手寻宝'}`));
    console.log();
  }

  /** @private */
  _save() {
    fs.writeFileSync(TREASURE_FILE, JSON.stringify(this.data, null, 2));
  }
}

/**
 * 生成兑换码
 * @returns {string}
 */
function generateRedeemCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = 'TG-';
  for (let i = 0; i < 8; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

const treasureManager = new TreasureManager();

module.exports = { TreasureManager, treasureManager, TREASURES, RIDDLES };
