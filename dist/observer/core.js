import { parseAsOf } from "../core/util.js";
import { intentOf } from "../core/intent.js";
export const observerContextOf = (args, topic, identity, agentId) => {
    const observerId = agentId || identity?.id || "unknown";
    const asOfObj = parseAsOf(args?.asOf);
    const asOf = asOfObj ? asOfObj.date : undefined;
    const lens = String(args?.lens || identity?.name || identity?.id || "default");
    let realityAnchor = "current";
    const explicitAnchor = String(args?.realityAnchor || "");
    if (explicitAnchor === "known-at-time" || explicitAnchor === "historical")
        realityAnchor = explicitAnchor;
    else if (asOf || args?.observer)
        realityAnchor = "known-at-time";
    return {
        observerId,
        identityRef: identity?.id || observerId,
        intent: intentOf(args, topic),
        asOf,
        lens,
        realityAnchor,
    };
};
export const renderObserverContext = (o) => {
    const lines = ["[Observer]"];
    lines.push(`observerId ${o.observerId} · identityRef ${o.identityRef}`);
    lines.push(`intent ${o.intent.goal}${o.intent.question ? ` · ${o.intent.question}` : ""}`);
    lines.push(`asOf ${o.asOf || "now"} · lens ${o.lens || "default"} · realityAnchor ${o.realityAnchor}`);
    return lines.join("\n");
};
