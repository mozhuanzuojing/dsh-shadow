# ADR-0044: Evidence Lineage Boundary（证据血缘边界，提议·暂不实现）

- 状态：**已提出（2026-09-08，先冻结边界；暂不实现**——用户明确"先把真实数据结论提升成边界，别急着写代码"）
- 决定日期：2026-09-08
- 关联 ADR：ADR-0042/0043（Shadow Contract）、ADR-0037（Decision Capture）、ADR-0039（Task Lifecycle）、ADR-0040（Context Recovery）
- 关联术语：`../CONTEXT.md`（Memory Atom / Decision / ShadowNode / Evidence Density / kind）
- 数据来源：`OpenAPI-Gateway/.shadow/2026-09-08`（52 个真实记忆原子，`shadow-report.md` 已生成）

## Context

这次真实工程数据（OpenAPI-Gateway，52 原子）暴露的**不是 bug，而是 dsh-shadow 最核心的数据模型缺口：Atom 层的"来源血缘"不足**。

`shadow-report.md`（真实计算，按类型拆）显示 Evidence Density 表面 25%，但分层看：

| 类型 | 有证据/节点 | 覆盖率 | 判读 |
|------|------------|--------|------|
| code | 4/4 | 100% | 模型正确（引用真实路径） |
| document | 9/9 | 100% | 模型正确（引用真实路径） |
| decision | 0/5 | 0% | **Atom 缺 lineage** |
| memory | 0/34 | 0% | **分类污染**（34 条全是 `shadow` 会话元数据） |

所以问题**不是** "ShadowNode 无法追踪"，而是 **"部分 Atom 没有提供可追踪来源"**。这是两个完全不同的问题。

- `code`/`document` 原子 100% 有证据 → **ShadowNode 模型本身没有大问题**。
- `decision`（如「采用 e-Builder 的 openApi + OAuth2 认证」）证据链 `证据(—)` → **产生决策时没记录产生环境**。
- `memory` 34 条入口全是 `shadow` 会话元数据 → **Memory Atom 分类过宽**，把"真正经验"与"系统事件/会话入口"混在一起。

> **核心命题**：Agent 的经验必须有出处，否则所谓长期记忆只是长期幻觉。这正是 dsh-shadow 与普通 Memory Plugin 的区别。

## Decision：冻结 Evidence Lineage Boundary

### 1. Evidence 是事件溯源，不是后处理（最核心）

**禁止**让 LLM"猜证据"：

```text
Decision ──LLM 推理──▶ 猜 evidence    ❌ 禁止
```

**应该**是事件溯源——产生 decision 时记录产生环境：

```text
User Request ─▶ Agent Working Context ─▶ Decision Created ─▶ Capture Current Context ─▶ Evidence Lineage
```

即：**Evidence 在 decision 产生的那一刻被捕获，不是事后补写**。

```yaml
# 期望形态（决策发生时的产生环境，非 LLM 补写）
Decision Atom:
  content: 采用 e-Builder 的 openApi + OAuth2 认证
  lineage:
    created_at: conversation-2026-09-08
    evidence:
      - type: conversation   source: sessions/xxxx.json
      - type: file           source: adr/001-auth.md
      - type: code           source: src/AuthFilter.java
```

### 2. 新增 AtomLineage（模型增强，v1.8.0 落）

```typescript
interface AtomLineage {
  source: string;
  createdBy: "user" | "agent" | "tool";
  evidence: string[];    // 指向产生环境（会话/ADR/代码/spec 路径）
}
```

### 3. memory 增加 kind（二级属性），不是新 type

**不新增 `metadata type`**（避免类型爆炸）。增加二级属性：

```typescript
type AtomKind = "experience" | "metadata" | "session" | "task" | "artifact";
```

```yaml
# 真正记忆
type: memory
kind: experience
content: 之前 OAuth2 认证选择 RSA 签名方案

# 会话元数据
type: memory
kind: metadata
content: 用户打开项目
```

派生：**默认 `kind != metadata` 才生成 MemoryNode**——Node 类型不膨胀，真实记忆与元数据分离。

### 4. task 暂不增加（数据<阈值）

- 数据仅 5 处 task 型内容（`tmp/dnw_todo.md`、`todo/…plan.md`）。
- **不把 `ShadowNode.type += task`**（task 易污染）。
- 观察：未来 `task` 查询占比 > 10% 再引入；或先作为 `kind: task` 而非 type。

### 5. relations 保持冻结

- 本次数据验证关系设计克制：`belongs_to` 52 · `references` 21 · `objective` 0。
- 无 `depends_on/implements/contradicts` 信号 → 当前 Shadow Graph 还不是 Graph，更像 **Evidence Graph**——这是正确阶段。

### 6. zg / PageIndex 暂不接入

- 当前最需要增强的是 **source lineage**，不是 **retrieval ability**。
- zg 会带来更多 `code`/`document` 节点（本就 100%），解决不了 `decision 0%`；PageIndex 同理（document 100% 不是瓶颈）。

## 明确不做（边界）

- ❌ LLM 推理/补写 evidence（Evidence ≠ Interpretation；有 Decision ≠ 一定有 Reason/证据，绝不编造）。
- ❌ 新增 `metadata` / `task` 类型（用 `kind` 二级属性替代；task 待数据阈值）。
- ❌ 接 zg / PageIndex / 建索引层（当前不是检索瓶颈，是 lineage 瓶颈）。
- ❌ 立刻写 v1.7.3 代码修复（先立本边界，再动 v1.8.0）。
- ❌ 追求「25% → 100%」（目标应是 `decision 0→80+`、`memory 0→过滤后提升`、`code/document 保持 100`）。

## 分阶段（供后续，未实现）

```text
v1.7.1 Observatory            ✅
  → 真实数据                    ✅（OpenAPI-Gateway 52 原子）
  → ADR-0044 Evidence Lineage Boundary（本边界）  ✅
  → v1.8.0 Evidence Lineage Layer（AtomLineage + memory.kind + Evidence Density by type/kind）
  → 重新测 Evidence Density（decision 0→80+ · memory 0→提升 · code/document 保持 100）
  → Phase 1B Projection Store（Performance Feature；触发：Node 稳定+query 稳定+rebuild 成本明显）
  → Phase 2 zg Index Engine
  → Phase 3 PageIndex Knowledge Engine
```

## 自检（本 ADR 无代码，仅记录）

- [x] 与 ADR-0042/0043 自洽：Evidence 指向 Atom / 有来源才可返回 / 无证据不返回 / Node 是派生投影。
- [x] 明确这是**模型边界**（Evidence≠Interpretation），不是 bug 修复；先冻结，再分阶段实现。
- [x] 用真实数据（52 原子）支撑判断：`decision/memory` 缺 lineage 是核心缺口，`code/document` 已健康。
