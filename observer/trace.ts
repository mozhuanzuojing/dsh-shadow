// dsh-shadow —— observer/trace.ts：Observation Trace（v0.23）——Observer 记录"我当时怎么看见"的可回放记录。
// 与 Experience 分离（Experience=发生了什么；ObservationTrace=我怎么看见发生的）。
// 旁路记录：写入 .shadow/observation/<date>/<id>.md，不影响 recall/排序/答案；listMemories 跳过非日期目录。
import { SHADOW_ROOT } from "../core/paths.js";
import type { ObservationTrace } from "../core/types.js";
import { today } from "../core/util.js";
import { scrubUnsafe } from "../security/scrub.js";

export const recordObservationTrace = async (fs: any, ws: string, trace: Omit<ObservationTrace, "id"> & { id?: string }) => {  try {
    const id = trace.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const rel = `${SHADOW_ROOT}/observation/${today()}/${id}.md`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, renderObservationTrace({ ...trace, id }));
  } catch (e: any) {
    console.log("[dsh-shadow] observation trace record failed (bypath):", e && e.message);
  }
};

export const renderObservationTrace = (tr: ObservationTrace) => {
  const lines = ["# Observation Trace"];
  lines.push(`> observer: ${scrubUnsafe(tr.observerId)}`);
  lines.push(`> createdAt: ${tr.createdAt}`);
  lines.push(`> realityAnchor: ${tr.realityAnchor}`);
  lines.push(`> intent: ${scrubUnsafe(tr.intent.goal)}${tr.intent.question ? ` · ${scrubUnsafe(tr.intent.question)}` : ""}`);
  if (tr.decision) lines.push(`> decision: ${scrubUnsafe(tr.decision.action)}${tr.decision.rationale ? ` (${scrubUnsafe(tr.decision.rationale)})` : ""}`);
  if (tr.outcome) lines.push(`> outcome: expected=${scrubUnsafe(tr.outcome.expected || "—")} · actual=${scrubUnsafe(tr.outcome.actual || "—")}`);
  lines.push(`> uncertainty: ${tr.uncertainty.level}${tr.uncertainty.reasons.length ? ` (${scrubUnsafe(tr.uncertainty.reasons.join("、"))})` : ""}`);
  lines.push(`> source: ${tr.metadata.source}`);
  if (tr.state && (tr.state.focus || tr.state.energy || tr.state.goalStage || tr.state.uncertainty !== undefined)) {
    lines.push(`> state: ${JSON.stringify(tr.state)}`);
  }
  lines.push("");
  lines.push(`visible: ${tr.projection.visible.join("、") || "—"}`);
  lines.push(`hidden: ${tr.projection.hidden.join("、") || "—"}`);
  lines.push(`distortion: ${tr.projection.distortion.join(" · ") || "—"}`);
  return lines.join("\n");
};

// 把 ObservationTrace markdown 解析回结构化对象（v0.24 Reflection 消费）。
export const parseObservationTrace = (text: string): Partial<ObservationTrace> | null => {
  if (!/^# Observation Trace/m.test(String(text || ""))) return null;
  const m = (re: RegExp) => (String(text || "").match(re) || [])[1] || "";
  const intentRaw = m(/^> intent: (.+)$/m);
  const intentParts = intentRaw.split(" · ");
  const decisionRaw = m(/^> decision: (.+)$/m);
  const dm = decisionRaw.match(/^(.*?)(?: \((.*)\))?$/);
  const outcomeRaw = m(/^> outcome: (.+)$/m);
  const exp = (outcomeRaw.match(/expected=([^·]*)/) || [])[1]?.trim();
  const act = (outcomeRaw.match(/actual=([^·]*)/) || [])[1]?.trim();
  const vis = m(/^visible: (.+)$/m).split("、").filter((x) => x && x !== "—");
  const hid = m(/^hidden: (.+)$/m).split("、").filter((x) => x && x !== "—");
  const dis = m(/^distortion: (.+)$/m).split(" · ").filter((x) => x && x !== "—");
  const stateRaw = m(/^> state: (.+)$/m);
  let state: any; try { state = stateRaw ? JSON.parse(stateRaw) : undefined; } catch { state = undefined; }
  return {
    observerId: m(/^> observer: (.+)$/m),
    createdAt: m(/^> createdAt: (.+)$/m),
    realityAnchor: (m(/^> realityAnchor: (.+)$/m) || "current") as any,
    intent: { goal: intentParts[0] || "", question: intentParts[1] || "" },
    projection: { visible: vis, hidden: hid, distortion: dis },
    decision: (dm && dm[1]) ? { action: dm[1], rationale: (dm[2] || "") || undefined } : undefined,
    outcome: (exp || act) ? { expected: exp || undefined, actual: act || undefined } : undefined,
    uncertainty: { level: Number((m(/^> uncertainty: (\d+)/) || "") as any) || 0, reasons: [] },
    metadata: { source: "read_shadow" },
    state,
  };
};

// 读取 ${SHADOW_ROOT}/observation/<date>/<id>.md 全部轨迹（v0.24 Reflection 输入）。
export const readObservationTraces = async (fs: any, ws: string): Promise<Partial<ObservationTrace>[]> => {
  const out: Partial<ObservationTrace>[] = [];
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/observation`, { cwd: ws });
    const dates = (await fs.listDir(root).catch(() => [])) || [];
    for (const d of dates) {
      if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
      const dt = await fs.resolve(`${ws}/${SHADOW_ROOT}/observation/${d.name}`, { cwd: ws });
      const files = (await fs.listDir(dt).catch(() => [])) || [];
      for (const f of files) {
        if (!f?.name || !f.name.endsWith(".md")) continue;
        const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/observation/${d.name}/${f.name}`, { cwd: ws });
        const t = parseObservationTrace(await fs.readText(p));
        if (t) { t.id = f.name.replace(/\.md$/, ""); out.push(t); }
      }
    }
  } catch { /* 无 observation 目录 */ }
  return out;
};
