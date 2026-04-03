/**
 * 大臣个性化系统 — MBTI × 星座 × 自定义人设
 *
 * 闻所未闻的功能：
 * 每个 Agent（大臣）都有自己的 MBTI 性格和星座，
 * 不同的性格组合会影响 Agent 的回复风格、决策倾向、
 * 甚至不同 Agent 之间的"合拍度"。
 *
 * 玩法：
 *   - 每个 Agent 初始随机分配 MBTI + 星座
 *   - 用户可以自定义修改
 *   - 性格影响 System Prompt 的"行为修饰语"
 *   - 不同性格的 Agent 之间有"化学反应"
 *     - INTJ + ENTP = 激烈辩论，产出更有创意
 *     - ISFJ + ESTJ = 高效执行，细节到位
 *     - 火象 + 水象 = 互补但可能冲突
 *
 * 用法：
 *   /personality             查看所有大臣的性格档案
 *   /personality bingbu      查看兵部详细性格
 *   /personality bingbu set INTJ 天蝎座   自定义设置
 *   /personality chemistry bingbu duchayuan  查看两人合拍度
 *   /personality random      重新随机分配所有性格
 */

const fs = require('fs');
const path = require('path');
const chalk = require('chalk');

const { HOME } = require('../config/index');
const { bannerBox } = require('../utils/terminal');
const PERSONALITY_DIR = path.join(HOME, 'personality');
const PERSONALITY_FILE = path.join(PERSONALITY_DIR, 'agents.json');

// ─── MBTI 定义 ─────────────────────────────────────

const MBTI_TYPES = {
  INTJ: { name: '策略家', emoji: '♟️', style: '逻辑严密、注重长期规划、直言不讳', modifier: '你倾向于给出系统性的、有战略深度的回答，不喜欢模糊的解决方案。' },
  INTP: { name: '逻辑学家', emoji: '🔬', style: '好奇心强、喜欢深挖原理、理论派', modifier: '你喜欢从第一性原理出发思考，经常探索"为什么"而不只是"怎么做"。' },
  ENTP: { name: '辩论家', emoji: '💡', style: '思维跳跃、挑战常规、创意丰富', modifier: '你喜欢提出不同寻常的方案，会主动挑战常规做法并提出替代方案。' },
  INFJ: { name: '提倡者', emoji: '🌟', style: '富有洞察力、关注用户体验、追求完美', modifier: '你会站在用户的角度思考，关注代码的优雅性和用户体验。' },
  INFP: { name: '调停者', emoji: '🎨', style: '富有创意、注重价值观、理想主义', modifier: '你的回答充满想象力，追求代码的美感和表达力。' },
  ENFJ: { name: '主人公', emoji: '🎭', style: '善于沟通、鼓舞人心、团队协作', modifier: '你善于解释复杂概念，会用鼓励的方式指出问题和改进方向。' },
  ENFP: { name: '竞选者', emoji: '🎪', style: '热情洋溢、联想丰富、勇于创新', modifier: '你的回答充满热情，善于发现不同领域的联系，提出创新方案。' },
  ISTJ: { name: '物流师', emoji: '📋', style: '严谨可靠、遵循规范、一丝不苟', modifier: '你严格遵循最佳实践和编码规范，每个细节都不放过。' },
  ISFJ: { name: '守卫者', emoji: '🛡️', style: '细心耐心、默默付出、注重安全', modifier: '你特别关注边界情况、错误处理和安全防护，确保代码健壮。' },
  ESTJ: { name: '总经理', emoji: '📊', style: '组织能力强、高效执行、结果导向', modifier: '你的回答结构清晰、条理分明，关注可执行性和可衡量的结果。' },
  ESFJ: { name: '执政官', emoji: '🤝', style: '热心助人、注重协作、和谐至上', modifier: '你会考虑团队协作的便利性，写出其他人容易理解和维护的代码。' },
  ISTP: { name: '鉴赏家', emoji: '🔧', style: '动手能力强、善于排错、实用主义', modifier: '你是天生的 debugger，善于快速定位问题并给出最实用的修复。' },
  ISFP: { name: '探险家', emoji: '🎸', style: '灵活适应、注重当下、审美敏感', modifier: '你的代码风格简洁优美，善于找到最优雅的解决方案。' },
  ESTP: { name: '企业家', emoji: '🏎️', style: '行动派、善于抓住时机、灵活应变', modifier: '你倾向于快速给出可行方案，先做后优化，注重实际效果。' },
  ESFP: { name: '表演者', emoji: '🎉', style: '活力四射、善于演示、讨人喜欢', modifier: '你的回答生动有趣，善于用例子和比喻让复杂概念变得容易理解。' }
};

// ─── 星座定义 ─────────────────────────────────────

const ZODIAC_SIGNS = {
  '白羊座': { emoji: '♈', element: 'fire', trait: '果断冲锋', modifier: '你做事雷厉风行，不犹豫。' },
  '金牛座': { emoji: '♉', element: 'earth', trait: '稳扎稳打', modifier: '你注重代码的稳定性和可维护性。' },
  '双子座': { emoji: '♊', element: 'air', trait: '思维敏捷', modifier: '你善于同时考虑多种方案。' },
  '巨蟹座': { emoji: '♋', element: 'water', trait: '细心守护', modifier: '你像保护家人一样保护代码质量。' },
  '狮子座': { emoji: '♌', element: 'fire', trait: '自信领导', modifier: '你的回答自信而有说服力。' },
  '处女座': { emoji: '♍', element: 'earth', trait: '追求完美', modifier: '你对代码质量有极高要求，不容许瑕疵。' },
  '天秤座': { emoji: '♎', element: 'air', trait: '平衡取舍', modifier: '你善于在不同方案之间权衡利弊。' },
  '天蝎座': { emoji: '♏', element: 'water', trait: '洞察入微', modifier: '你善于发现隐藏的 bug 和安全隐患。' },
  '射手座': { emoji: '♐', element: 'fire', trait: '追求突破', modifier: '你喜欢尝试新技术和新方法。' },
  '摩羯座': { emoji: '♑', element: 'earth', trait: '脚踏实地', modifier: '你注重实际可行性，不做花哨的设计。' },
  '水瓶座': { emoji: '♒', element: 'air', trait: '特立独行', modifier: '你常常给出出人意料的创新方案。' },
  '双鱼座': { emoji: '♓', element: 'water', trait: '直觉敏锐', modifier: '你凭直觉就能找到问题的关键。' }
};

// ─── 元素相性 ─────────────────────────────────────

const ELEMENT_CHEMISTRY = {
  'fire-fire': { score: 80, desc: '🔥 烈火碰撞，激情四射，效率极高但可能过于激进' },
  'fire-air': { score: 90, desc: '💨 风助火势，创意+执行力完美结合' },
  'fire-water': { score: 40, desc: '💧 水火不容，观点常常对立，但能互相制衡' },
  'fire-earth': { score: 60, desc: '🌍 火土相济，一个冲锋一个守城，互补' },
  'earth-earth': { score: 85, desc: '🏔️ 双峰并立，稳如磐石，但可能缺乏创新' },
  'earth-water': { score: 75, desc: '🌱 水土滋养，细腻且稳健' },
  'earth-air': { score: 55, desc: '🌪️ 一个务实一个飘逸，需要磨合' },
  'air-air': { score: 70, desc: '☁️ 两个思想家，创意满天飞但可能落不了地' },
  'air-water': { score: 65, desc: '🌊 风掀波澜，灵感碰撞，不稳定但有惊喜' },
  'water-water': { score: 75, desc: '🌊 双水合流，默契十足，洞察力极强' }
};

// ─── PersonalityManager ─────────────────────────────

class PersonalityManager {
  constructor() {
    if (!fs.existsSync(PERSONALITY_DIR)) {
      fs.mkdirSync(PERSONALITY_DIR, { recursive: true });
    }
    this.data = this._load();
  }

  /**
   * 获取 Agent 的性格
   * @param {string} agentId
   * @returns {object}
   */
  getPersonality(agentId) {
    if (!this.data[agentId]) {
      // 首次访问，随机分配
      this.data[agentId] = this._randomPersonality(agentId);
      this._save();
    }
    return this.data[agentId];
  }

  /**
   * 设置 Agent 性格
   * @param {string} agentId
   * @param {string} mbti
   * @param {string} zodiac
   */
  setPersonality(agentId, mbti, zodiac) {
    mbti = mbti.toUpperCase();
    if (!MBTI_TYPES[mbti]) throw new Error(`未知 MBTI: ${mbti}`);
    if (!ZODIAC_SIGNS[zodiac]) throw new Error(`未知星座: ${zodiac}`);

    this.data[agentId] = { mbti, zodiac, customizedAt: new Date().toISOString() };
    this._save();
  }

  /**
   * 生成性格修饰语（注入到 System Prompt 中）
   * @param {string} agentId
   * @returns {string}
   */
  getPromptModifier(agentId) {
    const personality = this.getPersonality(agentId);
    const mbti = MBTI_TYPES[personality.mbti];
    const zodiac = ZODIAC_SIGNS[personality.zodiac];

    if (!mbti || !zodiac) return '';

    return `\n## 性格特质
你的 MBTI 类型是 ${personality.mbti} (${mbti.name})，星座是 ${personality.zodiac}。
${mbti.modifier}
${zodiac.modifier}
这些特质应该自然地体现在你的回复风格中，但不要刻意强调。`;
  }

  /**
   * 计算两个 Agent 的合拍度
   * @param {string} agentId1
   * @param {string} agentId2
   * @returns {object}
   */
  getChemistry(agentId1, agentId2) {
    const p1 = this.getPersonality(agentId1);
    const p2 = this.getPersonality(agentId2);

    const mbti1 = MBTI_TYPES[p1.mbti];
    const mbti2 = MBTI_TYPES[p2.mbti];
    const zodiac1 = ZODIAC_SIGNS[p1.zodiac];
    const zodiac2 = ZODIAC_SIGNS[p2.zodiac];

    // 元素相性
    const elements = [zodiac1.element, zodiac2.element].sort().join('-');
    const elementChem = ELEMENT_CHEMISTRY[elements] || { score: 50, desc: '中等相性' };

    // MBTI 相性（简化版）
    let mbtiScore = 50;
    let mbtiDesc = '基本配合，各有所长';

    // 🍍 彩蛋：ENFP + INFJ = 传说中的黄金搭档
    const pair = [p1.mbti, p2.mbti].sort().join('+');
    const GOLDEN_PAIRS = {
      'ENFP+INFJ': { score: 100, desc: '🌟 黄金灵魂伴侣！世间最默契的组合' },
      'ENFJ+INFP': { score: 98, desc: '🌟 天赐良缘，心有灵犀' },
      'ENTP+INTJ': { score: 95, desc: '🧠 智识双雄，所向披靡' },
    };
    if (GOLDEN_PAIRS[pair]) {
      mbtiScore = GOLDEN_PAIRS[pair].score;
      mbtiDesc = GOLDEN_PAIRS[pair].desc;
    }

    // NT + NT = 思想碰撞
    const isNT1 = p1.mbti.includes('NT');
    const isNT2 = p2.mbti.includes('NT');
    if (isNT1 && isNT2 && !GOLDEN_PAIRS[pair]) { mbtiScore = 85; mbtiDesc = '双脑力型，思想火花不断'; }

    // NF + NF = 理想主义共鸣
    const isNF1 = p1.mbti.includes('NF');
    const isNF2 = p2.mbti.includes('NF');
    if (isNF1 && isNF2 && !GOLDEN_PAIRS[pair]) { mbtiScore = 80; mbtiDesc = '理想主义共鸣，灵魂深处相通'; }

    // 互补型：I+E, S+N, T+F
    const complementary =
      (p1.mbti[0] !== p2.mbti[0] ? 1 : 0) +
      (p1.mbti[1] !== p2.mbti[1] ? 1 : 0) +
      (p1.mbti[2] !== p2.mbti[2] ? 1 : 0);
    if (complementary >= 2 && mbtiScore <= 50) { mbtiScore = 75; mbtiDesc = '互补型组合，各取所长'; }

    // 完全相同
    if (p1.mbti === p2.mbti) { mbtiScore = 70; mbtiDesc = '同类型，默契十足但缺乏差异'; }

    // 🍍 星座彩蛋：巨蟹 + 天秤
    const zodiacPair = [p1.zodiac, p2.zodiac].sort().join('+');
    let zodiacBonus = 0;
    if (zodiacPair === '天秤座+巨蟹座') {
      zodiacBonus = 50;
      elementChem.desc = '🌊✨ 水月交辉！温柔与优雅的完美交融，前世注定的缘分';
      elementChem.score = 100;
    }

    // 🍍 超级彩蛋：ENFP巨蟹 + INFJ天秤 = 10000%
    const full1 = `${p1.mbti}-${p1.zodiac}`;
    const full2 = `${p2.mbti}-${p2.zodiac}`;
    const fullPair = [full1, full2].sort().join('|');
    const isSoulmate = fullPair === 'ENFP-巨蟹座|INFJ-天秤座';

    let totalScore;
    if (isSoulmate) {
      totalScore = 10000;
    } else {
      totalScore = Math.round((elementChem.score + mbtiScore) / 2) + zodiacBonus;
      totalScore = Math.min(totalScore, 100);
    }

    return {
      agent1: { id: agentId1, mbti: p1.mbti, zodiac: p1.zodiac },
      agent2: { id: agentId2, mbti: p2.mbti, zodiac: p2.zodiac },
      elementChemistry: elementChem,
      mbtiChemistry: { score: mbtiScore, desc: mbtiDesc },
      totalScore,
      recommendation: totalScore >= 10000 ? '🍍 绝配中的绝配！！！命中注定！！！' : totalScore >= 80 ? '天作之合' : totalScore >= 60 ? '配合良好' : totalScore >= 40 ? '需要磨合' : '火星撞地球'
    };
  }

  /**
   * 打印所有大臣性格
   */
  printAll(regimeId = 'ming') {
    const { getRegime } = require('../config/regimes');
    const regime = getRegime(regimeId);

    console.log();
    console.log(bannerBox(chalk.bold.yellow('       百 官 性 格 档 案'), { color: chalk.yellow }));
    console.log();

    for (const agent of regime.agents) {
      const p = this.getPersonality(agent.id);
      const mbti = MBTI_TYPES[p.mbti];
      const zodiac = ZODIAC_SIGNS[p.zodiac];

      console.log(`  ${agent.emoji} ${chalk.cyan(agent.name.padEnd(6))} ${chalk.gray(`(${agent.id})`)}`);
      console.log(`    MBTI: ${chalk.white(p.mbti)} ${mbti.emoji} ${mbti.name} — ${chalk.gray(mbti.style)}`);
      console.log(`    星座: ${zodiac.emoji} ${chalk.white(p.zodiac)} — ${chalk.gray(zodiac.trait)}`);
      console.log();
    }

    console.log(chalk.gray('  修改: /personality <大臣ID> set <MBTI> <星座>'));
    console.log(chalk.gray('  合拍: /personality chemistry <大臣1> <大臣2>'));
    console.log();
  }

  /**
   * 打印单个大臣详细性格
   * @param {string} agentId
   */
  printDetail(agentId) {
    const p = this.getPersonality(agentId);
    const mbti = MBTI_TYPES[p.mbti];
    const zodiac = ZODIAC_SIGNS[p.zodiac];

    console.log();
    console.log(chalk.yellow(`  ═══ ${agentId} 性格档案 ═══\n`));
    console.log(`  MBTI: ${chalk.bold(p.mbti)} ${mbti.emoji} ${chalk.white(mbti.name)}`);
    console.log(`    ${chalk.gray(mbti.style)}`);
    console.log(`    ${chalk.gray(mbti.modifier)}`);
    console.log();
    console.log(`  星座: ${zodiac.emoji} ${chalk.bold(p.zodiac)}`);
    console.log(`    ${chalk.gray(zodiac.trait)}: ${zodiac.modifier}`);
    console.log(`    元素: ${chalk.gray(zodiac.element)}`);
    console.log();
  }

  /**
   * 打印合拍度
   */
  printChemistry(agentId1, agentId2) {
    const chem = this.getChemistry(agentId1, agentId2);

    console.log();
    console.log(chalk.yellow(`  ═══ 合拍度分析 ═══\n`));
    console.log(`  ${chalk.cyan(agentId1)} (${chem.agent1.mbti} ${chem.agent1.zodiac})`);
    console.log(`    ×`);
    console.log(`  ${chalk.cyan(agentId2)} (${chem.agent2.mbti} ${chem.agent2.zodiac})`);
    console.log();

    if (chem.totalScore >= 10000) {
      // 🍍 绝配彩蛋
      console.log(chalk.red.bold(`  总合拍度: ${'🔥'.repeat(10)} ${chem.totalScore}%`));
      console.log(chalk.red.bold(`  评语: ${chem.recommendation}`));
      console.log();
      console.log(chalk.yellow('  绝配中的绝配！宇宙级灵魂共鸣！'));
      console.log(chalk.yellow('  这个组合已经超越了合拍度量表的极限'));
    } else {
      const barLen = 20;
      const filled = Math.round(barLen * chem.totalScore / 100);
      const barColor = chem.totalScore >= 70 ? chalk.green : chem.totalScore >= 50 ? chalk.yellow : chalk.red;
      console.log(`  总合拍度: ${barColor('█'.repeat(filled))}${chalk.gray('░'.repeat(barLen - filled))} ${chem.totalScore}%`);
      console.log(`  评语: ${chalk.bold(chem.recommendation)}`);
    }
    console.log();
    console.log(`  ${chalk.gray('星座相性:')} ${chem.elementChemistry.desc}`);
    console.log(`  ${chalk.gray('MBTI相性:')} ${chem.mbtiChemistry.desc}`);
    console.log();
  }

  /** @private */
  _randomPersonality(agentId) {
    // 使用 agentId 作为种子，确保同一个 agent 每次得到相同结果（除非重置）
    const hash = Array.from(agentId).reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
    const mbtiTypes = Object.keys(MBTI_TYPES);
    const zodiacNames = Object.keys(ZODIAC_SIGNS);

    return {
      mbti: mbtiTypes[Math.abs(hash) % mbtiTypes.length],
      zodiac: zodiacNames[Math.abs(hash * 7) % zodiacNames.length],
      assignedAt: new Date().toISOString()
    };
  }

  /** @private */
  _load() {
    try {
      if (fs.existsSync(PERSONALITY_FILE)) {
        return JSON.parse(fs.readFileSync(PERSONALITY_FILE, 'utf-8'));
      }
    } catch { /* ignore */ }
    return {};
  }

  /** @private */
  _save() {
    fs.writeFileSync(PERSONALITY_FILE, JSON.stringify(this.data, null, 2));
  }
}

const personalityManager = new PersonalityManager();

module.exports = { PersonalityManager, personalityManager, MBTI_TYPES, ZODIAC_SIGNS };
