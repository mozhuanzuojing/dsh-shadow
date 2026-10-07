// dsh-shadow —— reflection/engine.ts：v0.24 Reflection Engine（Candidate Generator）。
// 输入 ObservationTrace[] → Pattern Extraction → Candidate Reflection（status:"candidate"），等确认；不写回 Identity。
// 旁支不是主干：Reflection ≠ Memory 查询。v0.24 只产 candidate，confirmed 留 v0.25；不生成 Candidate Identity Change。
//
// B2/B4/B12/B14/B15（v1.22.x，一次改一类）：
//   · **B2** `reflectOf` 旧版 `catch { /* 旁支降级 */ }`（连 `console.log` 都没有）——
//     而 `.shadow/reflection/` 正是 `readReflections` 随后读回的**唯一载体**（身份演化的输入）
//     ⇒ 不适用正当静默豁免。现在返回 `{ reflection, persist }`，由 `query/observer-kernel.ts`
//     在**同一段输出**里说明「未落盘 + 真实原因」（ADR-0049 规则 2/3；ADR-0085：`console.log` 不算信号）。
//   · **B4** `readReflections` 旧版把「目录不存在」「listDir/readText 失败」「解析失败」并进
//     一个 `catch { /* 无 reflection 目录 */ }` ⇒ 读故障与「还没反思」不可区分，症状是**静默削样本**。
//     现在 `isNotFound` 分离、`JSON`/解析独立 try、坏件**计数**并返回给调用方。
//   · **B12** `reflectTraces` 自称「纯计算」却用 `Math.random()` 造 id ⇒ 同一份输入两次运行得到
//     不同的 `Reflection.id`（与 ADR-0003「派生件可复算」相悖，也让 `reflectTraces` 无法被确定性断言锁住）。
//     现在 id **由调用方注入**（`reflectOf` 用 `core/util.ts#newId`）；函数内不造 id。
//   · **B14** `learning.type` / `status` 是封闭联合，旧版把未校验字符串 `as any` 灌进去
//     （文件里写任何字符串都成为合法值）。现在查成员表，非法值回落安全默认，删掉 `as any`。
//   · **B15** 旧版 `id: m(/^> period: (.*)$/m)` 从**期间**标签读 id —— 而 `renderReflection`
//     **根本不写 id 行**（写的是 observer/status/period/confidence/evidenceCount）⇒ 直接调用
//     `parseReflection` 会得到「2026-09-05 → 2026-09-08」这样的垃圾 id。仓内唯一调用点紧接着用
//     文件名覆盖它，所以今天不显形 —— 这正是它没被发现的原因。**id 只能来自文件名 / 调用方。**
import { SHADOW_ROOT } from "../core/paths.js";
import type { ObservationTrace } from "../core/types.js";
import { completenessOf, type Reflection, type ReflectionLearningType, type ReflectionStatus } from "./types.js";
import { repeatedDecisions, repeatedOutcomes } from "./patterns/decision-outcome.js";
import { decisionOutcomeCorrelation } from "./patterns/success-rate.js";
import { distortionPatterns } from "./patterns/distortion.js";
import { readObservationTraces } from "../subject/observer/trace.js";
import { today, newId, isNotFound, errText } from "../core/util.js";
import type { PersistOutcome } from "../persistence/outcomes.js";
import { scrubUnsafe } from "../security/scrub.js";

export interface ReflectOpts {
  id?: string;
  observerId: string;
  period: { from: string; to: string };
}

/** `learning.type` 的成员表（B14：封闭联合的校验集合，唯一一份）。 */
const LEARNING_TYPES: ReadonlySet<string> = new Set<ReflectionLearningType>(["principle", "anti_pattern", "unknown"]);
/** `status` 的成员表（B14）。 */
const REFLECTION_STATUSES: ReadonlySet<string> = new Set<ReflectionStatus>(["observed", "candidate", "confirmed"]);

// 纯计算：eligible traces → Reflection。完整性闸门（decision+outcome 齐备）before 计算。
// ⚠ **本函数不造 id**（B12）：`opts.id` 由调用方注入（`reflectOf` 用 `newId`）；缺它就返回空串，
// 由调用方决定（`readReflections` 会用文件名覆盖，见 B15 的说明）。
export const reflectTraces = (traces: Partial<ObservationTrace>[], opts: ReflectOpts): Reflection => {
  const eligible = traces.filter((t) => completenessOf(t).reflectionEligible);
  const reDecisions = repeatedDecisions(eligible);
  const reOutcomes = repeatedOutcomes(eligible);
  const corr = decisionOutcomeCorrelation(eligible);
  const devs = distortionPatterns(eligible);
  const top = corr.find((c) => c.count >= 3);
  const rate = top ? top.successRate : 0;
  let type: ReflectionLearningType = "unknown";
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
    id: opts.id || "",
    observerId: opts.observerId,
    sourceTraces,
    period: opts.period,
    observation: { repeatedDecisions: reDecisions, repeatedOutcomes: reOutcomes, deviationPatterns: devs },
    pattern: { decisionOutcomeCorrelation: corr },
    learning: { statement: statement || "（无足够模式：尚无 ≥3 次的 decision→outcome 轨迹）", type, evidenceCount: eligible.length },
    confidence: { score, reasons: [`${eligible.length} 条可参与轨迹`, top ? `${top.count} 次观察` : "不足"] },
    status: "candidate" as ReflectionStatus,
  };
};

/** 一次反思及其**写侧/读侧**降级形状（B2/B4：调用方要能把它们写进输出）。 */
export interface ReflectionOutcome {
  reflection: Reflection;
  /** 反思 markdown 的落盘结果（`ok:false` ⇒ `readReflections` 下次读不到它）。 */
  persist: PersistOutcome;
  /** 轨迹输入的削样本事实（`skipped > 0` / 有 `readFailure` ⇒ 本次反思基于**不完整**样本）。 */
  traces: { skipped: number; readFailure?: string };
}

// 读轨迹 → 反思 → 写 .shadow/reflection/<date>/<id>.md（Reflection ≠ Memory，旁支）。
// id 由本函数注入（B12）：`newId("refl")` 与全仓 id 生成收一处（6 位 base36，够宽以避同毫秒碰撞）。
export const reflectOf = async (fs: any, ws: string, opts: ReflectOpts): Promise<ReflectionOutcome> => {
  const { traces, skipped, readFailure } = await readObservationTraces(fs, ws);
  const id = opts.id || newId("refl");
  const reflection = reflectTraces(traces, { ...opts, id });
  const rel = `${SHADOW_ROOT}/reflection/${today()}/${id}.md`;
  let persist: PersistOutcome = { ok: true };
  if (!fs || !ws) {
    persist = { ok: false, reason: "无 fs 或无工作区 ⇒ 未写 reflection" };
  } else {
    try {
      const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
      await fs.writeText(t, renderReflection(reflection));
    } catch (e: any) {
      persist = { ok: false, reason: `写入 ${rel} 失败：${errText(e)}` };
    }
  }
  return { reflection, persist, traces: { skipped, readFailure } };
};

export const renderReflection = (r: Reflection) => {
  const lines = ["# Reflection"];
  lines.push(`> observer: ${scrubUnsafe(r.observerId)}`);
  lines.push(`> status: ${r.status}`);
  lines.push(`> period: ${r.period.from || "…"} → ${r.period.to || "…"}`);
  lines.push(`> confidence: ${r.confidence.score.toFixed(2)} (${r.confidence.reasons.join("、")})`);
  lines.push(`> evidenceCount: ${r.learning.evidenceCount}`);
  lines.push("");
  lines.push(`learning: ${r.learning.type} · ${r.learning.statement}`);
  lines.push(`observation: repeatedDecisions=${r.observation.repeatedDecisions.join("、") || "—"} · repeatedOutcomes=${r.observation.repeatedOutcomes.join("、") || "—"}`);
  if (r.observation.deviationPatterns.length) lines.push(`deviationPatterns: ${r.observation.deviationPatterns.join("、")}`);
  if (r.pattern.decisionOutcomeCorrelation.length) {
    lines.push("decisionOutcomeCorrelation:");
    for (const c of r.pattern.decisionOutcomeCorrelation.slice(0, 6)) lines.push(`  ${c.decision} → ${c.outcome} (×${c.count} · 成功率 ${(c.successRate * 100).toFixed(0)}%)`);
  }
  return lines.join("\n");
};

// parseReflection：把 reflection markdown 解析回结构化（v0.25 Candidate 消费）。
export const parseReflection = (text: string): Reflection | null => {
  if (!/^# Reflection/m.test(String(text || ""))) return null;
  const m = (re: RegExp) => (String(text || "").match(re) || [])[1] || "";
  const learningRaw = m(/^learning: (.+)$/m);
  const lm = learningRaw.match(/^(\w+) · (.*)$/);
  const corr: any[] = [];
  for (const line of String(text || "").split("\n")) {
    const cm = line.match(/^\s+(.+?) → (.+?) \(×(\d+) · 成功率 (\d+)%\)$/);
    if (cm) corr.push({ decision: cm[1], outcome: cm[2], count: Number(cm[3]) || 0, successRate: (Number(cm[4]) || 0) / 100 });
  }
  const obs = m(/^observation: (.+)$/m);
  const rD = (obs.match(/repeatedDecisions=([^·]*)/) || [])[1]?.trim() || "";
  const learningRawType = lm ? lm[1] : "unknown";
  const statusRaw = m(/^> status: (.+)$/m) || "candidate";
  return {
    // **id 只能来自文件名 / 调用方**（B15）：`renderReflection` 不写 id 行，旧版从 `> period:` 读回来的是
    // 期间串（「2026-09-05 → 2026-09-08」）—— 唯一调用点用文件名覆盖它，所以一直没显形。
    id: "",
    observerId: m(/^> observer: (.+)$/m),
    sourceTraces: [],
    period: { from: m(/^> period: ([^→]*)→/).trim() || "", to: m(/^> period: [^→]*→\s*(.*)$/m).trim() || "" },
    observation: { repeatedDecisions: rD.split("、").filter(Boolean), repeatedOutcomes: [], deviationPatterns: m(/^deviationPatterns: (.+)$/m).split("、").filter(Boolean) },
    pattern: { decisionOutcomeCorrelation: corr },
    // B14：查成员表，非法值回落安全默认（`unknown` / `candidate`），删掉 `as any`。
    learning: { statement: lm ? lm[2] : "", type: LEARNING_TYPES.has(learningRawType) ? (learningRawType as ReflectionLearningType) : "unknown", evidenceCount: Number(m(/^> evidenceCount: (.+)$/m)) || 0 },
    confidence: { score: Number(m(/^> confidence: ([\d.]+)/) || 0) || 0, reasons: [] },
    status: REFLECTION_STATUSES.has(statusRaw) ? (statusRaw as ReflectionStatus) : "candidate",
  };
};

/** 反思读取结果：`reflections` 之外还要带出**被削掉多少**（B4 —— 静默削样本是这条的病根）。 */
export interface ReflectionsRead {
  reflections: Reflection[];
  /** 读不出/不是 Reflection 的文件数（>0 ⇒ 身份演化的输入样本不完整）。 */
  skipped: number;
  /** **目录级**读不出来（不是「还没有 reflection 目录」）的真实原因。 */
  readFailure?: string;
}

// 读取 .shadow/reflection/<date>/<id>.md 全部反思（v0.25 Candidate 输入）。
export const readReflections = async (fs: any, ws: string): Promise<ReflectionsRead> => {
  const reflections: Reflection[] = [];
  let skipped = 0;
  if (!fs || !ws) return { reflections, skipped, readFailure: "无 fs 或无工作区 ⇒ 读不出 reflection" };
  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/reflection`, { cwd: ws });
  } catch (e: any) {
    // 「还没有 reflection 目录」= 正常（还没反思过）；其余（EACCES / 后端故障 / 只读挂载）= 事故。
    return isNotFound(e) ? { reflections, skipped } : { reflections, skipped, readFailure: `定位 .shadow/reflection 失败：${errText(e)}` };
  }
  let dates: any[] = [];
  try {
    dates = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { reflections, skipped } : { reflections, skipped, readFailure: `列举 .shadow/reflection 失败：${errText(e)}` };
  }
  for (const d of dates) {
    if (!d?.name || !/^\d{4}-\d{2}-\d{2}$/.test(d.name)) continue;
    let files: any[] = [];
    try {
      const dt = await fs.resolve(`${ws}/${SHADOW_ROOT}/reflection/${d.name}`, { cwd: ws });
      files = (await fs.listDir(dt)) || [];
    } catch (e: any) {
      if (isNotFound(e)) continue; // 这一天没了 ⇒ 正常跳过（不因此丢掉其它日期）
      return { reflections, skipped, readFailure: `列举 .shadow/reflection/${d.name} 失败：${errText(e)}` };
    }
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".md")) continue;
      let raw = "";
      try {
        const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/reflection/${d.name}/${f.name}`, { cwd: ws });
        raw = await fs.readText(p);
      } catch (e: any) {
        // **单个文件读失败不得丢弃已累计的样本**（旧版落在外层 catch ⇒ 整体吞掉且与「目录为空」不可区分）。
        skipped += 1;
        continue;
      }
      const r = parseReflection(raw);
      if (r) { r.id = f.name.replace(/\.md$/, ""); reflections.push(r); }
      else skipped += 1; // 「读不回来的东西」与「本来就空」对读者是两件事
    }
  }
  return { reflections, skipped };
};
