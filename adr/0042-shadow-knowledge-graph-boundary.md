# ADR-0042: Shadow Knowledge Graph / Cognitive Layer Boundary（影子知识图·认知层边界，提议·暂不实现）

- 状态：**已提出（2026-09-07，先冻结方向；暂不实现**——这是 dsh-shadow 最大的一次模型升级，先定边界再分阶段）
- 决定日期：2026-09-07
- 关联术语：`../CONTEXT.md`（Memory Atom / Episode / Task / ContextReference）
- 关联 ADR：ADR-0037/0038/0039/0040/0041（全部自洽）

## Context

dsh-shadow 已从"记忆插件"演化为"工作恢复系统"（v1.5/1.6）。用户 2026-09-07 提出：**不是把 `zg`（zvec-grep）与 `PageIndex` 当外部插件接入，而是把它们的能力**移植进 shadow 内部**，统一成 **Shadow Knowledge Graph**——即 dsh-shadow 的目标是 **Agent Cognitive Layer**（认知层），不是 Memory Plugin。

> 吸收 = 把 zg 的 **Index Engine**（代码意识/工作区索引）、PageIndex 的 **Document Tree Model**（文档理解）**重构成 shadow 内部引擎**，而非调用外部服务。

## 提议的模型（方向，未实现）

```text
dsh-shadow → Shadow Core
  ├── Memory Engine    （保存经历：原 dsh-shadow）
  ├── Index Engine     （代码/工作区索引：吸收 zg）
  └── Knowledge Engine （文档理解：吸收 PageIndex）
```

统一节点：
```yaml
ShadowNode:
  id; type: memory | code | document | decision | concept
  content
  relations: [depends | references | caused_by | implements]
  index:     [keyword | tree | (可选 vector)]
```

> **勘误（ADR-0051 / v1.14.0）**：上面的 `type` 列表是本文（提议、未实现）当时的写法；v1.14.0 起**实现侧**的 `NodeType` 另有第 6 个 `resource`（资源卡投影）。本文其余提议（Projection Store / Graph 关系扩展）仍未实现。

查询入口从 `read_shadow("xxx.md")` 演进为 `shadow.query("appid secret 认证在哪里设计")`，返回跨"历史 ADR / 代码 / 规范 / 关系"的上下文。

## 接受的边界（本 ADR 冻结，实现时禁止越界）

1. **移植而非调用**：zg 的 Index Engine、PageIndex 的 Document Tree Model **重构为 shadow 内部引擎**；不是把 shadow 变成调用它们的客户端插件。
2. **Memory Atom = source of truth**：`ShadowNode` 是**派生的统一视图**（从 memory/decision/context/task/code/document 聚合），Node 不覆盖 Atom（沿用 ADR-0038/0040 的"投影非事实"）。
3. **relations 只派生、不 LLM 创造**：`implements/references/caused_by/depends` 从**观察信号**派生（同入口路径、同目标、同证据路径），**禁** LLM 编造关系。
4. **index（semantic.index / document.tree / memory.graph）是可重建的派生索引**：不是事实源；换存储/检索方式不影响模型（核心 = Immutable Event + Lineage + Projection）。
5. **经验闭环**：`搜索 → 理解 → 修改 → 总结 → 形成 Shadow Node → 下次直接使用`（今天的"解决 appid 签名"→ `experience/appid-signature.md` 关联 SecurityFilter/SSO规范/ADR → 半年后"增加资产同步接口"时复用 SignService）。
6. **差异化**：每一次查询都能指出**证据来源（provenance）**，且可复用经验——这正是 Agent Cognitive Layer 区别于普通搜代码/记忆的地方。

## 明确不做

- ❌ 现在实现（先冻结方向；按阶段推进，每阶段小而可测）。
- ❌ 把 zg/PageIndex 当外部插件接入（而是**重构为内部引擎**）。
- ❌ LLM 生成 Node/关系/事实（relations 派生；Node 是投影）。
- ❌ Node 覆盖 Atom（Atom 仍 source of truth）。
- ❌ 让 shadow 变成知识库/对象永久化（ADR-0041 已排除 Entity 演化成知识库）。

## 分阶段建议（未实现）

- **Phase 1**：统一 `ShadowNode` 派生 + `shadow.query(...)` 入口（把现有 memory/decision/task/context 聚合为跨类型 Node；查询返回跨"历史/代码/规范/关系"上下文）。
- **Phase 2**：Index Engine（吸收 zg 索引/检索：bm25+语义+ripgrep 作 shadow 内部索引）——用于 `mode:"context"` 的 P0 **语义复核**（判断"是否真实过期"，替代纯 fs 存在性）与 recall 检索增强。
- **Phase 3**：Knowledge Engine（吸收 PageIndex 文档树：文档→章节树→节点摘要）——文档理解。
- **Phase 4**：经验闭环（experience/ 沉淀 + 关联 code/spec/adr）。

## 自检（本 ADR 无代码，仅记录）

- [x] 与 ADR-0037/0038/0039/0040/0041 自洽（Evidence≠Interpretation / Episode=投影 / Memory=source / ContextReference=投影 / Outcome≠Success / Entity=观察非创造）。
- [x] 明确这是模型升级（Cognitive Layer），非功能添加；先冻结方向，再分阶段实现。
