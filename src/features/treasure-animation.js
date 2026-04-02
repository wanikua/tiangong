/**
 * 宝藏掉落动画 — 按稀有度分级，快速有冲击力
 *
 * common    → 简单闪光 (0.3s)
 * uncommon  → 金色边框 (0.5s)
 * rare      → 展开动画 + 铃声 (0.8s)
 * epic      → 彩色波浪 + 铃声 (1.2s)
 * legendary → 金色雨 + 三连铃 (1.8s)
 */

const chalk = require('chalk');

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function bell() {
  process.stdout.write('\x07');
}

/**
 * 播放掉落动画
 * @param {string} rarity - common/uncommon/rare/epic/legendary
 * @param {object} treasure - 宝藏对象
 */
async function playDropAnimation(rarity, treasure) {
  if (!process.stdout.isTTY) {
    // 非交互环境，简单输出
    console.log(chalk.yellow(`\n  🎁 发现宝藏: ${treasure.name}\n`));
    return;
  }

  switch (rarity) {
    case 'common':
      await animateCommon(treasure);
      break;
    case 'uncommon':
      await animateUncommon(treasure);
      break;
    case 'rare':
      await animateRare(treasure);
      break;
    case 'epic':
      await animateEpic(treasure);
      break;
    case 'legendary':
      await animateLegendary(treasure);
      break;
    default:
      await animateCommon(treasure);
  }
}

async function animateCommon(treasure) {
  console.log();
  console.log(chalk.gray('  ✨ ') + chalk.white(treasure.name));
  await sleep(300);
}

async function animateUncommon(treasure) {
  console.log();
  console.log(chalk.yellow('  ┌────────────────────────────────┐'));
  console.log(chalk.yellow('  │') + chalk.bold(` ✨ ${treasure.name}`.padEnd(32)) + chalk.yellow('│'));
  console.log(chalk.yellow('  └────────────────────────────────┘'));
  await sleep(500);
}

async function animateRare(treasure) {
  bell();
  console.log();

  // 展开效果
  const frames = [
    '  ╔══╗',
    '  ╔════════╗',
    '  ╔════════════════╗',
    '  ╔══════════════════════════════════╗',
  ];
  for (const frame of frames) {
    process.stdout.write('\r' + chalk.blue(frame) + '\x1B[K');
    await sleep(80);
  }
  console.log();
  console.log(chalk.blue('  ║') + chalk.bold.yellow(` 🎁 ${treasure.name}`.padEnd(34)) + chalk.blue('║'));
  console.log(chalk.blue('  ║') + chalk.gray(`    ${treasure.description}`.padEnd(34).slice(0, 34)) + chalk.blue('║'));
  console.log(chalk.blue('  ╚══════════════════════════════════╝'));
  await sleep(300);
}

async function animateEpic(treasure) {
  bell();
  console.log();

  // 彩色闪烁
  const colors = [chalk.magenta, chalk.blue, chalk.cyan, chalk.magenta];
  for (let i = 0; i < 4; i++) {
    const c = colors[i];
    process.stdout.write('\r' + c('  ★ ═══════════════════════════════════ ★') + '\x1B[K');
    await sleep(100);
  }
  console.log();
  console.log(chalk.magenta('  ║') + chalk.bold.yellow(`  🎁 ${treasure.name}`.padEnd(37)) + chalk.magenta('║'));
  console.log(chalk.magenta('  ║') + chalk.white(`     ${treasure.description}`.padEnd(37).slice(0, 37)) + chalk.magenta('║'));
  console.log(chalk.magenta('  ║') + chalk.green(`     效果: ${treasure.effect}`.padEnd(37).slice(0, 37)) + chalk.magenta('║'));
  console.log(chalk.magenta('  ★ ═══════════════════════════════════ ★'));
  await sleep(400);
}

async function animateLegendary(treasure) {
  bell(); await sleep(200); bell(); await sleep(200); bell();
  console.log();

  // 金色雨
  const rainChars = '✦✧★☆⚡✨💫';
  for (let row = 0; row < 3; row++) {
    let line = '  ';
    for (let col = 0; col < 40; col++) {
      line += rainChars[Math.floor(Math.random() * rainChars.length)];
    }
    console.log(chalk.yellow(line));
    await sleep(150);
  }

  console.log();
  console.log(chalk.red.bold('  ╔══════════════════════════════════════╗'));
  console.log(chalk.red.bold('  ║') + chalk.yellow.bold(`   🌟 ${treasure.name} 🌟`.padEnd(38)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.white(`   ${treasure.description}`.padEnd(38).slice(0, 38)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ║') + chalk.green.bold(`   效果: ${treasure.effect}`.padEnd(38).slice(0, 38)) + chalk.red.bold('║'));
  console.log(chalk.red.bold('  ╚══════════════════════════════════════╝'));

  // 底部金色雨
  for (let row = 0; row < 2; row++) {
    let line = '  ';
    for (let col = 0; col < 40; col++) {
      line += rainChars[Math.floor(Math.random() * rainChars.length)];
    }
    console.log(chalk.yellow(line));
    await sleep(100);
  }
  console.log();
  await sleep(300);
}

/**
 * 成功庆祝动画（金榜题名效果）
 */
async function playCelebration() {
  console.log(chalk.yellow('  🎊 ═══════════════════════════════ 🎊'));
  console.log(chalk.yellow.bold('  ║    金 榜 题 名 · 任 务 大 成    ║'));
  console.log(chalk.yellow('  🎊 ═══════════════════════════════ 🎊'));
}

module.exports = { playDropAnimation, playCelebration };
