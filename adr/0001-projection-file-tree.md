# ADR-0001: 自建「投影文件树」作为上下文恢复来源，而非 OpenViking / 向量库

- 状态：已接受（2026-09-02）
- 决定日期：2026-09-02
- 关联术语：见 `../CONTEXT.md`

## Context

目标：让 agent 在「缺上下文」时能自己跑回近期工作里找，即一个**上下文自愈**机制：
采集最近的动作 → 沉淀成可读目录 → 提示 agent「缺上下文就去翻」。

当时可选的方向：

- **OpenViking**（火山引擎）——"Self-evolving Context Database for AI Agents。Unify Agent Memory, Knowledge RAG and Skills"。核心是 Context Types，自带 DB / RAG / 向量检索。
- **claude-mem**（本机已装 MCP）——已有 chroma + `build_corpus` / `prime` / `query` / `session_start_context`。但实测 corpora 为空、query 超时，等于没在采集。
- **自建投影文件树**（即 dsh-shadow）——用 DSH 的 `fs` 把每回合动作/记忆落成 `shadow/<日期>/<时刻>-<主题slug>.md`，`shadow/_index.md` 作说明文档 + 主题索引，`read_shadow` 可穿透。

DSH 运行时事实：agent 是模型，**读文本最经济**；文件系统天然可 grep / 可链接 / 可版本化 / 可 diff；不引入外部服务则无需额外运维与授权。

## Decision

采用**自建「投影文件树」**（dsh-shadow）作为上下文恢复的 canonical 来源：

- 一条记忆 = 一个文件（一切皆文件）。
- `shadow/_index.md` 承载「说明文档 + 主题索引」。
- `read_shadow` 无参读目录、按 `topic` 穿透到具体记忆文件。
- 用 `systemPrompt.context()` 注入「缺上下文就去翻」的指针（用 **context** 而非 section，避免 DSH 的 complete-section replacement 把普通 section 覆盖掉）。

## Alternatives Considered

1. **OpenViking**：语义最强、免维护，但要额外跑一个重服务（DB / RAG），且与 DSH 的 agent 工具面需要额外集成；对「agent 缺上下文就去翻」这种低成本诉求过重。
2. **claude-mem 向量库**：免造存储，但当前 corpora 为空、query 超时，等于从零再建一摊；语义检索对「回忆最近做过什么」并非必要。
3. **仅静态规则提示（不采集）**：零代码，但没有「近期动态」可翻，等于没有这个能力。

## Consequences

- **正**：自包含、便宜、可读可 grep 可链接、无外部依赖；agent 直接以文本消费；索引与说明文档合并在 `_index.md`。
- **负**：丢失向量/语义检索；主题索引靠「文本子串匹配」，对同名跨上下文召回较弱；采集只覆盖工具调用与文件改动（不含纯对话推理），不是全量思维。
- **代价**：一旦该文件树成为上下文恢复的 canonical 来源，再迁移到 OpenViking / 向量是重新布线，旧记忆无法无成本复用。

## Notes

- 若日后召回不足，可在 `_index.md` 之上叠一层向量检索（如 chroma）作为增强，而不推倒文件树。
- 术语见 `../CONTEXT.md`；命名经 /grill-with-docs 定为 `dsh-shadow`。
