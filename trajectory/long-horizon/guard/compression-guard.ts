// dsh-shadow —— long-horizon/guard/compression-guard.ts：227 History Compression ≠ Reality Simplification。
// 摘要是访问辅助，不是新的事实源；禁 reality 字段 / 摘要即事实。
//
// **A27（v1.22.x）**：唯一的 `assert*` 旧写法把同一个谓词在对象字面量里求值两次（且那处是 `JSON.stringify`）；
// 现在「求值一次 + `{ ok, reason? }`」。
import type { HistorySummary } from "../types/index.js";

const REALITY_FIELD = /"reality"|reality\s*:|summarizes reality|summary replaces|summary\s*=\s*fact|摘要替代事实|摘要即事实|摘要.*事实/i;
export const summaryNoRealityField = (s: HistorySummary) => !REALITY_FIELD.test(JSON.stringify({ sourceRefs: s?.sourceRefs, compressionMethod: s?.compressionMethod }));
export const assertSummaryNoRealityField = (s: HistorySummary) => {
  const ok = summaryNoRealityField(s);
  return { ok, reason: ok ? undefined : "History Compression ≠ Reality Simplification（摘要是访问辅助，非新事实源；禁 reality 字段/摘要即事实）" };
};
