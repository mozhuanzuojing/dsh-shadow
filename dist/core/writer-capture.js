// dsh-shadow —— core/writer-capture.ts：写侧采集 seam（candidate 2 主体拆分）。
// 从 createShadowCollector 迁出的「事件 → pending」部分：push + 四个事件 handler（fs/tool/goal/session），
// 以及 primaryComp（主题入口统计）。只改 core.pending/comps/goalByAgent/cwdBySession，不碰 fs/索引。
// 与 writer.ts 原实现逐字一致；挂起时经 hooks.flush 兜底落盘（hooks 由 composition root 注入，解 cycle）。
import { stamp, under, component } from "./util.js";
import { sanitizeText } from "../security/scrub.js";
import { extractMessage, classifyUser, extractDecisionStatement, extractReason, goalText } from "./collect.js";
import { resolveWorkspace } from "./scope.js";
export function makeCapture(core, hooks) {
    const initiatorId = () => {
        try {
            const agents = core.context.get("agents");
            return agents ? agents.currentInitiator()?.id : undefined;
        }
        catch {
            return undefined;
        }
    };
    const agentIdOf = (thing) => {
        if (!thing || typeof thing !== "object")
            return undefined;
        const nested = thing.agent && typeof thing.agent === "object" ? thing.agent.id : undefined;
        const direct = typeof thing.id === "string" ? thing.id : undefined;
        return (typeof nested === "string" && nested) || direct || undefined;
    };
    const push = (agentId, rec) => {
        if (!agentId)
            return;
        const arr = core.pending.get(agentId) || [];
        arr.push({ time: stamp(), ...rec });
        core.pending.set(agentId, arr);
        // 只把"语义"comp 计入主题入口；纯工具名不作入口（防跨事务串线、召回命中错主题）。
        if (rec.comp && rec.source !== "tool") {
            const cs = core.comps.get(agentId) || [];
            cs.push(rec.comp);
            core.comps.set(agentId, cs);
        }
        // 兜底：pending 超阈值即异步落盘，避免依赖单一 turn-stopping 事件导致积压不落盘。
        if (arr.length >= core.MAX_PENDING) {
            void hooks.flush?.(core.getAgentById(agentId) || { id: agentId });
        }
    };
    const primaryComp = (agentId) => {
        const cs = core.comps.get(agentId) || [];
        if (!cs.length)
            return "";
        const tally = {};
        for (const c of cs)
            tally[c] = (tally[c] || 0) + 1;
        return Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
    };
    const onFsObserved = (target, observation, actor) => {
        const abs = (target && (target.displayPath || target.targetKey)) || "";
        if (!abs)
            return undefined;
        const id = agentIdOf(actor) || initiatorId();
        if (!id)
            return undefined;
        const ws = resolveWorkspace(core.getAgentById(id), core.cwdBySession, core.config) || "";
        push(id, { kind: "action", text: `改/读 ${under(abs, ws) || abs}`, comp: component(abs, ws), source: "fs" });
        return undefined;
    };
    const onToolsResult = (exec) => {
        const id = exec?.agent?.id || initiatorId();
        // 只读宿主 `ToolExecution.name`（ToolExecution = { callId, rootCallId?, name, arguments, agent?, parent?, signal }）。
        // **不留旧名兜底**：`exec.tool?.name` / `exec.toolName` / `exec.tool` 在宿主类型上都不存在。
        const tool = exec?.name || "tool";
        push(id, { kind: "action", text: `调用 ${tool}`, comp: tool, source: "tool" });
        return undefined;
    };
    const onGoalChanged = (payload) => {
        const gid = payload?.agent?.id;
        const change = payload?.change;
        // 只读真字段 `change.goal.objective`（`change.objective` 在任何版本都不存在）。
        const obj = change?.goal?.objective || "";
        // `clear`（或载荷不带 goal）= 「目标没了」：必须清掉缓存，否则后续记忆仍带旧 `> 目标：`。
        // 这是 operation 读对之后才暴露出来的「半修」状态。
        if (gid && (change?.operation === "clear" || change?.goal === undefined))
            core.goalByAgent.delete(String(gid));
        else if (gid && obj)
            core.goalByAgent.set(String(gid), String(obj).slice(0, 120));
        // Decision Capture：goal 事件 = 明确决策（一等事件），statement 与 source 入内供血缘派生。
        push(gid, { kind: "decision", text: `决定 ${goalText(payload?.change)}`, statement: goalText(payload?.change), source: "goal" });
        return undefined;
    };
    const onSessionEvent = (session, event) => {
        const sid = session?.id;
        const cwd = session?.header?.cwd;
        if (sid && cwd)
            core.cwdBySession.set(String(sid), cwd);
        const m = extractMessage(event);
        if (!m)
            return undefined;
        const id = core.getAgentById(sid)?.id || (sid ? String(sid) : undefined) || initiatorId();
        const tag = m.kind === "user" ? "用户" : "我";
        if (m.kind === "assistant") {
            push(id, { kind: "assistant", text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub: "", source: "assistant" });
            for (const st of extractDecisionStatement(m.text)) {
                push(id, { kind: "decision", text: `决定 ${st}`, statement: st, reason: extractReason(m.text), source: "assistant" });
            }
            return undefined;
        }
        const sub = classifyUser(m.text);
        const rec = { kind: "user", text: `${tag}：${sanitizeText(m.text)}`, comp: "", sub, source: "user" };
        if (sub === "decision") {
            rec.statement = m.text;
            rec.reason = extractReason(m.text);
        }
        push(id, rec);
        return undefined;
    };
    return { push, primaryComp, onFsObserved, onToolsResult, onGoalChanged, onSessionEvent };
}
