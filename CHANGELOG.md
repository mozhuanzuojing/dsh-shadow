# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.33] `T26` 执行：**删掉零消费者的 `decision/` 整层** + 补上棘轮闸**缺的那一半**（`--confirm-shrink`）

**用户裁定（2026-09-25）**：`T26` 的选项不是「接线 / 维持现状 / 删除」里的 ③，而是**更强的那个 —— 直接删掉**。
理由按用户一贯口径：**没使用者的机制要么用要么删**。

### 1. 删之前先查锚点（`D1` 的教训）+ 实测「零消费者」

- `grep` 全部**产品面**（`index.ts` / `core/` / `query/` / `persistence/` / `selfhood/` / `subject/` / `epistemic/` / `stance/` / …）
  ⇒ **零处** import `decision/`；该层只被自己的测试与工具扫到。连 `choose()` 也只有测试调用（10 处），
  与 `adr/0096` §12 记的「唯一引擎只报 `null`」互相印证。
- 找到**两处会变成死引用的锚点**（这一步才是「查锚点」的实际价值）：
  ① `tools/audit-layers.lib.ts` 的 `PURE_MODULES` 里有 `decision/types.ts`（白名单对**不存在的路径必须报腐化** ⇒ 留着天天红）；
  ② 同文件 `DIRECTION_RULES` 里 **3 条 `decision` 层禁令**（层没了还留禁令 = **永不命中的死规则**，正是本仓最忌的「门绿着、判别力没了」）。

### 2. 删了什么 + 代价（如实记，不缩小）

- 删除 `decision/` 全部 6 个文件（`choice.ts` / `engine.ts` / `guard.ts` / `heuristic.ts` / `lineage.ts` / `types.ts`）
  + 只测它的 `test/decision-primitive.test.ts`（236 行）；同步清掉上面那两处引用。
- **代价**：`T19` 的证据指针（`test/decision-primitive.test.ts` ⑦「`EngineDeclaration` 字段集恰好四个」）**随之失效**
  —— 结论仍成立，但**重放路径消失**（已在 `BACKLOG` 就地补注）；`adr/0096` §12 的论证失去可跑锚点（协议仍在、实现没了）。
  `MATERIALS.md` 的「已吸收 `choice` 原语…」是**历史台账**，不改。
- `adr/0096` 追加**补记**（记录删除决定、实测前提、影响面、代价、以及「为什么不选维持现状」）。

### 3. 顺带发现并补上：棘轮闸**缺的那一半**（`--confirm-shrink`）

- **现象**：删完之后 `audit:ratchet` 的 **V7 语料健康门**判 `PARTIAL`（A 段线索 **33 → 25**，跌 24% > 20% 容许带）
  ⇒ **拒绝 `--update-ratchet`**。而闸自己的提示是「**先确认**是『真修好了』还是『工具坏了』」——
  **却没有留下「确认」这个动作的位置**（同型问题本仓早记过一次：`PARTIAL` 拒绝录基线 ⇒ 把口径修正也堵死了）。
- **补法（刻意窄）**：新增 `--confirm-shrink "<一句人话理由>"`，判据在 `tools/corpus-health.lib.ts` 的 `shrinkConfirmVerdict`，
  **只**放开「**文件面健康 + 哨兵齐 + 只有线索面骤降**」这一种 `PARTIAL`；理由与前后数字写进基线的 `confirmed_shrinks` 段
  （**确认本身也留痕**，不是静默放行）。
- **它不是万能开关**：`EMPTY` / `UNKNOWN` / **哨兵缺失** / **文件面骤降** 一律拒绝；**理由为空或空白也拒绝**
  —— 正反对照进了 `tools/corpus-health.selftest.ts` 的 **⑫**（每条负对照都必须红）。
- 本次实际记录：`{from: {files 963 → 954, findingsA 33 → 25}, reason: "T26: 用户 2026-09-25 决定删掉 decision/ 整层…"}`；
  wiring 段新基线 `a1=18 / a2a=3 / a2b=0 / a3=4 / a_total=25 / b_keys=102`（drift 侧 `NORMAL`、逐桶相等）。

### 4. 验证

- `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` → **exit 0**（`run-tests` **69/69**：删掉那个测试文件后 70 → 69）。
- `node tools/audit-wiring.ts . --update-ratchet --confirm-shrink "…"` → exit 0，且**基线里确实留下了 `confirmed_shrinks`**（已回读核对）。
- `npm run audit:ratchet` → 两个消费者都通过（wiring 已确认收缩、drift `NORMAL` 逐桶相等）。
- `node tools/corpus-health.selftest.ts` → `ALL PASS ✅`（含新增 ⑫ 的 9 条断言）。
- `npx tsc -p tsconfig.tools.json` → exit 0。

### 5. 诚实标注

- 「零消费者」是**实测**（grep 产品面），不是推测；但**删除是不可逆的**（重放只能回 `v1.21.32` 及以前的提交）。
- `--confirm-shrink` 是**新开的确认通道**：它把闸的判据**放宽了一条**（只在这一种形状上）。
  这是有意的取舍（闸的提示要求人确认，而此前无处记录确认），代价是**多了一个将来可能被误用的口子** ——
  故：理由必填、负对照齐全、记录进基线、且不覆盖「工具坏了」的那几种形状。
- 本版**没有**做 `T27`（审计→证据的路径键）—— 那是下一件，尚未开工。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T27`（审计记录按**文件路径**当线索键接进证据面，缺路径标「归不了」）→ `T17-C` 的默认值前置条件 ①。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）。
