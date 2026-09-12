// 「正/负结果」判据**收一处**（ADR-0063/0070）：本文件原有自己的 `POS`/`NEG`，与
// `validation/validate.ts` / `dream/compress.ts` 的版本**给出不同答案**（实测：`"依赖降低"` 一边 true 一边 false、
// `"unstable"` 因 `includes("stable")` 恰好相反）⇒ 同一份 trace 一处记成功、一处记反例。现统一走 `core/polarity.ts`。
import { isPositiveOutcome } from "../../core/polarity.js";
/** 兼容性再导出：判据的**唯一来源**是 `core/polarity.ts`（本文件不再自带词表）。 */
export { isPositiveOutcome };
export const decisionOutcomeCorrelation = (traces) => {
    const m = new Map();
    for (const t of traces) {
        const d = t.decision?.action, o = t.outcome?.actual;
        if (!d || !o)
            continue;
        const k = `${d}||${o}`;
        const rec = m.get(k) || { decision: d, outcome: o, positive: 0, count: 0 };
        rec.count++;
        if (isPositiveOutcome(o))
            rec.positive++;
        m.set(k, rec);
    }
    return [...m.values()]
        .sort((a, b) => b.count - a.count)
        .map((r) => ({ decision: r.decision, outcome: r.outcome, count: r.count, successRate: r.count ? +(r.positive / r.count).toFixed(2) : 0 }));
};
