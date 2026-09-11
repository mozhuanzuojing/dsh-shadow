import { confidenceOf } from "../retrieval/rank.js";
import { readRel } from "../persistence/files.js";
import { evidencePathsOf, isPathLike, isConcreteLocator } from "../evidence/paths.js";
// claim：记忆里的"断言"（优先用户提示/决策，否则入口标题）；这是要被验证的主张。
export const claimOf = (text) => {
    const decision = (String(text || "").match(/^> 用户提示\/决策：(.+)$/m) || [])[1] || "";
    return decision || (String(text || "").match(/^# (.+)$/m) || [])[1] || "（无明确断言）";
};
// 对一条记忆的 claim 下判断：验证证据 → 结论 + 置信 + 理由（由 Observer 视角/决策风格决定 semantics）。
export const judgmentOfClaim = async (fs, ws, mm, observer, verifyEvidence) => {
    const text = await readRel(fs, ws, mm.rel);
    if (!text)
        return null;
    const claim = claimOf(text);
    // **双条件**（ADR-0059 定的判据；ADR-0070 补齐本处漏掉的那一条）：
    //   只有「① 引用是**可检查的具体路径**（`isConcreteLocator` 排除 glob `scripts/*.ps1` 与
    //   git ref `origin/main`）**且** ② 它确实解析不到」才算「证据缺失」。
    // 此前本处只做了 `.filter(isPathLike)`（**故意不收窄**的粗筛，见 `evidence/paths.ts:22-24` 的注释），
    // 于是对 glob / git ref 也做存在性检查 ⇒ 必然 `not_found` ⇒ `conflictCount++`
    // ⇒ 结论**假降为 `evidence_stale`**、置信度假降。
    // 同一判据在 `observer/arbitrate.ts` 是**正确**的（它一直带这一道过滤）——
    // 这是「同一判据在多处表达、其中一处漏了条件」的那一族（由 `tools/audit-drift.ts` 的检测 B 抓到）。
    // 真语料实测受影响 12 条（0.49%）/ 非具体 locator 17 处。
    // 收敛锁定：`test/evidence-missing-criterion.test.ts`（含与 `arbitrate.ts` 的**跨消费者一致性**断言）。
    const paths = evidencePathsOf(text).filter(isPathLike).filter(isConcreteLocator).slice(0, 6);
    let evidence = null;
    let conflictCount = 0;
    for (const p of paths) {
        const r = await verifyEvidence({ path: p, kind: "path" }, { fs, ws });
        if (!evidence && r.status !== "unavailable")
            evidence = r;
        if (r.status === "not_found")
            conflictCount++;
    }
    const conclusion = conflictCount > 0 ? "evidence_stale" : "evidence_live";
    const confidence = confidenceOf(0, Math.max(0, Math.round((Date.now() - Date.parse(mm.date)) / 86400000)), conflictCount > 0 ? "stale" : "active", {
        hasExperience: /^> 摘要：|^> 概况：/m.test(text),
        hasDecision: /^> 用户提示\/决策：/m.test(text),
    });
    const styles = observer.identity?.decisionStyle;
    const rationale = conflictCount > 0
        ? `证据路径缺失 ${conflictCount} 处，结论降为待验证`
        : `证据在，结论成立${styles?.length ? ` · 视角 ${styles.join("、")}` : ""}${observer.lens ? ` · 透镜 ${observer.lens}` : ""}`;
    return { observerId: observer.observerId, claim, evidence, conclusion, confidence, rationale };
};
export const renderJudgments = (js) => {
    const lines = ["[Judgments]"];
    if (!js.length) {
        lines.push("（无可下判断的记忆：需要含「断言」的匹配记忆）");
        return lines.join("\n");
    }
    for (const j of js.slice(0, 6)) {
        lines.push(`judgment: observer=${j.observerId} · claim=${j.claim.slice(0, 40)}`);
        if (j.evidence)
            lines.push(`  evidence: ${j.evidence.status} (${j.evidence.source})`);
        lines.push(`  conclusion ${j.conclusion} · conf=${j.confidence.overall.toFixed(2)} · ${j.rationale}`);
    }
    return lines.join("\n");
};
