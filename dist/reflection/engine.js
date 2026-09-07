// dsh-shadow —— reflection/engine.ts：v0.24 Reflection Engine（Candidate Generator）。
// 输入 ObservationTrace[] → Pattern Extraction → Candidate Reflection（status:"candidate"），等确认；不写回 Identity。
// 旁支不是主干：Reflection ≠ Memory 查询。v0.24 只产 candidate，confirmed 留 v0.25；不生成 Candidate Identity Change。
import { SHADOW_ROOT } from "../core/paths.js";
import { completenessOf } from "./types.js";
import { repeatedDecisions, repeatedOutcomes } from "./patterns/decision-outcome.js";
import { decisionOutcomeCorrelation } from "./patterns/success-rate.js";
import { distortionPatterns } from "./patterns/distortion.js";
import { readObservationTraces } from "../observer/trace.js";
import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";
// 纯计算：eligible traces → Reflection。完整性闸门（decision+outcome 齐备）before 计算。
export const reflectTraces = (traces, opts) => {
    const eligible = traces.filter((t) => completenessOf(t).reflectionEligible);
    const reDecisions = repeatedDecisions(eligible);
    const reOutcomes = repeatedOutcomes(eligible);
    const corr = decisionOutcomeCorrelation(eligible);
    const devs = distortionPatterns(eligible);
    const top = corr.find((c) => c.count >= 3);
    const rate = top ? top.successRate : 0;
    let type = "unknown";
    let statement = "";
    if (top) {
        type = rate >= 0.6 ? "principle" : rate < 0.4 ? "anti_pattern" : "unknown";
        statement = type === "principle"
            ? `该观察者在「${scrubUnsafe(top.decision)}」场景多次产生「${scrubUnsafe(top.outcome)}」（成功 ${Math.round(rate * top.count)}/${top.count}）`
            : type === "anti_pattern"
                ? `该观察者在「${scrubUnsafe(top.decision)}」场景常导致「${scrubUnsafe(top.outcome)}」`
                : `「${scrubUnsafe(top.decision)}」→「${scrubUnsafe(top.outcome)}」出现 ${top.count} 次`;
    }
    const score = top ? Math.min(0.95, 0.4 + rate * 0.4) : 0.2;
    const sourceTraces = eligible.slice(0, 20).map((t) => t.id || "").filter(Boolean);
    return {
        id: opts.id || `${today()}--${Math.random().toString(36).slice(2, 8)}`,
        observerId: opts.observerId,
        sourceTraces,
        period: opts.period,
        observation: { repeatedDecisions: reDecisions, repeatedOutcomes: reOutcomes, deviationPatterns: devs },
        pattern: { decisionOutcomeCorrelation: corr },
        learning: { statement: statement || "（无足够模式：尚无 ≥3 次的 decision→outcome 轨迹）", type, evidenceCount: eligible.length },
        confidence: { score, reasons: [`${eligible.length} 条可参与轨迹`, top ? `${top.count} 次观察` : "不足"] },
        status: "candidate",
    };
};
// 读轨迹 → 反思 → 写 .shadow/reflection/<date>/<id>.md（Reflection ≠ Memory，旁支）。
export const reflectOf = async (fs, ws, opts) => {
    const traces = await readObservationTraces(fs, ws);
    const r = reflectTraces(traces, opts);
    try {
        const rel = `${SHADOW_ROOT}/reflection/${today()}/${r.id}.md`;
        const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
        await fs.writeText(t, renderReflection(r));
    }
    catch { /* 旁支降级 */ }
    return r;
};
export const renderReflection = (r) => {
    const lines = ["# Reflection"];
    lines.push(`> observer: ${scrubUnsafe(r.observerId)}`);
    lines.push(`> status: ${r.status}`);
    lines.push(`> period: ${r.period.from || "…"} → ${r.period.to || "…"}`);
    lines.push(`> confidence: ${r.confidence.score.toFixed(2)} (${r.confidence.reasons.join("、")})`);
    lines.push(`> evidenceCount: ${r.learning.evidenceCount}`);
    lines.push("");
    lines.push(`learning: ${r.learning.type} · ${r.learning.statement}`);
    lines.push(`observation: repeatedDecisions=${r.observation.repeatedDecisions.join("、") || "—"} · repeatedOutcomes=${r.observation.repeatedOutcomes.join("、") || "—"}`);
    if (r.observation.deviationPatterns.length)
        lines.push(`deviationPatterns: ${r.observation.deviationPatterns.join("、")}`);
    if (r.pattern.decisionOutcomeCorrelation.length) {
        lines.push("decisionOutcomeCorrelation:");
        for (const c of r.pattern.decisionOutcomeCorrelation.slice(0, 6))
            lines.push(`  ${c.decision} → ${c.outcome} (×${c.count} · 成功率 ${(c.successRate * 100).toFixed(0)}%)`);
    }
    return lines.join("\n");
};
// parseReflection：把 reflection markdown 解析回结构化（v0.25 Candidate 消费）。
export const parseReflection = (text) => {
    if (!/^# Reflection/m.test(String(text || "")))
        return null;
    const m = (re) => (String(text || "").match(re) || [])[1] || "";
    const learningRaw = m(/^learning: (.+)$/m);
    const lm = learningRaw.match(/^(\w+) · (.*)$/);
    const corr = [];
    for (const line of String(text || "").split("\n")) {
        const cm = line.match(/^\s+(.+?) → (.+?) \(×(\d+) · 成功率 (\d+)%\)$/);
        if (cm)
            corr.push({ decision: cm[1], outcome: cm[2], count: Number(cm[3]) || 0, successRate: (Number(cm[4]) || 0) / 100 });
    }
    const obs = m(/^observation: (.+)$/m);
    const rD = (obs.match(/repeatedDecisions=([^·]*)/) || [])[1]?.trim() || "";
    return {
        id: m(/^> period: (.*)$/m) || "",
        observerId: m(/^> observer: (.+)$/m),
        sourceTraces: [],
        period: { from: m(/^> period: ([^→]*)→/).trim() || "", to: m(/^> period: [^→]*→\s*(.*)$/m).trim() || "" },
        observation: { repeatedDecisions: rD.split("、").filter(Boolean), repeatedOutcomes: [], deviationPatterns: m(/^deviationPatterns: (.+)$/m).split("、").filter(Boolean) },
        pattern: { decisionOutcomeCorrelation: corr },
        learning: { statement: lm ? lm[2] : "", type: (lm ? lm[1] : "unknown"), evidenceCount: Number(m(/^> evidenceCount: (.+)$/m)) || 0 },
        confidence: { score: Number(m(/^> confidence: ([\d.]+)/) || 0) || 0, reasons: [] },
        status: (m(/^> status: (.+)$/m) || "candidate"),
    };
};
// 读取 .shadow/reflection/<date>/<id>.md 全部反思（v0.25 Candidate 输入）。
export const readReflections = async (fs, ws) => {
    const out = [];
    try {
        const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/reflection`, { cwd: ws });
        const dates = (await fs.listDir(root).catch(() => [])) || [];
        for (const d of dates) {
            if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name))
                continue;
            const dt = await fs.resolve(`${ws}/${SHADOW_ROOT}/reflection/${d.name}`, { cwd: ws });
            const files = (await fs.listDir(dt).catch(() => [])) || [];
            for (const f of files) {
                if (!f?.name || !f.name.endsWith(".md"))
                    continue;
                const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/reflection/${d.name}/${f.name}`, { cwd: ws });
                const r = parseReflection(await fs.readText(p));
                if (r) {
                    r.id = f.name.replace(/\.md$/, "");
                    out.push(r);
                }
            }
        }
    }
    catch { /* 无 reflection 目录 */ }
    return out;
};
