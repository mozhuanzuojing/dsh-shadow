/**
 * v2 contract — mode 清单（唯一来源）。
 *
 * 62 = 10 core + 1 toolset + 51 lab；toolset 是独立工具，不是 read_shadow mode。
 */

export const CORE_MODES = [
  "recovery",
  "query",
  "episode",
  "decision",
  "task",
  "context",
  "knowledge",
  "query-log",
  "shadow-report",
  "shadow-manifest",
] as const;

export type CoreMode = (typeof CORE_MODES)[number];

export const LAB_MODES = [
  "adapt-change", "adapt-context", "adapt-validation",
  "agency-context", "agency-event", "agency-select",
  "candidate",
  "continuity-index",
  "delegation-check", "delegation-context", "delegation-event",
  "distortion",
  "evidence",
  "execute",
  "federation", "federation-diff", "federation-perspective",
  "feedback",
  "horizon-context", "horizon-event", "horizon-link", "horizon-summary",
  "identity-advance",
  "index",
  "model", "model-claim", "model-observation",
  "observer-boundary", "observer-config", "observer-context", "observer-lineage",
  "offline",
  "plan",
  "real-evidence", "real-refer",
  "recall-event", "recall-forget", "recall-index", "recall-validation",
  "reflection",
  "simulate",
  "stability",
  "temporal",
  "timeline",
  "validate",
  "verification",
  "world", "world-relation", "world-represent",
  "workspace-context", "workspace-record",
] as const;

export type LabMode = (typeof LAB_MODES)[number];

export const TOOLSET_MODE = "toolset" as const;

export const ALL_MODES = [...CORE_MODES, TOOLSET_MODE, ...LAB_MODES] as const;

export const CORE_MODE_SET: ReadonlySet<string> = new Set(CORE_MODES);
export const LAB_MODE_SET: ReadonlySet<string> = new Set(LAB_MODES);

export const isCoreMode = (x: unknown): x is CoreMode =>
  typeof x === "string" && CORE_MODE_SET.has(x);

export const isLabMode = (x: unknown): x is LabMode =>
  typeof x === "string" && LAB_MODE_SET.has(x);

/** 未知 mode 的最近邻（编辑距离），用于显式错误里的建议。 */
export const nearestModes = (input: string, k = 3): string[] => {
  const s = String(input ?? "");
  const dist = (a: string, b: string): number => {
    const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
    for (let j = 1; j <= b.length; j++) dp[0]![j] = j;
    for (let i = 1; i <= a.length; i++) {
      for (let j = 1; j <= b.length; j++) {
        dp[i]![j] = Math.min(
          dp[i - 1]![j]! + 1,
          dp[i]![j - 1]! + 1,
          dp[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
    }
    return dp[a.length]![b.length]!;
  };
  return [...ALL_MODES]
    .map((m) => ({ m, d: dist(s, m) }))
    .sort((a, b) => a.d - b.d || a.m.localeCompare(b.m))
    .slice(0, k)
    .map((x) => x.m);
};
