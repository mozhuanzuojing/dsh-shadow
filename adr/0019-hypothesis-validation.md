# ADR-0019 · Observer Hypothesis Validation Protocol（v0.28 前置协议，先于实现）

> 时间：2026-09-07 ｜ 状态：已实现（v0.28.0） ｜ 版本：v0.28.0
> 前置：ADR-0018.1（v0.27 Sleep Kernel）。定位：**Reality Feedback Loop for Artificial Observer**——外部现实对 Observer 内部模型的反向约束。
> 这不是"验证答案"，而是：**一个观察者是否拥有允许自己被现实推翻的机制**。这决定 dsh-shadow 是 Memory Augmented Agent 还是 Artificial Observer Runtime。

## 核心命题

```
Hypothesis → Reality Evidence → Validation Judgment → Observer Update
```
v0.27 完成"产生假设但保持无知"；v0.28 引入**认识论闭环**。过去不能验证未来（防"事后诸葛亮"）。

## 7 条协议

### 1. Validation 只能消费 Future Evidence
禁 `Hypothesis(t0) → 读取已有 Memory → validated`（事后诸葛亮）。正确：
```
Hypothesis(t0) → future observation(t1) → Evidence → Validation
```
```ts
FutureEvidence {
  id: string; hypothesisId: string; observedAt: string;
  sourceTraceIds: string[]; observationType: string; actualOutcome: string; createdAt: string;
}
```

### 2. Hypothesis 生命周期（锁死）
```
generated → pending → observed → validated
                          ↘ rejected
```
- `observed` = 未来出现支持事件（**不是证明**）。
- `validated` = 多次支持 + 低反例（`N=10, support=8, contradiction=1, alternative weakened`）。
- `rejected` = 未来出现反例。

### 3. Validation 必须与 AlternativeExplanation 同时竞争
不能 `Evidence → valid`。必须 `Evidence → Hypothesis A + Alternative B → support 对比 → judgment`（否则 v0.27 的 alternative 只是装饰）。
```ts
ValidationResult {
  hypothesisId: string;
  supportingEvidence: string[]; contradictingEvidence: string[];
  alternativeEvaluation: { alternative: string; supported: boolean; weakened: boolean }[];
  conclusion: "validated" | "observed" | "rejected" | "expired";
  confidence: Confidence;
}
```

### 4. Confidence 重定义（4 维，非 +1/-1）
```ts
Confidence { evidenceStrength: number; repetition: number; contradiction: number; alternativeSurvival: number; }
```
例：支持 10 次但存在更简单解释 → 不高（alternativeSurvival 低）。

### 5. Validation 不修改 Identity
```
Hypothesis → Validation → Reflection → CandidateIdentityChange → Evaluator → Identity
```
禁 `validated → Identity`（否则 Dream 绕过人格闸门）。

### 6. 增加失败价值（rejected 更有价值）
Observer 学会"哪些自己的观察方式不可靠"。
```
ValidationOutcome: validated | observed | rejected | expired
```
`expired`：某策略长期有效但一年未再出现——不是失败，是过期。

### 7. Validation 记录 Observer 当时视角（支持 v0.30 World Model）
```ts
ValidationContext {
  hypothesisProjectionSnapshot: any;
  currentRealitySnapshot: any;
  perceptionDelta: any;
}
```
验证保留"当初我怎么看世界 vs 现在现实告诉我什么"的差异。

## 命名 / 定位

**ADR-0019 Observer Hypothesis Validation Protocol** —— "Observer 如何允许未来事件修改自己过去形成的假设"。

## 验收测试（mock 76–83）

- **76** pending hypothesis 接收 future evidence。
- **77** support evidence → observed。
- **78** 多轮验证 → validated。
- **79** contradiction → rejected。
- **80** alternative explanation 胜出。
- **81** expired hypothesis。
- **82** validation 不修改 Identity。
- **83** validation 保留历史 perception snapshot。

## 边界 / 非目标

- 无 LLM；不自动学习知识；不"判断 AI 对不对"；不优化答案。
- v0.28 的 FutureEvidence 由未来观察/注入提供（harness 按 hypothesisId 注册 observedAt/actualOutcome）；真实部署需事件/回调注册"未来发生了与假设 H 相关的观察"。
- 不修改 Identity（经 v0.25 evaluator）。

## 演进

v0.20–v0.27 = **Observer Formation**（我是谁/我怎么看/经历了什么/如何反思/如何产假设）。
v0.28–v0.30 = **Reality Coupling**（观察 → 现实反馈 → 模型修正 → 世界理解）。

---

## 附录：v0.28 实现说明（5 个 checklist 已落地）

1. **FutureEvidence 独立存储**：`shadow/future-evidence/<id>.json`；`shadow/hypothesis/<id>.json`（dream 产出）；`shadow/validation/<id>.json`（artifact）。保持 Memory ≠ Evidence、Hypothesis ≠ Evidence。
2. **Validation 生成 Artifact，不覆盖 Hypothesis**：`validation/validate.ts` `validateHypothesis` → `ValidationArtifact`（同一假设可多次 validated/observed/rejected，保留历史）。
3. **observed vs validated 严格**：observed = ≥1 未来支持；validated = applied≥3 且 supportRate≥0.7 且 contradiction≤1 且 alternativeSurvival≥0.4（例 8支持/1反例）。
4. **expired 不自动删除**：无新证据且 `createdAt ≥365 天` → expired（知识状态，可重新激活，非 false）。
5. **Validation 不产生 Knowledge / 不修改 Identity**：validated 只入 `Reflection → CandidateIdentityChange → Evaluator → Identity`；无 knowledge 存储。

4 维 confidence：`{evidenceStrength, repetition, contradiction, alternativeSurvival（反例削弱→替代解释存活度下降）}`。`mode:evidence`（注册 FutureEvidence）+ `mode:validate`（假设 vs 替代解释竞争 → ValidationArtifact）。

mock 76–85 验证：pending 接收未来证据 / support→observed / 多轮→validated / contradiction→rejected / alternative 胜出 / expired / 不改 Identity / 保留 perception snapshot / 多次 validation 保留历史 / validated 不入 Knowledge/Identity。
