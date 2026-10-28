# ADR-0010 · v0.22 Judgment（Observer 决定，Evidence 是输入）

> 时间：2026-09-07 ｜ 状态：已执行 ｜ 版本：v0.22.0（G2）
> 前置：ADR-0009（RealityProjection）。按路线 G1 → G3 → G2，本 ADR 是 G2。

## 1. 判断

Judgment 不是 Evidence 的升级，它挂在 **Observer** 下：`Observer → Judgment ↑ Evidence`。同一 Evidence 在不同 Observer 下结论不同（架构师→重构、老板→延期投资）；Evidence 只是输入，不决定 Judgment。

## 2. Judgment 结构

```ts
Judgment {
  observerId,      // 谁在判断
  claim,           // 记忆里的断言（优先 用户提示/决策，否则入口标题）
  evidence,        // EvidenceResult（Evidence 是输入）
  conclusion,      // evidence_live / evidence_stale / superseded
  confidence,      // ConfidenceDims（分维）
  rationale        // 理由（Observer 视角/决策风格决定 semantics）
}
```

- `observer/judgment.ts`：`claimOf(text)`（取断言）、`judgmentOfClaim(fs, ws, mm, observer, verifyEvidence)`（验证证据 → 结论+置信+理由）、`renderJudgments`。
- `{claim:true}` 模式：对 topic 匹配的记忆逐一"下判断"，`read_shadow(topic, {claim:true})`。

## 3. 接线

- `query/query.ts` 新增 `{claim:true}` 分支（读 Identity + ObserverContext，按 topic 过滤，逐条 `judgmentOfClaim`）。
- `core/types.ts` 新增 `Judgment` / `JudgmentConfidence`。
- `index.ts` read_shadow 新增 `claim` 参数。

## 4. 边界

- Judgment 确定性派生（无 LLM 黑箱）：结论由证据路径存在性 + Observer 透镜/决策风格决定；confidence 分维可解释。
- 现有 `{judgment:true}`（情境→决策"思考模式"）保留，与 claim-based Judgment 分属两义：前者"遇到这种情况我如何判断"，后者"这个断言成不成立"。

## 5. 验收

- `tsc` + `node --check` 通过；mock 场景 **1–47** 全量 PASS（新增 47 Judgment：claim→Evidence→Judgment，Observer 决定）。
- 原 1–46 不变。

## 6. 路线

```
v0.20 Observer Kernel        ✅ ADR-0008
v0.21 RealityProjection      ✅ ADR-0009
v0.22 Judgment               ✅ 本 ADR
v0.23 Reflection             （Offline Reflection Engine：压缩/模式发现/原则沉淀）
```
