# ADR-0059: 引用漂移的检测（双条件）；修两处假「证据失效」；不做自动纠正

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0043（Shadow Contract：Atom / Projection / Evidence / Mutation）、ADR-0049（缺件不静默）、ADR-0055 / ADR-0058（工具台账；本 ADR 与之共用「证据」纪律）、ADR-0057（能力预检）
- 关联术语：`../CONTEXT.md`（Evidence / 证据链 / stale / 漂移）
- 版本：`1.15.15`

## Context

用户 2026-09-11 的目标之一是：**「管理本地知识库的可供 agent 执行的真相和纠正漂移」**。

动手前先做了两件事（都不是凭直觉）：

**① 文献裁决（调研，28 篇读摘要 + 46 仓库实测 star）** —— 「检测」与「纠正」的证据强度差得极远：

| 方向 | 证据 |
|---|---|
| ✅ **检测可做** | CASCADE（**FSE 2026**，[2604.19400](https://arxiv.org/abs/2604.19400)）：**只有「现有代码测试失败」且「从文档生成的代码通过同一测试」两个条件同时成立才报不一致** |
| ✅ 确定性取代 + 双时间账本 | Temporal Validity（[2606.26511](https://arxiv.org/abs/2606.26511)）：**余弦相似度分辨「被推翻的旧事实」与「换个说法」的 AUROC 仅 0.59（近随机）**；RAG 因此结构性有 **15–40%** 概率返回已被取代的值 |
| ❌ **LLM 判过期** | 同上 AUROC 0.59 —— 让 LLM 判「哪条失效」无依据 |
| ❌ **LLM 自动纠正** | Huang（ICLR 2024，[2310.01798](https://arxiv.org/abs/2310.01798)）无外部反馈时**性能反降**；Kamoi（TACL 2024，[2406.01297](https://arxiv.org/abs/2406.01297)）**无任何工作证明提示式自纠能成功**；误纠正率主导 **53–94%**（[2605.27559](https://arxiv.org/abs/2605.27559)） |
| ❌ **裸用 LLM 查文档漂移** | DocPrism（**ISSTA 2026**，[2511.00215](https://arxiv.org/abs/2511.00215)）：**flag rate 98%**（>90% 的函数被标成不一致），加约束后降到 14% —— **无约束时基本是噪声** |

**外部独立佐证本仓的四条不变量**：[Missing Knowledge Layer](https://arxiv.org/abs/2604.11364)（Knowledge = **indefinite supersession**；批评「把认知衰减施加到事实断言上」）、[MemIR](https://arxiv.org/abs/2605.25869)（**grounded atoms 分离 evidence / cues / claims，授权仅限有支撑的 claim**）。

**② 用仓库自己的函数在真语料上量一次**（不造功能先量事实）。

## Decision

### 1. 先量事实：表面 40.8% 的「证据失效」里，绝大多数是假的

对 `.shadow` 全库（6465 个记忆）跑 `evidencePathsOf → isPathLike → fsExists`（**即召回路径上真正用的那条链**）：

| 阶段 | 可解析 | 判「缺失」 | 占比 |
|---|---|---|---|
| 修复前 | 1489 | **1025** | **40.8%** |
| 修 F1（绝对路径）后 | 2255 | 267 | 10.6% |
| 再修 F2（目录）+ 双条件后 | — | **226** | **9.0%** |

⇒ **约 76% 的「证据失效」判定是假的。** 两个真 bug 如下。

### 2. F1（真 bug，影响面大）：绝对 locator 被拼上工作区前缀

`evidence/filesystem.ts` 的 `fsExists` **无条件**做 `${ws}/${rel}`：

```
ws + "D:/project/wslc1/scripts/x.ps1"
  → "D:/project/dsh1/D:/project/wslc1/scripts/x.ps1"   ← 双前缀，必然不存在
```

实测：`D:/project/dsh1/vendor/dsh-shadow/package.json`（**磁盘上确实存在**）被判 `false`。

**为什么影响大**：语料里绝对路径证据很常见（跨项目引用）。它们被一律判「证据失效」→ 在召回里 `score × 0.5` + `stale = true`（`query/query.ts`），并在 `mode:"context"` / `verifyEvidence` 里报「已过时/证据缺失」——**这是假漂移**。

**修复**：新增 `isAbsoluteLocator`（`evidence/paths.ts`，**单一来源**，`core/semble.ts` 的 `absolutizeLocator` 也改用它，消掉两处各自写正则的漂移风险）；`fsExists` 对绝对 locator 直接查它自己。

**边界**：这是**正确性**修复，不扩大授权。`inScope` / `authorizeScope`（`core/authorization.ts`）仍单独管「哪些候选允许返回」。

### 3. F2（同类真 bug）：目录引用被判缺失

`readText` 对目录必失败（真实宿主抛 `FS_NOT_REGULAR_FILE`）→ 引用一个**存在的目录**会被判「证据失效」。实测 `D:\project\wslc1`(11×)、`D:\project\dsh1\vendor\dsh-shadow`(8×) 都真实存在却被判缺失。

**修复**：`fsExists` 在 `readText` 失败后补一次 `listDir`。

**依据来自读真实源码，不是假设**（`@deepseek-ai/dsh-fs-local/lib/index.js`）：

| 调用 | 真实契约 |
|---|---|
| `readText(目录)` | 抛 `FS_NOT_REGULAR_FILE`（:341）→ **需要兜底** |
| `listDir(目录)` | ✅ 成功返回条目 |
| `listDir(不存在)` | 抛 `FS_NOT_FOUND`（:277）→ 兜底**正确**返回 `false` |

### 4. 检测判据：**双条件**（借 CASCADE 思路）

> 只有在 **① 引用是「可检查的具体路径」** 且 **② 它确实解析不到** 时，才判「引用失效」。

新增 `isConcreteLocator`（`evidence/paths.ts`）排除**通配符**（`scripts/*.ps1`、`**/*.Tests.ps1`）与 **git 分支/ref**（`origin/main`）——「通配符还在不在」**不是良构问题**，拿它验存在性必然判缺失。

接入点：`observer/arbitrate.ts`（`conflictOf`，驱动召回降权）与 `core/context.ts`（`refPathsOf`，驱动 `mode:"context"` 的「已过时」标记）。

> **注意 `isPathLike` 故意不收窄**：它服务「这像不像路径引用」的粗筛（`core/context.ts` / `observer/*` 用它挑候选），收窄会改变那些调用方的候选集。需要「可检查」语义处用新函数。

### 5. **不做自动纠正**（证据反对）

本 ADR 明确排除三类做法，并给出依据：

| 排除 | 依据 |
|---|---|
| 让 LLM 判「哪条知识过期」 | AUROC 0.59 近随机（2606.26511） |
| LLM 自动「解决」冲突 / 改写事实 | 误纠正率 53–94%；无外部反馈时自纠不可靠（三重否定） |
| 裸用 LLM 检测文档-代码漂移 | flag rate 98%（DocPrism, ISSTA 2026） |

**本仓既有设计被证据正面支持**：`DriftReport` **只答「有无违反边界」且明确不等于现实断言**（`verification/render.ts` 的告白行）、`Mutation = LLM 只能读+总结，永不 create fact/关系`（ADR-0043）——**与证据一致，本轮不改**。

⇒ **形态**：确定性规则承担判定；LLM 只做「解释与建议」，且建议**必须回到 Atom 由人/工具确认**。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 用 LLM 判「这条记忆的引用是否失效」 | **AUROC 0.59 近随机**；DocPrism 无约束时 flag rate 98% |
| LLM 自动修正过期引用 | 误纠正率主导 53–94%，且违反 ADR-0043 的 Mutation 边界 |
| 在**测量脚本**里「猜工作区基线」以降低剩余噪声 | **已被我自己证伪两次**：按名字猜 winget 包 ID 产出 9 例假阳性（ADR-0058）；本次按后缀猜同样错（`xh`→Firefox）。**不猜** |
| 把 `isPathLike` 直接收窄（省一个新函数） | 会改变 `core/context.ts` / `observer/*` 的候选集，属**未预期行为变更**；故新增 `isConcreteLocator` 并在需要的两处显式接入 |
| 用 `fs.stat` 判存在 | 插件使用的 fs 面里**没有** `stat`（只有 resolve / readText / writeText / listDir）——已核实 |

## Consequences

### 正
- **消掉一个静默的正确性缺陷**：绝对路径证据不再被误判失效 —— 量级 **1025 → 243**（约 76% 的假「证据失效」消失）。
- 「引用漂移检测」有了**可引用的判据**（双条件），且与 FSE 2026 的方法同构。
- 明确了**不做什么**（自动纠正），并在 ADR 里留下依据，避免以后有人「顺手加个 LLM 修一下」。
- 修 bug 过程中**独立发现了两处 mock 不忠实**（见下）。

### 负 / 已知边界
- **残余 9.0% 未解析**，主体是**跨项目相对路径**（如 `scripts\wslc-utils.ps1` 来自 wslc1 仓库）——它们相对本工作区根确实不存在。**不能靠猜基线解决**（见 Alternatives）；需要的是**跨项目根注册**这种带来源的能力，本轮不做。
- 双条件只排除**形态上**不可检查的引用；**伪路径**（`v1.0.5`、目录树示意图）仍可能混入。`isPathLike` 的粗筛特性未改。
- `isConcreteLocator` 的 git-ref 规则（`^origin/`）是**经验规则**，非穷举。

### 测试侧的教训（值得记下）
修 `fsExists` 后，`missing-dependency` 与 `recall-attribution` 两个测试**先红**。查证发现：**是 mock 不忠实** —— 它们的 `listDir` 对不存在的目录返回 `[]` 而不抛，与已核实的真实契约（抛 `FS_NOT_FOUND`）不符。已按真实源码修正这两处 mock。
> 通用教训：**mock 与宿主契约不符时，测的是 mock 不是系统**。本仓此前也踩过同类（CHANGELOG v1.15.2「5 处建在编造形状上的测试」）。

## 自检

- [x] 与 ADR-0043 一致：未引入任何「LLM 造事实/造关系」路径；`Mutation` 边界未动。
- [x] 与 ADR-0049 一致：只降低假「缺失」，不改「缺件只陈述事实」的口径。
- [x] F1 / F2 均有**回档与前后对照数据**（1025 → 267 → 243），非单点断言。
- [x] 真实 fs 契约**读过源码**（`dsh-fs-local/lib/index.js:277/341`），非假设。
- [x] 全套 30 个测试文件通过；新增 `test/evidence-absolute-path.test.ts`（10 组断言，含「修复前为红」的回归）。
- [ ] **未验证**：真机 DSH 内 `host.fs` 的 `resolve` 语义（测试用 `node:path` + 真实磁盘模拟）。
- [ ] **未验证**：其余测试里的内存 fs mock 是否还有别处不忠实（本轮只修了被这次改动暴露的两处）。
- [ ] **未做**：跨项目根注册（残余 9% 的主要成因）。
