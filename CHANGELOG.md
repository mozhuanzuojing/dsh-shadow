# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.28] `T11` ① 结案：**留出集落地**（时间窗切点 + 默认排除 + 口径必须声明）

**工具面 + 协议面 + 台账面**。由来（hl_mem 的量化代价）：它在**同一份 400-bundle dev** 上调参拿到 13/13，
而在**独立 held-out-r5 只有 3/13**（另产生 27 条错误 edge / 3 条反例误 supersede）⇒ 整批撤回。
本仓此前**连一条 A/B 分离都没有**（自证式标定：调参与报告同源）。

### 1. 分离形态（决定：留出集用什么语料、谁不读它）

- **留出集 = `>= holdout_from` 的记忆**，切点是**协议常量**（`tools/retrieval-eval.protocol.json`，
  本机切点 `2026-09-24`）——改切点＝改数据、被 diff 审阅（**预注册**：先定切点，再看读数）。
- **调参期不读留出**：`verify` 里的 `eval:retrieval:check` 跑 **dev 切片**（`< 切点`），**默认路径结构上排除**留出。
- **报告口径**显式 `--holdout-only`（**刻意不在 `verify` 里**，就是为此）。

### 2. 判据收一处 + 标定（新增两组）

- `tools/retrieval-eval.lib.ts`：`isHoldoutRel`（无日期 ⇒ 算调参集，**绝不**谎报有留出集）/ `splitVerdict`
  （两侧都必须 ≥1）/ `corpusRoleVerdict` / `phaseVerdict`；`checkProtocol` 新增「**切点必须声明且是 `YYYY-MM-DD`**」。
- `tools/retrieval-eval.selftest.ts`：**⑭ 切分**（切点当天/之后算留出、之前与无日期算调参、两侧为空都拒）、
  **⑮ 口径/阶段**（缺件 / 简写 / 大小写 / 写成路径或日期都红）—— 每类都有正反对照。

### 3. 口径必须可区分（新门）

- 录基线**强制**显式声明 `--corpus-role <live-workspace|frozen-snapshot>`，**缺件即拒**（不许默认成某一个）：
  基线是「报告口径」的锚点，不声明就无法判断它是不是拿调参语料录的。
- 基线新增 `corpus_role` / `eval_phase` 两个**枚举**字段（仍满足「基线只含聚合面」的形状白名单）；
  `--check-baseline` 缺它们即红，并如实打印「当前语料 sha vs 基线 sha ⇒ **数值不可比**」——
  **刻意不算违规**：本仓语料是活的，判违规＝常红的假闸门（「不可比」是第三种结论，不是失败）。

### 4. 两侧读数（本机 `net1`，同种子同日）

| 策略 | dev 切片（572 条 · sha `11d2a85b`） | 留出切片（460 条 · sha `f03fdbea`） |
|---|---|---|
| A 单库·词·有阈值 | recall 0.2978 / 噪声 0 / 预算 3.571 | **0.3422** / 0 / 3.571 |
| C 扇出2库·无阈值+RRF | 0.2844 / 1 / 5 | 0.3089 / 1 / 5 |
| F 单库·二元组·有阈值 | 0.2600 / 1 / 5 | 0.2733 / 1 / 5 |

⇒ **两个口径的数字不同**（A 差 **+0.044**）⇒ **不能拿 dev 的数字当报告数字**；
但**策略排序与两条关键结论在留出切片上同样成立**（扇出无召回增益 / 无阈值灌噪声）。
与 hl_mem「dev 13/13 → held-out 3/13」的崩塌**相反**：本仓这次是**数值变、结论不变**。

### 5. 基线重录（写明为什么旧基线失效）

旧基线（`dataset_sha256` 前 12 位 `1e770df7f36e`，`source_files=1585`）**早于 `v1.21.0` 的 projections
排除修复** ⇒ 那份哈希对应的是**另一种语料定义**（把「每个原子一份的便利贴」也数了进去）。
本轮以 `--corpus-role live-workspace` 重录（dev 切片，572 条）：`1e770df7f36e` → `11d2a85b3166`。

### 6. 验证

- `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` → **exit 0**（`run-tests` 69/69）。
- 可重放：`node tools/retrieval-eval.ts --update-baseline --force --corpus-role live-workspace`（dev 口径）；
  `node tools/retrieval-eval.ts --holdout-only --json`（报告口径）；`node tools/retrieval-eval.ts --check-baseline`（门）。
  三条都手工跑过：`--check-baseline` 打印出基线与本次的 `corpus_role` / `eval_phase` / 语料 sha 对照。

### 7. 诚实标注（做不到的不假装）

- **本机没有冻结快照** ⇒ 没有在 `frozen-snapshot` 口径上录过基线；**报告级基线需要一份冻结语料**（属用户侧资源）。
- **marker-free 不变式（MemStrata）未实现**：本仓语料目前没有 `[OUTDATED]` 这类文本过期标记，
  按本仓「不造没有消费者的机制」**登记不实现**。
- 三条 **CLI 行为**（缺切点即拒 / 缺 `--corpus-role` 即拒 / 拒绝覆盖基线）未做成子进程断言 ——
  已写进 `retrieval-eval.selftest.ts` 末尾的「未在测试中验证」清单（不缩小承诺）。

### 8. 棘轮记账：`b_keys` 100 → 102（+2）

| 新线索 | 位置 | 为什么不是缺陷 |
|---|---|---|
| `phase=dev` · `phase=holdout` | `tools/retrieval-eval.lib.ts` 的 `phaseVerdict` | 比较的是**阶段声明**（来自 CLI 的 `--holdout-only`）。值的**生产者在调用方**（`PHASE = FLAG("--holdout-only") ? "holdout" : "dev"`），而文本分析看不到跨文件的那个赋值 ⇒ 与上一版的 `t=--dry-run` **同族**（外部输入 / 声明校验），**不是**「忘了接线」 |

- 录基线：`node tools/audit-wiring.ts . --update-ratchet`；`audit-drift` 的桶未变，未动它的段。
- 录基线**不等于**「这些无害」——它是「**有人看过并记账**」；下次真要动它们，棘轮仍会因**桶消失**而红（缺件不静默）。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = **dev 切片（默认）** / **留出切片（报告，显式 `--holdout-only`）**。
- **下一批**：`T13` 后半（复杂度预算，须先立 ADR）→ `T17-C` → `T18` 另半边 → `T21`。
- **仍等你**：`D2` 填可信根（只有人能加）· `6.3 待定语义`（明写「不修，需先拍板」）· 一份**冻结语料**（报告级基线）。
