# ADR-0047: Adopt PageIndex + zg Ideas（免向量树检索 + 多级管线，设计收缩·暂不集成工具）

- 状态：**已提出（2026-09-08；学习 PageIndex/zg 的**思想**并进入 dsh-shadow，不集成外部工具**）
- 决定日期：2026-09-08
- 关联 ADR：ADR-0001（不引向量库）、ADR-0042/43（Shadow Contract）、ADR-0045/46（Lineage/Plan）、ADR-0044（Evidence Lineage Boundary）
- 参考源码：`vendor/_src/PageIndex`（Vectorless, Reasoning-based RAG）、`vendor/_src/zvec-grep`（zg, local-first search layer）
- 关联术语：`../CONTEXT.md`（Knowledge Tree / Index Engine / Evidence Gate / provenance）

## Context

用户方向：**学习 PageIndex / zg 的`思想`，让它们进入 dsh-shadow**——不是把工具搬进来，而是把它们的**检索哲学**内化。读源码后提炼：

### PageIndex 的核心思想
- **Vectorless / No Vector DB / No Chunking**：用**分层树索引**替代向量索引。
- **相似 ≠ 相关**：retrieval 真正需要的是**相关**，相关需要**推理**（LLM 在树上推理检索）。"Inspired by AlphaGo，像人一样翻到长报告的正确章节"。
- 两步：**Index**（生成每文档的树结构索引）+ **Retrieve**（agentic 地在树上推理搜索）。
- **自然章节**（非固定 chunk）；结果**可追溯**（显式引用）。
- `index=` 基础模型即可（树来自布局，非 LLM 生成）；`chat=` 用最强模型（在树上推理检索）。
- **PageIndex File System**：文件级树索引层，跨**整个语料**（corpus）推理，不只单文档。
- 上下文经济：只读推理到达的节点。

### zg 的核心思想
- **本地优先、agent 可用**：一种本地接口统一 ripgrep / BM25 / 向量搜索。
- **多级检索管线**：语义发现（缩小范围）→ **词汇级排序（锚定精确标识）** → **精确文本/正则验证**。
- 多格式（代码用符号/签名/面包屑索引；文档用聚焦章节/chunk）。
- **排序 + 源码链接** → 更少工具调用、更少 token、更少噪声。
- 本地默认（文件/索引/模型留本机）。

## Decision：吸收并内化这些思想

dsh-shadow **已经立了**同名骨架（ADR-0001 不引向量库；Knowledge Engine 保留树；Evidence Gate 无证据不返回；Index Engine 候选生成；provenance 可追溯）。本 ADR 把 PageIndex/zg 的**检索哲学**正式收紧进 dsh-shadow，并明确**吸收的是思想、不是工具**。

### 1. 免向量树检索（PageIndex：relevant ≠ similar）

- dsh-shadow 的 Knowledge Engine（`core/knowledge-engine.ts`，Phase 3）保留**层级树**（规范→章节→条款→约束），**不转 vector/chunk**——这就是 PageIndex 的树索引。
- **Retrieve = 在树上推理**：给定 query，**走树/选章节**（自然章节），用 **LLM 只做导航/选章节**（同 `recall_shadow` 的 `llmRecall` 边界：LLM 选编号，事实仍派生）。**LLM 绝不创造事实/关系**（Shadow Contract / ADR-0043）。
- 结果**可追溯**：每个返回节点带显式引用（已是 Evidence Gate 契约）。

### 2. 多级检索管线（zg：discover → rank → verify）

- dsh-shadow 的 Index Engine（`core/index-engine.ts`，Phase 2）承担**候选生成**（`fs` 全量｜`zg` provider）。内化 zg 的**多级管线**：
  1. **discover（语义/候选生成）**：`IndexEngine.generateCandidates`（缩小范围）。
  2. **rank（词汇级排序/锚定）**：对候选**按精确标识**排序（`scoreMemory`/AND 匹配锚定）。
  3. **verify（精确验证）**：Evidence Gateway 的 `verifyEvidence`（无证据不返回）。
- **管线在 Shadow Core**（Context Assembly），外部（zg/PageIndex）只做**候选/传感器**——绝不把外部系统变成大脑（ADR-0043）。

### 3. 文件级 corpus 树（PageIndex File System）

- Knowledge Engine 从"单文档树"升级为**file-level corpus 树**：按项目**模块→文件→章节**建树，使 dsh-shadow 能**跨整个项目**推理（如 `io/backend`、`spec/`、`adr/` 各自成模块树）。

### 4. 边界（吸收思想，不集成工具）

- ❌ 不引入向量库 / DB（ADR-0001 不变）。
- ❌ 不把 zg/PageIndex 当外部"大脑"集成（保留为**可插拔 provider**：未装→unavailable，绝不静默 fallback 成 verified）。
- ❌ LLM 不创造事实/关系（只导航/排序/解释）。
- ✅ 吸收的是**思想**：免向量树检索 + 推理检索 + 多级管线 + 语料树 + 可追溯。

## 明确不做

- ❌ 现在集成 PageIndex（pip 包）/ zg（CLI）作为依赖；只吸收设计哲学。
- ❌ 引入向量嵌入 / chuncking。
- ❌ LLM 生成树/事实/关系（树来自可观察层级：文档标题/路径）。

## 分阶段（供后续，未实现）

```text
v1.9.0（Knowledge Tree + Index Engine 骨架）✅
  → ADR-0047（本 ADR：吸收 PageIndex+zg 思想）
  → v1.10.0 Knowledge Engine 升级（corpus 树 + 树上推理检索导航，LLM 只导航；多级管线 discover→rank→verify）
  → zg/PageIndex 仍为可插拔 provider（可选接入，不改变 Core 立场）
```

## 自检（本 ADR 无代码，仅记录）

- [x] 提炼 PageIndex（免向量树+推理检索+可追溯+语料树）与 zg（多级管线+多格式+本地化）核心思想。
- [x] 明确"吸收思想、不集成工具"；与 ADR-0001/0043 自洽（不向量化、LLM 不造事实、zg 是 sensor）。
- [x] 映射到 dsh-shadow 现有骨架（Knowledge Engine 树 / Index Engine 候选 / Evidence Gate 可追溯）。
