const REALITY_FIELD = /"reality"|reality\s*:|summarizes reality|summary replaces|summary\s*=\s*fact|摘要替代事实|摘要即事实|摘要.*事实/i;
export const summaryNoRealityField = (s) => !REALITY_FIELD.test(JSON.stringify({ sourceRefs: s?.sourceRefs, compressionMethod: s?.compressionMethod }));
export const assertSummaryNoRealityField = (s) => ({ ok: summaryNoRealityField(s), reason: summaryNoRealityField(s) ? undefined : "History Compression ≠ Reality Simplification（摘要是访问辅助，非新事实源；禁 reality 字段/摘要即事实）" });
