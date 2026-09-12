// dsh-shadow —— core/polarity.ts：**「正/负结果」这条判据的唯一来源**（ADR-0063 / ADR-0070「判据收一处」）。
//
// 为什么要有这个文件：同一条判据曾在**三处**各写一份，且**给出不同答案**（实测）：
//   · `validation/validate.ts`   的 `POS`/`NEG`/`isPositive`（与 `dream/compress.ts` **逐字相同**）
//   · `reflection/patterns/success-rate.ts` 的 `POS`/`NEG`/`isPositiveOutcome`（词表不同）
// 差异例（已实测，非推断）：
//   · `"依赖降低"` → validate **false**（POS 无「降低」）／ reflection **true**（POS 有「依赖降低」）
//   · `"solved"`   → validate **false**（POS 无 solved）／ reflection **true**
//   · `"unstable"` → validate **true**（`"unstable".includes("stable")` 子串命中！）／ reflection **false**（NEG 有 unstable）
// ⇒ 同一份 trace：`validateHypothesis` 记 1 条**反例**，`decisionOutcomeCorrelation` 记 1 条**成功**。
//
// **收一处的方式 = 并集 + 否决**：
//   正 = 任一处的 POS 命中；负 = 任一处的 NEG 命中；**有负即负**。
//   理由：两份词表都是**证据清单**（人工列举的确定性标记，不是穷举），
//   「A 处认为它是正面」本身就是它可能是正面的证据 ⇒ 并集；而负向是**否决票**，故一票否决。
//
// ⚠ **本并集会改变历史分类**（诚实标注）：`validateHypothesis` 侧原先判为「反例」的
// `依赖降低 / solved / 成本下降 / 维护成本下降 / 验收通过` 现在判为「支持」；
// 原先误判为「支持」的 `unstable` 现在判为「反例」。**这是修正，不是回归**，但它确实改变了统计口径 ⇒ 已记入 ADR。
//
// 纯函数、无 import、不读时钟、不调模型。
/** 正向标记（两处词表的**并集**）。 */
export const POSITIVE_MARKERS = [
    // 中文
    "成功", "通过", "验收通过", "解决", "优化", "提升", "改进", "稳定", "下降", "成本下降", "维护成本下降", "依赖降低",
    // 英文
    "improved", "fixed", "passed", "optimized", "stable", "success", "reduced", "solved",
];
/** 负向标记（两处词表的**并集**；命中任意一条即**否决**）。 */
export const NEGATIVE_MARKERS = [
    // 中文
    "失败", "瓶颈", "恶化", "故障", "回退", "出错", "复杂", "复杂性增加", "复杂度增加", "超时", "阻塞", "超标",
    "污染", "积压", "缺陷", "上升",
    // 英文
    "increased", "increase", "failed", "failure", "complexity", "issue", "bottleneck",
    "degraded", "regression", "breaking", "unstable",
];
/**
 * 结果是否「正面」：命中任一正向标记，**且**不命中任何负向标记。
 *
 * 实现与三处原实现同形（小写化 + 子串包含 + 负向否决），**不引入 LLM、不引入权重**
 * —— 只把「词表 + 否决规则」这**同一条判据**收到一处。
 */
export const isPositiveOutcome = (actual) => {
    const s = String(actual ?? "").toLowerCase();
    const hit = (markers) => markers.some((m) => s.includes(m.toLowerCase()));
    return hit(POSITIVE_MARKERS) && !hit(NEGATIVE_MARKERS);
};
