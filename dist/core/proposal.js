/** 严格白名单：未列出的字段一律拒收（这是防「伪装」的机械手段）。 */
const PROPOSAL_FIELDS = [
    "type", "id", "kind", "source", "model", "promptVersion", "inputRefs", "proposedRelation", "subject", "createdAt",
];
const CONFIRMATION_FIELDS = ["type", "id", "proposal", "actor", "action", "timestamp", "reason"];
/** 这些字段出现在 proposal 上即视为**伪装事实**（用户点名的 `{type:"proposal", status:"validated"}`）。 */
const MASQUERADE_FIELDS = ["status", "state", "confirmed", "validated", "verified", "settled", "fact", "truth", "confidence"];
const KINDS = ["subject", "relation", "outcome", "pattern", "knowledge"];
const SOURCES = ["model-proposal", "user", "tool", "ci"];
const ACTORS = ["human", "tool", "ci"];
const ACTIONS = ["confirm", "reject", "revoke"];
const isObj = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const nonEmpty = (v) => typeof v === "string" && v.trim().length > 0;
/** 一条记录的拒收理由（空数组 = 收下）。**`type:"fact"` 在此被拒**。 */
export const validateRecord = (record) => {
    const out = [];
    if (!isObj(record))
        return ["记录必须是对象"];
    const type = record.type;
    if (type === "fact") {
        return [
            "`type:\"fact\"` **一律拒收**：Fact 是投影（P + C 派生），**没有写入路径** —— " +
                "「Proposal 冒充 Fact」在结构上不可能（ADR-0082 §2.3）",
        ];
    }
    if (type !== "proposal" && type !== "confirmation") {
        return [`未知记录类型：${String(type)}（只接受 proposal / confirmation）`];
    }
    const allowed = type === "proposal" ? PROPOSAL_FIELDS : CONFIRMATION_FIELDS;
    for (const key of Object.keys(record)) {
        // 伪装字段优先报（比「未知字段」更具体、更可诊断）
        if (MASQUERADE_FIELDS.includes(key)) {
            out.push(`字段「${key}」是**伪装字段**：候选不得携带状态/置信度（防「改一个字段就变成事实」）`);
            continue;
        }
        if (!allowed.includes(key))
            out.push(`未白名单字段「${key}」⇒ 拒收（严格白名单）`);
    }
    if (!nonEmpty(record.id))
        out.push("缺 id");
    if (type === "proposal") {
        if (!KINDS.includes(record.kind))
            out.push(`kind 必须是 ${KINDS.join(" / ")}`);
        if (!SOURCES.includes(record.source))
            out.push(`source 必须是 ${SOURCES.join(" / ")}`);
        const refs = record.inputRefs;
        if (!Array.isArray(refs) || refs.length === 0) {
            out.push("inputRefs 必填非空 —— 否则**连被复核的资格都没有**（要能回答「模型为什么会提这个候选」）");
        }
        else {
            for (const r of refs) {
                if (!isObj(r) || !nonEmpty(r.file) || typeof r.line !== "number" || !Number.isFinite(r.line)) {
                    out.push("inputRefs 每项必须是 {file, line}");
                    break;
                }
            }
        }
        if (!nonEmpty(record.proposedRelation))
            out.push("缺 proposedRelation");
        if (!nonEmpty(record.createdAt))
            out.push("缺 createdAt（时间由调用方传入，本层不读时钟）");
    }
    else {
        if (!nonEmpty(record.proposal))
            out.push("confirmation 必须指向一个 proposal");
        if (!ACTORS.includes(record.actor)) {
            out.push(`actor 必须是 ${ACTORS.join(" / ")} —— **模型不能确认自己提出的东西**`);
        }
        if (!ACTIONS.includes(record.action))
            out.push(`action 必须是 ${ACTIONS.join(" / ")}`);
        if (!nonEmpty(record.timestamp))
            out.push("缺 timestamp");
    }
    return out;
};
/**
 * 投影：由 `(proposals, confirmations)` 派生出**事实**。
 *
 * 判定（逐字对应 ADR-0082 的不变量）：
 *   ① 该 proposal 必须**通过校验**且 `inputRefs` 非空（「基于什么提议」在场）；
 *   ② 必须存在指向它的 confirmation；
 *   ③ 该 confirmation 的**有效动作**（按 timestamp 升序取最后一条，同刻按 id 升序）必须是 `confirm`；
 *      出现 `reject` / `revoke` ⇒ **不产生事实**（撤销即事实消失，且**历史保留**）。
 *
 * 不变量：**只有 FACT 能改变认知统计；CANDIDATE 只能改变「待确认候选」的统计。**
 * 故任何统计入口都应消费本函数的 `facts`，而不是原始 records —— `factualOnly()` 是那条唯一入口。
 */
export const projectFacts = (records) => {
    const violations = [];
    const proposals = new Map();
    const confirmations = [];
    for (const r of records) {
        const bad = validateRecord(r);
        if (bad.length > 0) {
            violations.push(...bad.map((b) => `拒收记录：${b}`));
            continue;
        }
        const rec = r;
        if (rec.type === "proposal") {
            const id = rec.id;
            if (proposals.has(id))
                violations.push(`proposal id 重复：${id}`);
            proposals.set(id, rec);
        }
        else {
            confirmations.push(rec);
        }
    }
    const byProposal = new Map();
    for (const c of confirmations) {
        if (!proposals.has(c.proposal)) {
            violations.push(`confirmation ${c.id} 指向不存在的 proposal：${c.proposal}`);
            continue;
        }
        const arr = byProposal.get(c.proposal) ?? [];
        arr.push(c);
        byProposal.set(c.proposal, arr);
    }
    const facts = [];
    for (const [id, p] of proposals) {
        const cs = (byProposal.get(id) ?? [])
            .slice()
            .sort((a, b) => (a.timestamp === b.timestamp ? (a.id < b.id ? -1 : 1) : a.timestamp < b.timestamp ? -1 : 1));
        const effective = cs[cs.length - 1];
        if (effective === undefined || effective.action !== "confirm")
            continue;
        facts.push({
            type: "fact",
            id: `fact-${id}`, // **确定性派生**：同输入同 id
            proposal: id,
            confirmation: effective.id,
            kind: p.kind,
            statement: p.proposedRelation,
        });
    }
    facts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { facts, violations };
};
/** **唯一**允许认知统计消费的入口（Pattern / M5 / 棘轮都必须走这里，不得直接吃 records）。 */
export const factualOnly = (records) => projectFacts(records).facts;
const daysBetween = (fromIso, toIso) => {
    const a = Date.parse(fromIso);
    const b = Date.parse(toIso);
    if (!Number.isFinite(a) || !Number.isFinite(b))
        return null;
    return Math.floor((b - a) / 86_400_000);
};
/**
 * 候选可见性。`now` **由调用方传入**（本层不读时钟 ⇒ 可复现）。
 * 统计口径：`acceptanceRate = confirmed / (confirmed + rejected)`；**待确认不计入分母**
 * （否则「还没人看」会被算成「被拒」，那是伪造精度）；分母 0 ⇒ `null`。
 */
export const candidateStats = (records, now) => {
    const { facts } = projectFacts(records);
    const confirmedIds = new Set(facts.map((f) => f.proposal));
    const proposals = records.filter((r) => isObj(r) && r.type === "proposal" && validateRecord(r).length === 0);
    const decided = new Set();
    for (const r of records) {
        if (!isObj(r) || r.type !== "confirmation")
            continue;
        if (!ACTIONS.includes(r.action))
            continue;
        if (r.action !== "confirm")
            decided.add(String(r.proposal));
    }
    const confirmed = proposals.filter((p) => confirmedIds.has(p.id)).length;
    const rejected = proposals.filter((p) => !confirmedIds.has(p.id) && decided.has(p.id)).length;
    const denominator = confirmed + rejected;
    const ages = proposals.map((p) => daysBetween(p.createdAt, now)).filter((d) => d !== null);
    return {
        candidates: proposals.length,
        confirmed,
        rejected,
        pendingConfirmation: proposals.length - denominator,
        oldestCandidateDays: ages.length > 0 ? Math.max(...ages) : null,
        acceptanceRate: denominator > 0 ? confirmed / denominator : null,
        rejectionRate: denominator > 0 ? rejected / denominator : null,
    };
};
