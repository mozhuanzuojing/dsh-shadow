// dsh-shadow —— reflection/patterns/distortion.ts：Pattern 3 认知偏差（projection.hidden → outcome.actual，纯统计）。
// 当时没看到的（hidden）：其关键词后来出现在 actual → 判"低估/漏看"偏差。接近人的反思——发现自己当时为什么这样看。
import type { ObservationTrace } from "../../core/types.js";

const STRIP = ["风险", "问题", "隐患", "瓶颈", "成本", "缺陷", "压力", "负担"];
const keywordOf = (item: string) => {
  let k = String(item || "").trim();
  for (const s of STRIP) if (k.endsWith(s)) k = k.slice(0, -s.length);
  return k.trim();
};

export const distortionPatterns = (traces: Partial<ObservationTrace>[]): string[] => {
  const out = new Set<string>();
  for (const t of traces) {
    const hid = t.projection?.hidden || [];
    const actual = String(t.outcome?.actual || "").toLowerCase();
    if (!actual) continue;
    for (const h of hid) {
      const kw = keywordOf(h);
      if (kw && actual.includes(kw.toLowerCase())) out.add(`低估/漏看「${h}」`);
    }
  }
  return [...out];
};
