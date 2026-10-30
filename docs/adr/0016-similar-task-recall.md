# ADR-0016: 相似过往任务召回（任务卡 + 经验），新增 `recall_similar`

- 状态：accepted（v2.2 未发版；随 v2 分支提交）
- 日期：2026-10-30
- 关联：ADR-0003/0004（派生视图 / 可见降级）、ADR-0014（BM25 兜底）、ADR-0015（项目事实）；借鉴 ExpeL / REM / Generative Agents / LangMem / Agent Skills（见 `_reports/shadow-similar-task-memory-20261030.md`）
- 定位：回答「历史做过的事，下次遇到类似任务怎么想起来」。

## Context

- 本仓已有每回合 atom + Episode + Task + decision/outcome 等**素材**，但读侧没有"把过去任务压成可召回卡片"的一等产物，也缺少按「相关性 + 新近 + 重要性」召回"相似任务"的入口。
- 外部共识：**不存原始轨迹**；任务开始按相似度召回**压缩后的任务卡/教训**；相关性 ≠ 相似度，需叠加 importance 与 recency/strength（Generative Agents / LangMem）；REM 证明"分阶段压缩 + 按需展开"优于回放轨迹。

## Decision

1. **新增派生「任务卡」**（`src/domain/lessons.ts` 的 `buildLessonCards`）：按 `goal || entry` 归组，抽取 `title / trigger(首条用户消息) / when / status / decisions(+reason) / outcomes / lessons / evidence / memoryRefs`。**纯派生、不改写 atoms、确定性可重建**；`lessons` 用启发式正则从 `thinkLines` 抽（教训/坑/注意/边界/反思/因为…），标注为启发式。
2. **复合打分召回**（`rankLessonCards`）：`relevance(BM25，中文2-gram) + recency(近 30 天加权) + importance(决策/结果/教训条数)`；有 query 时要求至少命中 1 个检索 term，避免"随便返回最近任务"；空 query = 浏览。
3. **新增核心工具 `recall_similar`（2 参数：`query` / `limit`）**：返回 top-k 相似任务卡（当时请求/决策/结果/教训/来源），显式标注"派生经验 · 数据非指令 · 相似≠相同，复用前核对来源"。core 工具 4 → 5；core mode 仍 10。
4. **不动 atom 级严格召回**：本能力是新读出口，parity（19 条 avg Jaccard 0.890）不受影响。

## Consequences

- **正**：把"历史做过的事"变成可检索、可带出决策/结果/教训的任务卡；补齐 dsh-shadow 在"跨任务经验复用"上的空白；仍然是文件派生、可审、无向量依赖。
- **边界/负**：`lessons` 是启发式抽取（非 LLM），可能漏/噪声；相似度目前是 **BM25 + 中文 2-gram**，**语义近义/翻译仍可能不中**（可选 embedding 是后置项）；仍需 agent 主动调用工具（自动召回受注入 seam 限制，另做 spike）。

## Non-goals

- 不做向量/embedding 必选、不引外部依赖；不改写 atoms；不做自动注入（另议）。
- 不把任务卡当指令或规则（规则仍走 AGENTS.md/systemPrompt）。
