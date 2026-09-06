# ADR-0022 · Observer Runtime Integrity Review（v0.29 后架构冻结审查）

> 时间：2026-09-07 ｜ 状态：审查（冻结 v0.20–v0.29，先于 v0.30 Reality Model） ｜ 版本：v0.29.1
> 前置：ADR-0021（v0.29 Federation）。定位：**架构冻结审查 ADR（非实现 ADR）**——确认 v0.20–v0.29 满足进入 Reality Model 的前置条件。
> 分界：v0.20–v0.29 = **Observer 如何形成、观察、修正自身**；v0.30 = **Observer 如何描述 Reality**。两层次一旦混淆，World Model 会退化成 `多个 Observer Projection → merge → 看起来像 Reality`。

## 一、Architecture Invariant Checklist（7 条冻结）

```
Invariant-1: Observer ≠ Reality
Invariant-2: Projection ≠ World Model
Invariant-3: Evidence ≠ Knowledge
Invariant-4: Validation ≠ Truth
Invariant-5: Federation ≠ Identity Merge
Invariant-6: Dream ≠ Insight
Invariant-7: Temporal ≠ Reality Graph
```

## 二、Review 1：Projection ≠ Reality（最高风险）

- `RealityProjection.reality` 命名有污染风险：当前它实际是 **ObservedContext**（task + 候选计数），不是 Reality。
- **冻结**：禁止 `projection.reality === Reality`；允许 `projection.referenceRealityContext`（只作观察上下文引用，非世界模型）。`distortion`（为什么这个视角看到这些/没看到那些）是**观察误差标注**，不是世界事实。

## 三、Review 2：Identity 污染检查（三个漏洞）

- **漏洞 A Validation→Identity**：禁 `validated → Identity`；必须 `validated → Reflection → CandidateIdentityChange → Evaluator`。例："我预测接口会延期、后来真延期"只说明 `prediction ability ↑`，**不说明人格改变**。
- **漏洞 B Federation→Identity**：已冻结（v0.29 镜子≠修改器）。Identity 不是民主（A 安全优先 / B 性能优先 → 多数不能改 A）。
- **漏洞 C Dream→Identity**：已正确（`Dream → Hypothesis → FutureEvidence → Reflection → Evaluator`）。

## 四、Review 3：Evidence 层级审查

| 对象 | 含义 | 可信级 |
|---|---|---|
| ObservationTrace | 我看到什么 | 低 |
| RealityEvidence | 共同引用事件（弱事实） | 中 |
| ValidationResult | 现实反馈结果 | 高 |
**冻结：即使 ValidationResult 也不是 Truth，而是 `Hypothesis survived current evidence`。写死 `Validated ≠ Absolute Truth`（否则 v0.30 污染）。**

## 五、Review 4：Temporal Graph 审查

- 正确：`Temporal Graph → Dream`。
- **冻结**：Reality Model 不得 `Temporal Graph → Reality Graph` 直接转换；必须 `Temporal Graph + Reality Evidence Registry + Validation History → Reality Model`。Temporal 记录"我经历了什么"，Reality Model 描述"世界中稳定存在什么"，二者不是一回事。

## 六、Review 5：v0.29 后能力边界（冻结）

```
                Reality
                  ▲
          Reality Evidence（共享现实锚）
       ---------------------
       |                   |
 Observer A          Observer B（主体）
       |       Projection（视角）
       |       ObservationTrace
       |       Reflection
       |       Identity Evolution（主体连续性）
```
其中：Observer=主体 / Projection=视角 / Evidence=共享现实锚 / Validation=现实反馈 / Identity=主体连续性 / Temporal=时间坐标 / Dream=离线压缩。

## 七、Passed Boundaries（已通过）

- Federation 已通过 Reality Boundary 检查（Observer A \ RealityEvidence / Observer B，不是 A Memory + B Memory = Reality）。
- Dream → 不产 Principle/Knowledge；Validation → 不产 Knowledge；Temporal → 不报人格（v0.28.1）。

## 八、Remaining Risks（v0.30 前残余风险）

1. `RealityProjection.reality` 命名易误解（建议 v0.30 前改 `referenceRealityContext` 或标注）。
2. Validation 只"幸存于当前证据"，但易被当"已验证的真相"——v0.30 Reality Model 必须显式区分。
3. Reality Model 若直接从 TemporalGraph 推导会偷渡"我经历的=世界中存在的"——必须经 Evidence + Validation 汇合。

## 九、v0.30 Entry Conditions（进入 Reality Model 的前置）

1. 7 条 Invariant 全过（invariant tests 95–101）。
2. `Reality Evidence Registry` 弱事实 + `Validation History` 汇合到 Reality Model 的管道先立。
3. 不产生 Knowledge/Identity/Principle；`Validated ≠ Truth`。
4. 全量 mock 1–94 + invariant 95–101 全绿。

## 十、执行顺序

```
ADR-0022 Review → 全量 mock 1-94 regression → invariant tests 95-101 → tag v0.29.1 integrity
→ ADR-0023 Reality Model Kernel → v0.30 implementation
```
不要急着进 v0.30：此前所有阶段回答"Observer 如何知道自己可能错"；v0.30 才第一次回答"Reality 本身是什么"。两层次之间需要这道防火墙。

---

## 附录：审查验收

- 全量 mock 1–94 + invariant tests **95–101** 全绿（每个 Invariant 一条锁定测试：RealityEvidence 弱事实不声明规律 / Temporal Perception 非 World Model / Evidence 不入 knowledge 库 / validated 非绝对真理 / Federation 不产合并 Identity / Dream 不产 insight / Temporal 非 Reality Graph）。
- 结论：7 条架构 Invariant 全部通过，满足进入 v0.30 Reality Model Kernel 的前置条件。标记 `v0.29.1 integrity`。
- v0.30 残余风险提醒：`RealityProjection.reality` 命名建议改 `referenceRealityContext`；Reality Model 不得从 TemporalGraph 直接推导（须经 Evidence + Validation 汇合）。
