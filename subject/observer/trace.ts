// dsh-shadow —— subject/observer/trace.ts：Observation Trace（v0.23）——Observer 记录"我当时怎么看见"的可回放记录。
// 与 Experience 分离（Experience=发生了什么；ObservationTrace=我怎么看见发生的）。
// 旁路记录：写入 .shadow/observation/<date>/<id>.md，不影响 recall/排序/答案；listMemories 跳过非日期目录。
//
// B2（v1.22.x）：`recordObservationTrace` 旧形态 `Promise<void>` + `catch { console.log }` ——
// 这些轨迹是 `reflection/engine.ts` 的**唯一输入**（`readObservationTraces` 反读）⇒ 不适用
// 「正当静默」豁免（`core/view/projection-store.ts` 那条要求「降级后读者拿到的内容逐字节不变」）。
// 现在返回 `{ok, reason}`，由 `query/{topic-recall,lenses}.ts` 经 `deps.noteDegrade` 上横幅。
//
// B4（v1.22.x）：`readObservationTraces` 旧版把「目录不存在」「listDir 失败」「readText 失败」
// 「JSON 坏件」并进一个 `catch { /* 无 observation 目录 */ }` ⇒ 只读挂载 / 后端故障读出来与
// 「还没采集」逐字不可区分，而这条链路的后果是**静默削掉身份演化的输入样本**
//（`readObservationTraces` → `reflectTraces` → `readReflections` → `evaluator.advanceIdentity`）。
// 现在：`isNotFound` ⇒ 正常空；其余 ⇒ 带真实原因；坏件**计数后 continue**（不终止整轮）。
//
// B14/B16（v1.22.x）：
//   · `realityAnchor` 是**封闭联合**（`core/types.ts`），旧版把未校验的字符串 `as any` 直接灌进去；
//     现在查成员表，非法值回落安全默认（`"current"`），类型系统在这个入口上重新提供保证。
//   · 写入侧把 `uncertainty.reasons` 渲染成 `> uncertainty: <level> (<reasons>)`，而解析侧
//     只取数字、`reasons` 恒为 `[]` ⇒ **往返不闭合**，「不确定性为什么高」永久丢失。
//     现在解析括号段并按 `、` 切开；括号缺失（坏件）时保持 `[]`。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { ObservationTrace, RealityAnchor } from "../../core/types.js";
import { today, newId, isNotFound, errText } from "../../core/util.js";
import type { PersistOutcome } from "../../persistence/outcomes.js";
import { scrubUnsafe } from "../../security/scrub.js";

/** `realityAnchor` 的成员表（B14：封闭联合的校验集合；**判据收一处** —— 别在解析处再写一遍字符串）。 */
const REALITY_ANCHORS: ReadonlySet<string> = new Set<RealityAnchor>(["known-at-time", "current", "historical"]);

/** 未校验字符串 → 联合成员；不在表里 ⇒ 安全默认 `"current"`（时间锚定的中性档）。 */
const anchorOf = (raw: string): RealityAnchor => (REALITY_ANCHORS.has(String(raw || "")) ? (String(raw) as RealityAnchor) : "current");

export const recordObservationTrace = async (fs: any, ws: string, trace: Omit<ObservationTrace, "id"> & { id?: string }): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 observation trace" };
  // id 生成收一处（`core/util.ts#newId`：6 位 base36，此前本文件是 6 位自写版，7 个模块各一份）。
  const id = trace.id || newId("obs");
  const rel = `${SHADOW_ROOT}/observation/${today()}/${id}.md`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, renderObservationTrace({ ...trace, id }));
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
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
  // 写入格式即**往返契约**：`<level> (<reasons 按 、 连接>)`；解析侧按同一形状读回（见 parseObservationTrace）。
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
  // **往返闭合（B16）**：写入是 `> uncertainty: <level> (<reasons>)`，这里把括号段读回来并按 `、` 切开。
  // 老实现只取 `(\d+)`、`reasons` 恒为 `[]` ⇒ 落盘了的「不确定性理由」在往返后永久丢失。
  // 边界：括号缺失（坏件 / 老文件）⇒ 保持 `[]`（**不编造**理由）；`scrubUnsafe` 的写入侧不产出嵌套括号。
  const uncRaw = m(/^> uncertainty: (.+)$/m);
  const uncLevel = Number((uncRaw.match(/^(\d+)/) || [])[1] || 0);
  const uncReasonsRaw = (uncRaw.match(/\(([^)]*)\)/) || [])[1] || "";
  const uncReasons = uncReasonsRaw.split("、").map((s) => s.trim()).filter(Boolean);
  return {
    observerId: m(/^> observer: (.+)$/m),
    createdAt: m(/^> createdAt: (.+)$/m),
    // B14：不再 `as any` —— 非法值回落 `"current"`（安全默认），类型系统在这个入口上重新有效。
    realityAnchor: anchorOf(m(/^> realityAnchor: (.+)$/m)),
    intent: { goal: intentParts[0] || "", question: intentParts[1] || "" },
    projection: { visible: vis, hidden: hid, distortion: dis },
    decision: (dm && dm[1]) ? { action: dm[1], rationale: (dm[2] || "") || undefined } : undefined,
    outcome: (exp || act) ? { expected: exp || undefined, actual: act || undefined } : undefined,
    uncertainty: { level: Number.isFinite(uncLevel) ? uncLevel : 0, reasons: uncReasons },
    metadata: { source: "read_shadow" },
    state,
  };
};

/** 轨迹读取结果：`traces` 之外还要带出**被削掉多少**（B4 —— 静默削样本是这条的病根）。 */
export interface ObservationTraces {
  traces: Partial<ObservationTrace>[];
  /** 读不出/坏件而**跳过**的文件数（>0 ⇒ Reflection 的输入样本不完整）。 */
  skipped: number;
  /** **目录级**读不出来（不是「还没有 observation 目录」）的真实原因。 */
  readFailure?: string;
}

// 读取 .shadow/observation/<date>/<id>.md 全部轨迹（v0.24 Reflection 输入）。
export const readObservationTraces = async (fs: any, ws: string): Promise<ObservationTraces> => {
  const traces: Partial<ObservationTrace>[] = [];
  let skipped = 0;
  if (!fs || !ws) return { traces, skipped, readFailure: "无 fs 或无工作区 ⇒ 读不出 observation 轨迹" };
  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/observation`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { traces, skipped } : { traces, skipped, readFailure: `定位 .shadow/observation 失败：${errText(e)}` };
  }
  let dates: any[] = [];
  try {
    dates = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { traces, skipped } : { traces, skipped, readFailure: `列举 .shadow/observation 失败：${errText(e)}` };
  }
  for (const d of dates) {
    if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
    let files: any[] = [];
    try {
      const dt = await fs.resolve(`${ws}/${SHADOW_ROOT}/observation/${d.name}`, { cwd: ws });
      files = (await fs.listDir(dt)) || [];
    } catch (e: any) {
      if (isNotFound(e)) continue; // 这一天的目录没了 ⇒ 正常跳过（不因此丢掉其它日期）
      return { traces, skipped, readFailure: `列举 .shadow/observation/${d.name} 失败：${errText(e)}` };
    }
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".md")) continue;
      let raw = "";
      try {
        const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/observation/${d.name}/${f.name}`, { cwd: ws });
        raw = await fs.readText(p);
      } catch (e: any) {
        // **单条读失败不得丢弃已累计的样本**（旧版落在外层 catch ⇒ 整体吞掉且与「目录为空」不可区分）。
        skipped += 1;
        continue;
      }
      // 解析失败（`parseObservationTrace` 返回 null = 不是 Observation Trace 文件）也计数：
      // 「这天的目录里有读不回来的东西」与「这天本来就空」对读者是两件事。
      const t = parseObservationTrace(raw);
      if (t) { t.id = f.name.replace(/\.md$/, ""); traces.push(t); }
      else skipped += 1;
    }
  }
  return { traces, skipped };
};
