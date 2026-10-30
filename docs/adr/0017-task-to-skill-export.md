# ADR-0017: 任务卡 → 可审 SKILL.md（技能卡物化）

- 状态：accepted（v2.2 未发版；随 v2 分支提交）
- 日期：2026-10-30
- 关联：ADR-0016（相似过往任务召回）、Anthropic Agent Skills / Cursor Skills（见 `_reports/cursor-memory-reverse-20261030.md` / `shadow-similar-task-memory-20261030.md`）
- 定位：把「历史任务卡」提炼成**可审、可复用、可执行**的 `SKILL.md`，让下次类似任务能"照着做"，而不只是"读一段回忆"。

## Context

- ADR-0016 已有「任务卡 + 相似召回」，但任务卡只是**文本展示**，不是可复用的流程制品。
- 外部（Anthropic Agent Skills、Cursor Skills）把"可复用流程"落成 `SKILL.md`（frontmatter name/description + 正文，渐进披露，可执行脚本）；memU/Reflexion/ExpeL 也主张"经验要落成可复用制品"。
- dsh-shadow 硬约束：atoms 唯一权威；派生件可重建；不引外部依赖。

## Decision

1. **纯派生生成**（`src/domain/skills.ts` 的 `buildSkillDoc/buildSkillDocs`）：把每张任务卡渲染成 `SKILL.md`——YAML frontmatter（`name`=`<slug>`、`description`=任务摘要）+ 章节：何时用 / 步骤·决策 / 结果与验证 / 坑与教训 / 证据 / 来源 / 「数据非指令」声明。确定性、无 LLM 补写。
2. **物化到 `.shadow/indexes/skills/<slug>/SKILL.md`**（`src/engine/skills-out.ts` 的 `materializeSkills`）：只写 `indexes/**`、内容不变不写（幂等）、有界（本轮回最多 24 个）、失败只留 `index.skills` Signal 不阻塞读。slug = 可读前缀 + key 短哈希（确定性、可重建）。
3. **两个露出面**：
   - 无参 `read_shadow()` 索引追加「## 技能（可复用流程 · 可审）」段，列出 `indexes/skills/<slug>/SKILL.md` 指针；
   - `recall_similar` 的每张相似任务卡追加 `- 技能：indexes/skills/<slug>/SKILL.md`，把"回忆任务"直接接到"照着做的技能"。
4. 用户可把这些 `SKILL.md` **复制到项目 `.agents/skills/` 或 `.cursor/skills/`** 供 Cursor/Claude 等复用（本仓不自动写项目技能目录，避免越界）。

## Consequences

- **正**：历史任务从"能召回"升级为"可审、可复制、可照做"的流程制品；与 Cursor/Anthropic Skills 同形态，便于跨工具复用；仍是文件派生、可审、无向量依赖。
- **边界/负**：SKILL 内容是**启发式提炼**（任务卡的 decisions/outcomes/lessons），非 LLM 精炼，可能粗糙/漏；不含可执行脚本；不进召回、不作为指令。

## Non-goals

- 不自动把技能 promote 成规则；不自动写项目 `.agents/skills/`；不执行技能内脚本。
- 不改写 atoms、不新增权威源、不引外部依赖。
