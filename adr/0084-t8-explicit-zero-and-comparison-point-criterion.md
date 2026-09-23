# ADR-0084: 显式 0 不得被默认值吞掉 + 比较点判据收一处（T8-B 执行记录）

- 状态：**已接受并实现**（2026-09-12 / v1.15.64）
- 关联：`BACKLOG.md` **T8**（本条是其 **B 部分**：2 处开关缺陷）· **ADR-0049**（缺件不静默）·
  **ADR-0063 / ADR-0070**（判据收一处 —— 本条第二半就是它的一次实测）· `adr/0083` §14.1（路线漂移，
  本条是**回到泳道**后的第一个产物）· 用户 2026-09-12 的泳道：`T8 → T15 → D1/D2/D3 → A段 → …`
- 定位：**契约/纪律**（不是能力）。产出一条新纪律 + 修掉一处跨两个工具重复的判据。

## 1. Context：两条独立线索在同一轮里撞上

用户 2026-09-12 定下泳道 `T8 → T15 → …`（`adr/0083` §14.1 记下：我在 M1 之后连续 **8 轮**做
「审查→修」，T8/T15/D1-3/A段/T2 **一项未动**）。本轮回到泳道做 **T8**，其中 **B 部分**（2 处开关缺陷）
的**判据已定、纯实现**，不需要决策，故先做。

做的时候撞出**第二条**线索 —— 一条与 T8 无关、由闸门自己顶出来的：

```
① 修 T8-B，我在 core/util.ts 写了 numOr（内含 `typeof v === "number"`）
② audit-wiring 棘轮如实报：B 类线索**变多** b_keys 115 → 116
③ 查下去：`typeof x === "<类型名>"` 是**定义上的假阳** ⇒ 修掉 wiring 那一份
④ audit-drift 棘轮**紧接着**报：drift_sites 28 → 29（键名不变 `v=string`，只多一处 site）
⑤ 查下去：**同一个假阳在 drift 里还有一份独立实现**
```

第 ⑤ 步是关键：**「什么算一个比较点」此前有两个实现**，而 `audit-drift` 自述
**看不见 `tools/` 内部**的判据分叉（`isProductModulePath` 排除 `tools/`）
⇒ **它抓得到产品代码里的判据分叉，却抓不到自己与兄弟工具之间的那一处**。

## 2. 决定一：`||` 取默认值不得吞掉显式 0（新纪律）

### 2.1 缺陷形态

`Number(v) || dflt` 把「**显式 0**」与「**未传**」混为一谈：`0` 是 falsy ⇒ 用户写的 `0` 被默认值吞掉。
本仓因此有**三处「文档/闸门承诺 0 有意义、代码却不认」**（`BACKLOG` T8-B 原先只记了前两处）：

| # | 位置 | 承诺 0 有意义的**出处** | 被吞成 | 后果 |
|---|---|---|---|---|
| 1 | `core/writer/materialize.ts` 的 `writeAbstracts` → `abstracts.showInIndex`（**修前**在此行取默认） | **`core/types.ts:55` 明写**「默认 3，**0 = 不列**」 | 3 | 文档承诺与代码不符；`!show` 分支**永不可达** |
| 2 | `core/writer/core.ts` 的 `createWriterCore` → `episodes.showInIndex` | T8-B 立账时判定 | 8 | `core/writer/materialize.ts` 的 `rebuildIndex` 里 `episodeShow > 0` **恒真 = 死分支** ⇒「关掉 Episodes 段」**这个开关不存在** |
| 3 | `core/writer/core.ts` 的 `createWriterCore` → `episodes.gapMinutes` | T8-B 立账时判定 | 60 | 无法表达「同一分钟才算同一段」 |
| 4 | `core/episode.ts` 的 `deriveEpisodes` 的 `gapMinutes` | 同 3（**库函数层**） | 60 | 同上；且它是**默认值的实际落点** |
| 5 | `core/writer/materialize.ts` 的 `runCompact` → `compact.gapMinutes` | 同 3 | `episodeGap` | 同上 |
| 6 | `query/reads.ts` 的 episode/decision 读查询 → `episodes.gapMinutes` | 同 3 | 60 | 同上，**且是第三处口径分叉** |

**#6 是「找出遗漏之处」的产物**：`episodes.gapMinutes` 的默认值算法此前在**三个地方各写一遍**
（`core/writer/core.ts` / `episode.ts` / `query/reads.ts`）——**判据分叉**，而三份都吞 0。

### 2.2 判据（**本仓唯一一份**：`core/util.ts:numOr`）

```
numOr(v, dflt, min = 0)
  number            ⇒ 用之
  非空 string       ⇒ Number() 之
  其余类型          ⇒ 视为**未传**，回落 dflt      ← 含 undefined/null/""/空白串/布尔/对象/数组
  NaN / ±Infinity   ⇒ 视为**非法**，回落 dflt
  最后              ⇒ 钳到 min
```

三处刻意的选择及其理由：

1. **错类型判为「未传」而不是 0**。写 `false` 或 `""` 几乎总意为「我没填」；把它读成 0 会
   **静默关掉一个功能** —— 那正是本条要修的毛病（`adr/0049` 同族）。
   *代价（已知）*：`numOr(true, 60)` 从修前的 `1` 变成 `60`。`true` 作为数值是垃圾输入，
   回落默认值比静默取 1 更诚实。
2. **`min > 0` 的调用点不纳入本次修复**。那些点上 0 本就不是合法值，回落默认值才是对的
   （`Math.max(1, Number(0) || 80)` 恒为 1，与 `dflt=80` 不同）。
   **口径更正**（元审查 self-fix）：我原先写「本仓 **25 处** `Number(x) || dflt`」——
   那是一次 `Select-String` 在 **`core/*.ts`** 上的**快照**（且是**修前**的），不是「本仓」全量，
   修后这个数字也不再是 25（6 处已换掉）。**能站住的说法**：
   「`core/` 下当时有 25 处 `Number(x) || dflt`，其中 `min <= 0`（即显式 0 可能有意义）的 6 处属本条」。
   数字要带**范围**与**时刻**，否则它会在下一次改动后变成一句无人能复核的断言。
3. **默认值只在库函数里落一次**。`deriveEpisodes` 是 `gapMinutes` 默认值的**唯一落点**；
   `writer-core` 与 `query/reads` **原样传配置**（`core/episode.ts` 的 `deriveEpisodes` 注释里写明）。

### 2.3 裁定：`forget.minHits` 的 `||` **判为正当，不修**

`minHits: 0` 会让判据 `hits < 0` **恒假** ⇒ 等于「按 hits 永不遗忘」。而这个语义本仓
**已由 `enabled: false` 明确承担** —— 再让 0 表达一次就是**同一件事两个开关**（判据分叉）。
⇒ 此处 0 判为**非法输入**，回落 1。理由就地写在 `core/forget.ts` 的 `isForgettable`。

这条裁定是刻意「**关掉**而不是**记成新线索**」：`adr/0083` §14.1 的教训正是「线索越查越多、
路线图原地不动」。能当轮判掉的，当轮判掉。

## 3. 决定二：`typeof x === "<类型名>"` 不是比较点（判据收一处）

### 3.1 它为什么是**定义上**的假阳

两个工具都用「`字段 === "字面量"`」当线索输入，而 `typeof x === "object"` 会被这个正则收进来
（左侧标识符 = `x`，右侧 = `object`）。但：

| 工具 | 它问的问题 | 为什么 `typeof` 是噪音 |
|---|---|---|
| `audit-wiring` B 类 | 某 `字段=字面量` **只有读点、生产里无写入点** ⇒ 分支可能不可达 | 右侧是**类型名**、左侧是 `typeof` 的结果 ⇒ **必然**「无写入点」。可这个分支的可达性由**运行时类型**决定，静态文本**永远答不了** |
| `audit-drift` B 类 | 同一 `字段=字面量` 在 **≥2 个生产模块**被表达 ⇒ 判据可能分叉 | `typeof` 的名字空间只有 8 个字面量，左侧又几乎总是泛用局部名（`v`/`x`/`k`）。两个模块同时写 `typeof v === "object"` 只是**巧合同名**，不是同一条判据 |

### 3.2 实测规模（**不是估计**）

真语料实测假阳：**18 个键 / 23 处 site**，全部来自 `typeof`：

- 键（18）：`agent=object` · `c=object` · `drift=object` · `editText=function` · `fromSoul=object` ·
  `ident=string` · `inject=function` · `k=string` · `location=string` · `nested=string` ·
  `patterns=string` · `pref=object` · `resolve=function` · `stat=function` · `turn=number` ·
  `v=object` · `v=string` · `wiring=object`
- **9 个键是「带点操作数」的 typeof**（`typeof thing.agent === "object"`、`typeof fs.stat === "function"` …）
  —— 这一点**很重要**，见 §4 我自己的错误。

**取证**：`.docs/fix/2026-09-12/t8b-typeof-vs-real-audit.ts` 对这 18 个键**逐键**回到 HEAD 语料，
断言「**每一处**出现点都带 `typeof ` 前缀」。判据等价性：某键只要有**一处**非 typeof 出现点，
它就不会消失 ⇒ 该检查**恰好等价**，既不过严也不过松。
结果：**18/18 通过，非 typeof 出现点 0 个** ⇒ 下降**只**减掉假阳，**没有误删任何真线索**。

### 3.3 决定：判据搬到 `tools/comparison-points.lib.ts`，两份实现合一

- 新增 `tools/comparison-points.lib.ts`：`scanComparisons(strippedText)` 是
  「什么算一个比较点」的**唯一来源**（含 `typeof` 排除）。
- `audit-wiring.lib.ts:collectComparisons` 与 `audit-drift.lib.ts:findPredicateExpressedTwice`
  都改为调用它。
- **键怎么取，两家刻意不同，不要「统一」**：wiring 只取左侧**最后一段**标识符
  （`r.status === "ok"` ⇒ `status=ok`，接收者不影响「有没有写入者」）；
  drift 取**整条接收者链**并把 `?.` 归一（`c?.status === "supported"` ⇒ `c.status=supported`，
  接收者是判据身份的一部分）。**统一键 = 同时改变两个工具的含义**。
  共享的是「**扫什么**」，不是「**怎么归键**」。这句话写进了该文件的文件头，防止后人「顺手统一」。
- `stripComments` 在 `audit-drift.lib.ts` 里**继续保留自己那一份**（原注释：「为免跨工具耦合」）——
  本条只统一**判据**，不动那个已记录的取舍。

### 3.4 反例正控：排除的必须是 `typeof` **前缀**，不是「值长成类型名」

若哪天有人把排除写成「值在黑名单里就跳过」，就退化成 `adr/0063` 最怕的「把一类别名一删了事」的
**静默掩盖**。故两处标定夹具都放了**同一个字面量的两个方向**：

| 夹具 | 写法 | 期望 |
|---|---|---|
| `tools/fixtures/wiring-fixture.ts` `f` | `typeof v === "number"` | **不收集** |
| `tools/fixtures/wiring-fixture.ts` `g` | `r.t === "number"`（真字段 + 同一字面量） | **照旧收集**，且出现在 orphan 清单 |
| `audit-drift.selftest.ts` ⑤c | `typeof v === "object"` 跨两个文件 | **不报** |
| `audit-drift.selftest.ts` ⑤c | `r.mode === "object"` 跨两个文件 | **照旧报**（键 `r.mode=object`） |

## 4. 我自己的错误（留档）

写取证探针时，我用「匹配点**之前**紧邻 `typeof `」来判断一处是不是 typeof 形态。
**这错了**：`typeof thing.agent === "object"` 的匹配点落在链的**最后一段** `agent` 上，
它前面是 `typeof thing.` 而不是 `typeof ` ⇒ 探针把 9 个**真 typeof**误判成「非 typeof」，
于是报出「9 个键**减多了**」的**假警报**。

修法：探针改用**与 `comparison-points.lib.ts` 逐字同源**的正则（可选 `typeof ` 前缀 + 接收者链）
并复刻其判据 `/^typeof\b/.test(m[0])`，不自创近似判断。

**这个错误本身就是本条的论据**：它和 §3 要修的东西是**同一个** ——
**同一个判据被写了两遍，其中一遍写窄了**。我修 `tools/` 的两份正则时抓到了这个模式，
转身在 `.docs` 的探针里又犯了一次。⇒ 判据收一处不是一次性的清理，是**每次写判据时的动作**。

**同时留一条反面记录**：探针第一次跑**红了并且是对的**（它拒绝接受我没有证据的结论）。
若我当时改的是探针的期望值而不是它的判据，这条 18 键的下降就会被记成一个**没有证据的数字**。

## 5. 结果（可对账）

| 项 | 修前 | 修后 | 说明 |
|---|---|---|---|
| `audit-wiring` `b_keys` | 115 | **97** | −18，全部经 §3.2 逐键取证 |
| `audit-drift` `drift_keys` | 11 | **9** | −2 |
| `audit-drift` `drift_sites` | 28 | **23** | −5 |
| `numOr` 覆盖的配置点 | 0 | **6** | `min <= 0` 的那 6 处；`min > 0` 的 19 处**未动** |
| `episodes.gapMinutes` 默认值落点 | 3 处 | **1 处** | `core/episode.ts` 的 `deriveEpisodes` |
| 比较点扫描判据落点 | 2 处 | **1 处** | `comparison-points.lib.ts` |
| `npm run verify` | 53/53 | **54/54** | 新增 `test/t8-explicit-zero.test.ts` |

**红前绿后**（不是推断）：把 `core/writer/core.ts` / `core/writer/materialize.ts` 的三处调用点**临时还原**为
`||` 形态、重新 `tsc`、再跑新测试 ⇒ `③b episodes.showInIndex:0` **真的红**，
报文里打印出修前索引仍含 `## 任务回溯（Episodes）` 段。恢复后 54/54 全绿。

## 6. 未做 / 诚实边界

- **T8 的 A 部分（7 处静默降级）未做** —— 本条只完成 B 部分（2 处开关缺陷）。A 部分每条需要
  **不同的可见信号形态**，是本条的下一段工作。
- **`min > 0` 的 19 处 `Number(x) || dflt` 未审**：它们不属于「显式 0 有意义」这一类，
  但**不等于**都判过正当 —— 本轮**只按 `min <= 0` 这个必要判据筛**，没有逐条读语义。
- **棘轮基线被收紧，不是被放宽**：`b_keys` 97 / `drift_keys` 9 / `drift_sites` 23 都已用
  工具自身的 `--update-ratchet` 重录（`a_total` 仍 39，**未变** ⇒ 新 `numOr` 确有接线）。
  按本仓纪律，**上升**必须点名并给理由；本轮只有下降。
- **语料指纹已变**（`1e66ea539824…` / `7d771706cac4…`）：本轮新增/改动了 `.ts` 文件，
  指纹变化是**预期**的，不代表语料质量变化（V7 的规模类判据不覆盖内容变化）。
- `query/reads.ts` 的 episode 读查询里那处简化**未做端到端读路径测试**：它只是把默认值交给 `deriveEpisodes`，
  单元层（`deriveEpisodes` 的 `gapMinutes: 0`）已有锁，但「`read_shadow({mode:'episode'})`
  在 `episodes.gapMinutes: 0` 下的端到端行为」**没有断言**。
