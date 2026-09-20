export const HEURISTIC_ENGINE_NAME = "heuristic-v1";
export const RULE_PREFER = "explicit-prefer";
export const RULE_MENTION = "unique-verbatim-mention";
/** 规则 ②：唯一逐字提及。与 context 的**键序无关**（只数集合大小）。 */
const byUniqueMention = (input) => {
    const haystack = Object.values(input?.context ?? {}).join("\n");
    if (!haystack)
        return null;
    const present = (input?.candidates ?? []).filter((c) => String(c).length > 0 && haystack.includes(String(c)));
    return present.length === 1 ? present[0] : null;
};
export const heuristicEngine = {
    name: HEURISTIC_ENGINE_NAME,
    decide(input) {
        const candidates = [...(input?.candidates ?? [])];
        /** 统一的声明构造：`rawOutput` = 本次判定的**规则轨迹**逐字留存（这就是证据，ADR-0096 §5）。 */
        const declarationOf = (rule, selected) => ({
            engine: HEURISTIC_ENGINE_NAME,
            candidates,
            selected,
            // 规则引擎**没有**概率：显式 null。见 types.ts 的 reportedDistribution 与 ADR-0096 §4。
            reportedDistribution: null,
            rawOutput: JSON.stringify({
                engine: HEURISTIC_ENGINE_NAME,
                rule,
                question: input?.question ?? "",
                candidates,
                selected,
            }),
        });
        // 规则 ①：调用方**明示**了偏好。
        const prefer = String(input?.context?.prefer ?? "").trim();
        if (prefer) {
            const hit = candidates.filter((c) => String(c).trim() === prefer);
            if (hit.length !== 1) {
                // 明示了却解析不到唯一候选 ⇒ **显式失败**（不退回规则 ②，更不猜）。
                return {
                    status: "unavailable",
                    reason: `prefer_unresolved:${hit.length === 0 ? "not_a_candidate" : "ambiguous"}`,
                };
            }
            return declarationOf(RULE_PREFER, hit[0]);
        }
        // 规则 ②：唯一逐字提及。
        const mentioned = byUniqueMention(input);
        if (mentioned !== null)
            return declarationOf(RULE_MENTION, mentioned);
        // 规则 ③：都不命中 ⇒ **不可用**。`decide` 允许返回 unavailable 就是为了这一刻。
        return { status: "unavailable", reason: `no_rule_matched:${HEURISTIC_ENGINE_NAME}` };
    },
};
