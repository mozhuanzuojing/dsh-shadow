// dsh-shadow —— core/trace.ts：Trace 中间层（ADR-0003 §3-5）。
// 采集源归一化：pending 记录 → Trace[]（typed、有序、可追溯），Memory 再从 Trace 塑形。
// 纯数据、无副作用；写侧在 flush 边界调用。事件 → Trace → Memory → Experience。
import type { Trace } from "./types.js";

export const traceOf = (records: any[], actorId: string | undefined): Trace[] =>
  (records || []).map((e, i) => ({
    seq: i + 1,
    at: e.time || "",
    kind: e.kind,
    actor: actorId || "",
    comp: e.comp || "",
    text: e.text || "",
    sub: e.sub,
    source: e.source || "",
  }));
