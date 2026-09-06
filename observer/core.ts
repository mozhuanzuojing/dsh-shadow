// dsh-shadow —— observer/core.ts：Observer Kernel（v0.20 根）。Observer 是"谁在看"的主体根。
// 一次观察事件 = ObserverContext{observerId, identityRef, intent, asOf, lens, realityAnchor} —— 稀疏、不携带 Identity 实体。
// Identity 是长期实体，经 identityRef 指向、resolveObserver 加载；Observer 不产生内容，只定义"从哪里看、为什么看、从哪层看"。
import type { Identity, ObserverContext, RealityAnchor } from "../core/types.js";
import { parseAsOf } from "../core/util.js";
import { intentOf } from "../core/intent.js";

export const observerContextOf = (args: any, topic: string, identity: Identity | null, agentId?: string): ObserverContext => {
  const observerId = agentId || identity?.id || "unknown";
  const asOfObj = parseAsOf(args?.asOf);
  const asOf = asOfObj ? asOfObj.date : undefined;
  const lens = String(args?.lens || identity?.name || identity?.id || "default");
  let realityAnchor: RealityAnchor = "current";
  const explicitAnchor = String(args?.realityAnchor || "");
  if (explicitAnchor === "known-at-time" || explicitAnchor === "historical") realityAnchor = explicitAnchor;
  else if (asOf || args?.observer) realityAnchor = "known-at-time";
  return {
    observerId,
    identityRef: identity?.id || observerId,
    intent: intentOf(args, topic),
    asOf,
    lens,
    realityAnchor,
  };
};

export const renderObserverContext = (o: ObserverContext) => {
  const lines = ["[Observer]"];
  lines.push(`observerId ${o.observerId} · identityRef ${o.identityRef}`);
  lines.push(`intent ${o.intent.goal}${o.intent.question ? ` · ${o.intent.question}` : ""}`);
  lines.push(`asOf ${o.asOf || "now"} · lens ${o.lens || "default"} · realityAnchor ${o.realityAnchor}`);
  return lines.join("\n");
};
