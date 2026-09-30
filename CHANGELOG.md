# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.39] 验证基线抬到 `0.2.0-rc.2`（用户指令「把最低兼容性升级到 0.2.0」）

### 1. 先核上游事实：没有 `0.2.0` 正式版，落在现存最新的 `0.2.0-rc.2`

指令的字面值是 `0.2.0`，但上游**不存在**这个版本：`@deepseek-ai/dsh` 的 `latest` / `next` 都是 **`0.2.0-rc.2`**，
版本表末尾是 `0.1.7-rc.2 → 0.2.0-rc.1 → 0.2.0-rc.2`；本机桌面 App 的 `desktopVersion` 同样是 `0.2.0-rc.2`。
按 semver，`0.2.0-rc.2 < 0.2.0` ⇒ 照字面写 `>=0.2.0`，得到的是一条**无法验证、且连本机 live 宿主都不满足**的下限。
**经用户确认后，取值落在 `0.2.0-rc.2`**（现存最新、也是本机正在跑的那一版）。

### 2. 判据：两代「现装闭包」逐文件 MD5（口径与 §8 同源，取证形态换了）

上一代那棵 dlx 树已被 pnpm 缓存清掉（本机只剩 rc.2 那棵）⇒ 改成 `pnpm add @deepseek-ai/dsh@<版本>` 装两棵
**现装闭包**（同机同 store，比「dlx vs dlx」更对称）。脚本可重放：`../.docs/fix/2026-09-30/compare-dsh-closure.ts`。

| 项 | 读数 |
|---|---|
| 包数 | **288 / 288** |
| 实质面文件（`lib/**` · `presets/**` · `locale/**`） | **3018 → 3034** |
| 有差异的包 | **47 个 / 134 处**（非 client/host 面 20 个包 / 53 处 · UI/Host 面 27 个包 / 81 处） |
| 本仓消费面 | **10 个包逐包指纹两代全同（0 处差异）** |

### 3. 结论：rc.2 新增的设施不落在本仓的采集面上

- rc.2 唯一新增设施 = **用户问答的定时等待**（`dsh-user-questions` 新增 `timed-wait` / `projection`、
  `dsh-tool-ask-user` 新增 `types/timed.d.ts`）；类型面上表现为 `MessageSourceMap` 多一条 `'user-question-reply'` ——
  实测 **7 个包的 `lib/typert.host.js` 差异全都是这条声明串**；`dsh-api-session-controller` 另在会话投影里加 `userQuestions`。
- **对本仓无影响（代码级可证，不是推断）**：`core/retention/collect.ts` 的 `extractMessage` 只按**事件类型**分类
  （`type` ∈ `user/message` / `assistant/message`），**从不读消息的来源标识**；全仓对 `MessageSourceMap` /
  `user-question-reply` / `session-projection` / `userQuestions` / `deferredToolsMode` / `supportsMidConvo*` /
  `responseModel`（`dsh-llm-pi-ai` 本代三处改动全落在这些符号上）的**引用数都是 0**。
- **⚠ 仍未核**：非 client/host 面的其余差异只做了逐文件定位、未逐行判定行为影响 —— `dsh` 外壳 ·
  `dsh-api-gateway` / `-remotes` / `-terminal-controller` · `dsh-tool-cordis`。**这是判断，不是证明。**

### 4. 改了哪些文件

| 处 | 文件 | 改动 |
|---|---|---|
| ① | `package.json` | `version` → `1.21.39`；`engines.dsh` → `>=0.2.0-rc.2` |
| ② | `index.ts` | `HOST_BASELINE` → `0.2.0-rc.2`（注释**同法改写、不增行** —— `index.ts` 是复杂度热点棘轮，368 行**只能降**） |
| ③ | `README.md` | 基线表两行 + 「当前版本」行 + 新增一段基线沿革（含读数与未核项） |
| ④ | `CONTEXT.md` | 「验证基线」术语行：历史链、`engines.dsh` 取值、rc.2 依据 |
| ⑤ | `presets/README.md` | `(current as of …)` → `0.2.0-rc.2`（依据：载体包与 `dsh-agent-preset` 指纹两代相同） |
| ⑥ | `BACKLOG.md` · `adr/0098` §8.6 | 登记本节读数、指纹、未核项与口径说明 |

### 5. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 三处基线声明 = `engines.dsh` | `npm run audit:docs` ⑦ | `0.2.0-rc.2` |
| 2 | 三方版本一致 | `npm run audit:docs` ① | `1.21.39` |
| 3 | `HOST_BASELINE` 防漂移棘轮 | `test/host-probe.test.ts` ⑥ | 与 `engines.dsh` 一致 |
| 4 | 复杂度热点棘轮 | `npm run audit:complexity` | `index.ts` **368**（未上涨） |
| 5 | 全仓闸门 | `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` | **exit 0** · 70/70 通过 |

### 6. 诚实标注

- 本版**只抬基线 + 同步文档**，不动行为代码；
- 「rc.2 对本仓无影响」有**代码级证据**（消费面 0 处差异 + 相关符号引用数 0），但**覆盖不到** §3 末尾列出的未核包 ——
  那几家只做了逐文件定位，**是判断不是证明**；
- 本机跑着的正是 `0.2.0-rc.2` ⇒ 声明与运行面一致（若照字面写 `0.2.0`，本机反而落在自己的基线之下）。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T17-C` 的默认值前置条件 ①（`query-error` 有界重试 + 退避）；审计 ref 进 atom lineage（需先过契约面决策）；
  两份外来材料若要**吸收**（而不是登记），需按惯例**先立 ADR**（判据见 `references.md` §22 / §23）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）。
