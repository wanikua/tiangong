# 天工开物

### 三省六部，听旨办差。养好班子，派去打工。

> **以中国古代三省六部制为蓝本的 AI Agent 框架。** 训练好一套朝廷班子，可以派到任何项目打工，也可以上架 [AgentPark](https://github.com/wanikua/AgentPark) 劳务市场。

```
天子（用户）
  │
  ▼
┌─────────────────────────────────────────┐
│  中书省 (Planning)                       │
│  接旨 → 分析意图 → 优化 Prompt → 执行计划 │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  门下省 (Review Gate)                    │
│  权限审查 → 安全检查 → 封驳 / 准奏        │
└──────────────────┬──────────────────────┘
                   ▼
┌─────────────────────────────────────────┐
│  尚书省 (Execution) → 统领六部            │
│  ┌────┬────┬────┬────┬────┬────┐       │
│  │吏部│户部│礼部│兵部│刑部│工部│         │
│  └────┴────┴────┴────┴────┴────┘       │
└─────────────────────────────────────────┘
```

## 三种制度可选

| 制度 | 特点 | Agent 数 |
|------|------|---------|
| **明朝内阁制** | 司礼监 + 内阁 + 六部，快速迭代 | 10 |
| **唐朝三省制** | 中书 → 门下 → 尚书，三权制衡 | 9 |
| **现代企业制** | CEO/CTO/CFO/CMO，国际化 | 8 |

## 快速开始

```bash
# 安装
git clone https://github.com/wanikua/tiangong.git
cd tiangong && npm install

# 单次执行
node bin/tiangong.js "帮我写一个登录页面"

# 交互模式
node bin/tiangong.js

# 指定制度
node bin/tiangong.js --regime tang "审查这段代码"
node bin/tiangong.js --regime modern "做一个市场分析"
```

## 六部对应

| 六部 | 古代职能 | AI 职能 |
|------|---------|---------|
| 吏部 | 选拔官吏 | Agent 生命周期管理 |
| 户部 | 国库财税 | Token 计费 + 预算控制 |
| 礼部 | 礼仪外交 | 输出格式化 + API 协议 |
| 兵部 | 军事作战 | Bash / 文件读写编辑 / 搜索 |
| 刑部 | 司法刑律 | 沙箱 + 安全检查 + 权限 |
| 工部 | 工程营造 | Git / Worktree / DevOps |

## 导出朝廷班子

训练好的班子可以打包导出：

```bash
# 导出为 AgentPark 格式（上架劳务市场）
node bin/tiangong.js export --format agentpark --regime ming

# 导出为 OpenClaw 格式（给当皇上项目用）
node bin/tiangong.js export --format openclaw --regime tang

# 从 AgentPark 导入
node bin/tiangong.js import agentpark://team/coding-squad
```

### AgentPark 集成

天工的朝廷班子可以直接上架 [AgentPark](https://github.com/wanikua/AgentPark) 劳务市场：

- 一个朝廷 = 一个 Agent Team
- 按任务计费，S/M/L/XL 分级
- 链上信任，智能路由
- 越干越强（Agent 进化 + 记忆积累）

## 项目结构

```
tiangong/
├── bin/tiangong.js              # CLI 入口
├── src/
│   ├── zhongshu/                # 中书省 - 起草决策
│   │   ├── planner.js           # 意图分析 + 执行计划
│   │   └── prompt-builder.js    # 动态 System Prompt
│   ├── menxia/                  # 门下省 - 审核封驳
│   │   ├── permission-gate.js   # 权限矩阵
│   │   └── security-check.js    # 命令安全检查
│   ├── shangshu/                # 尚书省 - 六部执行
│   │   ├── dispatcher.js        # 六部调度器
│   │   ├── bing/                # 兵部 - Bash + 文件操作
│   │   ├── hu/                  # 户部 - Token 计费
│   │   ├── li/                  # 礼部 - 格式化 + 协议
│   │   ├── xing/                # 刑部 - 沙箱 + 安全
│   │   ├── gong/                # 工部 - Git + Worktree
│   │   └── li2/                 # 吏部 - Agent 管理
│   ├── engine/                  # 核心引擎
│   │   ├── query-loop.js        # 对话循环
│   │   └── repl.js              # 交互模式
│   ├── export/                  # 导出 / 导入
│   │   ├── exporter.js          # AgentPark / OpenClaw / JSON
│   │   └── importer.js          # 从外部导入 Agent
│   └── config/                  # 配置
│       ├── regimes.js           # 三种制度定义
│       └── defaults.js          # 默认配置
├── skills/                      # 技能插件
└── tests/                       # 测试
```

## 与 Claude Code 的区别

| Claude Code | 天工 |
|---|---|
| 扁平工具列表 | 三省六部层级化 |
| 单一 System Prompt | 中书省动态生成 |
| 权限弹窗 | 门下省事前审核 + 封驳权 |
| 子 Agent 无组织 | 吏部统一调度 |
| 固定架构 | 三种制度可选 |
| 闭源 | MIT 开源 |
| 不可导出 | 打包上架 AgentPark |

## 关联项目

- [当皇上](https://github.com/wanikua/danghuangshang) — AI 朝廷教程 + OpenClaw 实现
- [AgentPark](https://github.com/wanikua/AgentPark) — Agent 劳务市场

## License

MIT
