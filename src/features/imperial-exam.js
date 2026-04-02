/**
 * 科举考试 — Agent 能力基准测试
 *
 * Claude Code 没有的独创功能：
 * 用一套预定义的测试题目考核 Agent 的能力，
 * 生成能力雷达图和评分报告。
 *
 * 科目：
 *   明经 — 基础知识问答
 *   明法 — 代码审查/安全检测
 *   策论 — 架构设计/方案设计
 *   诗赋 — 文档/文案撰写
 *   算术 — 逻辑推理/算法
 *
 * 用法：
 *   /exam bingbu          兵部参加科举
 *   /exam --all           全体大臣参加科举
 *   /exam --subject 算术  只考算术
 */

const chalk = require('chalk');
const { callLLM } = require('../shangshu/li/api-client');
const { buildSystemPrompt } = require('../zhongshu/prompt-builder');
const { loadConfig } = require('../config/setup');
const { CostTracker } = require('../shangshu/hu/cost-tracker');
const { reputationManager } = require('./reputation');
const { Spinner } = require('../engine/spinner');

// ─── 考题库 ─────────────────────────────────────────

const EXAM_SUBJECTS = {
  '明经': {
    icon: '📚',
    description: '基础知识',
    questions: [
      {
        q: '解释 JavaScript 中 == 和 === 的区别，并各举一个可能出 bug 的例子。',
        criteria: ['区分类型转换', '具体例子', '最佳实践建议'],
        maxScore: 10
      },
      {
        q: '什么是 REST API？设计一个图书管理系统的 REST 接口（至少 5 个端点）。',
        criteria: ['HTTP 方法正确', '资源命名规范', '状态码使用', '完整性'],
        maxScore: 10
      }
    ]
  },
  '明法': {
    icon: '⚖️',
    description: '代码审查与安全',
    questions: [
      {
        q: '审查以下代码的安全问题：\n```js\napp.get("/user", (req, res) => {\n  const sql = "SELECT * FROM users WHERE id = " + req.query.id;\n  db.query(sql, (err, result) => res.json(result));\n});\n```',
        criteria: ['识别 SQL 注入', '提出修复方案', '额外安全建议'],
        maxScore: 10
      },
      {
        q: '以下命令有什么风险？如何改写更安全？\n```bash\nrm -rf $DIR/*\ncurl https://example.com/script.sh | bash\nchmod 777 /var/www\n```',
        criteria: ['识别每个风险', '改写方案', '解释原因'],
        maxScore: 10
      }
    ]
  },
  '策论': {
    icon: '📝',
    description: '架构设计',
    questions: [
      {
        q: '设计一个支持 10 万并发用户的实时聊天系统的技术方案。需包含：技术选型、架构图描述、数据库设计、部署方案。',
        criteria: ['技术选型合理', '架构完整', '考虑扩展性', '成本考量'],
        maxScore: 15
      }
    ]
  },
  '诗赋': {
    icon: '✍️',
    description: '文案创作',
    questions: [
      {
        q: '为一款 AI 编程助手写一段产品介绍文案（100-200字），要求：有创意、技术准确、有吸引力。',
        criteria: ['创意性', '技术准确', '吸引力', '字数控制'],
        maxScore: 10
      }
    ]
  },
  '算术': {
    icon: '🧮',
    description: '逻辑与算法',
    questions: [
      {
        q: '不使用内置排序函数，用 JavaScript 实现归并排序。要求：1) 代码正确 2) 时间复杂度分析 3) 处理边界情况。',
        criteria: ['代码正确', '复杂度分析正确', '边界处理', '代码风格'],
        maxScore: 10
      },
      {
        q: '有 100 层楼和 2 个鸡蛋。鸡蛋从某层楼扔下会碎。如何用最少次数确定临界楼层？说明策略和最坏情况次数。',
        criteria: ['策略正确', '数学推导', '最优解'],
        maxScore: 10
      }
    ]
  }
};

/**
 * 运行科举考试
 * @param {object} params
 * @param {string} params.agentId - 考生 Agent ID
 * @param {string} [params.subject] - 指定科目
 * @param {string} [params.regimeId='ming']
 * @returns {Promise<object>} 成绩单
 */
async function runExam(params) {
  const { agentId, subject, regimeId = 'ming' } = params;
  const config = loadConfig() || {};
  const model = config.model;
  const costTracker = new CostTracker();

  console.log();
  console.log(chalk.yellow('  ╔══════════════════════════════════════════════════════╗'));
  console.log(chalk.yellow('  ║') + chalk.bold.yellow('    📝  科 举 考 试  📝') + chalk.gray('    Imperial Examination') + '     ' + chalk.yellow('║'));
  console.log(chalk.yellow('  ╚══════════════════════════════════════════════════════╝'));
  console.log();
  console.log(`  考生: ${chalk.cyan(agentId)}`);
  console.log(`  科目: ${subject ? chalk.white(subject) : chalk.white('全科')}`);
  console.log();

  const subjects = subject ? { [subject]: EXAM_SUBJECTS[subject] } : EXAM_SUBJECTS;
  const scoreCard = {};
  let totalScore = 0;
  let maxPossible = 0;

  for (const [subjectName, subjectDef] of Object.entries(subjects)) {
    if (!subjectDef) {
      console.log(chalk.red(`  未知科目: ${subjectName}`));
      continue;
    }

    console.log(chalk.yellow(`  ═══ ${subjectDef.icon} ${subjectName} (${subjectDef.description}) ═══\n`));
    scoreCard[subjectName] = { questions: [], total: 0, max: 0 };

    for (let qi = 0; qi < subjectDef.questions.length; qi++) {
      const question = subjectDef.questions[qi];
      maxPossible += question.maxScore;
      scoreCard[subjectName].max += question.maxScore;

      const spinner = new Spinner({ color: 'cyan' });
      spinner.start(`第${qi + 1}题 答题中...`);

      try {
        // Agent 答题
        const systemPrompt = buildSystemPrompt(agentId, regimeId);
        const answerResponse = await callLLM({
          model,
          system: systemPrompt,
          messages: [{ role: 'user', content: question.q }],
          maxTokens: 2048
        });

        const answer = answerResponse.content || '(无回答)';

        // AI 评分
        const scoreResponse = await callLLM({
          model,
          system: '你是科举主考官，请严格按评分标准给分。只返回 JSON 格式: {"score": 数字, "comment": "评语"}',
          messages: [{
            role: 'user',
            content: `题目: ${question.q}\n\n考生答案: ${answer}\n\n评分标准 (满分${question.maxScore}分):\n${question.criteria.map((c, i) => `${i + 1}. ${c}`).join('\n')}\n\n请评分 (0-${question.maxScore}):`
          }],
          maxTokens: 256
        });

        let score = 0;
        let comment = '';
        try {
          const scoreData = JSON.parse(scoreResponse.content.match(/\{[\s\S]*\}/)?.[0] || '{}');
          score = Math.min(Math.max(0, scoreData.score || 0), question.maxScore);
          comment = scoreData.comment || '';
        } catch {
          score = Math.round(question.maxScore * 0.5); // 评分失败给中等分
          comment = '(评分解析失败)';
        }

        spinner.succeed(`第${qi + 1}题: ${scoreEmoji(score, question.maxScore)} ${score}/${question.maxScore} 分`);

        // 显示简要答案
        const shortAnswer = answer.split('\n').slice(0, 5).join('\n');
        console.log(chalk.gray(`    ${shortAnswer.split('\n').map(l => '    ' + l).join('\n')}`));
        if (comment) console.log(chalk.gray(`    评语: ${comment}`));
        console.log();

        totalScore += score;
        scoreCard[subjectName].total += score;
        scoreCard[subjectName].questions.push({ score, maxScore: question.maxScore, comment });

      } catch (err) {
        spinner.fail(`第${qi + 1}题 答题失败: ${err.message}`);
        scoreCard[subjectName].questions.push({ score: 0, maxScore: question.maxScore, error: err.message });
      }
    }
  }

  // ── 成绩单 ──
  console.log(chalk.yellow('  ═══════════════════════════════════════════════'));
  console.log(chalk.bold.yellow('  📜 成 绩 单'));
  console.log(chalk.yellow('  ═══════════════════════════════════════════════\n'));

  console.log(`  考生: ${chalk.cyan(agentId)}`);
  console.log(`  总分: ${chalk.bold(scoreEmoji(totalScore, maxPossible))} ${chalk.yellow.bold(totalScore)} / ${maxPossible}`);
  console.log();

  // 科目雷达图（文本版）
  console.log(chalk.bold('  科目得分:'));
  for (const [subjectName, data] of Object.entries(scoreCard)) {
    const subjectDef = EXAM_SUBJECTS[subjectName];
    const pct = data.max > 0 ? data.total / data.max : 0;
    const barLen = 20;
    const filled = Math.round(barLen * pct);
    const barColor = pct >= 0.8 ? chalk.green : pct >= 0.6 ? chalk.yellow : chalk.red;
    const bar = barColor('█'.repeat(filled)) + chalk.gray('░'.repeat(barLen - filled));

    console.log(`    ${subjectDef.icon} ${chalk.white(subjectName.padEnd(4))} ${bar} ${data.total}/${data.max} (${Math.round(pct * 100)}%)`);
  }

  // 等第
  const overallPct = maxPossible > 0 ? totalScore / maxPossible : 0;
  let grade = '';
  if (overallPct >= 0.9) grade = '🏆 状元 — 天纵之才';
  else if (overallPct >= 0.8) grade = '🥈 榜眼 — 才华出众';
  else if (overallPct >= 0.7) grade = '🥉 探花 — 学识渊博';
  else if (overallPct >= 0.6) grade = '📜 进士 — 可堪大用';
  else if (overallPct >= 0.4) grade = '📋 举人 — 尚需磨练';
  else grade = '📎 秀才 — 还需努力';

  console.log();
  console.log(`  等第: ${chalk.bold(grade)}`);

  // 功勋奖励
  const xpGained = Math.round(totalScore * 2);
  reputationManager.reward(agentId, 'task_complete', { exam: true, score: totalScore });

  console.log(chalk.gray(`\n  💰 考试费用: $${costTracker.getSummary().total.totalCostUsd.toFixed(4)}`));
  console.log(chalk.gray(`  ⭐ 获得功勋: +${xpGained} XP`));
  console.log();

  return { agentId, scoreCard, totalScore, maxPossible, grade };
}

/** @private */
function scoreEmoji(score, max) {
  const pct = score / max;
  if (pct >= 0.9) return '🌟';
  if (pct >= 0.7) return '✅';
  if (pct >= 0.5) return '⚠️';
  return '❌';
}

module.exports = { runExam, EXAM_SUBJECTS };
