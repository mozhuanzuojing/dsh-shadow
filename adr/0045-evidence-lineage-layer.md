# ADR-0045: Evidence Lineage Layer（v1.8.0 设计冻结，暂不实现）

- 状态：**设计冻结（2026-09-08；先冻结实现方案，再动代码**——Evidence Lineage 会改变 Atom 生命周期，比 Projection Layer 更底层）
- 决定日期：2026-09-08
- 关联 ADR：ADR-0044（Evidence Lineage Boundary，本层的边界依据）、ADR-0043（Shadow Contract）、ADR-0042（方向）、ADR-0037（Decision Capture）
- 关联术语：`../CONTEXT.md`（Memory Atom / ShadowNode / AtomKind / Evidence Density / lineage）
- 数据往来：`OpenAPI-Gateway/.shadow/2026-09-08`（52 原子：decision/memory 0% evidence，code/document 100%）

## 目标

> 让 Shadow 的每个高价值认知单元都能回答：**"这个东西为什么存在，它来自哪里？"**

- **不是**提高搜索能力。
- **不是**增加知识。
- **而是**提高 **可信度与可审计性**。

## 一、核心模型变化：ShadowAtom 增加 AtomLineage

```ts
ShadowAtom {
  id: string;
  type: NodeType;
  content: string;
  lineage: AtomLineage;
}

AtomLineage {
  source: string;                 // 这个 Atom 从哪里产生
  createdBy: "user" | "agent" | "tool";
  evidence: string[];             // 支撑这个 Atom 的材料
  createdAt: string;              // 产生时间
}
```

## 二、Lineage 的语义边界：source ≠ evidence

- **`source`** = 这个 Atom **从哪里产生**（如 `session/2026-09-08-001`）。
- **`evidence`** = **支撑这个 Atom 的材料**（spec/代码/adr 路径）。

例（一次设计决策）：

```yaml
type: decision
content: 采用 RSA 签名方案
lineage:
  createdBy: agent
  source: session/2026-09-08-001
  evidence:
    - docs/sso-spec.pdf
    - src/SecurityFilter.java
    - adr/0001-auth.md
```

## 三、Evidence 不允许自动补全

继续守住：LLM **解释 evidence**，**不能创造 evidence**。

- ✅ 允许（解释已有证据）：`根据 ADR-001，因为 xxx`
- ❌ 禁止（创造证据后写入）：`我认为可能来自 AuthFilter.java`

## 四、memory kind 设计

**不增加 type**，保持：

```ts
NodeType = "memory" | "code" | "document" | "decision" | "concept";
```

新增二级属性：

```ts
AtomKind = "experience" | "metadata" | "session" | "task" | "artifact";
```

关系：

```text
Atom type=memory kind=experience  →  ShadowNode type=memory      （进入认知）
Atom type=memory kind=metadata    →  不进入默认认知查询           （如"用户打开项目"）
```

这样"用户打开项目 / 切换目录 / 执行命令"这类**垃圾不会进入 Agent 上下文**。

## 五、Projection 规则调整

```text
Atom
  │
  ├── lineage validation
  │
  ▼
Projection
```

规则：

```ts
// memory：kind != metadata 才生成 MemoryNode
if (type === "memory" && kind !== "metadata") create Node;

// decision：必须有证据，否则不进 shadow_query context（但保留 Atom）
if (type === "decision" && lineage.evidence.length > 0) enterContext;
else keepAtom;    // 决策发生过 ≠ 决策可信
```

## 六、Evidence Density 报告升级

按维度拆分 `shadow-report` 的 Evidence Density：

- **按 type**：`decision / memory / code / document` 各 xx%。
- **按 kind**：`experience / metadata（ignored）/ task` 各 xx%。
- **按 createdBy**：`user-created / agent-created / tool-created`（未来可观察** Agent 自己产生的记忆是否更容易缺证据**）。

## 七、新增测试 invariant（v1.8.0 必须）

**Invariant 1 — 无 evidence decision 不进入 query**
```text
create decision, evidence=[]
  → shadow_query
  → expect: not returned
```

**Invariant 2 — metadata memory 不进入默认查询**
```yaml
type: memory
kind: metadata
```
```text
query scope=memory
  → expect: 不出现
```

**Invariant 3 — LLM 不参与 lineage**
```text
deriveShadowNodes() 无 generate / infer / guess 路径
```

## 八、版本边界（v1.8.0 不做）

- ❌ `nodes.jsonl`
- ❌ Projection Store
- ❌ zg
- ❌ PageIndex
- ❌ Graph relation 扩展
- ❌ 自动总结经验

**只做**：
- ✅ Atom lineage
- ✅ kind 分类
- ✅ evidence gate
- ✅ report

## 九、完成后的预期

现在：
```text
Evidence Density: code 100% · document 100% · decision 0% · memory 0%
```

目标（**不是** 100%）：
```text
code       保持 100
document   保持 100
decision   >80
memory     >80（过滤 metadata 后）
```

## 十、v1.8.0 之后再判断 Phase 1B

- 若 `Atom 5000 · derive 20ms` → Projection Store 没必要。
- 若 `Atom 500000 · derive 45s` → 再做。

## 路线

```text
ADR-0044 Boundary            ✅
  → ADR-0045 v1.8.0 design freeze（本文档）
  → 实现 Evidence Lineage Layer
  → 真实 OpenAPI-Gateway 再跑一次
  → Evidence Density 对比（decision >80 · memory >80 过滤 metadata 后）
  → 决定 Projection Store / zg / PageIndex
```

## 自检（本 ADR 无代码，仅记录）

- [x] 与 ADR-0044 自洽：Evidence 事件溯源、source≠evidence、Evidence Gate 无证据不返回。
- [x] 明确这是**设计冻结**（比代码更底层的模型变化），先出方案再实现。
- [x] 版本边界清晰：v1.8.0 只做 Atom lineage / kind / evidence gate / report，不做存储/检索/图关系扩展。
