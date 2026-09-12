// dsh-shadow —— core/memory.ts：记忆记录塑形（完整线索头）+ meta 注册。从 index.ts 迁出。
import { today } from "./util.js";
import { scrubUnsafe, referencedMaterials } from "../security/scrub.js";
import { mutateMeta } from "../persistence/meta.js";
export const buildClueHeader = (entry, arr, srcId, extra) => {
    const mats = [];
    const prompts = [];
    const userPoints = [];
    const seen = new Set();
    const addMat = (x) => {
        const p = scrubUnsafe(String(x || "").trim());
        if (p && !seen.has(p)) {
            seen.add(p);
            mats.push(p);
        }
    };
    for (const e of arr) {
        if (e.kind === "action" && /^改\/读 /.test(e.text))
            addMat(e.text.replace(/^改\/读 /, "").trim());
        if (e.kind === "user") {
            const raw = scrubUnsafe(e.text.replace(/^用户：/, ""));
            const refs = referencedMaterials(raw);
            for (const r of refs.slice(0, 6))
                addMat(r);
            if (e.sub)
                prompts.push(`「${raw.slice(0, 48)}」〔${e.sub}〕`);
            userPoints.push(`「${raw.slice(0, 48)}」`);
        }
    }
    const acts = arr.filter((x) => x.kind === "action").length;
    const usr = arr.filter((x) => x.kind === "user").length;
    // ── Decision Capture（v1.1.1）：决策作为一等事件进入 Memory。 ──
    // 只捕获「明确存在的决策表达」：goal 事件 / 用户拍板（classifyUser==decision）/ assistant 明确决策。
    // 决策事实（statement）与决策理由（reason）分离：reason 只在原文明确表达时才挂，绝不推测
    // （Evidence≠Interpretation；有 Decision ≠ 一定有 Reason，缺则不补）。
    const decs = [];
    const stmtSeen = new Set();
    for (const e of arr) {
        let statement = "", source = "", reason = "";
        if (e.kind === "decision") {
            statement = scrubUnsafe(String(e.statement || e.text || "").replace(/^决定 /, "")).trim();
            source = String(e.source === "assistant" ? "assistant" : (e.source || "goal"));
            reason = scrubUnsafe(String(e.reason || "")).trim();
        }
        else if (e.kind === "user" && e.sub === "decision") {
            statement = scrubUnsafe(String(e.statement || e.text || "").replace(/^用户：/, "")).trim();
            source = "user";
            reason = scrubUnsafe(String(e.reason || "")).trim();
        }
        if (statement && !stmtSeen.has(statement)) {
            stmtSeen.add(statement);
            decs.push({ text: statement.slice(0, 120), source, reason: reason ? reason.slice(0, 120) : "" });
        }
    }
    const decCount = decs.length;
    const kindLabel = { action: "动作", user: "用户", assistant: "agent", decision: "决策" };
    const kindsSeen = Array.from(new Set(arr.map((e) => e.kind).filter(Boolean))).map((k) => kindLabel[k] || k).join("·") || "—";
    const evPaths = mats.slice(0, 6).join("、") || "—";
    const lines = ["> 完整线索"];
    if (mats.length)
        lines.push(`> 背景/材料：${mats.slice(0, 8).join("、")}`);
    if (prompts.length)
        lines.push(`> 用户提示/决策：${prompts.slice(0, 6).join("；")}`);
    if (decs.length)
        lines.push(`> 决策：${decs.slice(0, 8).map((d) => `〔${d.source}〕${d.text}`).join("；")}`);
    const reasons = decs.filter((d) => d.reason);
    if (reasons.length)
        lines.push(`> 决策理由：${reasons.slice(0, 6).map((d) => `〔${d.source}〕${d.reason}`).join("；")}`);
    if (userPoints.length)
        lines.push(`> 用户要点：${userPoints.slice(0, 6).join("；")}`);
    lines.push(`> 证据链：来源(${kindsSeen}) · 日期(${today()}) · 证据(${evPaths})`);
    lines.push(`> 概况：${acts} 动作 · ${usr} 用户消息 · ${decCount} 决策`);
    if (srcId)
        lines.push(`> 来源会话：${scrubUnsafe(String(srcId))}`);
    if (extra?.project)
        lines.push(`> 项目：${scrubUnsafe(String(extra.project))}`);
    if (extra?.agent)
        lines.push(`> Agent：${scrubUnsafe(String(extra.agent))}`);
    if (extra?.goal)
        lines.push(`> 目标：${scrubUnsafe(String(extra.goal)).slice(0, 80)}`);
    return lines.join("\n") + "\n";
};
/**
 * 登记 `_meta.json` 里的一条。**返回是否登记成功**（v1.15.56）。
 *
 * 旧版把失败吞成一行 `console.log` ⇒ 记忆文件与索引缓存**早已写入**，于是这条记忆在索引/召回里
 * 是「活跃」的，而 `_meta.json` 里没有它 ⇒ `hits` 永远不计、生命周期恒判 NEW、遗忘判据落回默认值。
 * 调用方（`flush`）据此留痕，读侧才能提示「元数据未登记」。
 */
export const registerMeta = async (fs, ws, rel, actorId, retentionEnabled) => {
    if (!retentionEnabled)
        return true; // 未开启保留策略 ⇒ 本来就不需要 meta（不是失败）
    try {
        // 事务（ADR-0068）：读-改-写带版本守卫，并发下不丢更新；`false` = 已存在，无需写。
        const ok = await mutateMeta(fs, ws, (meta) => {
            if (meta[rel])
                return false;
            meta[rel] = { created: today(), lastSeen: 0, hits: 0, status: "active", confidence: 0.5, pinned: false, createdBy: actorId ? String(actorId) : "", confirmedBy: [] };
        });
        if (!ok)
            console.log(`[dsh-shadow] meta register 未落盘（写失败或坏件）：${rel}`);
        return ok;
    }
    catch (e) {
        console.log("[dsh-shadow] meta register failed:", e && e.message);
        return false;
    }
};
