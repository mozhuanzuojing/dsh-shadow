# ADR-0070: 投影漂移审计工具（经标定）—— 并把「证据缺失」双条件补齐到第二个消费者

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：**ADR-0062**（接线审计工具 —— 本 ADR 是它的**姊妹工具**，同一「先标定再用」纪律）、**ADR-0059**（证据缺失的**双条件**判据 —— 本 ADR 把漏掉的那个消费者补齐）、ADR-0063/0066/0067/0068/0069（本工具要抓的那一族缺陷）
- 关联待办：`../BACKLOG.md`
- 版本：`1.15.27`

## Context

v1.15.22–26 连续五轮，找到的都是**同一族**缺陷：**机制是对的，断的是「投影跟不上源头」**，
且**单元测试全绿**：

| 轮次 | 缺陷 | 检测手段 |
|---|---|---|
| ADR-0063/D5 | 同一条规则**三份实现**，生效那份判据精度仅 9.8% | 手工 + 探针 |
| ADR-0067 | 命中数累积用了「展开了片段」的集合（74.3% 永不命中） | 手工（`_meta.json` 不存在这一矛盾逼出来） |
| ADR-0069 | `_index.md` 新鲜度只看**进程内** `Set` | 手工 |

**逐个手工找是体力，不是能力。** 目标第 (4) 条要的是「**漂移检测与纠正的能力**」——
所以本轮转向：把这族缺陷变成**可重复的检测**。

## Decision

### 1. 新增 `tools/audit-drift.ts`（+ `.lib.ts` + `.selftest.ts` + 两个夹具）

两个检测器，纯静态、无 LLM、无网络：

**检测 A「派生件的新鲜度只看进程、不问源」（已标定，精度高）** —— 三条同时成立才报：
1. 守卫是**裸 `return;`**（不返回值）—— 排除「缓存命中直接回值」这种正当早退；
2. 守卫条件里出现**进程内集合**的 `.has(`；
3. **该守卫条件里不出现源探针**（`*Fingerprint(` / `listDir(` / `stat(` / `readText(`…），
   也不出现「由探针赋值出来的局部名」。

> 第 3 条的「探针赋值的局部名」是关键：修复后的写法是
> `const fpNow = await shadowSourcesFingerprint(...); if (fpNow === prev) return;`
> —— 条件是 `fpNow`，不是探针调用本身。不做这一步会把**已修好**的代码报成漂移（假阳）。

**「进程内集合」的三种接收者形态**（可解释的启发式，非类型分析）：
`core.<field>.has(`（`WriterCore` 就是进程内状态持有者）、本文件 `new Set/Map` 出来的局部名、
以及 `<ident>.<prop>.has(` 中 prop 名含 `Map|Set|Cache|Dirty|Warm|Seen|Visited`。

**函数名收窄**（`DERIVED_ARTIFACT_FN`）：新鲜度跳过守卫只出现在
`*Index|Cache|Projection|Snapshot|Manifest|Materialize|Rebuild|Ensure|Refresh|Sync|Fingerprint|Digest|Version*`
这类函数里 —— 不加这条会把 `if (core.pending.has(id)) return;`（已在处理，无需重复）**误报**。

**检测 B「同一条判据在 ≥2 个模块被表达」（线索级）** —— 把 `字段 === "字面量"` 按
`字段=字面量` 归集，跨文件出现即报。

> **它只答「同一键出现在多个模块」，答不了「两处口径是否一致」** —— 而那才是 D5 的真正病根。
> 故 B 的输出**一律人工复核**，工具里写明「不得据 B 定罪」。把它做成线索级而不是结论级，
> 是**有意的克制**（与 ADR-0062 对 A 类的处理一致）。

### 2. **先标定，再用**（ADR-0062 §2 的纪律）

标定集两层，**都是已知答案**：

**① 夹具**（`tools/fixtures/drift-fixture*.ts`）—— 10 组，带 `MARK:` 标记，测试**按标记定位**（不硬编码行号）：

| 用例 | 期望 |
|---|---|
| POS-1 `core.indexDirty.has(ws) && core.indexCacheWarm.has(ws)) return;` | **报** |
| POS-2 本文件 `new Set` 的局部名 | **报** |
| POS-3 `ctx.cacheMap.has(k)`（属性名表示进程内） | **报** |
| NEG-1 `if (cache.has(k)) return cache.get(k);`（**返回值**=缓存命中） | 不报 |
| NEG-2 条件用**探针赋值的局部名**（ADR-0069 修复后的写法） | 不报 |
| NEG-3 条件**直接含源探针** | 不报 |
| NEG-4 不含进程内集合 | 不报 |
| NEG-5 **非派生件路径**上的正当早退（`push` 里的 `core.pending.has`） | 不报 |
| B-POS `phase === "ghost"` 跨两文件 | **报**（两侧各一条） |
| B-NEG `only === "here"` 单文件 | 不报 |

**② git 历史里的真缺陷（最强的一组）**：`0c4e06b:core/writer-materialize.ts` 的 `:41` 与 `:215`
就是 ADR-0069 的两处真缺陷，而同文件**当前版本**已修。检测器必须「**旧版报 2 条、新版报 0 条**」。
把历史编码进测试（而不是靠人记），是为了让结论**可复现**。

### 3. 工具的**第一次使用**就抓到一个新缺陷（第 7 处）

检测 B 报出 `res.status=not_found` 在 `core/context.ts` 与 `observer/arbitrate.ts` 两处 ——
顺着查下去，发现**第三个消费者 `observer/judgment.ts` 漏了双条件里的第一条件**：

| 位置 | 证据候选筛选 | 判定 |
|---|---|---|
| `observer/arbitrate.ts:92` | `.filter(isPathLike).filter(isConcreteLocator)` | ✅ 正确 |
| `observer/judgment.ts:26` | `.filter(isPathLike)` | ❌ **漏了 `isConcreteLocator`** |

而 `evidence/paths.ts:22-24` 的注释**明文写着契约**：

> `isPathLike`（旧函数）**故意不收窄** —— 它服务的是「这像不像一条路径引用」的粗筛
> （`core/context.ts` / `observer/*` 用它挑候选）；**需要「可检查」语义的地方用本函数**。

**后果**：`judgment.ts` 对 glob（`scripts/*.ps1`）与 git ref（`origin/main`）也做存在性检查
⇒ 必然 `not_found` ⇒ `conflictCount++` ⇒ 结论**假降为 `evidence_stale`**、置信度假降、rationale 谎称「证据路径缺失」。

**实测影响**（真语料 2436 条有路径引用的记忆）：**12 条（0.49%）**受影响 / 非具体 locator **17 处**。

**修复**：`judgment.ts` 补 `.filter(isConcreteLocator)`（并 import）。
**复现测试**：`test/evidence-missing-criterion.test.ts` —— **修复前先看它红**：

```
AssertionError: 通配符 `scripts/*.ps1` 不是「可检查的具体路径」，不得判 evidence_stale；
  实际 evidence_stale（rationale: 证据路径缺失 1 处，结论降为待验证）
```

修复后 5 组断言全过，含 ③ **反向不变量**（真实缺失的**具体**路径仍须判冲突 —— 别把门修没了）
与 ⑤ **跨消费者一致性**（6 组混合证据上 `judgment` 与 `arbitrate` 判定必须一致）。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 继续手工逐轮找 | 那是体力。且**不可证明找完了**；工具给出可重复的覆盖面 |
| 只做检测 A（已标定），不做 B | B 正是**本轮抓到新缺陷的那一个**（`not_found` 跨文件）。没有 B 就没有第 7 处 |
| 把 B 做成「结论」而不是「线索」 | 它答不了「口径是否一致」。做成结论就会产生**看起来权威的错判** —— 正是 ADR-0062 对 A 类的教训 |
| 用 TypeScript 编译器 API 做精确分析 | 能做对，但引入重依赖且本工具只需线索；当前「文本启发式 + 强制人工复核 + 夹具标定」已够（与 ADR-0062 同一取舍） |
| 把 A 的「进程内集合」靠类型分析识别 | 同上。当前的三种接收者形态是**可解释**的启发式，边界写在测试与工具输出里 |
| 不修 `judgment.ts`（只报不修） | 它会让**合法引用**被误判过期并降置信 —— 直接违背本目标「无证据不返回 / Evidence 可追溯」的**反面**（把「不可检查」说成「已失效」）。且修复是一行 |

## Consequences

### 正
- **这一族缺陷从「靠人找」变成「可重复检测」**：A 有标定（夹具 8 组 + git 历史真缺陷回归），
  B 有标定（跨文件/单文件正反例），两条都在 `npm run audit:drift:selftest` 里跑。
- **工具首次使用即产出**：抓到 `judgment.ts` 的双条件缺口（第 7 处），修复后
  12 条记忆（0.49%）不再被误判「证据过期」、置信不再假降、rationale 不再谎报缺失。
- **跨消费者一致性被锁住**：`test/evidence-missing-criterion.test.ts` 的 ⑤ 直接断言
  「同一批引用，两个消费者的判定必须一致」—— 这正是病根形态的**不变量化**。
- **回归护栏**：真仓库上检测 A 必须 **0 条**（ADR-0069 刚修完）。若将来有人写回「只看进程」的守卫，
  标定测试立刻红。
- 与 `audit-wiring.ts` 构成**姊妹工具对**：一个查「接线断没断」，一个查「投影跟不跟得上源头」。

### 负 / 已知边界（全部写进工具输出与测试）
- **检测 A**：只认**裸 `return;`**（`return <值>` 形式的跳过不抓）；**跨行**守卫不抓（按行匹配）；
  「进程内集合」的识别依赖三种接收者形态（换成模块级单例 / `WeakMap` 别处注入会漏）；
  函数名收窄靠 `DERIVED_ARTIFACT_FN` 正则（派生件函数取名不含这些词会漏）。
- **检测 B**：**只答「同一 `字段=字面量` 出现在多个模块」，答不了「两处口径是否一致」** ⇒
  **一律人工复核**。真仓库上当前 12 个键 / 30 处，其中多数是正当的分层表达（生产者/消费者）。
- **真机 `not_found` 语义未端到端验证** —— 复现测试用按契约写的假 Gateway。
- **影响面 12 条 / 0.49% 是离线探针读数**（`_research/judgment-locator-drift.ts`），不放进单元测试。
- `slice(0, 6)`（judgment）与 `slice(0, 12)`（arbitrate）的候选上限不同是**有意的**，本轮未统一。
- 本次改动**尚未在运行进程生效**（插件 `dist/` 不热加载，ADR-0057）。

## 自检

- [x] 与 ADR-0062 一致：同一条纪律（先标定再用、输出是线索不是结论、不引入重依赖）。
- [x] 与 ADR-0059 一致：**未改**双条件判据；把漏掉的消费者补齐，方向是**强化**该 ADR。
- [x] 与 ADR-0063/0066/0067/0068/0069 一致：本工具正是为抓它们那一族而造；A 的标定集用了 0069 的真缺陷。
- [x] **先复现再修**：`judgment.ts` 的修复前测试跑出 `evidence_stale` 的红，修复后转绿。
- [x] **反向不变量**：③ 锁住「真实缺失的**具体**路径仍判冲突」，防止把门修没。
- [x] **不夸大**：B 明确标为线索级、不得据它定罪；A 的四条已知边界写在工具输出与测试末尾。
- [x] **历史回归**：把 `0c4e06b` 的修复前代码编码进标定（旧报 2、新报 0），不靠人记。
- [x] `npx tsc --noEmit` clean；`npm run typecheck:tools` clean；全套回归 **36/36**。
- [x] `node tools/audit-drift.selftest.ts` → **ALL PASS**（6 组，含真历史标定与真仓库护栏）。
- [ ] **未验证**：真机 `not_found` 端到端；工具未接入任何自动门禁（本仓无 CI，与 ADR-0062 的 V6 同一缺口）。
- [x] ~~**未做**：检测 B 的 12 个键逐个人工复核（本轮只复核了 `not_found` 那一个）~~ → **已结（v1.15.32 第 4–5 次复核，见下节）**。

---

## 补记（v1.15.32）：检测 B 余下各键复核结案 + 工具自身一处**漏报**修复

`BACKLOG.md` 的 **T5** 要求「检测 B 的键逐个复核，各落『正当（给出分层理由）/ 真漂移（给出修复 + 锁）』二选一」。
本轮把余下各键**逐个**复核完毕，并在过程中**先发现工具自己漏报**。

### 1. 先修工具：`?.` 让同一判据被拆成两个键 ⇒ **静默漏报**

- **形态**：`findPredicateExpressedTwice` 的原正则 `\b([\w$.]+)\s*===` 的字符集**不含 `?`**，
  于是 `c?.status === "supported"` 只从 `status` 起匹配 ⇒ 键退化成 `status=support…`，
  与不带 `?` 的 `c.status=…` **归不到一起**。
- **后果（实测）**：`world/guard/claim-admission.ts:6` 的 `isAdmissibleClaim` —— **判据源自己** ——
  就是这样从 B 段**消失**的。而它恰恰是下面那条真漂移的关键证据：修复前 B 段看不到它，
  于是「两处各自重写、没用唯一判据源」这件事**没有任何线索指向**。
- **修法**：允许 `?.`，并把键里的 `?` **归一掉**（`a?.b` 与 `a.b` 是同一条访问路径）。
  **键的形态随之改变**：接收者入键（`c.status=supported`，原为 `status=supported`）—— 这是**更精确**的形态。
- **回归锁**：`audit-drift.selftest.ts` ⑤b（夹具一侧写 `x?.flag`、另一侧写 `x.flag`，
  断言二者归到同一个键 `x.flag=join` 并在两侧各报一条）。

### 2. 逐键复核结论（**11 键 → 10 键**）

| 键 | 判定 | 依据 |
|---|---|---|
| `c.status=supported` | **真漂移（已修 + 已加锁）** | 见下节 3；键**已消失** |
| `res.status=not_found` | 第 7 处真缺陷 | **v1.15.27 已修**（`observer/judgment.ts` 补 `isConcreteLocator`） |
| `c.kind=provider` / `c.kind=reference` | **正当分层** | `toolset.ts` **声明** `kind` ↔ `toolset-exec.ts` **消费**；并实测其边界不变量 **107 项全满足**（v1.15.29 已复核） |
| `r.status=unavailable` | **正当分层** | `core/index-engine.ts:54,66` **产出** `unavailable`（zg/semble 缺件）↔ `query/query.ts:222` **消费**它并渲染缺件提示（`unavailableHint`）。**同一契约的两个角色**；且 `unavailable` 是**宿主声明的类型值**（`core/types.ts:59` `EvidenceStatus`），非本仓自造 |
| `err.code=ENOENT` | **正当分层** | 两处都是**同一个外部契约**（Node `execFile` 的 `err.code`）在各自 CLI 上的一致性检查：`core/semble.ts:45` → `semble_not_installed`、`evidence/zg.ts:68` → `zg_not_installed`。**口径一致**（都映射到 `unavailable` + provider 专属 reason），非漂移 |
| `e.kind=user` | **正当分层** | `core/memory.ts` 是**写侧**（构造线索头 / 统计用户消息数）、`core/writer-materialize.ts:203` 是**读侧**（`writeConsent` 门判断本回合是否含用户明说）。两者读的是**同一份 `pending` 事件流**的同一字段，属生产/消费 |
| `kind=error` | **误报（同形不同义）** | `core/writer-llm.ts:31` 是**宿主流事件**的 `chunk.reason.kind`（外部输入，`dsh-llm` 契约）；`index.ts:61-68` 是本插件 `reportHostGap` 自己的**局部形参** `kind`。二者**接收者与语义都不同**，仅字面量同形 —— 正是工具「无类型分析」的已知噪声 |
| `type=principle` / `type=anti_pattern` | **正当分层（且已由类型锁）** | `reflection/engine.ts:32` **产出** `ReflectionLearningType`（`reflection/types.ts:6` 三值联合）↔ `identity/types.ts:47` **映射**为 `IdentityChangeType`。两侧**共用同一类型声明**（`identity/types.ts:4` import 它）⇒ 类型层已保证口径一致 |
| `v=string` | **误报（短局部别名）** | `core/scope.ts:10` / `core/util.ts:54` 的 `v` 都是回调形参名（`values.find((v) => …)`）。工具无作用域分析，属已记录的「短局部变量别名」噪声 |

**结案**：**1 处真漂移（已修）+ 0 处待复核**。其余各键均落「正当分层」或「同形不同义」。
B 段小计 **11 键/28 处 → 10 键/25 处**。

### 3. 真漂移：`c.status=supported` —— 判据源已存在，两处却各自重写

- **事实（三处表达同一条判据）**：

  | 位置 | 形态 | 角色 |
  |---|---|---|
  | `world/guard/claim-admission.ts:6` | `isAdmissibleClaim = (c) => c?.status === "supported"` | **唯一判据源** |
  | `world/builder/representation-builder.ts:9` | 手写 `claims.filter((c) => c.status === "supported")` | 重写（**同文件已 import 该模块**） |
  | `query/world.ts:42` | 手写 `claims.find((c) => c.status === "supported" && …)` | 重写 |

- **性质**：与 **ADR-0063 / D5** 同族（「同一条规则多份实现」），而非「接线断了」。
  本轮**不删任何一处**，只把两处重写**收敛**到唯一判据源（`isAdmissibleClaim`）。
- **锁（新测试 `test/claim-admission-single-source.test.ts`）**：
  ① 判据语义（含 `null`/`undefined` 边界）· ② **源码级棘轮**「全仓生产源码里 `status === "supported"`
  **只允许**判据源那一处」· ③ 行为反向不变量（`candidate`/`unstable`/`rejected` 一条不得进 Representation；
  同 `subject` 去重）· ④ **正对照**（证明扫描器真会报警，且不把注释当判据）。
- **自曝（本条值得单独记）**：该测试**第一版**自己写了 `line.replace(/\/\/.*$/, "")` 去剥注释 ——
  而本仓 `.ts` 是 **CRLF**，JS 的 `.` **不匹配 `\r`** ⇒ `.*` 在 `\r` 前停住、`$` 匹配不上 ⇒
  **替换静默失败**，注释里的代码被当成真判据 ⇒ 测试**假红**（一度让我以为源码残留分叉）。
  更根本的问题是：那样做等于把「注释剥离」这条判据**又写了一份** —— 正是本 ADR 反复记录的病症。
  已改为**复用工具自己的 `stripComments`**（字符状态机，正确处理 CRLF/字符串/正则字面量，
  且保证行号不漂移，有 selftest ① 断言）。
- **类型层面的边界（诚实标注）**：② 是**源码级正则棘轮**，不是类型级 ——
  换个写法（`"supported" === c.status`、经变量间接比较）会漏。它挡的是「同一判据再被手写一份」
  这一最可能的回归，不是全部形态。

### 4. 附带：台账「两级边界」不变量**从实测升级为棘轮**（T5 附带项）

`core/toolset.ts:3-6, 44-46` 规定两级语义不同：`reference` = 插件**不接线**的通用 CLI 目录
（`degradesTo` 必须表明「不影响插件行为」）、`provider` = **插件内接线**的可选增强
（缺件 = 能力降级，必须给**确定性退路** + `provides` + `install`）。
v1.15.29 只做过一次**实测**（107 项全满足），**没有断言** ⇒ 加条目时可能把边界写糊。
本轮把它做成 `test/toolset-catalog.test.ts` 的 **⑧**（含 provider 必须归在「插件内接线」分类）。
