# ADR-0015 · Observer Identity Continuity Protocol（v0.25 协议，先于实现）

> 时间：2026-09-07 ｜ 状态：协议（提案，待 v0.25 实现） ｜ 版本：v0.25.0
> 前置：ADR-0014（v0.24 Reflection）。定位：**Identity 不是"总结出来的人格"，而是 Observer 在时间轴上的稳定约束**。
> 关键：变的是"当前时间切片中，观察者对自身规律的认识"，不是灵魂；否则 v0.25 退化成 `过去行为→总结→改人格→影响未来`。
> 建议改名：**Observer Identity Continuity / Observer Self-Model Evolution**（避免误解成模型人格变化）。
>
> **勘误（ADR-0050 / v1.13.0）**：正文与附录仍写 `read_shadow({mode:"identity"})` 指 **Identity Continuity 推进**；正名已改为 `mode:"identity-advance"`。读 curated 主体锚仍用 `args.identity:true`（与推进 mode 不同）。

## 1. 核心不变量

1. **Identity 三层模型**：`Core`（永久身份锚，值/真理/因果/工程等）· `Learned`（经验证形成的原则）· `CurrentModel`（当前对自己的理解：decisionStyle/antiPatterns）。
2. **不自动写回**：`Reflection → CandidateIdentityChange → Approval Gate → Identity Timeline`。**不得 Reflection → Identity 直改**（人格会漂移）。
3. **变化不是灵魂，是自我认识**：Candidate 只影响 `CurrentModel`/`Learned`，不动 `Core`。

## 2. Identity 三层模型

```ts
type Identity = {
  // v0.25 升级：Core 外再分 Learned / CurrentModel
  core: { observerId: string; values: string[] };                 // 永久锚（curated）
  learned: { text: string; confidence: number; source: string }[];// 经验证+确认的原则
  currentModel: { decisionStyle: string[]; antiPatterns: string[] };// 当前自我理解（可从 Learned 派生呈现）
};
```
`Core` 来自 soul.json（curated，稳定参考系）；`Learned`/`CurrentModel` 是**派生物**，只由 **Approval Gate 通过后的 CandidateIdentityChange** 推进。

## 3. CandidateIdentityChange（独立对象，不是 Reflection→Identity）

```ts
interface CandidateIdentityChange {
  id: string; observerId: string;
  from: { identityVersion: string };
  proposal: { type: "add_principle" | "remove_principle" | "change_decision_style" | "add_boundary"; content: string };
  evidence: { reflections: string[]; traceCount: number };
  confidence: { consistency: number; duration: number; contradiction: number };
  status: "candidate" | "accepted" | "rejected";
  createdAt: string;
}
```

## 4. 三道闸门（Candidate → Accepted 前必须全过）

- **Gate 1 重复性**：一次事件不能改变 Identity。必须 `N 次 Reflection + 同方向结果`（例：20 次项目决策，15 次提前设计致返工 → 候选"设计前先验证需求"）。
- **Gate 2 时间稳定**：引入 `half-life`，越久远越弱；`confidence = frequency × recency × consistency`（**recency 基准 = traces.createdAt**，确定性计算，非 LLM）。
- **Gate 3 反证**：必须有 `support evidence + contradiction evidence`（否则 AI 形成**幻觉人格**）。例：30 次决策——架构优先成功 18 / 失败 6 / 数据不足 6 → 候选"架构优先倾向" confidence 0.62（不是"喜欢架构设计"）。

## 5. Approval Gate（v0.25 用确定性规则门，非 LLM）

- 规则：`confidence.consistency ≥ 阈值` AND `contradiction < 阈值` AND `traceCount ≥ N` → **accepted**，推进 Identity Timeline；否则 **rejected** 或保留 `status:"candidate"` 等人工确认。
- 不得自动改 Identity；accept 只推进一个版本（`identity(t0)→identity(t1)`），`CurrentModel`/`Learned` + `identityVersion` 递增。

## 6. 冻结（v0.25 不做）

❌ LLM 生成人格 ❌ 情绪分析 ❌ 从语言推断性格 ❌ 自动修改 Identity（除非过三道闸门）❌ Dream 参与 Identity

## 7. Mock（v0.25 需 4 个）

- **55** 一次失败不改变 Identity（candidate 不升 accepted、Identity 不变）。
- **56** 多次一致行为形成 candidate（10 traces 同 pattern → CandidateIdentityChange）。
- **57** 冲突证据降低 confidence（support=8 / contradiction=5 → confidence 下降）。
- **58** 人工/规则确认后才进 timeline（candidate → approve → identity(t1)）。

## 8. 演进（闭环）

```
Observer → Observe → Experience → Reflection → Candidate Self Model → Identity Evolution → Future Observation
灵魂=Observer Core（稳定参考系）；经历=Observation Trace；思考=Reflection；自我认识=Identity Model；成长=Identity Timeline
```

---

## 附录：v0.25 实现说明（4 条约束已落地）

1. **Identity Timeline 是一等对象**：`shadow/identity/<at>-v<N>.json`（不可变版本切片）+ `timeline.md`。**不覆盖 soul.json**——Core 来自 soul.json（curated 稳定锚），Learned/CurrentModel 由 approval 推进的派生切片承载。`identity/timeline.ts`：`identityV1Of/readIdentityVersions/readCurrentIdentity/writeIdentityVersion/nextVersion/renderIdentityModel`。
2. **CandidateIdentityChange 不含人格结论**：`proposal { type, content }` 只允许 `add_principle/remove_principle/change_decision_style/add_boundary`，content 来自 Reflection.learning.statement（重复行为→决策规律→原则），**无 personality 字段**。`identity/candidate.ts`：`candidateOf`（learning.type→proposal type，unknown→不成候选）、`identityConfidenceOf`、`renderCandidate`。
3. **confidence 多维度**：`IdentityConfidence { frequency, recency, consistency, contradiction, overall }`（Identity ≠ Assertion）；反证 = reflection.deviationPatterns 数量 ×0.1。
4. **Evaluator（非 Gate）**：`identity/evaluator.ts` `evaluateCandidate`（重复性 minCount / 时间稳定 minRecency+halfLifeDays 衰减 / 反证 maxContradiction → `IdentityChangeDecision{status, reasons}`）+ `advanceIdentity`（读反思→候选→三道闸门→接受者推进 identity(t0)→t1）。对外调用：`read_shadow({mode:"identity-advance"})`（ADR-0050；旧文 `mode:"identity"` 已废止）。

实现为 3 个逻辑步（Identity Model → Candidate → Evaluator），因模块相互依赖合并为一个可编译提交；每步语义独立。mock 55–60 验证：一次失败不改 Identity / 多次一致→candidate / 冲突证据降 confidence / 确认后进 timeline / 时间衰减 / 两候选共存（context-dependent 不覆盖）。
