# ADR-0062: 接线审计工具（找「机制存在但接线断了」）；确认 ChangeSet 未接线但非缺陷

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0048⑤（变革驱动索引——本 ADR 审计的正是它的接线状态）、ADR-0057（P0：`toolset` 未挂进 `readQueries`）、ADR-0059（引用漂移的两处假失效）、ADR-0061（取代生命周期未回填）
- 关联术语：`../CONTEXT.md`
- 版本：`1.15.19`

## Context

本仓在 v1.15.13–18 之间**连续挖出四类同源缺陷**，且**单元测试全部是绿的**：

| 版本 | 缺陷 | 为什么测试测不到 |
|---|---|---|
| v1.15.13 | `readQueries` 漏挂 `toolset` → 整块台账三个版本无入口 | 三个既有测试**直接 import 执行函数**，从不走 dispatch |
| v1.15.15 | `fsExists` 无条件拼 `${ws}/${rel}` → 绝对路径证据被判失效；目录引用同类 | 执行函数是对的，断的是**输入形态**（绝对路径/目录） |
| v1.15.18 | `meta.status === "superseded"` 三条分支**无写入者**（唯一写入者是测试夹具） | 测试夹具**手工塞入**了那个值 |

共同特征：**机制是对的、执行函数是对的，断的是「谁调用它」或「谁写这个值」**。
这正是「单元测试测执行、不测接线」的结构性盲区。故值得做一个**专门的审计工具**——
不是为了抓这四个（已修），而是**为了下一次能自动发现同类**。

## Decision

### 1. 新增 `tools/audit-wiring.ts`（+ `.lib.ts` + `.selftest.ts` + fixtures）

两类判据，纯静态、无 LLM、无网络、不改文件：

- **A. 导出但生产代码无调用点** —— 数 `Name(` 形态的**调用/实例化**，减去 `function Name(`。
- **B. 只被读、生产代码无写入点的判断值** —— 对每个 `字段 === "值"`，找是否有行内「字段…值」共现的生产者。

### 2. **工具必须先标定，再用**（本 ADR 最重要的一条）

初版在真仓库上报「A 类 0、B 类 10」，而其中 B 类 10 条**全是误报**——`status: violated ? "violated" : "satisfied"`
这种**三元写**我的检测器看不到。**一个不会报警的检测器，报「0」是没有意义的。**

故新增 `tools/audit-wiring.selftest.ts`，用已知答案的夹具（`tools/fixtures/wiring-fixture.ts`）标定。
标定过程**连续暴露了 4 个工具自身的缺陷**，每一个都会导致错误结论：

| # | 工具缺陷 | 后果 | 修正 |
|---|---|---|---|
| 1 | 三元写不认（`status: c ? "v" : "s"`） | **误报**把可达分支说成不可达 | 改按**字段+值**行内共现判定 |
| 2 | 改按「字面量」判定后，**跨字段同名值**算作写入者 | **漏报** —— 恰好漏掉 `status=superseded`（`"superseded"` 被生产成 `verdict`/`outcome`，不同对象） | 回到**字段+值**联合判定 |
| 3 | **扫注释文本** | 夹具里一句说明 `meta.status === "superseded"` 被当成真代码 | 加**尊重字符串的注释剥离**状态机 |
| 4 | 分类器 `/[\\/]test[\\/]/` **要求前导斜杠**，相对路径 `test/x.ts` 不匹配 | **顶层 `test/` 从未被排除** ⇒ 测试夹具的 `status: "superseded"` 被当成生产写入者，**恰好掩盖**要抓的真缺陷 | 改为**按路径分段**判定（`isProductionPath`） |

第 4 条尤其说明「标定」的价值：**工具的分类器 bug 会把真缺陷掩盖成"没问题"**。

另有两处比较行自匹配（`if (r.phase === "ghost")` 里 `phase` 与 `"ghost"` 同行共现，
于是**读点冒充写入点**）与箭头函数定义误减，均由标定测试抓出并修正。

### 3. 审计结论：**一处确认，其余多为误报**

**确认（真发现）**：`ChangeSet`（`core/change-set.ts`，83 行）与
`ShadowProjectionStore.invalidateFor?()`（`core/projection-store.ts`）**在生产中未接线**：
- `ChangeSet` 唯二消费者是 `test/change-set.test.ts` 与 `test/projection-store.test.ts`；
- 生产侧只在**类型位置**提到它（`invalidateFor?(set: ChangeSet)`），而该方法**本身也无调用者**；
- 生产走的是**粗粒度清空** `invalidateProjection` → `invalidate()`（`writer-materialize.ts:213`）。

**但这不是正确性缺陷**（本 ADR 明确纠正可能的夸大）：
- 投影缓存是**可重建派生**，清空后下次读自动重建 ⇒ 粗粒度路径**正确**；
- ADR-0048⑤ 的「变革驱动」是**优化**，接线它需要**写侧新增变更跟踪**
  （现有 `rebuildIndex` 走 `listMemories` 全量扫描，不产出 `ChangeSet`）；
- 且伴随真实取舍：清空 = 一次极小写 + 下次全量重建；`invalidateFor` = 读全量缓存 + 写回，换下次读更快。

⇒ **处置**：保留实现与测试，在 `change-set.ts` 与 `projection-store.ts` 的**代码里显式标注「生产中未接线」**，
并记入本 ADR。**不臆造接线**（本仓纪律：不引机制除非有据），由后续决策是否接线或删除。

**误报（已识别，不计为缺陷）**：
- **A 类精度低**：本仓有意导出大量**面向测试的包装 API**。典型：`delegation/guard/*` 的
  `assert*` 包装函数（返回 `{ok, reason}`）只被测试调用，但它们包裹的**判定函数**
  （`contextHasNoExpansionField` / `resultNoPermissionUpgrade` …）在生产里**确有**被
  `delegated-execution.ts` 导入使用 ⇒ 不是断线。
- **B 类噪声**：`typeof x === "object"`、`mode=*`（mode 由**调用方/模型**传入，属外部输入）、
  `code=ENOENT`（Node 错误码）——分支可达，只是不由本仓生产。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 用 ESLint 的 `no-unused-vars` / `ts-prune` 等现成工具 | 它们判「未使用」是按**名字引用**，正是本 ADR 修正掉的那种粗判；`ChangeSet` 有类型导入+接口签名，现成工具同样漏报。且本工具要判的是「**值有无生产者**」，现成工具不做 |
| 用 TypeScript 编译器 API 做精确分析 | 能做对，但引入重依赖、且本工具只需**线索**不需要完备。当前文本启发式 + **强制人工复核**已够 |
| 不标定，直接用工具输出 | **已实测后果**：初版输出全是错（0 真报、10 误报）。不标定的检测器其结论不可采信 |
| 直接接线 `invalidateFor`（顺带"修好"） | 需写侧新增变更跟踪 + 性能取舍，属**设计变更**；且现状不是缺陷。不臆造 |
| 删掉 `ChangeSet` / `invalidateFor` 死代码 | 它是 ADR-0048⑤ 的落地物、有测试；删掉会丢一个已记录的决策。故**标注**而非删除 |

## Consequences

### 正
- 有了一个**能自动发现同类问题**的工具，且它**自身经标定**（8 组断言，含 2 处真仓库已知答案）。
- 标定过程暴露的 4 个工具缺陷本身是**方法论收获**：静态分析器必须尊重字符串/注释、
  必须按路径分段而非正则、必须区分「读点」与「写点」、必须做**已知答案回归**。
- 把一处**未接线的优化**从「静默」变成「显式标注 + 有据可查」——避免以后有人以为它在工作。
- 明确了 A 类**在本仓精度低**及其原因（有意导出测试向 API），避免把它当缺陷清单用。

### 负 / 已知边界
- **A 类精度低**（本仓特性）；**B 类噪声多**（外部输入值无本仓生产者）。工具是**线索发现器，不是缺陷清单**。
- 只做**单行 200 字符窗口**匹配：**跨行**构造的对象会漏判。
- **无类型分析**：不区分「哪个对象」的字段，同名字段挂不同对象时会混判。
- 未接入 CI（本仓无 CI）；靠手动 `node tools/audit-wiring.ts`。

## 自检

- [x] 与 ADR-0057/0059/0061 一致：本 ADR 是该三条同类缺陷的**方法论收口**（不只修个案）。
- [x] 与 ADR-0048⑤ 一致：**未推翻**其决策；只审计并标注其接线状态，处置留待决策。
- [x] **未夸大**：`ChangeSet` 明确记为「未接线的优化，非正确性缺陷」，并给出理由。
- [x] 工具经**标定**：8 组断言全过，含 2 处**真仓库已知答案**（`status=superseded` / `ChangeSet`）与 2 处**反例不误报**。
- [x] 标定中修正的 4 个工具缺陷全部记录在案（本 ADR §2 表），可复现追溯。
- [x] 全套回归通过；`tools/` 已在 `package.json` 的 `files` 白名单内（随包发布）。
- [ ] **未验证**：A 类命中是否还有**第二处**真实断线（本轮只逐条核实了 guard 类与 `ChangeSet`）。
- [x] ~~**未做**：A 类 ~30 条未逐条分诊~~ → **已结（v1.15.33，见下节）**。
- [ ] **未做**：把审计接入任何自动门禁（本仓无 CI）。

---

## 补记（v1.15.33）：A 类**逐条**分诊结案 —— 33 条全部落格

`BACKLOG.md` 的 **T1 / T4** 要求「A 类每条落『误报 / 真断线 / 零引用』三选一，结果回写 ADR-0062」。
本轮把 **A 段 33 条**逐条核实完毕（`node tools/audit-wiring.ts .`，生产源码 192 个）。

### 0. 先说工具的口径（否则会误读结论）

1. **`tools/` 被算作生产**：`isProductionPath` 只排除 `node_modules/dist/test/tests/fixtures/__tests__`。
   故 `auditDrift` / `countInconsistency` 这类工具内部符号会进 A 段。
2. **工具数不出三类调用**（原记「三条盲区」）：
   ① 调用点只在**注释**里；② 经**数组/变量间接调用**（`for (const g of guards) g(x)`）；
   ③ 「成对导出、只接一半」的**平行 API**（谓词接线、`assert*` 包装不接线）。
   本仓绝大多数 A 类线索都属这三类 —— 这正是原 ADR 只说了结论、没说成因的那条「A 类精度低」的**具体成因**。

   > ⚠ **本条已更正（v1.15.36，逐条实测后）**：上面 ① 的**位置与方向都记错了**。实测三种形态：
   >
   > | 形态 | 旧实现判出的调用点数 | 真相 |
   > |---|---|---|
   > | **注释**里 `Foo(` | **0** | 旧实现**早已** `stripComments` ⇒ **不是盲区** |
   > | **字符串**里 `Foo(` | **1** | **真盲区**：把死代码看成活的 ⇒ **漏报**（比误报危险） |
   > | 块注释 / 行注释 | 0 | 已正确 |
   >
   > ⇒ 真正的盲区是**字符串**（不是注释），方向是**漏报**（不是误报）。
   > 已在 `countCallSites` 改用 `maskStrings` 修掉（见下「补记（v1.15.36）」）。
   > **教训**：这条「成因」当初是**推理**出来的、没实测 —— 而它被写进 ADR 后就成了「事实」。
   > 与本仓一贯纪律（先量证再下结论）相悖，故在此显式更正。
3. **A 段计数随语料变**：本轮实测 **33**（`adr/0062` 原文记 ~30；差异来自删/增符号）。

### 1. 分诊结论

| 类别 | 条数 | 符号 |
|---|---|---|
| **误报 · 生产有真调用点（含间接）** | **9** | `renderExperience`（`query/query.ts:251` 作回调传入）、`sembleCandidates`（`index-engine.ts:45` 默认参数注入）、`apply`（**唯一调用者是 Cordis 宿主**，依 `cordis.patch.yml` 挂载 + `package.json` main）、`ledgerMismatch`（`toolset-authority.ts:24` import + 测试棘轮消费）、4 个长程 `assertResultNo*`（`long-horizon/engine/interaction.ts:11-17` 入 `resultGuards` 数组后 `:43` 间接调用） |
| **误报 · 调用点只在注释里** | **2** | `progressiveDisclosure` / `refineTree` —— 生产命中仅定义行 + `core/knowledge-engine.ts:8` 的**清单式注释**。⚠ **更正 BACKLOG T1 原文**：T1 把它们写成「误报，但值得记」，措辞含糊 —— 准确表述是**仅测试消费**（真实消费者 `test/knowledge-engine.test.ts:53,59`），**不是**「有生产调用点」 |
| **误报 · 跨层 API** | **1** | `ChangeSet` —— `core/projection-store.ts:85` 的 store 工厂在生产被调用（`:168`），故 `invalidateFor(new ChangeSet(...))` 是**可达消费点**。⚠ **与 D1 的关系**：D1 说「`ChangeSet`/`invalidateFor` 生产中未接线」**仍然成立**（无生产**实例化点**）；两条不矛盾 —— 一条说「接口可达」，一条说「没人实例化」。⇒ **D1 维持原判** |
| **零引用（生产 + 测试皆无调用）** | **18 符号 / 8 决定** | 见 §4 表 |
| **仅测试消费** | **4** | `renderRetrieved`、`isExchangeable`、`readTemporalGraph`、`readGraph`（后二者 ADR-0071 已定「保留 + 改正 + 收敛」） |
| **真断线（原本意图接线却断了）** | **1** | **`countInconsistency`** —— 见 §2 |
| **工具自身** | **2** | `auditDrift`（全仓零引用，**已删**）、`countInconsistency`（**已接线**） |

### 2. 真断线（**本轮唯一一处，已修**）：`countInconsistency` 从未被执行

- **事实**：`tools/toolset-authority.lib.ts:66` 定义了 `countInconsistency`，注释写明
  *「清单自洽性：`counts` 必须与 `rows` 实际相符」*；但 `tools/toolset-authority.ts:24` 的 import
  **不含它**，CLI 只调 `unsubstantiatedMeasured`（`:74`）后直接 `writeFileSync`（`:111`）
  ⇒ **`counts` 与 `rows` 的自洽性在生产里从未校验过**，只有 `test/toolset-authority.test.ts` 在跑。
- **为什么算「真断线」而不只是「零引用」**：它有**明确用途注释**、且 `counts` 是**下游要读的汇总**
  （离线棘轮断言 `falseMeasured === 0`）—— 一个**从不执行的检查与没有检查等价**（本 ADR 的原始命题）。
- **修法**：在 `writeFileSync` **之前**调用它；不一致则打印 + `process.exit(1)`，**拒绝写入坏清单**。
- **锁**：`test/toolset-authority.test.ts` **⑥ 接线棘轮** —— 断言 CLI **import 了它**、
  **调用了它**、调用发生在 **`writeFileSync` 之前**、且失败路径是 `process.exit(1)` 而非只打日志。
  **这不是「断言函数存在」，而是断言「CLI 调了它」** —— 后者才是本 ADR 命题的正解。
  已验证**先红后绿**（临时移除 import ⇒ 红）。

### 3. 与 T5 同型的第二处真漂移：`isExchangeable` 重写了唯一源（**已修**）

- **事实**：`federation/types.ts:13` 的 `EXCHANGEABLE_KINDS` 是这份清单的**唯一源**（且**零引用**），
  而 `federation/contract.ts:23` 的 `isExchangeable` **再手写一遍**同一三元素数组字面量。
- **危险点（比 `c.status=supported` 那次更具体）**：`ExchangeableKind` 是联合类型，
  `EXCHANGEABLE_KINDS: ExchangeableKind[]` **会被类型检查**（漏一个编译不过），
  但 `isExchangeable` 的内联字面量**不受该类型约束** ⇒ 将来加第四种可交换种类时，
  类型系统会**逼你**更新 `EXCHANGEABLE_KINDS`、却**不会**提醒 `isExchangeable` ⇒ 静默漏掉。
- **修法**：`isExchangeable = (kind) => EXCHANGEABLE_KINDS.includes(kind)`（引用唯一源）。
- **未加单独棘轮（诚实标注）**：与 T5 的 `claim-admission` 不同，这里**类型系统已承担主体约束**，
  内联重写已消除；再加源码级正则棘轮边际价值低，故只做收敛 + 本记录。

### 4. T4 余下各项的处置（各落「接线 / 删除 / 保留并注明」）

| 符号 | 处置 | 理由（已写进代码注释） |
|---|---|---|
| `auditDrift` | **删除** | 全仓零引用（生产 + 测试 + 夹具**都**没有）。判据不是「没人 import」，而是它**没有任何信息价值**：只是把两个检测器打包成一个对象，删掉不减少任何能力。CLI 直接调两个检测器，本就不经过它 |
| `countInconsistency` | **接线** | 见 §2 |
| `isExchangeable` (+`EXCHANGEABLE_KINDS`) | **收敛** | 见 §3 |
| `writeMeta` | **保留并注明** | `persistence/meta.ts:92` 已声明是「明确要覆盖」的逃生舱；生产写 meta **一律走 `mutateMeta` 事务**（ADR-0068）⇒ 它不是遗漏接线，是**有意留的后门**。本 ADR 登记结论、不重复其注释 |
| `relationForProposal` | **保留并注明**（+ **新风险**，见 §5） | `temporal/edge.ts:29` 原文已写「保留：…v0.26 不跑 reflection，留接口」 |
| `renderIntent` / `renderIdentityModel` | **保留并注明** | 二者同型：都是**完整形态的渲染器**，而实际读侧走别的路径（`observer/core.ts:31` 内联 / `soul/identity.ts` 的 `renderIdentity`）。它们承载「完整形态」的唯一落点，删掉会让模型只能以原始 JSON 出现；**接线与否属产品决策** ⇒ T1 待决。已在两处代码加注 |
| `progressiveDisclosure` / `refineTree` / `renderRetrieved` | **保留并注明** | `adr/0048 ①/②` 的**目标能力**，实现完整；是否启用属产品决策（默认路径可能刻意不做成本折叠）⇒ T1 待决。已在 `core/knowledge-cost.ts` 加注 |
| 7 个 delegation `assert*` 包装 | **保留并注明** | 「谓词接线、`assert*` 不接线」是**一处决定**，不是 7 处缺陷。已在 `expansion-guard.ts` 加注（家族级） |
| `hasNoUpgradeApi` | **保留（暂不处置）** | 它是 `agency/guards.ts` **唯一**未被 `agency/engine.ts:4` import 的导出（同文件另 15 个都被用）—— 「遗漏接线」还是「有意保留」本轮**未能判定**，且删它要动 invariant 面 ⇒ 留在 T4 |
| `isMetadataMemoryText` | **保留并注明** | ADR-0066 已决定保留（服务不 `parseMemory` 的读路径） |
| 4 个长程 `assert*` | **误报** | `interaction.ts:11-17` 入数组、`:43` 循环调用 |

**`assert*` 家族的结构性结论**：delegation 7 + 长程 4 = 11 个 `assert*` 的**唯一消费者是测试**。
根因是**同一个决定**（导出「带理由」的断言包装作测试面），**不是 11 处独立缺陷**。
⇒ 处置按**家族**做（加一条家族注释），不逐条删 —— 删一个会与其余不一致。

### 5. 本轮**新发现**（未修，已登记为待办）

**`relationForProposal` 忽略入参**：`temporal/edge.ts:30` 签名为 `(_n: any)` ⇒ 恒返回 `"evolved_into"`。
它现在是**零引用**所以无害；但**一旦接线**（例如把 `TemporalEdge.relation` 改由它决定），
调用方传什么都会被丢弃、**静默统一成 `evolved_into`**。已加注并升为 `BACKLOG.md` **T7**。

### 6. 计数与验证

- A 段：**33 条 → 31 条**（减少来自 `auditDrift` 的删除；`countInconsistency` 仍被工具报出，
  但它现在是**已被接线的**，其「零调用」判定已失效 —— 这正是**记录的接线棘轮**要守的）。
- `npx tsc --noEmit` / `npm run typecheck:tools` / `npm run build` 均 **exit 0**。
- 全套回归 **40/40**；`audit-drift.selftest` 与 `audit-wiring.selftest` 均 **ALL PASS**。
- **诚实标注**：A 类是**线索级**；本轮结论基于**人工 grep/read**（每条带 `文件:行号`），
  非工具自动判定；工具自身的盲区（间接调用 / 平行 API）**未修** ⇒ A 段仍会误报。
  （原文写的「三条盲区（注释 / 间接调用 / 平行 API）」已由 v1.15.36 更正为「**字符串** / 间接调用 / 平行 API」——见 §0 的更正表。）

---

## 补记（v1.15.36）：**修工具自身的盲区** —— 字符串内调用形状 + 三类误报分桶

用户在 T1/T4 结案后指示「fix 审计工具的三条盲区」。本轮**逐条实测**后发现：
**原记的三条里有一条记错了**，真正的盲区在**另一个位置、且方向相反**。

### 1. 逐条实测（先量证，再动手）

用探针（TS / node26）在 `countCallSites` 上跑五种形态，结果**推翻了原记账**：

| 形态 | 旧实现判出的调用点数 | 判定 |
|---|---|---|
| **注释**里 `Foo(` | **0** | 旧实现早已 `stripComments` ⇒ **不是盲区** |
| **块注释**里 `Foo(` | 0 | 已正确 |
| **字符串**里 `Foo(` | **1** | **真盲区**：字符串内嵌的调用形状被当成真调用 ⇒ **漏报**（死代码看成活的，比误报危险） |
| 数组间接调用 `guards = [f]; for (g of guards) g(x)` | 0 | 确认（②，无法靠文本解决） |
| 平行 API（`assertX` ↔ `x` 只接谓词） | 0 | 确认（③，无法靠文本解决） |

⇒ **原 ADR 记的「注释」是推理出来的、没实测**，而它写进 ADR 后就成了「事实」。已更正（§0）。

### 2. 修复 ①（真盲区）：`maskStrings`

新增 `maskStrings(src)` —— 在 `stripComments` 之上**再抹掉字符串字面量**，仍是**状态机**（不是正则）：

- 行/块注释、`'…'`、`"…"` ⇒ **整段空白化**（保长度、保换行 ⇒ **行号不漂移**）；
- `` `…` `` 模板串 ⇒ **只抹字面部分，`${…}` 里的代码原样保留并递归处理**
  （`` `${f(x)}` `` 里的 `f(x)` 是**真调用**，抹掉它会制造**新的漏报**）。

`countCallSites` 从 `stripComments` 改用 `maskStrings`。**`stripComments` 保留不动** ——
B 类检测要匹配的**正是字符串里的值**，抹掉它会毁掉 B 类。

**量证**：`stripComments` vs `maskStrings` 在当前真仓库（204 文件 / 516 导出）逐符号比对，
**3 个符号**计数有差异（`isProductionPath` 8→6、`markedLines` 8→6、`notRevoked` 3→2），
均**只是去掉虚高**、未翻转归桶 ⇒ **当前真仓库上零净效果（真但潜伏）**。
这与 ADR-0071 的「运行时收益为 0」同一性质：**修的是「若触发则错」，收益是消除地雷**。

### 3. 分桶 ②③（不伪造精度，改为如实分类）

②（间接调用）与 ③（平行 API）**无法靠文本分析解决**（要类型/数据流分析）。
⇒ 工具**不去猜「它到底有没有被调用」**，而是把原来的「一个 33 条大堆」拆成**四桶**：

| 桶 | 判据 | 实测条数 | 复核价值 |
|---|---|---|---|
| **A2b 导入即闲置** | 被 import，但**导入行之外零提及**（`bareMentions === 0`） | **1** | **最可疑**（未使用的导入 / 忘了接线） |
| **A1 零引用** | 既未被 import、也无配对导出 | **17** | 可疑（可能忘了接线，或纯公开面） |
| **A2a 间接调用/类型位置** | 被 import 且别处**有**提及 | **3** | **基本是误报**，可略过 |
| **A3 平行 API** | 与同文件另一导出成对（`assertX` ↔ `x`） | **11** | **基本是误报**（一处决定，非 N 处缺陷） |

⇒ 需要人工逐条查的：**32 → 18**（A2b 1 + A1 17），其余按**已知形态**可略过。

**关键判据 `bareMentions` 是量证出来的**：抹掉 import/export-from 行后数裸提及、减去定义处那次。
在 A2 候选上它**恰好切开**已知答案 —— `ledgerMismatch` 裸提及 **0**（T1 已核实：仅测试用，真可疑），
而 `ChangeSet` 1（类型位置 `set: ChangeSet`）· `renderExperience` 1（回调 `exps.map(renderExperience)`）·
`sembleCandidates` 1（默认参数值）**全是正当用途**。
⇒ 这条把「8 条要人工查」缩到「1 条真的要看」。

### 4. **第 4 类盲区（本轮新发现，未修）**：传递性死代码

`notRevoked` **有** 2 个调用点（`revocation-guard.ts:7,8`），故它**不在 A 段**。
但这 2 个调用点**都在 `assertNotRevoked` 内部** —— 而 `assertNotRevoked` 自己**零调用**（A3 桶）。
⇒ **`notRevoked` 事实上是不可达的，工具却说它「有接线」**。

本仓真正的模式是「**predicate 接线 / `assert*` 包装仅测试消费**」（§4 的家族结论），
故只有**一处**（`notRevoked` 是靠 assert 包装才「看似被用」的）—— 但这是**同一类问题的新严重度**：
不是「数不出调用」，而是「**数到了，但那调用点在死支上**」。
**修不了的原因是本质的**：这需要**调用图 / 可达性分析**，纯文本判据做不到。
⇒ 已在 `BACKLOG.md` 立 **T10**，本轮只登记不实现。

### 5. 验证

- `npm run typecheck:tools` **exit 0**；全套回归 **41/41 `ALL PASS`**。
- `audit-wiring.selftest` **11 组 → 13 组**（新增 ⑨ 字符串掩码 · ⑩ 分桶判定 · ⑪ 真仓库分桶覆盖 · ⑫ 裸提及判据），
  **含反向不变量**：模板串 `${…}` 里的真调用**必须仍被计数**（防止修 ① 时误伤）。
- `audit-drift.selftest` 仍 **ALL PASS**（B 类未受影响 —— `stripComments` 未动）。
- **诚实标注**：① 在当前真仓库上**零净效果**（真但潜伏）；②③ 是**分类而非修复**（精度未提高，
  只是**可操作性**提高）；④ 未修。

