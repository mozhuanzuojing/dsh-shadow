# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.35] 两份外来补充材料登记（`open-code-review` · Everything Claude Code）与用户转述的事实分层

**用户提供（2026-09-28）**：一条**新材料** `alibaba/open-code-review`，一条**旧材料的新名字**
（Everything Claude Code）。本版只做**联网核实 + 登记**：**不改任何代码、不含吸收裁决**。

### 1. 做了什么

- `references.md` 追加 **§22 / §23**（+183 行）：新材料登记（是什么 / 读数 / 核心设计 / 边界 / 未核实）、
  旧材料**别名证实**与读数刷新、**逐条事实分层表**、与 dsh-shadow 的关系（同族判据，**不构成待办**）。
- 证据落 `../.docs/fix/2026-09-28/`：取证脚本 + 两份 README 全文 + 关键词抽行（36 行）+ 三个榜徽章 SVG
  + `INDEX.md`（怎么重放 / 产物清单 / 未做清单）。
- 核实链路图落 `../../_reports/2026-09-28-materials-verification.html`（archify，`showcase`）。

### 2. 核实结论（三分类 —— 本版最要紧的产出）

| 分类 | 结论 |
|---|---|
| **可核** | 「日 / 周 / 月 三榜第一」：徽章 SVG 原文为 `#1 Repository Of The Day` / `Of The Week` / `Of The Month`；「Everything Claude Code」= `affaan-m/ECC`（API 重定向后的 `full_name` 就是 ECC） |
| **需更正** | 夺冠场次是 **2025-09 的 Anthropic × Forum Ventures Hackathon**，不是 26 年（2026-02 那场产出的是 ECC 子件 AgentShield）；`+861%` 是 code churn，不是「返工率」；36kr 的 38 agents / 156 skills 是 2026-05 读数 |
| **未核到** | 「立项背景」四数字**不在** open-code-review README 里（一手出处是 Faros AI《The Acceleration Whiplash》，`441.5%` 未在其落地页出现）；8 小时黑客松四项成果数字在两份 README 与 36kr 报道里 **0 命中** |

### 3. 验证

- 取证脚本可重放（怎么跑写在 `fetch-materials-20260928.ts` 的文件头注释里）；
- `npm run audit:docs` → 七项全绿（**⑥ 引用门**：引用 607 处 · 可判 410 · 未判定 197 · **越界 0**）；
- `npm run audit:scripts` → 扫 496 文件 / 79 目录，扩展名命中 **0**；
- archify：`validate --quality showcase` = **9/9 检查 · 0 错 0 警**；`visual-check` 四档视口
  （1440×900 / 1600×1000 / 1920×1080 / 2048×1320）containment **全通过**；
- `npm run release` 的闸门 `npm run verify`（`SHADOW_EVAL_ROOT=D:\project\net1`）⇒ **exit 0**（`run-tests` **70/70**）。

### 4. 诚实标注

- 两条材料**都未安装、未运行**；`open-code-review` **未克隆**（故**不进** `MATERIALS.md` —— 那份台账的口径是**磁盘枚举**），
  `vendor/_src/ECC` 本机已有但**本版未读其源码**；
- 四项成果数字的出处**仍未找到**（口径：两份 README + 36kr 报道 0 命中；**未做全网穷举检索**）——
  按本仓纪律，**未核到的数字不得当事实用**；
- 归类为「可核」的那几条，依据都是**可复算的外部读数**，**不是本系统的证据**（同 `adr/0073` 与 `references.md` §3.2 的纪律）。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T17-C` 的默认值前置条件 ①（`query-error` 有界重试 + 退避）；审计 ref 进 atom lineage（需先过契约面决策）；
  两份外来材料若要**吸收**（而不是登记），需按惯例**先立 ADR**（判据见 `references.md` §22 / §23）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）。
