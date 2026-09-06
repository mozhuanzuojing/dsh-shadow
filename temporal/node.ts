// dsh-shadow —— temporal/node.ts：TemporalNode 构建（一个观察状态：那个时间点我是谁、我看到什么）。
import type { TemporalNode } from "./types.js";
import type { ObservationTrace } from "../core/types.js";
import { today } from "../core/util.js";

export const buildNode = (trace: Partial<ObservationTrace>, identityVersion: string, lens?: string): TemporalNode => ({
  id: trace.id || `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
  observerId: trace.observerId || "unknown",
  timestamp: trace.createdAt || today(),
  stateSnapshot: {
    identityVersion,
    observerState: trace.state,
    intent: trace.intent || { goal: "", question: "" },
  },
  perceptionSnapshot: {
    lens,
    visible: trace.projection?.visible || [],
    hidden: trace.projection?.hidden || [],
    distortion: trace.projection?.distortion || [],
  },
  evidenceLinks: [],
  sourceTraceIds: trace.id ? [trace.id] : [],
  // observerContextHash 预留（同上下文判断），当前不计算。
});
