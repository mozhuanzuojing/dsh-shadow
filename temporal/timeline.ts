// dsh-shadow —— temporal/timeline.ts：Identity Timeline resolution（读取时解析，不回写历史）。
export interface IdentityVersionEntry { version: string; at: string; }

export const resolveIdentityAt = (versions: IdentityVersionEntry[], timestamp: string): IdentityVersionEntry | null => {
  const t = String(timestamp || "").slice(0, 10);
  const sorted = [...versions].sort((a, b) => (parseInt(a.version.replace(/\D/g, "")) || 0) - (parseInt(b.version.replace(/\D/g, "")) || 0));
  let best: IdentityVersionEntry | null = null;
  for (const v of sorted) { if ((v.at || "") <= t) best = v; else break; }
  return best;
};

export const resolvedVersionOf = (versions: IdentityVersionEntry[], timestamp: string): string =>
  resolveIdentityAt(versions, timestamp)?.version || "pre-v1";
