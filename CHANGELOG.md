# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.30] `T17-C`：派生索引**验证矩阵逐项落点** + 三个基准数字 + 同机二进程并发

**工具面 + 证据面 + 台账面；产品代码零改动**（本轮不碰 `core/candidate/sqlite.ts`）。
由来：`adr/0095` §六 要三个数字、§七 的 T17-C 矩阵 9 项、§补记七 明列「**并发/多进程同读同写未测**」。
此前这些读数的证据散在**仓外**（`../.docs/fix/2026-09-16/t17b/`）或**根本没测**。

### 1. 新增可重放基准 `tools/derived-index-bench.ts`（`npm run bench:derived-index`）

- **自己造合成语料**（默认 8800 条，`--atoms N`），写进**系统临时目录** ⇒ **不进仓库、不碰真实记忆**；
- 用与 `dsh-fs-local.listDirectory` 同形的**本地 fs 门面**（真目录）驱动**真 provider**
  （`createSqliteCandidateProvider().provide`），**不自己算一遍**；
- 三步自带断言：① cold rebuild（`rows == N`）② startup（同一份索引再取）③ incremental（+1 新、原地改 1 ⇒
  **改动能被看见** —— 这条同时证明 `dirtyRels` 那条路真的把原地改写带进了索引）；
- ④ **二进程并发探针**：两个子进程（都 `writable: true`，其中一个每 3 轮新增一条）同时对同一份索引调 `provide`。
  ⚠ **实测踩到并更正**：`writable: false` **不是「并发读」** —— 守卫②（只读会话）直接返回 `unavailable`，
  拿它当并发探针**等于什么都没测**（那个行为由 `test/derived-index.test.ts` ②b 覆盖）。

### 2. 三个数字（`--atoms 8800`，本机 2026-09-25）

| 场景 | 读数 |
|---|---|
| ① **cold rebuild**（8800 `.md` → SQLite） | **512.6 ms** · `rows=8800/8800` · 索引 **6884 KB**（801 B/条） |
| ② **startup**（索引已存在 → ready） | **68.9 ms** |
| ③ **incremental**（+1 新、原地改 1） | **302.5 ms** · `rows=8801/8801` · 改动能被看见 = true |

⇒ 「默认开是否可接受」在**量级**上有答案：冷建**不到一秒**、启动**几十毫秒**。
⚠ **边界**：合成语料**分布均匀**（真语料更偏）、单次运行、单机 ⇒ 只当**下界量级**，**不是**性能基线。

### 3. 二进程并发读数（**两次运行结论不同，都照记**）

| 运行 | reader | writer |
|---|---|---|
| 合成 **300** 条 | 12/12 `ok` | **出现 `query-error`**（撞锁） |
| 合成 **8800** 条 | 12/12 `ok` | 12/12 `ok` |

⇒ **并发写会撞锁，但撞锁是时序相关的**；它被表达成 `query-error`（本次回退 fs + **可见**），
**不是崩溃、也不是静默空集**（第一原则 `error ≠ empty` 的形状成立）。
⇒ **不能靠单次运行断言**（同 `AGENTS.md` 里那条「别拿单次运行当结论」）。

### 4. 矩阵逐项落点（写进 `adr/0095` 的补记 §一）

9 项各自指到**可跑的东西**，不写「已验证」了事：`fs`/`sqlite` ⇒ `test/derived-index.test.ts` ①/①b；
`unavailable` ⇒ ②a/②b；`schema mismatch` ⇒ ②c；`corrupt`（表缺失）⇒ 同路径但**未单独断言**（诚实标注）；
`source changed` ⇒ ⑤；`rebuild` ⇒ ②c 第二次读；`8.8k cold build` / `incremental` ⇒ 本轮 bench。

### 5. 决策：**默认仍 `fs`**（本轮不改）

理由不是「矩阵没过」，而是**跨平台的另一半没测**：`adr/0095` §七 的判据原文是「**全部通过之后**才考虑把 `sqlite` 设为默认」，
而 §补记七 的四条「未核实」里本轮只关掉了**同机二进程并发**一条；
**跨平台（WSL/容器）锁与 WAL / 真实流量漏召回 / 外部进程原地改的频率 / 非本地后端 `processPath`** 仍未测。
⇒ 按判据原文**不改默认**；改默认需要跨平台环境 + 真实流量 query-log 样本。

### 6. 验证

- `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` → **exit 0**（`run-tests` **70/70**；本轮未新增测试文件）。
- `node tools/derived-index-bench.ts --atoms 8800` → 四步全成立、exit 0（读数见上表）。
- `npx tsc -p tsconfig.tools.json` → exit 0（新工具在工具面类型门内）。
- 新工具**刻意不进 `verify`**（要造 8800 个文件），与 `sweep:timebomb` / `sidecar:cost` 同一条边界；
  `AGENTS.md` 的「构建与验证」段已记它的用途与重跑时机。

### 7. 诚实标注（做不到的不假装）

- 合成语料**均匀** ⇒ 三个数字只能当**量级**；**单次运行**、单机。
- 矩阵第 4 项「表缺失」分支**没有单独断言**；并发只测**同机二进程**；撞锁的**频率**未量化。
- **跨平台锁 / 真实流量漏召回 / 非本地后端 `processPath`**：仍未测（`adr/0095` §补记七）。
- 本轮**产品代码零改动** ⇒ 不需要重跑 `sweep:timebomb`（未改任何默认值）。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T18` 另半边（`decision/` 原语接线 —— 先定切片）→ `T21`（审计流被读侧消费 —— 先定消费形态）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）· **跨平台环境**（`sqlite` 设默认的前提）。
