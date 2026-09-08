// dsh-shadow —— core/task.ts：Task Lifecycle 视图（ADR-0039，派生式）。
// Task = 任务生命周期一等对象（title/trigger/objective/constraints/status/decisions/outcomes）。
// 沿 ADR-0038 纪律：Task 是【读侧派生的投影】，不是写侧事实源；Memory Atom=事实，Task 在其上派生。
// 沿 ADR-0039 边界：Outcome≠Success（结果只记【观察文本】，不做"成/败"判断）；
//   status 也是【启发式观测】（active/completed/abandoned），不是"方案正确/已确认"。
import { scrubUnsafe } from "../security/scrub.js";
const fmtT = (hhmmss) => { const s = String(hhmmss || "").padEnd(6, "0"); return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`; };
const REMINDER_RE = /注意|提醒|重点|不要|别|小心|切记|别忘了|另外|补充|但是|错误|不对|前提|前提是|关键是|边界|坑|留[^。]{0,5}(神|意)/;
const COMPLETE_RE = /(全部通过|通过|完成|passed|测试通过|执行成功|done|complete|成功)/i;
const ABANDON_RE = /(放弃|停止|搁置|不再做|废弃该|abandon|取消)/i;
const OUTCOME_RE = /(通过|passed|成功|失败|报错|错误|完成|耗时|个测试|tests?|结果|耗时|ms|秒)/i;
const atomAt = (p) => `${p.date || ""} ${fmtT(p.time)}`;
export const deriveTasks = (parsed) => {
    const groups = new Map();
    for (const p of parsed) {
        const key = p.goal || p.entry || "(无任务)";
        let g = groups.get(key);
        if (!g) {
            g = [];
            groups.set(key, g);
        }
        g.push(p);
    }
    const out = [];
    for (const [key, atoms] of groups) {
        const sorted = [...atoms].sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
        const first = sorted[0];
        const objective = key;
        const title = scrubUnsafe((first.goal || first.entry || key).slice(0, 60));
        const userLines = sorted.flatMap((a) => a.userMessages || []);
        const trigger = scrubUnsafe((userLines[0] || "").slice(0, 80)) || "（无明确触发用户消息）";
        const constraints = Array.from(new Set(sorted.flatMap((a) => (a.userMessages || []).filter((l) => REMINDER_RE.test(l)).map((l) => scrubUnsafe(l.trim()).slice(0, 60)))));
        const decisions = sorted.flatMap((a) => {
            const events = a.decisionEvents && a.decisionEvents.length ? a.decisionEvents : a.decisions.map((d) => ({ statement: d, source: "", reason: "" }));
            const at = atomAt(a);
            return events.map((e) => ({ text: scrubUnsafe(String(e.statement || "")).slice(0, 80), source: String(e.source || ""), reason: scrubUnsafe(String(e.reason || "")).slice(0, 80), at, rel: a.rel }));
        });
        const outcomes = Array.from(new Set(sorted.flatMap((a) => (a.thinkLines || []).filter((l) => OUTCOME_RE.test(l)).map((l) => scrubUnsafe(l.trim()).slice(0, 80)))));
        const evidence = Array.from(new Set(sorted.flatMap((a) => a.materials || []))).slice(0, 12);
        const memoryRefs = sorted.map((a) => a.rel);
        const all = sorted.flatMap((a) => a.thinkLines || []).join("\n");
        let status = "active";
        let statusNote = "（未观测到明确完成/放弃信号，按活跃任务处理）";
        if (ABANDON_RE.test(all)) {
            status = "abandoned";
            statusNote = "（观测到放弃/停止/搁置信号，非判断）";
        }
        else if (COMPLETE_RE.test(all)) {
            status = "completed";
            statusNote = "（观测到完成/通过信号，非「方案正确」判断）";
        }
        out.push({
            id: `task-${(key || "task").replace(/[^a-z0-9_-]+/gi, "-").slice(0, 32) || "task"}`,
            title, objective,
            trigger, constraints,
            status, statusNote,
            startedAt: atomAt(first),
            endedAt: atomAt(sorted[sorted.length - 1]),
            decisions, outcomes, evidence, memoryRefs,
        });
    }
    return out;
};
export const renderTasks = (tasks, topic) => {
    const needle = String(topic || "").toLowerCase();
    const filtered = needle
        ? tasks.filter((t) => [t.title, t.objective, t.trigger, ...t.constraints, ...t.decisions.map((d) => d.text), ...t.outcomes, ...t.evidence].join(" ").toLowerCase().includes(needle))
        : tasks;
    if (!filtered.length)
        return needle ? `（无匹配任务：${topic}）` : "（暂无 Task 派生结果）";
    const parts = filtered.map((t) => {
        const seg = [];
        seg.push(`## Task · ${t.title}`);
        seg.push(`- 状态：${t.status}（启发式观测）${t.statusNote}`);
        seg.push(`- 生命周期：${t.startedAt} → ${t.endedAt}`);
        seg.push(`- 目标：${(t.objective || "—").slice(0, 60)}`);
        seg.push(`- 触发：${t.trigger.slice(0, 60)}`);
        if (t.constraints.length)
            seg.push(`- 约束：${t.constraints.slice(0, 6).join("、")}`);
        if (t.evidence.length)
            seg.push(`- 证据/材料：${t.evidence.slice(0, 6).join("、")}`);
        if (t.decisions.length) {
            seg.push(`- 决策链（${t.decisions.length}）：`);
            for (const d of t.decisions.slice(0, 12)) {
                const reason = d.reason ? `，因：${d.reason}` : "，因：未明确";
                seg.push(`    · ${d.at.slice(5, 16)} ${d.text}〔${d.source || "?"}〕${reason}`);
            }
        }
        if (t.outcomes.length) {
            seg.push(`- 观测结果（非成/败判断）：`);
            for (const o of t.outcomes.slice(0, 8))
                seg.push(`    · ${o.slice(0, 70)}`);
        }
        seg.push(`- 记忆：${t.memoryRefs.map((r) => r.split("/").slice(-1)[0]).join("、")}`);
        return seg.join("\n");
    });
    return parts.join("\n\n");
};
