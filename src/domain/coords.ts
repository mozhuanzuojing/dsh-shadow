/**
 * v2 domain —— 升降维的「坐标」派生层（ADR-0026 Phase C）。
 *
 * 纪律：点（atom）不可变；这里只**派生**高层坐标（真入口 / 任务 / 主题），不改任何事实。
 * 纯函数、无 I/O；供升维（线/面）与「轴可用性」度量使用。
 */

import type { ParsedAtom } from "../contract/types.js";

const PATH_RE =
  /(?:[A-Za-z]:[\\/]|\.{1,2}\/)?[A-Za-z0-9_\-./]+\.(?:md|ts|tsx|js|mjs|json|py|yaml|yml|html|css|sh|ps1|txt|sqlite)\b/g;
const DEGEN = new Set(["", "shadow", "session"]);

const firstPath = (s: string): string => {
  const m = String(s ?? "").match(PATH_RE);
  if (!m) return "";
  return m.map((x) => x.trim()).find((x) => x && !x.includes(".shadow")) || "";
};

/** 原始 entry 是否「有意义」（不是项目名 / 占位）。 */
export const meaningfulEntry = (a: ParsedAtom): string => {
  const e = String(a.entry || "").trim();
  return e && e !== a.project && !DEGEN.has(e) ? e : "";
};

/** 入口坐标：优先原始 entry，其次用户话里的路径，再次动作里的路径（改/读 xxx）；用户在哪干活。 */
export const entryCoord = (a: ParsedAtom): { value: string; source: "entry" | "user" | "action" | "none" } => {
  const m = meaningfulEntry(a);
  if (m) return { value: m, source: "entry" };
  for (const u of a.userMessages) {
    const p = firstPath(String(u).replace(/^用户：/, ""));
    if (p) return { value: p, source: "user" };
  }
  for (const act of a.actions) {
    const p = firstPath(String(act).replace(/^改\/读\s+/, ""));
    if (p) return { value: p, source: "action" };
  }
  return { value: "", source: "none" };
};

/** 任务坐标：只认明确的 goal（不把摘要伪装成任务；Evidence≠Interpretation）。 */
export const taskCoord = (a: ParsedAtom): { value: string; source: "goal" | "none" } => {
  const g = String(a.goal || "").trim();
  return g ? { value: g.slice(0, 60), source: "goal" } : { value: "", source: "none" };
};

/** 主题坐标：goal 优先，其次用户首句（≈每次不同 ⇒ 需聚类，仅供度量/粗分）。 */
export const topicCoord = (a: ParsedAtom): { value: string; source: "goal" | "user" | "none" } => {
  const t = taskCoord(a);
  if (t.value) return { value: t.value, source: "goal" };
  const u = a.userMessages[0];
  if (u) {
    const cleaned = String(u).replace(/^用户：/, "").replace(/\s+/g, " ").trim();
    if (cleaned) return { value: cleaned.slice(0, 40), source: "user" };
  }
  return { value: "", source: "none" };
};
