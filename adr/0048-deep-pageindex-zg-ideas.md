# ADR-0048: Deeper PageIndex + zg Ideas（检索成本/渐进披露/增量索引/授权边界，设计收缩·暂不集成工具）

- 状态：**已提出（2026-09-08；ADR-0047 之后再次深入核对 zg/PageIndex 源码，挖掘更深的可吸收设计**）
- 决定日期：2026-09-08
- 关联 ADR：ADR-0047（PageIndex/zg 思想第一批）、ADR-0043（Shadow Contract）、ADR-0001（不向量化）
- 参考源码：`vendor/_src/PageIndex`（`tree_optimize.py`/`page_index_md.py`/`flash/classification`/`agent_tools.py`）、`vendor/_src/zvec-grep`（`daemon/change-set.ts`/`authorization/*`/`retrieval/*`）

## Context

ADR-0047 吸收了 PageIndex/zg 的第一批思想（免向量树 + 推理检索 + 语料树 + 多级管线）。再次深入源码，挖到**更深、能显著强化 dsh-shadow 索引/知识层**的 8 个点（见下）。本 ADR 收紧**采用项**，其余留作候选。

## Decision：采用 ①②⑤⑥（本 ADR 落地），③④⑦⑧ 留作候选

### ① 成本感知树优化（PageIndex `tree_optimize.py`）
- **思想**：树不是"建好就完"，要用**最坏检索成本** refine——`expand()/merge()` 按"路由成本 vs 扫描成本"决定展开/合并；被合并子树的标题存父上作 `key_items`；覆盖相同页的兄弟合并（`merge_same_page`）。
- **对 dsh-shadow**：Knowledge 树应**成本优化**（检索代价有界）→ `refineTree()`：折叠扫描成本 `S(v)`（子树范围）vs 路由成本 `R(v)`（读标题/摘要），`expand iff expand_cost < collapse_cost`；`merge iff merge_cost <= tree_cost`；保留 `key_items`。

### ② 渐进披露树（PageIndex `page_index_md.py`）
- **思想**：内部节点带**子树摘要**（`prefix_summary`），**叶子带全文**；推理读摘要决定下探，最后读叶子全文。
- **对 dsh-shadow**：Knowledge 节点 `summary`（路由摘要）+ `content`（叶子全文）→ `progressiveDisclosure()`：内部节点 `summary=标题+节数`，叶子 `content=全文`；"只读推理到达的节点"（上下文经济）。

### ⑤ change-set 增量索引（zg `daemon/change-set.ts`）
- **思想**：只重索引**变更**文件；`touchedFiles/rescanDirectories/deletedPrefixes/forceFullReconcile`；`add(path, kind: created|changed|deleted)`；`pathCoveredBy` 去重；`maxChangedPaths` 超阈值→强制全量对齐。
- **对 dsh-shadow**：索引（Projection Store/L2）应**变革驱动增量** → `ChangeSet` 数据类 + 投影 store 只失效变更项的节点。

### ⑥ 授权范围搜索（zg `authorization/*`）
- **思想**：检索尊重 **agent 可访问的 scope**，防越权泄漏（哪些文件/路径能搜）。
- **对 dsh-shadow**：Index/Knowledge/Evidence 尊重**权限 scope** → `authorizeScope()` 过滤允许范围外的候选/证据；与 provenance 互补（Agent 信任层）。

## 候选（③④⑦⑧，暂不实现）
- ③ 确定性结构抽取 + 内容分类去噪（TOC/页眉页脚剔除）；④ 树即 agent 工具 + 引用；⑦ 按格式结构化抽取（code 符号/markdown 标题）；⑧ manifest/诊断/可观测。

## 边界
- ❌ 不集成 PageIndex/zg 依赖（保留 provider，未装→unavailable）。
- ❌ 不引向量库 / chunking（ADR-0001）。
- ❌ LLM 不造事实/关系；**结构确定性**（树/成本/增量/授权均无 LLM 参与）。
- ✅ 吸收的是**更深的思想**：检索成本有界 + 渐进披露 + 变革驱动 + 权限边界。

## 分阶段（供后续）
```text
ADR-0047（第一批）✅
  → ADR-0048（本 ADR：①②⑤⑥）
  → 实现：refineTree / progressiveDisclosure / ChangeSet / authorizeScope（每个带测试）
  → v1.11.0（如果纳入版本）
```

## 自检
- [x] 深入 PageIndex/zg 源码挖出 8 个更深设计，本 ADR 收紧采用 ①②⑤⑥。
- [x] 与 ADR-0043/0047 自洽：结构确定性（无 LLM）、不向量化、检索不是系统大脑。
