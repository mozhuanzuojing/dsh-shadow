import { daysBetween } from "./util.js";
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
/** 确认事件的**确定性排序**：`timestamp` 升序；同刻按 `id` 升序；**完全同 ⇒ 0**（不能返回 1，否则排序不稳定）。 */
const byTimeThenId = (a, b) => a.timestamp === b.timestamp ? (a.id === b.id ? 0 : a.id < b.id ? -1 : 1) : a.timestamp < b.timestamp ? -1 : 1;
/** 收一处的**校验 + 去重 + 分组**（事实层与统计层必须共用，见下方 `effectiveConfirmations` 的说明）。 */
const collect = (records) => {
    const violations = [];
    const proposals = new Map();
    const confirmations = [];
    const confirmationIds = new Set(); // 去重判据（**非** O(n²) 线性扫描：记录量大时那是可被放大的开销）
    for (const r of records) {
        const bad = validateRecord(r);
        if (bad.length > 0) {
            violations.push(...bad.map((b) => `拒收记录：${b}`));
            continue;
        }
        const rec = r;
        if (rec.type === "proposal") {
            const id = rec.id;
            // **重复 id 不覆盖**：报违规并保留**首见**（此前后一条会静默顶掉前一条 —— 报错却仍生效）。
            if (proposals.has(id)) {
                violations.push(`proposal id 重复：${id} —— **不覆盖**，保留首见（否则后一条静默改掉前一条的语义）`);
                continue;
            }
            proposals.set(id, rec);
        }
        else {
            const id = rec.id;
            if (confirmationIds.has(id)) {
                violations.push(`confirmation id 重复：${id} —— **不覆盖**，保留首见（并列裁决会让事实不可复现）`);
                continue;
            }
            confirmationIds.add(id);
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
    return { violations, proposals, byProposal };
};
/**
 * **判据收一处**（ADR-0063 / ADR-0070）：每个 proposal 的**有效动作** =
 * 指向它的确认事件按 `(timestamp, id)` 升序排序后的**最后一条**（与插入顺序无关）。
 *
 * 事实层（`projectFacts`）与候选统计层（`candidateStats`）**必须共用本函数** ——
 * 曾经两处各写一遍，后果是同一份数据两个答案：`revoke` 在事实层让事实消失，
 * 在统计层却被算成「pending / 被拒」（`revoke` 与 `reject` 被混为一谈，拒绝率被虚增）。
 */
const effectiveConfirmations = (proposals, byProposal) => {
    const out = new Map();
    for (const id of proposals.keys()) {
        const cs = (byProposal.get(id) ?? []).slice().sort(byTimeThenId);
        const last = cs[cs.length - 1];
        if (last !== undefined)
            out.set(id, last);
    }
    return out;
};
/**
 * 投影：由 `(proposals, confirmations)` 派生出**事实**。
 *
 * 判定（逐字对应 ADR-0082 的不变量）：
 *   ① 该 proposal 必须**通过校验**且 `inputRefs` 非空（「基于什么提议」在场）；
 *   ② 必须存在指向它的 confirmation；
 *   ③ 该 confirmation 的**有效动作**必须是 `confirm`（见 `effectiveConfirmations`）；
 *      出现 `reject` / `revoke` ⇒ **不产生事实**（撤销即事实消失，且**历史保留**）。
 *
 * 不变量：**只有 FACT 能改变认知统计；CANDIDATE 只能改变「待确认候选」的统计。**
 * 故任何统计入口都应消费本函数的 `facts`，而不是原始 records —— `factualOnly()` 是那条唯一入口。
 */
export const projectFacts = (records) => {
    const { violations, proposals, byProposal } = collect(records);
    const effective = effectiveConfirmations(proposals, byProposal);
    const facts = [];
    for (const [id, p] of proposals) {
        const eff = effective.get(id);
        if (eff === undefined || eff.action !== "confirm")
            continue;
        facts.push({
            type: "fact",
            id: `fact-${id}`, // **确定性派生**：同输入同 id
            proposal: id,
            confirmation: eff.id,
            kind: p.kind,
            statement: p.proposedRelation,
        });
    }
    facts.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    return { facts, violations };
};
/**
 * **唯一**允许认知统计消费的入口（Pattern / M5 / 棘轮都必须走这里，不得直接吃 records）。
 *
 * ⚠ **本函数只返回事实**：被拒记录（`violations`）**不在此返回**。需要它们时请直接用
 * `projectFacts(records).violations`；`candidateStats` 亦已把条数露为 `violations`（v1.15.56）。
 * 这样写是为了让「事实面」保持单一职责，同时**不把「有记录被拒」这件事藏起来**。
 */
export const factualOnly = (records) => projectFacts(records).facts;
const ACTOR_ORDER = ["human", "tool", "ci"];
/**
 * 候选可见性。`now` **由调用方传入**（本层不读时钟 ⇒ 可复现）。
 *
 * 口径：每个 proposal 按 `effectiveConfirmations` 的判定落入
 * `confirmed / rejected / revoked / pending` 之一 ⇒ **`candidates = 四者之和`**（可机械断言）。
 * 比率的分母为 0 ⇒ `null`（**不可测不报 0**）；**待确认不计入分母**（否则「还没人看」会被算成「被拒」）。
 */
export const candidateStats = (records, now) => {
    const { proposals, byProposal, violations } = collect(records);
    const effective = effectiveConfirmations(proposals, byProposal);
    const perActor = new Map();
    const pendingAges = [];
    let confirmed = 0;
    let rejected = 0;
    let revoked = 0;
    let pending = 0;
    let unmeasuredAges = 0;
    for (const [id, p] of proposals) {
        const eff = effective.get(id);
        if (eff === undefined) {
            pending += 1;
            const age = daysBetween(p.createdAt, now);
            if (age === null)
                unmeasuredAges += 1;
            else
                pendingAges.push(Math.max(0, age));
            continue;
        }
        const bucket = perActor.get(eff.actor) ?? { confirmed: 0, rejected: 0, revoked: 0 };
        if (eff.action === "confirm") {
            confirmed += 1;
            bucket.confirmed += 1;
        }
        else if (eff.action === "reject") {
            rejected += 1;
            bucket.rejected += 1;
        }
        else {
            revoked += 1;
            bucket.revoked += 1;
        }
        perActor.set(eff.actor, bucket);
    }
    const rate = (num, den) => (den > 0 ? num / den : null);
    const byActor = ACTOR_ORDER.filter((a) => perActor.has(a)).map((actor) => {
        const v = perActor.get(actor);
        const den = v.confirmed + v.rejected;
        return { actor, ...v, acceptanceRate: rate(v.confirmed, den), rejectionRate: rate(v.rejected, den) };
    });
    const human = perActor.get("human");
    const humanDen = human === undefined ? 0 : human.confirmed + human.rejected;
    return {
        candidates: proposals.size,
        confirmed,
        rejected,
        revoked,
        pendingConfirmation: pending,
        oldestPendingDays: pendingAges.length > 0 ? pendingAges.reduce((m, a) => (a > m ? a : m), pendingAges[0]) : null,
        unmeasuredAges,
        acceptanceRate: human === undefined ? null : rate(human.confirmed, humanDen),
        rejectionRate: human === undefined ? null : rate(human.rejected, humanDen),
        byActor,
        violations: violations.length,
    };
};
