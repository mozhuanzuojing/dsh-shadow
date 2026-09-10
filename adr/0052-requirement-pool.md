# ADR-0052: Requirement Pool —— 需求（知识缺口）作为第 7 个 NodeType（提议，边界待冻结）

- 状态：**提议（2026-09-10）——边界待冻结，未实现任何代码。**
- 决定日期：2026-09-10
- 关联 ADR：ADR-0001（不引向量库）、ADR-0042（Shadow Knowledge Graph，提议未实现）、ADR-0043（Shadow Contract：Atom/Projection/Evidence/Mutation）、ADR-0044/0045/0046（Evidence Lineage / Validation Gate）、ADR-0049（缺件不静默）、ADR-0050（正名硬切）、ADR-0051（Resource Card → `resource` NodeType）
- 关联术语：`../CONTEXT.md`（Requirement / Knowledge Gap / ShadowNode Projection / Evidence Gate）
- 上游动机：投影模式预设 ⑦「创意与资源」在 v1.14.x 只解决了**采到的东西怎么存**（资源卡）；没有解决**没采到的东西怎么被记住**。本 ADR 只处理后者中「缺口」这一种。

## Context

§1 现状：`NodeType` 只有 6 个（`memory|code|document|decision|concept|resource`，`core/lineage.ts:19`），前 5 个从**记忆原子**派生，`resource` 从**资源卡源文件**派生（ADR-0051）。系统里**没有任何对象表示「我们现在缺什么」**——全仓 grep `requirement` **0 命中**。

§2 缺口造成的具体失败：一个 agent 发现「Java 调试 MCP 的断点支持没人验证过」时，唯一去处是把它写进对话。换上会话即失忆（README 失败模式 #1）；另一个 agent 会**重新搜一遍同样的东西**——这正是 v1.13.2 立的「编排者与专家不重复做同一件事」在**知识维度**上的漏洞：那条纪律只约束了**同一次编排内**不重复，跨会话、跨 agent 无从约束，因为没有共享的「已搜过 / 还缺什么」记录。

§3 关键的不对称（本 ADR 的全部难点）——需求与资源卡在证据上**方向相反**：

| | Resource Card（ADR-0051） | Requirement（本 ADR） |
|---|---|---|
| 它在说什么 | 关于**世界**的断言（「这东西存在、它权威」） | 关于**我们**的申报（「我们还不知道 X」） |
| 有无 `source` | **必须有**，否则不上投影 | **天然没有**——有 source 就不叫缺口 |
| 门因此 | `无 source → reject` | `无 source` 是**正常态**，不能照抄 |
| 若照抄 resource 的门 | — | **每一条需求都会被自己的门挡掉**，得到一个永远为空的死类型 |

§4 因此需求的证据必须换一个**指向**：不是「支撑材料」，而是**观察到缺口的现场**（哪次会话 / 哪个入口 / 哪天）。这条恰好落在既有抽象里——`AtomEvidenceRef.type` 已经是 `"file" | "conversation" | "document" | "commit" | "url"`（`core/lineage.ts:23`），`conversation` 就是为此预留的，**不需要新增类型**。

## Decision

**1. 新增 `NodeType` 第 7 个值 `requirement`**（`core/lineage.ts:19`）。

**2. 两层分离，完全照 ADR-0051 的形状：**

| 面 | 是什么 | 谁写 | 可否 `rm -rf` |
|----|--------|------|---------------|
| **Requirement Card** | `.shadow/requirements/<name>.md` 普通文件 | human / agent（用普通文件工具） | **否**（是事实源） |
| **`requirement` 节点** | 从卡片确定性派生的 ShadowNode | 系统 | **是**（派生投影，可重建） |

**插件只读不写**（与 ADR-0051 一致）：写侧零代码，落盘由 agent/human 用既有文件工具完成。

**3. 卡片格式（一级标题 = 需求名；`- 键：值` 收字段；中英键名都收）：**

| 字段 | 别名 | 必填 | 语义 |
|------|------|------|------|
| `question` | 问题 / 未知 / 待答 | **是** | 缺口的**一句话表述**（是谁的未知，不是谁的答案） |
| `missing_evidence` | 缺证据 / 缺失证据 | **是** | 要补齐**哪些**具体证据才能关闭（`、`/`,` 分隔） |
| `entry` | 入口 / 域 | 建议 | 缺口属于哪个入口/主题（与记忆文件的「入口」同轴，让 `read_shadow(topic)` 找得到） |
| `requester` | 提出者 / 上报者 | 建议 | 谁提出（自由文本，如 `coding-agent`；不强制 session id） |
| `blocking` | 阻塞 | 否 | `yes|no`：是否阻塞当前任务（区分「锦上添花」与「做不下去」） |
| `priority` | 优先级 | 否 | `high|normal|low`——**申报值，非派生值**（谁提谁声明，系统不算） |
| `status` | 状态 | 否 | `open|researching|resolved|dropped`，缺省 `open` |
| `resolved_by` | 已由 / 解决证据 | `status=resolved` 时**必填** | 指向**真实产物**（资源卡相对路径 / URL） |
| `drop_reason` | 放弃原因 | `status=dropped` 时**必填** | 为什么不再查（防静默放弃） |
| `date` | 日期 / observed_at | 建议 | 观察到缺口的日期，缺省 `today()` |

**4. 门（`validateAtomProjection` 增一条，`core/lineage-validator.ts`）——与 resource 不同的一道门：**

- `requirement` 的 **gap-site evidence** = `entry`（若形如路径/URL）+ 合成的 `conversation:<requester>@<date>`。
- **reject 条件**（三者任一）：
  1. `question` 为空 → 无法执行的诉求；
  2. `missing_evidence` 为空 → **不可证伪**（不是知识缺口，是意见）；
  3. 无 gap-site evidence（`entry` 与 `date`+`requester` 皆空）→ 无现场可回查。
- **`status=resolved` 但缺 `resolved_by`**：**不在 validator 里 reject**，而由**解析层降级**为 `open` 并在 content 里写一行 `⚠ 声明 resolved 但缺 resolved_by（按 open 处理）`——这是 ADR-0049「缺件不静默」的落点：**降级必须可见，绝不把缺件说成已完成**。
- 同样的处置给 `status=dropped` 但缺 `drop_reason`。

**5. 节点形状：**

- `id` = `rq-<slug(文件名)>`，非 ASCII slug 退化为 `mem` 时走短哈希兜底（照抄 `resourceIdOf`，`core/resource.ts:69-74`）。**由文件名派生，不由作者指定**——同名需求的去重天然落在文件系统上（同 slug ⇒ 同文件 ⇒ 后写者追加 `requester`），这是**确定性去重**，不需要 LLM 或向量。
- `type` = `"requirement"`；`createdBy` = `"tool"`（与 resource 同口径：人/agent 写，落盘经工具）。
- `relations` **只派生 `references`**（指向 gap-site），**不派生** `similar_to` / `depends_on` / `blocks` 等——ADR-0043 §5「LLM 只能解释关系，不能制造关系」。
- **`content` 行序固定（读侧只取前 6 行，`core/node.ts:79`）**，高价值行在前：

```text
缺口：<question>
缺证据：<a>、<b>、<c>
阻塞：是 · 优先级：high
提出者：coding-agent · 入口：<entry> · <date>
状态：open
（resolved 时）已由：<resolved_by>
```

**6. 接线面（实现时共 7 处，本 ADR 不改代码）：**

| # | 文件 | 改动 |
|---|------|------|
| 1 | `core/lineage.ts:19` | `NodeType` 增 `"requirement"` |
| 2 | `core/requirement.ts`（新） | `REQUIREMENT_DIR` / 别名表 / `parseRequirementCard` / `listRequirementCards` / `requirementLineage` / `deriveRequirementNodes`——结构照 `core/resource.ts` |
| 3 | `core/lineage-validator.ts` | 增 requirement 的门（含与 resource 不同的判据注释） |
| 4 | `query/reads.ts:110-113` | 合并 `deriveRequirementNodes(cards)` + scope 白名单加 `requirement` |
| 5 | `index.ts:302 / 307` | `shadow_query` 描述 + scope schema |
| 6 | `test/requirement-node.test.ts`（新） | 照 `test/resource-node.test.ts` 的棘轮（含**「无 source 的需求必须能上投影」**这条与 resource 相反的正向断言） |
| 7 | `README.md` / `CONTEXT.md` / `CHANGELOG.md` | 同步（仓库约定：改 mode/术语后做四查） |

**明确不做**：写侧插件代码、`requirements.jsonl` / 任何 Store、向量库（ADR-0001）、LLM 生成任何字段、自动计算 `priority`、relations 扩展、自动 GC 僵尸需求。

## Alternatives Considered

1. **复用 `resource` 类型 + 一个 `kind/status: 需求` 字段**
   - 支持：零新增枚举。
   - **否决**：`NodeType` 是读侧 `scope` 的单位（`query/reads.ts:113`）。混用会让 `scope:["resource"]` 同时返回「外面有什么」与「我们还不知道什么」，语义被污染；且两者证据门方向相反，塞进同一道门必错一半。
2. **放进 `AtomKind`（memory 的二级属性）**
   - **否决**：`kind` 只挂在 memory 原子上的二级分类（`core/lineage.ts:14`），而需求不是从记忆原子派生的——与 ADR-0051 拒绝让 `resource` 走 `kind` 的理由完全相同。
3. **独立 Store（`requirements.jsonl` / 单独的小库）**
   - 支持：查询更快、字段更自由。
   - **否决**：撞 ADR-0043（Projection 可重建、一切皆文件、Atom 是唯一事实源）与 ADR-0049；且引入第二个真相源，`rm -rf` 语义立刻分叉。
4. **不建类型，只靠 persona 纪律（agent 在对话里记）**
   - **否决**：这正是 README 失败模式 #1（换会话就失忆），且无法被 `shadow_query` 检索，等于没做。

## Consequences

### 正
- 「我们还缺什么」第一次成为**可检索、可追溯、跨会话**的一等对象，补上 v1.13.2「不重复做同一件事」在知识维度上的漏洞。
- 复用既有全部机制：`AtomEvidenceRef` 的 `conversation` 类型、Evidence Gate、派生投影、文件名去重——**零新机制、无 LLM、无向量、无 Store**。
- 纯读侧改动（写侧零代码），符合 ADR-0051 的部署形状。

### 负 / 已知边界
- **需求会膨胀**：无自动 GC（有意为之——判死需要判断力，而判断力不能用 LLM 冒充）。靠 `status` + `date` 让人/agent 显式收口。
- **slug 碰撞会合并两条不同需求**：同文件名即同需求，多个 `requester` 只能并存于一张卡内。与 `resource` 同名标题不撞 id 的性质相反（那里 id 取文件名所以不撞；这里 id 也取文件名，所以**会**撞）——这是有意的：需求的价值在于合并。
- **「缺口」可能被当成答案**：需求节点进入查询结果时，读侧已有的「数据非指令 / 可能过时」护栏**不覆盖**这种误读（那护栏针对的是旧记忆被当指令，不是缺被当有）。缓解：content 首行固定 `缺口：` 前缀。**是否默认排除，见下方待定焦点 F1。**
- 本 ADR **只冻结插件平面的对象与门**；投影模式预设里「什么时候上报缺口 / 什么时候查需求池」的**工作方式**属**预设平面**（同 ADR-0051 对资源侦察员的划分），不在本 ADR。

### 风险
- 若 F1 选择「默认排除」，则需求池对 agent 的可见性完全依赖 persona 主动去查——纪律一漏就等于没建。**缓解**：persona 侧强制「先查需求池再外搜」。

## 待定焦点（需在冻结前定，本 ADR 未决）

| # | 焦点 | 建议 |
|---|------|------|
| F1 | `requirement` 是否进入**无 scope**（默认）的 `shadow_query`？ | **进入**，靠 content 首行 `缺口：` 前缀区分（默认排除会让需求池变成只有主动查才存在的东西） |
| F2 | `status=resolved` 是否必须 `resolved_by`？ | **必须**；缺失时解析层降级为 `open` + 可见告警（ADR-0049） |
| F3 | `requester` 写自由文本还是强制 session id？ | **自由文本 + 可选 session 注释**（强制 id 会让手工写卡变难，且 id 不可读） |

## 自检（本 ADR 无代码）

- [x] 与 ADR-0043 自洽：Requirement Card = source（事实源），节点 = Projection（可重建）；relations 只派生；LLM 不生成任何字段。
- [x] 与 ADR-0044/0045/0046 自洽：走**同一道** `validateAtomProjection`，判据按 type 分化。
- [x] 与 ADR-0049 自洽：`resolved` 缺 `resolved_by` 走**可见降级**，不冒充成功。
- [x] 与 ADR-0050 自洽：新增名 `requirement` 无旧名冲突。
- [x] 与 ADR-0051 自洽：两层分离、文件名派生 id、插件只读不写、纯派生无 LLM。
- [ ] **未实现、未验证**：本 ADR 仅为边界冻结，代码与测试待 F1–F3 定后另行落地。
