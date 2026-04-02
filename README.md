# TianGong (天工开物)

### An AI Agent Framework Inspired by Ancient Chinese Governance | 三省六部制 AI Agent 框架

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-≥22-green.svg)](https://nodejs.org)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

> **[English](#english) | [中文](#中文)**

---

<a id="english"></a>

## What is TianGong?

TianGong is a **self-evolving multi-agent AI framework** that maps China's ancient imperial bureaucracy onto AI agent architecture. Instead of flat tool lists, agents are organized into a hierarchical government with planning, review, and execution layers — just like a real imperial court.

**What makes it different from Claude Code / Cursor / Aider / OpenHands?**

- **3 governance systems**: Ming Dynasty cabinet, Tang Dynasty three-department, or Modern corporate — each with different agent counts, permission models, and review flows
- **Self-evolving AI**: Agents automatically optimize their own prompts based on performance data (the AGI loop)
- **OpenViking memory**: L0/L1/L2 tiered context loading that saves 80%+ tokens
- **Agent competition**: Pit agents against each other, hold court debates, run imperial exams
- **Ancient wisdom injection**: Classical Chinese philosophy woven into agent prompts
- **MBTI × Zodiac personality**: Each agent has unique personality traits that affect behavior
- **Viral treasure hunt**: A gamified system that drives organic adoption

## Quick Start

```bash
git clone https://github.com/wanikua/tiangong.git
cd tiangong && npm install

# Interactive mode (recommended)
node bin/tiangong.js

# Single command
node bin/tiangong.js "Build a login page"

# Choose governance system
node bin/tiangong.js --regime tang "Review this code for security"
node bin/tiangong.js --regime modern "Create a market analysis"
```

## Supported LLM Providers

| Provider | Models | Local? |
|----------|--------|--------|
| Anthropic | Claude Sonnet/Opus/Haiku | No |
| OpenRouter | 50+ models | No |
| OpenAI | GPT-4o, o3 | No |
| DeepSeek | Chat, Reasoner | No |
| Qwen | Max, Plus, Turbo | No |
| **Ollama** | Llama, Qwen, Mistral, etc. | **Yes** |
| **LM Studio** | Any GGUF model | **Yes** |

## Three Governance Systems

```
                    Ming Dynasty (Fast Iteration)
User ──→ 司礼监(Dispatch) ──→ 内阁(Optimize) ──→ 六部(Execute) ──→ 都察院(Review)

                    Tang Dynasty (Checks & Balances)
User ──→ 中书省(Draft) ──→ 门下省(Review) ──→ 尚书省(Execute) ──→ 给事中(Audit)
              ↑                                                         │
              └──────────── Veto & Return (封驳) ────────────────────────┘

                    Modern Corporate (Flat & Fast)
User ──→ CEO(Strategy) ──→ CTO/CFO/CMO(Division) ──→ Teams(Execute)
```

## 18 Unique Features

### Core
| Command | Feature | What it does |
|---------|---------|-------------|
| `/auto-optimize` | Self-Evolving Prompts | Agents analyze their own performance and rewrite their prompts |
| `/viking` | OpenViking Memory | L0/L1/L2 tiered context filesystem (`viking://agent/`, `viking://user/`) |
| `/dream` | Predictive Engine | Scans TODOs, git state, dependencies — predicts what you need next |
| `/collab` | Multi-Agent Coding | Architect + Coder + Security + Tester + Reviewer work simultaneously |
| `/oracle` | Crash Oracle | Paste any error log → auto-analysis + fix code generation |

### Competition & Social
| Command | Feature | What it does |
|---------|---------|-------------|
| `/pk` | Agent Arena | Two agents compete on the same task, judge picks winner |
| `/debate` | Court Debate | Multiple agents argue from different perspectives, generate consensus |
| `/exam` | Imperial Exam | 5-subject benchmark test (knowledge, security, architecture, writing, algorithms) |
| `/rank` | Reputation System | 19-rank progression from 从九品 to 太师, XP-based |
| `/personality` | MBTI × Zodiac | Each agent has personality traits that affect their responses |
| `/treasure` | Treasure Hunt | Gamified viral loop — find hidden treasures, share for bonuses |

### Analytics & DevOps
| Command | Feature | What it does |
|---------|---------|-------------|
| `/replay` | Session Replay | Time-travel through past sessions, auto-generate weekly reports |
| `/autopsy` | Failure Analysis | Root cause analysis with cascade detection |
| `/evolve` | Regime Evolution | Auto-recommend the best governance system for your project |
| `/evolve-self` | Self-Evolution | Agent analyzes and improves its own code |
| `/cost` | Cost Tracking | Per-agent token usage and budget visualization |
| `/regime` | Switch Regime | Hot-swap governance systems mid-session |
| `/history` | Session History | Browse past commands and results |

## How the Prompt Stack Works

Each agent's System Prompt is built from 6 layers:

```
┌─────────────────────────────────┐
│ 1. Role Definition (制度+职能)     │  ← regimes.js
│ 2. Thinking Frameworks (思维框架)  │  ← wisdom.js (MECE, 5 Whys, etc.)
│ 3. Ancient Wisdom (古文慧根)       │  ← wisdom.js (22 classical quotes)
│ 4. MBTI × Zodiac (性格特质)       │  ← agent-personality.js
│ 5. Auto-Optimized Overlay (自进化) │  ← auto-prompt-optimizer.js
│ 6. Viking Context (记忆上下文)     │  ← viking-store.js (L0/L1/L2)
└─────────────────────────────────┘
```

## Architecture

```
tiangong/
├── bin/tiangong.js              # CLI entry point
├── src/
│   ├── zhongshu/                # 中书省 — Planning Layer
│   │   ├── planner.js           # Intent analysis + execution plan
│   │   ├── prompt-builder.js    # 6-layer dynamic System Prompt
│   │   └── wisdom.js            # Thinking frameworks + ancient wisdom
│   ├── menxia/                  # 门下省 — Review Layer
│   │   ├── permission-gate.js   # Permission matrix (wildcard support)
│   │   └── security-check.js    # 30+ dangerous command patterns
│   ├── shangshu/                # 尚书省 — Execution Layer
│   │   ├── dispatcher.js        # Agent loop (Anthropic + OpenAI format)
│   │   ├── bing/                # 兵部 — Bash + File I/O + Glob + Grep
│   │   ├── hu/                  # 户部 — Cost tracking (10+ model pricing)
│   │   └── li/                  # 礼部 — LLM API client (retry + fallback)
│   ├── engine/                  # Core engine
│   │   ├── query-loop.js        # Session orchestration with spinners
│   │   ├── repl.js              # Interactive REPL (20+ commands)
│   │   └── spinner.js           # Terminal animations
│   ├── memory/                  # Memory systems
│   │   ├── store.js             # Legacy memory store
│   │   ├── viking-store.js      # OpenViking context filesystem
│   │   └── extractor.js         # Auto memory extraction
│   ├── features/                # Unique features
│   │   ├── auto-prompt-optimizer.js  # AGI self-evolution loop
│   │   ├── pk-arena.js          # Agent competition
│   │   ├── court-debate.js      # Multi-agent debate
│   │   ├── collaborative-coding.js  # Parallel multi-role coding
│   │   ├── crash-oracle.js      # Error log → fix generation
│   │   ├── dream-engine.js      # Predictive TODO/git/dep analysis
│   │   ├── imperial-exam.js     # Agent benchmark testing
│   │   ├── reputation.js        # XP + 19-rank system
│   │   ├── agent-personality.js # MBTI × Zodiac
│   │   ├── treasure-hunt.js     # Viral gamification
│   │   ├── time-travel.js       # Session replay + weekly reports
│   │   ├── autopsy.js           # Failure root cause analysis
│   │   ├── regime-evolution.js  # Smart regime recommendation
│   │   └── self-evolution.js    # Self-improvement engine
│   ├── export/                  # AgentPark / OpenClaw export
│   └── config/                  # Providers + Regimes + Setup
```

## Related Projects

- [Claude Code Leaked Source Analysis](https://github.com/wanikua/Claude-code-leaks) — Architecture study that inspired TianGong
- [AgentPark](https://github.com/wanikua/AgentPark) — Agent marketplace
- [Thinking Frameworks](https://github.com/wanikua/thinking-frameworks) — Structured thinking models

---

<a id="中文"></a>

## 什么是天工开物？

天工开物是一个**自进化多 Agent AI 框架**，将中国古代三省六部的朝廷制度映射到 AI Agent 架构上。Agent 不再是扁平的工具列表，而是按决策层、审核层、执行层组织的朝廷官僚体系。

**和 Claude Code / Cursor / Aider / OpenHands 有什么不同？**

- **三种治国方略**：明朝内阁制（快速迭代）、唐朝三省制（三权制衡+封驳权）、现代企业制（扁平高效）
- **AI 自进化**：Agent 根据历史表现数据，自动重写自己的 Prompt（AGI 闭环）
- **OpenViking 记忆**：L0/L1/L2 三层上下文按需加载，节省 80%+ token
- **Agent 对决**：武举殿试、廷议辩论、科举考试——大臣们互相竞争、辩论、考核
- **古文慧根植入**：22 条经典古文智慧融入 Agent Prompt（「凡事预则立，不预则废」）
- **MBTI × 星座性格**：每个大臣有独特性格，影响回复风格和合拍度
- **寻宝游戏**：病毒式传播机制——宝藏收集、谜语挑战、邀请码裂变

## 快速开始

```bash
git clone https://github.com/wanikua/tiangong.git
cd tiangong && npm install

# 交互模式（推荐）
node bin/tiangong.js

# 单次执行
node bin/tiangong.js "帮我写一个登录页面"

# 选择制度
node bin/tiangong.js --regime tang "审查这段代码"
node bin/tiangong.js --regime modern "做一个市场分析"

# 本地模型（Ollama）
node bin/tiangong.js --provider ollama --model qwen2.5-coder:7b "写排序算法"
```

## 18 个独创功能

| 命令 | 功能 | 说明 |
|------|------|------|
| `/auto-optimize` | 🧬 自动 Prompt 优化 | AGI 核心——Agent 分析自己的表现并重写 Prompt |
| `/viking` | 📂 OpenViking 记忆 | L0/L1/L2 三层上下文文件系统 |
| `/dream` | 🔮 朝堂梦境 | 扫描 TODO/git/依赖，预判你下一步需求 |
| `/collab` | 📋 六部联名 | 架构师+编码者+安全官+测试官+审查官协同 |
| `/oracle` | 📜 天书降世 | 粘贴错误日志，自动根因分析+修复代码 |
| `/pk` | ⚔️ 武举殿试 | Agent 对决擂台 |
| `/debate` | 📣 廷议 | 多 Agent 朝堂辩论，自动总结共识和争议 |
| `/exam` | 📝 科举考试 | 5 科能力基准测试（明经/明法/策论/诗赋/算术） |
| `/rank` | 🏆 功勋排行 | 19 级品阶（从九品→太师），XP 驱动 |
| `/personality` | 🧬 性格档案 | 16 种 MBTI × 12 星座 × 合拍度分析 |
| `/treasure` | 🗺️ 寻宝奇缘 | 宝藏收集+谜语+邀请码裂变 |
| `/replay` | 📜 奏折回放 | 会话时间旅行+自动周报 |
| `/autopsy` | 🔍 大理寺 | 故障验尸报告+级联效应分析 |
| `/evolve` | 👑 朝代更迭 | 智能制度自适应推荐 |
| `/evolve-self` | 🧬 自进化 | Agent 自我改进引擎 |
| `/cost` | 💰 户部账目 | 预算进度条可视化 |
| `/regime` | 制度切换 | 运行时热切换制度 |
| `/history` | 旨意历史 | 浏览历史命令 |

## Prompt 构建链（6 层叠加）

```
角色定义 → 思维框架(8种) → 古文慧根(22条) → MBTI性格 → 自进化Overlay → Viking上下文
```

每一层独立进化，互不干扰。

## License

MIT

---

**「思考，是人类最后的自由。」—— 查理·芒格**

**"The right thinking framework matters more than intelligence." — Charlie Munger**
