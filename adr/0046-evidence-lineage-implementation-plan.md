# ADR-0046: Evidence Lineage Layer（v1.8.0 Implementation Plan Freeze，暂不实现）

- 状态：**实现计划冻结（2026-09-08；把 ADR-0045 映射到代码边界，冻结后再动代码**。不是重设计，是"把 ADR 落到哪个文件/哪个函数"）
- 决定日期：2026-09-08
- 关联 ADR：ADR-0045（设计冻结）、ADR-0044（Evidence Lineage Boundary）、ADR-0043（Shadow Contract）
- 关联术语：`../CONTEXT.md`（Atom / AtomKind / AtomLineage / EvidenceRef / Evidence Gate）

## 目的

把 ADR-0045 映射到代码边界，**避免实现过程中 Lineage 偷偷扩散到 Projection / Query / Index**。

> **顺序铁律**：先建 **Lineage 基础设施**（数据模型 + 写侧捕获）→ 再接 **Evidence Gate**（validator + projection/query 接入）→ 再改 **Report**。**不要反过来。**

## 范围（v1.8.0 只做这些）

✅ AtomLineage / EvidenceRef / AtomKind / 写侧 lineage 采集 / Validation Layer / Evidence Gate / Quality Report
❌ Projection Store / nodes.jsonl / zg / PageIndex / Graph DB / 自动经验总结

---

## 实现拆解（按 ADR 映射到模块）

### Phase A：数据模型层（Foundation）

新增 `core/lineage.ts`：

```ts
export type CreatedBy = "user" | "agent" | "tool";
export type AtomKind = "experience" | "metadata" | "session" | "task" | "artifact";

export interface EvidenceRef {
  type: "file" | "conversation" | "document" | "commit" | "url";
  locator: string;            // 路径 / 会话 id / commit sha / url
  fragment?: { start?: number; end?: number; page?: number };  // 行号/页范围
}

export interface AtomLineage {
  source: string;             // 从哪产生（session/yyyy-mm-dd-xxx）
  createdBy: CreatedBy;
  evidence: EvidenceRef[];    // 支撑材料（zg/PageIndex 未来就是 EvidenceRef）
  createdAt: string;
}
```

> **调整**：ADR-0045 概念层文案 `evidence: string[]` 保留为描述；**实现层直接用 `EvidenceRef[]`**，避免 zg（file+行号）/PageIndex（document+页）/Git（commit+diff）接入时再迁移。

### Phase B：Atom Schema 演进

`core/types.ts`：

```ts
interface ShadowAtom {
  id: string;
  type: NodeType;
  content: string;
  kind?: AtomKind;            // 新增（memory 分类：experience/metadata/session/task/artifact）
  lineage?: AtomLineage;      // 新增
}
```

- **兼容**：旧 Atom（`{type:"memory"}`）仍合法，`kind`/`lineage` 可选。**不做 migration。**

### Phase B2（写侧 Capture，计划补缺）：采集 lineage + kind

`core/writer.ts`（收集器，写侧）：

- 当创建 **decision** / **用户消息** Atom 时，把**同一回合读/改的路径**（当前 `materials`/`fs/observed` 积累）挂进 `lineage.evidence`（EvidenceRef: `{type:"file", locator:path}`），并把 `source` 置为当前会话 id、`createdBy` 按来源（user/agent/tool）。
- 按原子性质赋 `kind`：
  - 用户消息/会话入口类（`entry=="shadow"` 且无实质决策）→ `kind:"metadata"`（或 `session`）
  - 真实经验/决策 → `kind:"experience"`
  - todo/plan 文件 → `kind:"task"`（先作 kind，不新增 type）
- **`lineage` 是 event-sourced**：只记录**当下已观察到的**材料，**绝不 LLM 补写/推断**。

### Phase C：Lineage Validation Layer（v1.8.0 核心）

新增 `core/lineage-validator.ts`：

```ts
validateAtomProjection(atom): { allowed: boolean; reason?: string }
```

规则：
- `type=="memory" && kind=="metadata"` → `allowed:false`（reject projection；Atom 仍存在）
- `type=="decision" && (!lineage || lineage.evidence.length===0)` → `allowed:false`（reject context；Atom 仍存在）
- 其余 → `allowed:true`

> **reject 不是删除**：Atom 仍然存在（决策发生过 ≠ 决策可信）。

### Phase D：Projection 接入

`core/node.ts`：

```text
Atom → validateProjection → deriveShadowNodes → Node
```

- `deriveShadowNodes` 调用前先过 `validateAtomProjection`；rejected 的不生成 Node。
- **`deriveShadowNodes` 不做**：猜 evidence / 补 lineage / 调 LLM。

### Phase E：Query Contract

`query/query.ts`：

- **不改 API**；`shadow_query()` 不变。
- 行为：以前"所有 Node 返回"→ 现在"**只有通过 lineage gate 的 Node 返回**"。透明升级。
- 内部：`deriveShadowNodes` 已过滤 metadata memory / 无证据 decision；query 只在这些候选里匹配。

### Phase F：Observatory / Report

`query/observatory.ts`（`shadow-report` Evidence Density 按三维）：

- **type**：`decision / memory / code / document`
- **kind**：`experience / metadata（excluded）/ session / task / artifact`
- **createdBy**：`user / agent / tool / unknown`

输出示例：

```markdown
Evidence Density
type      decision 86% · memory 74% · code 100% · document 100%
kind      experience 82% · metadata excluded · task 71%
createdBy agent 65% · user 95% · tool 100%
```

---

## 测试计划

新增 `test/lineage.test.ts`、`test/evidence-gate.test.ts`、`test/atom-kind.test.ts`。

- **Test 1 — decision 无 evidence**：`{type:"decision", content:"选择RSA", lineage:{evidence:[]}}` → Atom 存在 / Node 不存在 / query 不存在。
- **Test 2 — metadata memory**：`{type:"memory", kind:"metadata"}` → derive skip。
- **Test 3 — 不生成 lineage**：projection path 无 `generate/infer/guess`；验证 `deriveShadowNodes`/validator 无 LLM 调用。

## 验证顺序（不要只看代码测试）

```text
1. 单元测试（lineage + evidence-gate + atom-kind）
      ↓
2. OpenAPI-Gateway 重新扫描（写侧采集 lineage/kind）
      ↓
3. shadow-report（Evidence Density 三维）
      ↓
4. 对比：
   Before: decision 0% · memory 0%
   After:  decision >80% · memory >80%（过滤 metadata 后）
```

## 版本边界（再确认）

v1.8.0 包含：✅ AtomLineage · ✅ EvidenceRef · ✅ AtomKind · ✅ 写侧 lineage 采集 · ✅ Validation Layer · ✅ Evidence Gate · ✅ Quality Report
不包含：❌ Projection Store / nodes.jsonl / zg / PageIndex / Graph DB / 自动经验总结。

## 自检（本 ADR 无代码，仅记录）

- [x] 把 ADR-0045 映射到具体文件/函数边界（lineage.ts / types.ts / writer.ts / lineage-validator.ts / node.ts / query.ts / observatory.ts）。
- [x] **补写侧 Capture 阶段（B2）**——否则 read 侧 gate 拿到的是空 evidence，Evidence Density 不会上去。
- [x] 明确"先基础设施 → 再 Gate → 再 Report"；Lineage 不扩散进 Projection/Query/Index。
- [x] 版本边界清晰（不含存储/检索/图/自动总结）。
