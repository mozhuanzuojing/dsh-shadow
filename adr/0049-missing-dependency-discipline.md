# ADR-0049: Missing-Dependency Discipline（缺件不静默边界，v1.12.8 冻结）

- 状态：**已接受（2026-09-08）**——把「缺件显式报错、不凭记忆继续」从「证据 Provider 的个例」提升为**全插件统一纪律**。
- 决定日期：2026-09-08
- 关联 ADR：ADR-0001（不引向量库）、ADR-0043（Shadow Contract）、ADR-0044/0045（Evidence Lineage）、ADR-0048（PageIndex/zg 思想，未装→unavailable）
- 关联术语：`../CONTEXT.md`（缺件不静默 / Evidence Gateway / 降级）
- 外部来源：hyperframes 技能文档「Treat a failed update as a visible tool failure; **do not continue from a remembered workflow contract**」；OpenAI《Computer use》指南「续对话不恢复现实」；本项目 2026-09-08 参考材料研究 §二 2.5。

## Context

dsh-shadow 有一批**可选增强**：一句话摘要、语义召回 B 档、`recall_shadow` 推理导航、Knowledge 树上导航、Projection Store 缓存、Evidence Provider 的 `zg`。它们各自有自己的失败处理，此前只有 `zg` 一条被明写成纪律（「未装 → `unavailable`，绝不静默 fallback 成 verified」）。

2026-09-08 的参考材料研究把这条提成候选：**「缺件不许凭记忆继续」应当是所有可选增强的统一纪律**，而不是证据 Provider 的个例——否则「降级」与「假装成功」的边界只靠各模块自觉。

代码审查（v1.12.7 那轮）又暴露一个反例：`evidence/gateway.ts` 的 `routeVerify` 在 provider 名不存在时会**静默退回 fs**——拼错 `evidenceProvider: "zg "`（带空格）就会把「查不到这个 provider」说成「fs 已核实」。这正是本 ADR 要封的口子。

## Decision

**可选增强缺件时：只降级到确定性路径，且必须可见；绝不把「缺件」表达成「已验证 / 已存在 / 已完成」。**

### 四条冻结规则

1. **只降级，不抛错、不阻塞**：读侧保持只读；缺件不得让 `read_shadow` / `recall_shadow` / `shadow_query` 失败或卡住。
2. **必须可见**：降级要有信号——`unavailable` 状态 / flush warn / debug trace 三者至少一个，不许无声无息。
3. **绝不冒充成功**：缺件不得 fallback 成 `verified` / 「已核实」/ 「已完成」；**不得拿记忆里记着的流程或结论代替真实检查**（不缓存「上次成功的流程」当契约）。
4. **缺件只陈述事实**：说清「缺什么依赖、因此降级到哪条确定性路径」，不写成建议或指令（读侧「数据非指令」不变）。

### 现状盘点（本 ADR 冻结时逐条对源码核对）

| 增强 | 依赖 | 缺件/失败时的行为 | 会不会冒充成功 |
|------|------|-------------------|----------------|
| 一句话摘要 `summary` | `llm` | `writer-llm.ts` 契约：route 缺失 / `llm` 缺失 / `finish` 出错或中止 → 返回 `""`，调用方按空值回退（不写 `> 摘要：`） | 否（留空，不编摘要） |
| 语义召回 B 档 `recall.enabled` | `llm` + provider/model | `expandTerms` 失败 → `[]` → 退回 A 档确定性关键词召回 | 否 |
| 推理导航 `llmRecall` | `llm` | `recallSelect` 失败 → `[]` → 退回确定性 `bestTask` | 否 |
| 知识树上导航 `knowledgeEngine.llmNavigate` | `llm` | `knowledgeNavigate` 失败 → `[]` → 退回确定性 `retrieveKnowledge` | 否 |
| Evidence Provider `zg` | `zg` CLI | `ENOENT` → `unavailable: true / reason: zg_not_installed`；结果 `status:"unavailable"`、`confidence:0` | 否，**且明确禁止** |
| Evidence Provider 名不存在 | 注册表 | **v1.12.8 起** `status:"unavailable"` + `provenance.reason:"provider_unknown"`（此前静默退回 fs，等于冒充 verified） | 否（本次修复） |
| Projection Store `projectionStore` | 缓存文件 | 读失败 / 坏行 → `null` → 重建（缓存不是真相，`rm -rf` 无影响） | 否 |
| `retention` / `forget` / `compact` | 无外部依赖 | 纯确定性派生 | — |
| 证据校验 `verify` | fs / zg | 路径不存在 → `not_found`；provider 未装 → `unavailable` | 否 |

### 新增可选增强时的门禁（自检清单）

- [ ] 缺件时的**返回值契约**写进注释（返回 `""` / `[]` / `null` / `unavailable`，不抛异常）
- [ ] 有**可见信号**（状态 / warn / debug 之一）
- [ ] 有**测试**：缺件时走确定性路径、且不产出「已验证」这类假结论
- [ ] 不把缺件写成建议/指令（「数据非指令」）

## 明确不做

- ❌ 静默 fallback 成「成功 / 已验证 / 已存在」。
- ❌ 凭记忆里的流程继续（不缓存上一次成功的 workflow contract）。
- ❌ 缺件就弹错/抛异常阻塞读侧（纪律是「降级 + 可见」，不是「失败」）。
- ❌ 用 LLM 补写缺失内容来「把缺件圆过去」。

## 自检

- [x] `npx tsc --noEmit` / `npm run build` 通过
- [x] 新增 `test/missing-dependency.test.ts`：未知 provider → `unavailable`（不冒充 verified）；`streamText` 缺 `llm`/缺 route → `""`；全增强打开但无 `llm` 时读侧仍走确定性路径、不抛错
- [x] 全量回归 `ALL PASS ✅`（20 个测试文件）
- [x] 盘点表逐条对源码核对（`writer-llm.ts` / `writer.ts` / `evidence/zg.ts` / `evidence/gateway.ts` / `projection-store.ts`）
