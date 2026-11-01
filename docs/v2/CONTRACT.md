# dsh-shadow v2 · Memory Contract

> 状态：**v2.10.0 契约（C4/C5 已落地，C6 机械基线已建立）** · 日期：2026-11-01
> 目的：把 v1 的「可核查记忆」边界翻译成 v2 可执行、可验收的条款；**契约优先于实现**。
> 来源：v1 `README.md`「它明确不做」、`CONTEXT.md`「完整线索」、`adr/0020`、`adr/0031`、`adr/0043`、`adr/0061`；v2 `ARCHITECTURE.md`。
> 这份文档不新增能力；它定义**什么叫没坏**、**什么叫仍然有用**。

---

## 0. 一句话

**dsh-shadow 不是替用户判断真假的裁决器，而是一套让“为什么/靠什么/怎么完成”可追溯、可核查、可撤回的记忆源。**

它必须同时守住三条底线：

1. **源与投影分离**：Atom 是源，索引/派生可重建，LLM 不制造事实或关系。
2. **可核查**：返回的记忆必须有可解析的源句柄；当前事实必须有证据；缺件不能伪装成空。
3. **不越权**：回忆不是新观察，遗忘不是删除；冲突与真假由证据 + 用户裁决，不由 recall 自动判。

---

## 1. 规范用语

| 术语 | 本契约中的含义 |
|---|---|
| **Atom / Source** | 人类、代码或工具产生的最小不可变记忆记录（`.shadow/atoms/` 热文件，或归档后 `.shadow/archive/<date>.jsonl` 中的同一条记录）。Atom 是“曾经观察到/说过/做过”的源，不是“客观真相”。 |
| **Archive** | Atom 的冷区同构存储（JSONL 原文 + 导航），**不是 Projection**；它和热文件共同构成源语料。 |
| **Projection / Derived** | 从源派生、可整份重建的索引/卡片/视图（SQLite、`_index.md`、`indexes/`、`projections/`、`abstracts/` 等）。删掉不丢事实。 |
| **Evidence** | 指向源的证据：Atom 句柄（`rel` / `archiveRel`）、材料路径、行号、文档节点等。**证据指针必须可解析或显式标失效**。 |
| **Observation** | 新发生的事实/事件被记录为新的 Atom。**Recall 不是 Observation。** |
| **Recall** | 过去记录重新进入当前可访问范围；不产生新事实、不重新证明、不自动升级为当前真相。 |
| **Forget** | 把记忆移出“活跃召回集”，文件/归档仍在。**≠ Delete。** |
| **Delete / Purge** | 物理移除某份源副本。只有归档已验证 + 保留期到期 + 可恢复路径存在时才允许。 |
| **Lineage** | 返回项到源 Atom 的可追溯路径；没有 lineage 的忆起按 **confabulation** 处理。 |
| **Confabulation** | 无源、无 lineage 却生成“过去发生过 X”的内容；本契约禁止。 |
| **User Adjudication** | 用户对冲突/真假的最终裁决记录（纠正、确认、撤回、保留多值）。**不是 recall 的自动判断。** |
| **Verdict** | “某个命题为真/假/正确/错误”的结论。核心读路径不生成 Verdict；只呈现证据、冲突、状态。 |

---

## 2. 契约条款

每条都按 **规则 → v2 落点 → 验收 → 当前状态** 写。验收必须可重复；不能只看“测试全绿”。

### C1 · Atom = Source；Projection = 派生可重建；LLM 不造事实/关系

**规则**

1. 源语料只由 `human / code / tool` 写入；Atom 一旦写入不可改写（允许归档/移入回收站，不等于改写内容）。
2. 索引、卡片、Episode、Decision、摘要、SQLite 都是 Projection；删除/损坏后可重建，不得反过来覆盖 Atom。
3. LLM 可以**摘要、解释、排序、导航**，但不得：
   - 创建/修改 Atom 的事实内容；
   - 生成不存在的关系（`references` / `depends` / `caused_by` 等）；
   - 补写决策理由、材料、用户没说过的话。
4. 归档 JSONL 是源的同构副本，不是 Projection；`_index.json` / `<date>.md` 是归档的派生导航。

**v2 落点**

- 写侧：`src/engine/write/capture.ts` → `writeAtom`（`src/store/atoms.ts`）。
- 归档：`src/store/archive.ts`（`archiveDays` / `loadAllAtoms`）。
- 派生：`src/store/index-cache.ts`、`src/store/index-db.ts`、`src/engine/derived.ts`、`src/store/gc.ts`。
- 摘要只有 `> 摘要：` 字段，是派生标注，不得进入 `> 决策：` / `> 决策理由：` / `> 背景/材料：` 事实位。

**验收**

1. `rm -rf .shadow/indexes` 后跑无参 `read_shadow`：源文件哈希集合不变，索引可重建。
2. 删除 `_index.md` / `SQLite`：`read_shadow` 仍能从 atoms/archive 返回；不丢条目。
3. 检查任意 Atom：`> 决策理由：` 只来自原文明确表达；没有原文时显示「未明确」，不得由摘要/LLM 补写。
4. 检查 `shadow_query` / `recall_shadow` 输出：每条结果都能追到 Atom 或 archive 句柄；没有“凭空节点”。

**当前状态**：**基本满足**。归档 JSONL 已作为源副本；派生件可重建。  
**待补**：摘要若由 LLM 生成，需在契约中固定“摘要不是事实”的渲染边界；目前靠字段位置约束，没有专门检查。

---

### C2 · 无 evidence 不返回；坏件 ≠ 空件；缺件可见

**规则**

1. 每条返回的**记忆项**必须带可解析的源句柄（`rel` 或 `archiveRel`）。句柄解析不到，就不能当作有效项返回。
2. 每条被当作**当前事实**使用的断言（如 `facts` / `context` 中的路径、配置、结论）必须有 Evidence；验证失败时返回 `stale / not_found / unavailable` 状态，**不得**把它渲染成已验证的当前事实。
3. 历史陈述可以返回（“当时有人说过/记录过”），但必须标明它是否仍可验证；历史记录本身是 Evidence，不是“命题为真”的证明。
4. 坏文件、坏归档、坏索引不能返回“空结果 + 成功”；必须返回部分结果 + 可见 Signal/错误。

**v2 落点**

- `read_shadow` 返回信封（`src/engine/read/render.ts` / `modes.ts`）。
- `facts`：`src/domain/facts.ts` + Evidence Gateway（`verifyEvidence` / `deps.verify`）。
- 路径核验：`src/engine/read/modes.ts` 的 `conflictRels`（目前只核验前 200 条材料路径）。
- 读失败：`Outcome` + `SignalStore`；`loadAtoms` / `loadAllAtoms` 的 `errors`。
- 坏归档：`archive.ts` 返回 `CORRUPT`；`loadAllAtoms` 收集 `errors` 继续返回热+好归档。

**验收**

1. 对不存在/无证据的主题查询：返回「无匹配」或显式拒绝，不生成条目。
2. 删除/改名一个 atom 引用的材料路径，再查 `facts`：必须出现 `✗ not_found` 或 `stale`，不能显示 `✓ verified`。
3. 返回项句柄解析率：抽样 100 条，`rel` / `archiveRel` 必须 100% 可解析到 atoms/archive。
4. 注入一个坏 atom / 坏归档 JSONL：`read_shadow` 返回其余可用项 + `Signal`，退出不是“空成功”。
5. 坏件修复后重读：Signal 清除，结果恢复；坏件本身不被静默删除。

**当前状态**：**部分满足**。  
- 句柄：已修 archiveRel；仍需验收 100% 解析。
- facts：有 Evidence Gateway。
- 坏件：`loadAtoms` / `loadAllAtoms` 有 partial errors；但 `read_shadow` 是否每条路径都显示 Signal 需要逐 mode 验收。
- 缺口：`conflictRels` 只核验前 200 条；不是所有当前事实都过证据门。

---

### C3 · Recall ≠ Observation；Forget ≠ Delete；无 lineage 不 confabulate

**规则**

1. 一次 recall 不得创建新的 Atom、不得改写旧 Atom、不得把“回忆”升级成“新观察”。
2. 读取可以写派生件（索引、hits、query-log、归档维护），但：
   - 不得新增/修改事实位；
   - 不得改变逻辑上的源集合（允许归档迁移，逻辑 hash 不变）；
   - 维护动作必须可见或被记录。
3. `Forget` 只移出活跃集；Atom 文件/归档必须仍可恢复。物理删除只在归档已验证 + 保留期到期后发生。
4. 任何“过去发生过 X”的返回必须有 lineage（Atom 句柄 + archive/rel）；没有 lineage 的忆起必须拒绝，不能编造。

**v2 落点**

- 读路径：`src/engine/read/route.ts`；`read_shadow` 不写 atoms。
- 归档：`archiveDays` 在无参读时可能移动热文件；这是**维护动作**，不是新观察。
- Forget：`src/domain/lifecycle.ts`；`maxActive` / `stale` 只改状态。
- Trash：`.shadow/.trash/<date>/` 保留 7 天；archive JSONL 是恢复副本。
- 派生：`src/engine/derived.ts` 只写 `indexes/`。

**验收**

1. 读前后对 `.shadow/atoms` + `.shadow/archive` 做逻辑 hash 集合：recall 不增加/修改事实；归档迁移只改变物理位置，不改变 hash。
2. 读 20 次后 Atom 数量与内容不变；只允许 `indexes/`、`query-log/`、`hits` 变化。
3. 对旧 Atom 执行 forget：`loadAllAtoms` 仍能取到；`.trash` 或 archive 可恢复；不得只剩“已删除”。
4. 查询一个**从未出现过**的主题：返回“无记录/无匹配”，不得生成一个过去事件。
5. 把某 Atom 从热区移入 trash 后，`loadAllAtoms` 仍能按原 `rel`/`archiveRel` 找到它（归档已登记时）。

**当前状态**：**部分满足**。  
- Forget≠Delete、archive/trash 路径已有。
- **需明确例外**：无参 `read_shadow` 会触发归档并移动热文件；这是读引发源位置变化，需在验收中记录为“维护例外”，不能宣称“读完全不改源”。
- 无 confabulation：核心读路径没有 LLM 生成事实；但摘要/派生摘要的边界需验收。

---

### C4 · 不替用户做决定：冲突/真假由证据 + 用户裁决，不由 recall 自动判

**规则**

1. 核心读路径不输出 `Verdict`（“X 正确/错误/为真/为假”）；只输出：
   - 源记录（谁在何时说过/做过）；
   - Evidence 状态（`verified / stale / not_found / unavailable`）；
   - 冲突/取代信号（旧版本、同入口更新、路径失效）。
2. 同入口新版本只能**降权/标 superseded**，不能自动删除旧版本，也不能自动宣布新版本为真。
3. 冲突必须**可见**：至少呈现双方（或明确列出被取代项及原因）；不能静默只返回一方。
4. 用户裁决是最终权威：纠正、确认、保留多值、撤回，都必须有记录；recall 不能替代。
5. `completed / abandoned` 是启发式观测，不是“方案正确/已确认”。

**v2 落点**

- `supersededBy`（`src/engine/read/recall.ts`）：同 `entry` 取最新，旧项 ×0.7；显式 `> 纠正：` 优先；渲染显示 `⚠被取代→<newRel>`。**只降权+标注，不判错**。
- `conflictRels`（`src/engine/read/modes.ts`）：材料路径失效 → `stale`；**只证明证据缺失**。
- `lifecycle`：`archived / superseded / compacted / stale / cap` 状态来自显式 meta 或确定性规则。
- `facts`：`✓ verified / ✗ not_found / ? unavailable` 是证据状态，不是真假判决。
- `shadow-report`：统计是观测，不是 verdict。

**验收**

1. 构造一对同入口冲突 Atom（旧说 A，新说 B）：查询必须**同时可见**两者，或明确显示“旧项被取代”及依据；不得只返回 B 并当作事实。
2. 不得输出“结论：A 是错的/正确的”这类 Verdict；只能输出状态与证据。
3. 用户显式纠正后：旧 Atom 仍在；新 correction Atom 可查；recall 显示纠正关系；撤回后恢复旧状态且不丢历史。
4. 注入一个“错误但无证据”的陈述：系统可以返回“某人曾这样说”，但不得标为 `verified`/当前事实。
5. 对 `facts` 缺证据的项：显示 `not_found/stale`，不显示“正确/错误”。

**当前状态**：**基本满足（v2.10.0）**。  
- 无 Verdict；`supersededBy` 已在 topic/query 渲染中标注 `⚠被取代→newRel`；显式 correction 优先于按入口推断。
- 证据失效仍只标 `stale`，不自动判真假。
- 仍需逐 mode 验收：decision/episode/recovery 不都带取代标注；`conflictRels` 只核验前 200 条。

---

### C5 · 用户裁决与撤回（可回退）

**规则**

1. 用户必须能：
   - 标记某条记忆为“已纠正/被取代/保留多值”；
   - 撤回一次纠正；
   - 从 archive/trash 恢复被遗忘/归档的 Atom；
   - 查看某个结论的证据链。
2. 纠正只能**追加**新记录（correction Atom / 裁决记录），不能改写旧 Atom。
3. 撤回必须能回到纠正前的可召回状态；旧记录不得因纠正被物理删除。
4. 物理清理只在保留期 + 归档验证通过后进行，且必须留下可追溯的清理记录。

**v2 落点**

- `shadow_adjudicate`（`src/surface/tools.ts`）：`correct / withdraw / restore`；写 `src/engine/write/adjudicate.ts`。
- 纠正/撤回只追加 Source Atom（`> 纠正：` / `> 撤回：`）；旧 Atom 不改写、不删除。
- `Forget ≠ Delete` + `.trash` 7 天 + archive JSONL；`restore` 从 archive/trash 复制回热区。
- `pinned` 保护（仍无写入口，需补）。

**验收**

1. 对一条 Atom 执行“纠正”：旧 Atom 仍在，新 correction 记录可查，recall 同时显示两者关系。
2. 撤回纠正：旧状态恢复，新 correction 记录保留（标记 withdrawn）。
3. 从 `.trash`/archive 恢复：原 `rel`/`archiveRel` 可重新解析，内容 hash 不变。
4. 保留期未到不得物理删除；清理后仍有 archive 副本或清理记录。

**当前状态**：**已提供入口（v2.10.0）**。`shadow_adjudicate` 支持 correct/withdraw/restore；单测覆盖“纠正追加、撤回生效消失、从 archive 恢复”。  
仍缺：多值冲突的显式标记（目前靠“不纠正”默认保留）、`pinned` 写入口、逐条证据链视图。

---

### C6 · 成功标准：还原“为什么/靠什么/怎么完成”，而不是测试数

**规则**

1. **工程门**（`npm run verify` 全绿、audit、docs-check）只证明“没坏/没回归”，**不等于**记忆有用。
2. 记忆验收必须抽样真实任务，回答五个问题：
   - 任务是什么（入口/目标）？
   - 靠什么背景/材料？
   - 用户给了哪些提醒/约束/决策？
   - agent 做了什么、结果是什么？
   - 每条关键结论的证据在哪里、现在是否仍有效？
3. 必须验证“错误可定位/可撤回”：
   - 注入错误/过期记录，能否定位到源；
   - 能否标记为 stale/superseded/corrected；
   - 能否撤回并恢复。
4. 必须验证“不编造”：
   - 无记录主题不生成过去；
   - 理由只来自原文；
   - 摘要不冒充事实。

**验收协议**

- **样本**：从真实 `.shadow` 抽 30 个已完成任务（跨 ≥3 个项目/入口）；只给读者 `recall_shadow`/`read_shadow` 输出，不给原始全库。
- **评分**（每任务 0/1/2）：
  - 背景/材料完整；
  - 用户约束/决策完整且理由未编造；
  - 动作/结果完整；
  - 证据句柄可解析；
  - 能区分“历史陈述”与“当前仍有效”。
- **错误样本**：注入 5 条错误/过期记录（1 条假理由、1 条错路径、1 条同入口旧版本、1 条无证据断言、1 条伪造历史）；要求 100% 可定位，且能标记/撤回。
- **门槛**：先测基线，再棘轮；**任何“编造理由/伪造历史”一经发现即失败**；证据句柄解析率必须 100%；完整线索分数不得低于上一基线。
- **记录**：日期、commit、样本 ID、分数、失败项、裁决/撤回记录；附在验收报告，不写进 Atom。

**当前状态**：**机械基线已建立（v2.10.0，2026-11-01）**。  
- 报告：[CONTRACT-BASELINE-2026-11-01.md](./CONTRACT-BASELINE-2026-11-01.md)
- 30 个 Atom（按 entry 分层，排除 `entry=shadow` 元数据）：Top-8 命中 **24/30**、证据句柄解析 **30/30**、五要素完整度 **2.10/5**、编造理由 **0**。
- 仍未做：读者盲测 0/1/2 语义评分、5 类错误注入（假理由/错路径/旧版本/无证据/伪造历史）；机械基线不等于成功。

---

## 3. 条款优先级与例外

1. **契约 > 实现**：实现不满足时，必须记 ADR/例外，不能静默绕过。
2. **用户裁决 > 证据状态 > 旧记忆**：用户显式纠正优先；其次可核验证据；最后才是未验证历史。
3. **错误方向不对称**：证明不了时，保留多值可见比制造单一真相安全（v1 ADR-0061）。
4. **例外必须可见**：例如“无参读会归档移动热文件”属于读侧维护例外，必须在验收与文档中写明，不得当成无副作用。

---

## 4. 非目标

- 不承诺“所有历史都出现在一次召回里”；top-k / token 预算仍是正常限制。
- 不承诺“记忆自动知道真假”；没有证据/用户裁决时，它只能给历史与状态。
- 不把 LLM 摘要、Episode、Decision 投影当事实源。
- 不做向量库 / RAG / 常驻服务 / 自动改写用户记忆。
- 不把 `completed/abandoned` 启发式当成“方案正确/已确认”。

---

## 5. v1 边界 → v2 条款映射

| v1 来源 | v1 边界 | v2 条款 |
|---|---|---|
| `README.md`「它明确不做」 | 不替你做决定、不改写记忆 | C4 / C5 |
| `README.md`「可核查」 | 不让你相信，而让你核查 | C2 / C3 |
| `CONTEXT.md`「完整线索」 | 还原为什么/靠什么/怎么完成 | C6 |
| `adr/0043-shadow-contract.md` | Atom/Projection/Evidence/Mutation；LLM 不造事实/关系 | C1 / C2 |
| `adr/0031-recall-continuity-boundary.md` | Recall≠Observation；Forget≠Delete；无 lineage 拒绝 | C3 |
| `adr/0020-epistemic-boundary.md` | 成熟=知道自己以前为什么错；身份不投票 | C4 / C6 |
| `adr/0061`（确定性取代） | 同入口新版本降权；无 LLM 判真伪；证明不了保留多值 | C4 |
| `adr/0038/0039`（Event≠Summary / ObservedOutcome） | 事实≠摘要；只记观察，不判成功失败 | C1 / C4 |
| `adr/0049`（缺件不静默） | 缺件可见，不回落成成功 | C2 |
| `adr/0077`（错误方向不对称） | 破坏保守，宁可保留多值 | C4 / C5 |

---

## 6. 验收记录模板

```text
日期 / commit：
工程门：npm run verify = PASS/FAIL；测试数：
样本：30 任务（项目/入口列表）
完整线索：平均分 / 最低分 / 未达标项
证据：句柄解析率；stale/not_found 数
不编造：0 编造理由 / 0 伪造历史（必须为 0）
错误样本：5/5 可定位；纠正/撤回 5/5 可执行
已知例外：读侧归档移动 / 其他
裁决人：
```

---

## 7. 实施顺序（不改本契约）

1. **先补可观测缺口**：✅ 冲突可见（`supersededBy` 标注）、✅ 用户裁决/撤回入口（`shadow_adjudicate`）；⬜ `pinned` 写入口。
2. **再补验收**：✅ 机械基线（30 Atom）已建立；⬜ 读者盲测 0/1/2、⬜ 5 类错误注入、⬜ 纳入发布前门。
3. **最后才做性能/归档优化**：归档、trash、并行测试属于载体优化，不能替代契约验收。
