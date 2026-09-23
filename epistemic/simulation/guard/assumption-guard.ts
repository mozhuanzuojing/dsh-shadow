// dsh-shadow —— simulation/guard/assumption-guard.ts：Assumption ≠ Fact（Assume X 允许，X will 禁止）。
export const isHypotheticalCondition = (c: string) => /^\s*Assume\b/i.test(String(c || ""));
export const isFactLike = (c: string) => /will (cause|happen|be|become|lead)|causes\b/i.test(String(c || ""));
export const assertAssumption = (c: string): { ok: boolean; reason?: string } =>
  isHypotheticalCondition(c) ? { ok: true } : { ok: false, reason: `condition 非假设措辞（须 "Assume X"）：${c}` };
export const assertNotFactLike = (c: string): { ok: boolean; reason?: string } =>
  isFactLike(c) ? { ok: false, reason: `condition 是事实断言语（禁 "will cause" 等）：${c}` } : { ok: true };
export const assertAssumptionAndNotFact = (c: string) => {
  const a = assertAssumption(c); if (!a.ok) return a;
  const b = assertNotFactLike(c); if (!b.ok) return b;
  return { ok: true };
};
