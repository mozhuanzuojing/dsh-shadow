import { daysBetween, hoursBetween } from "./util.js";
/** 归属键的**来源**。本模块只接受显式键；没有键的决策/观察一律不参与归属。 */
export const ATTRIBUTION_RULE = "same-key-window/v1";
const ms = (iso) => {
    const t = Date.parse(iso);
    return Number.isFinite(t) ? t : NaN;
};
// 天/小时粒度**不再在本模块实现**：与 `core/proposal.ts` 曾各写一份同样的判据（判据分叉风险），
// 现已收进 `core/util.ts` 的 `daysBetween` / `hoursBetween`（floor，不插值；不可解析 ⇒ null）。
const days = daysBetween;
const hours = hoursBetween;
/**
 * 按 `same-key-window/v1` 归属。**纯函数、不看时钟、不读文件**。
 * @param windowDays - 时间窗（天）。由调用方给出（走 config，**不是这里的硬编码魔数**）。
 */
export const attributeOutcomes = (input) => {
    const lenient = input.unkeyed === "include-as-unkeyed";
    const hasKey = (k) => lenient || (typeof k === "string" && k.trim().length > 0);
    const decisions = input.decisions.filter((d) => hasKey(d.key));
    const attributions = [];
    const ambiguous = [];
    const unattributed = [];
    // 观察按 (at, id) 排序 ⇒ 输出与输入顺序无关
    const observations = [...input.observations].sort((a, b) => a.at === b.at ? (a.id < b.id ? -1 : a.id > b.id ? 1 : 0) : a.at < b.at ? -1 : 1);
    for (const o of observations) {
        if (!hasKey(o.key)) {
            unattributed.push({ observation: o.id, key: o.key });
            continue;
        }
        // 候选 = 同 key、观察时刻不早于决策、且 lag 在窗内
        const candidates = decisions.filter((d) => {
            if (d.key !== o.key)
                return false;
            const lag = days(d.at, o.at);
            return lag !== null && lag >= 0 && lag <= input.windowDays;
        });
        if (candidates.length === 0) {
            unattributed.push({ observation: o.id, key: o.key });
            continue;
        }
        // 取**最晚前驱**；并列 ⇒ 不归属（保守，且可见）
        const latest = candidates.reduce((a, b) => (a.at > b.at ? a : b));
        const tied = candidates.filter((c) => c.at === latest.at);
        if (tied.length > 1) {
            ambiguous.push({ observation: o.id, key: o.key, candidates: tied.map((c) => c.id).sort() });
            continue;
        }
        const lag = days(latest.at, o.at);
        const lagHours = hours(latest.at, o.at);
        if (lag === null || lagHours === null) {
            unattributed.push({ observation: o.id, key: o.key });
            continue;
        }
        attributions.push({
            decision: latest.id,
            observation: o.id,
            key: o.key,
            rule: ATTRIBUTION_RULE,
            windowDays: input.windowDays,
            lagDays: lag,
            lagHours,
        });
    }
    attributions.sort((a, b) => (a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0));
    ambiguous.sort((a, b) => (a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0));
    unattributed.sort((a, b) => (a.observation < b.observation ? -1 : a.observation > b.observation ? 1 : 0));
    return {
        attributions,
        ambiguous,
        unattributed,
        considered: decisions.map((d) => d.id).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)),
    };
};
/**
 * 把归属结果变成**原语记录**（Proposal + Confirmation）—— 这是「接线」的关键：
 * **M1 的结果事实必须经 `projectFacts` 产生，本模块不返回事实。**
 *
 * - `Proposal.source` = **观察的来源**（user/tool/ci；内容是他们给的）；
 * - `Confirmation.actor` = `"tool"`（**确定性规则**这条写入路径），`reason` 写明规则与数字 ⇒ **可审计**。
 *
 * `missing`：归属里引用了、但调用方**没传**对应观察的 id（调用方传错参数时**不猜**：
 * 跳过会让事实凭空少一条，所以必须**报出来**，由调用方决定怎么处理）。
 */
export const toPrimitiveRecords = (result, observations) => {
    const byId = new Map(observations.map((o) => [o.id, o]));
    const proposals = [];
    const confirmations = [];
    const missing = [];
    for (const a of result.attributions) {
        const o = byId.get(a.observation);
        if (o === undefined) {
            missing.push(a.observation);
            continue;
        }
        const pid = `outcome-${a.decision}-${a.observation}`;
        proposals.push({
            type: "proposal",
            id: pid,
            kind: "outcome",
            source: o.source,
            inputRefs: o.inputRefs,
            proposedRelation: o.actual,
            subject: a.key,
            createdAt: o.at,
        });
        confirmations.push({
            type: "confirmation",
            id: `confirm-${pid}`,
            proposal: pid,
            actor: "tool",
            action: "confirm",
            timestamp: o.at,
            reason: `rule:${a.rule} key=${a.key} lag=${a.lagDays}d(${a.lagHours}h) window=${a.windowDays}d`,
        });
    }
    return { proposals, confirmations, missing: missing.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)) };
};
;
/** nearest-rank p90（确定性；不插值 —— 插值会造出不存在的年龄）。 */
export const p90 = (values) => {
    if (values.length === 0)
        return null;
    const sorted = [...values].sort((a, b) => a - b);
    const idx = Math.max(0, Math.ceil(0.9 * sorted.length) - 1);
    return sorted[idx];
};
/**
 * 结算读数。`now` **由调用方传入**（不读时钟 ⇒ 可复现）。
 * **注意**：本函数**不修改任何状态** —— 年龄只用于暴露「正常等待 / 长期积压 / 刻意推迟」。
 *
 * 口径（F6）：年龄分布、最老、p90 **只统计 `disposition:"open"`**；
 * `deliberate-deferral` 单独计数 —— 「刻意不做」不是积压，混在一起报就是**误导**。
 */
export const outcomeReadout = (input, now) => {
    const settledIds = new Set(input.result.attributions.map((a) => a.decision));
    // 「有没有键」的判定**只用 attribution 给出的 `considered`**，本层不重判（避免口径分叉）。
    // 注：若调用方拿**子集**算的 result 配**全集** decisions，这里会把差额算成 `unconsidered` —— 那是**故意叫响的**
    // （不猜、不静默），正常调用下 `unconsidered` 只等于「无键」的条数。
    const considered = new Set(input.result.considered);
    const unconsidered = input.decisions.filter((d) => !considered.has(d.id)).length;
    const pendingRecords = input.decisions.filter((d) => considered.has(d.id) && !settledIds.has(d.id));
    // 只有**明确的** `open`（含缺省）才算「在等」；枚举外的值既不算 open 也不算 deferred，
    // 单列出来（**未知枚举不得落回默认值** —— 否则它会静默污染 buckets / 最老 / p90）。
    const open = pendingRecords.filter((d) => d.disposition === undefined || d.disposition === "open");
    const invalidDisposition = pendingRecords.filter((d) => d.disposition !== undefined && d.disposition !== "open" && d.disposition !== "deliberate-deferral").length;
    let unmeasurable = 0;
    const ages = [];
    for (const d of open) {
        const age = days(d.at, now);
        if (age === null)
            unmeasurable += 1;
        else
            ages.push(Math.max(0, age));
    }
    const oldest = open
        .map((d) => ({ id: d.id, at: d.at, ageDays: days(d.at, now) }))
        .filter((x) => x.ageDays !== null)
        .map((x) => ({ id: x.id, at: x.at, ageDays: Math.max(0, x.ageDays) }))
        .sort((a, b) => b.ageDays - a.ageDays || (a.id < b.id ? -1 : 1))[0] ?? null;
    return {
        decisions: input.decisions.length,
        settled: settledIds.size,
        pending: pendingRecords.length,
        pendingOpen: open.length,
        pendingDeferred: pendingRecords.length - open.length - invalidDisposition,
        invalidDisposition,
        unconsidered,
        unmeasurable,
        ambiguous: input.result.ambiguous.length,
        unattributed: input.result.unattributed.length,
        buckets: {
            lt7: ages.filter((a) => a < 7).length,
            d7to30: ages.filter((a) => a >= 7 && a < 30).length,
            d30to90: ages.filter((a) => a >= 30 && a < 90).length,
            ge90: ages.filter((a) => a >= 90).length,
        },
        oldest,
        pendingAgeP90: p90(ages),
    };
};
/** 渲染成一行（供读路径复用；**不含任何判断**，只有数字与「未观察到」）。 */
export const renderOutcomeReadout = (r) => {
    const parts = [
        `决策 ${r.decisions}`,
        `已结算 ${r.settled}`,
        `待结算 ${r.pending}`,
        `（<7d ${r.buckets.lt7} · 7–30d ${r.buckets.d7to30} · 30–90d ${r.buckets.d30to90} · ≥90d ${r.buckets.ge90}）`,
        `p90 ${r.pendingAgeP90 === null ? "不可测" : `${r.pendingAgeP90}d`}`,
    ];
    if (r.oldest !== null)
        parts.push(`最老 ${r.oldest.at}（${r.oldest.ageDays}d）`);
    if (r.pendingDeferred > 0)
        parts.push(`刻意推迟 ${r.pendingDeferred}（不计入积压）`);
    if (r.invalidDisposition > 0)
        parts.push(`disposition 非法 ${r.invalidDisposition}（**未计入任何桶**）`);
    if (r.unconsidered > 0)
        parts.push(`未参与归属 ${r.unconsidered}（无键或不在本次 result 内）`);
    if (r.unmeasurable > 0)
        parts.push(`年龄不可测 ${r.unmeasurable}`);
    if (r.ambiguous > 0)
        parts.push(`歧义 ${r.ambiguous}`);
    if (r.unattributed > 0)
        parts.push(`未归属 ${r.unattributed}`);
    return parts.join(" · ");
};
