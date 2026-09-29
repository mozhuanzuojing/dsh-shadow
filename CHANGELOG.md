# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.38] 撤回一次判错的自纠 + 补核一处借错区间的旧账（用户 review：因果颠倒）

用户 2026-09-29 一句「review 因果颠倒」。逐段重读 `v1.21.36`/`v1.21.37` 的落盘文本、并当场复测后找到 6 处 ——
**其中 1 处是 `v1.21.37` 那次自纠自己新引入的判错**。本版逐条修掉。

### 1. ① 撤回：`v1.21.37` 把**已经核实过的** `231` 判成「没核过」并删掉

`v1.21.37` 原话：「跟着 §7 抄的示例值 `231`，与 `presets/README` 里实际写的 `232` 不一致 ⇒ 等于在传播一个没核过的数，去掉。」

**这句错了，而且错在跨代比较。** 本轮实测（本机五棵 dlx 树的载体 `dsh-experimental-tool-agent-team/lib/index.js` 逐行数）：

| 宿主 | 总行 | `const installed = new Map` | `const scoped = agent.ctx` | `team:policy` |
|---|---|---|---|---|
| 0.1.7-alpha.1 | 549 | 530 | 231 | 238 |
| 0.1.7-alpha.2 | 557 | 538 | 231 | 238 |
| 0.1.7-rc.1 / rc.2 / 0.2.0-rc.1 | 557 | 538 | **231** | **238** |

- `231` **是对的**：`const scoped = agent.ctx` 从 alpha.1 起每一代都是第 231 行；
- `232` **是 `0.1.5-rc.2` 时代的读数** —— `presets/README` 那句原文自己就写着 *those were `0.1.5-rc.2` readings*，`adr/0099` L58 亦同；
- 我拿**更早一代**的值当判据，去否定**当前代**的值 ⇒ **删掉的是一个已被验证的正确值，还被扣了「没核过」的帽子**。

⇒ `231` 已恢复；`v1.21.37` 那句判断**撤回**（`README` + `adr/0098` §8.4 都写明真值与撤回理由）。

### 2. ② 补核：`v1.21.36` 用**不相交区间**的比对去「销账」

`v1.21.36` 写「§7 的两条未核本次销账：`dsh-tools` **0 处差异**」—— 那个 0 来自 `rc.2 → 0.2.0-rc.1`，
而 §7 问的是 `alpha.2 → rc.2`。**两段区间不相交**：后一区间没变，推不出「前一区间变了但没影响」。

本轮把那 10 个文件**逐行读了**，并逐字复现 §7 的读数（`dsh-tools` **4** · `dsh-session` **6** ·
`dsh-experimental-agent-team` **18** · `dsh-goal` **1**）：

| 包 | alpha.2→rc.2 变化 | 读了之后：动了什么 | 对本仓 |
|---|---|---|---|
| `dsh-tools` | 4 | 只新增 `displayReason`（审批提示文案的本地化字段）。`tools/result` / `ToolResult` / `callId` / `content` 符号计数两代**完全相同** | 无影响 |
| `dsh-session` | 6 | 新增 `ToolHistoryProjection`、`startsSeries` 字段与注释重写 | 无影响 |
| `dsh-goal` | 1 | 只多注册 schedule 相关类型 | 无影响 |
| `dsh-experimental-agent-team` | 18 | Team 由 profile 层 bundle 提供，本预设不含委派行 | 未消费 |

⇒ 销账这次**成立**，但措辞改成「**补测销账**」。

### 3. ③ 降级：`--dump-config` 证明不了「确被读取」

`v1.21.36` 写「`--dump-config` 含 `preset-projection` ⇒ 声明行**确被读取**」。三条反证：
① `dsh --help` 自述 `--dump-config` = *print the composed profile tree **and exit*** ⇒ **不 mount**；
② 本轮 dump 里 **`fiberPhase` 出现 0 次**（§7 曾引 `preset-projection（fiberPhase: active）`）；
③ dump 里 `agent-preset-registry` 的 **`config.default: standard`** ⇒ 这个 profile 的默认预设是 **standard**。

⇒ 改为「行**被组合进** `0.2.0-rc.1` 的 profile 树」；「本会话跑的是哪个预设、`preset-projection` 有没有真被挂载/注入」列入**未核**（`BACKLOG` V10 连带项）。

### 4. ④⑤⑥ 三处收尾

- **④ 自纠不彻底**：`v1.21.37` 声称把「归一化读数」换成平白说法时**漏了 `adr/0098` §8.4** ——
  那句中间多「行号」两字，而我的 grep 用的是精确串 ⇒ 没命中。本版按**概念**查补齐。
  教训：**不能拿一个字符串 grep 当「修完了」的证据。**
- **⑤ 术语用错档位**：「硬依赖面」—— 但 CONTEXT 的术语表里 **硬依赖** = `ctx.on`/`ctx.inject`/`ctx.get`/`fs`/`tools`，
  而 **`systemPrompt` 是可选依赖**。4 处（`README` · `CONTEXT` · `index.ts` 注释 · `adr/0098` §8）改为
  「**本仓消费的宿主服务面**（实现这些服务的包）」。
- **⑥ 依据升级为实测**：载体包在 `alpha.2` / `rc.1` / `rc.2` 逐文件 MD5 一致（指纹 `88AF31B46A7B`），
  且 `rc.2 → 0.2.0-rc.1` **0 处差异** ⇒ 「这些读数对当前代也适用」这条不再是**继承**来的；并**注明 `alpha.1` 不在该区间**
  （载体 549 → 557 行，那条 +8 的位移正是 `installed` 530 → 538 的来源）。

### 5. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | `231` 真值 | 五棵 dlx 树逐行数 | `const scoped = agent.ctx` 五代表 **231**；`installed` alpha.1 **530** / alpha.2 **538** |
| 2 | §7 读数复现 | 两代树逐文件 MD5 | `dsh-tools` **4** · `dsh-session` **6** · `dsh-experimental-agent-team` **18** · `dsh-goal` **1**（与 §7 吻合） |
| 3 | 被删的值已恢复 | `grep '231'` | `README` 与 `adr/0098` §8.4 均给出真值（不再有「没核过」的判断） |
| 4 | 两处措辞误用清零 | 全仓 `grep '硬依赖面'` / `grep '归一化行号读数'` | 「硬依赖面」正文 **4 处清零**（仅剩本条目引用该词）；「归一化行号读数」`BACKLOG` 2 处改平白，正文清零 |
| 5 | 三方版本一致 | `npm run audit:docs` ① | **`1.21.38`**（`package.json` / README 当前版本行 / CHANGELOG 首条） |
| 6 | 三处基线声明 | `npm run audit:docs` ⑦ | `0.2.0-rc.1`（本版未动基线） |
| 7 | 全仓闸门 | `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` | **exit 0** · `[run-tests] 共 70 个检查（70 通过 / 0 失败）` · `ALL PASS ✅` |

### 6. 诚实标注

- 本版**只改文档 + 一处注释措辞**（`index.ts` 的注释），**不动行为代码、不动验证基线**；
- 这是本会话**第 3 次自纠**：① `v1.21.36` 复杂度热点上涨（`index.ts` 368→373）；② `v1.21.37` 错数 `178`；
  ③ 本版**撤回 `v1.21.37` 的误判**。三次同源：**写数 / 下判断之前没有当场核**。
  第 3 次尤其值得记：**自纠本身成了新的错误来源** —— 修错的动作如果不带同样强度的复核，就会变成下一处错。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T17-C` 的默认值前置条件 ①（`query-error` 有界重试 + 退避）；审计 ref 进 atom lineage（需先过契约面决策）；
  两份外来材料若要**吸收**（而不是登记），需按惯例**先立 ADR**（判据见 `references.md` §22 / §23）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）。
