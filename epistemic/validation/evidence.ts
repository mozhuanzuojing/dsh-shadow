// dsh-shadow —— validation/evidence.ts：FutureEvidence + Hypothesis 存取（独立存储，Memory ≠ Evidence）。
// .shadow/future-evidence/<id>.json；.shadow/hypothesis/<id>.json（dream 产出的假设，读侧供 validate）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { FutureEvidence } from "./types.js";
import type { Hypothesis } from "../../selfhood/dream/types.js";
import { today, newId, isNotFound, errText } from "../../core/util.js";

/**
 * 写一条 hypothesis。**返回是否真的落盘**（v1.15.55）。
 *
 * 旧版只 `console.log` 就返回 ⇒ 调用方随后照样播报「生成了 N 条假设」，
 * 而磁盘上可能 0 条；之后 `mode:validate` 会回「无 hypothesis」，
 * 使用者看到的是「假设消失了」而不是「当时就没写下去」。
 */
export const writeHypothesis = async (fs: any, ws: string, h: Hypothesis): Promise<boolean> => {
  try {
    const rel = `${SHADOW_ROOT}/hypothesis/${h.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(h));
    return true;
  } catch (e: any) {
    console.log("[dsh-shadow] hypothesis write failed:", e && e.message);
    return false;
  }
};

/**
 * 读一条 hypothesis。**三态**（B4 同类补扫，v1.22.x；规格轴复审 (a)-2）：
 *   · 真的还没有 `hypothesis/<id>.json` ⇒ `{ hypothesis: null }`（全新流程，正常）；
 *   · 文件在、但不是合法 JSON ⇒ `{ hypothesis: null, corrupt: true }`；
 *   · 读不出来（EACCES / 后端故障 / 只读挂载）⇒ `{ hypothesis: null, readFailure }`。
 *
 * 旧实现只有一个 `catch { return null; }` ⇒ 「没生成过」与「读不出来/坏件」给出**完全相同**的结果，
 * 而 `mode:"validate"` 随后渲染的是「（无 hypothesis …：请先 mode:offline 生成假设）」——
 * 把**事故**说成**用户还没做那一步**（ADR-0049：缺件不静默）。
 */
export interface HypothesisRead {
  hypothesis: Hypothesis | null;
  /** 文件在、但内容不可用（不是 JSON）。 */
  corrupt?: boolean;
  /** 读不出来（非「不存在」）的真实原因。 */
  readFailure?: string;
}

export const readHypothesis = async (fs: any, ws: string, id: string): Promise<HypothesisRead> => {
  if (!fs || !ws) return { hypothesis: null, readFailure: "无 fs 或无工作区 ⇒ 读不出 hypothesis" };
  let target: any;
  try {
    target = await fs.resolve(`${ws}/${SHADOW_ROOT}/hypothesis/${id}.json`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { hypothesis: null } : { hypothesis: null, readFailure: `定位 hypothesis/${id}.json 失败：${errText(e)}` };
  }
  let raw = "";
  try {
    raw = await fs.readText(target);
  } catch (e: any) {
    return isNotFound(e) ? { hypothesis: null } : { hypothesis: null, readFailure: `读取 hypothesis/${id}.json 失败：${errText(e)}` };
  }
  if (!raw) return { hypothesis: null };
  try {
    return { hypothesis: JSON.parse(raw) as Hypothesis };
  } catch {
    return { hypothesis: null, corrupt: true };
  }
};

/**
 * 登记一条 FutureEvidence。返回**证据本体 + 是否真的落盘**（v1.15.55）。
 *
 * 旧版落盘失败也返回 `full` ⇒ 调用方播报 `[Evidence] registered <id>` 当成功，
 * 之后 `mode:validate` 读不到它 ⇒ `applied` 变小、结论从 validated 掉回 observed/rejected，
 * 而且**没有任何地方说明为什么**。
 */
export const registerFutureEvidence = async (fs: any, ws: string, ev: { hypothesisId: string; observedAt: string; actualOutcome: string; observationType: string; sourceTraceIds?: string[]; createdAt?: string; id?: string }): Promise<{ evidence: FutureEvidence; persisted: boolean }> => {
  const id = ev.id || newId("ev");   // A12：id 生成**收一处**到 `core/util.ts`
  const full: FutureEvidence = { ...ev, sourceTraceIds: ev.sourceTraceIds || [], id, createdAt: ev.createdAt || today() } as FutureEvidence;
  try {
    const rel = `${SHADOW_ROOT}/future-evidence/${id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(full));
    return { evidence: full, persisted: true };
  } catch (e: any) {
    console.log("[dsh-shadow] future evidence write failed:", e && e.message);
    return { evidence: full, persisted: false };
  }
};

/**
 * 读 FutureEvidence（可按 `hypothesisId` 过滤）。**B4 同类补扫（v1.22.x；规格轴复审 (a)-2）**：
 *   · `skipped` —— 单条读不出/坏件而**跳过**的条数（旧实现把整个循环放在一个 `try` 里 ⇒ 第 k 个文件坏就
 *     **静默返回前 k-1 条**，后面的永不读；而 `mode:"validate"` 的 `applied`/结论恰恰吃这个列表长度）；
 *   · `readFailure` —— **目录级读不出来**（「还没有 `future-evidence/` 目录」**不算**）。
 * 两者都必须能说出口：`applied` 从 5 掉到 3 与「本来就只有 3 条」在输出上必须可区分（ADR-0049）。
 */
export interface FutureEvidenceRead {
  evidence: FutureEvidence[];
  skipped: number;
  readFailure?: string;
}

export const readFutureEvidence = async (fs: any, ws: string, hypothesisId?: string): Promise<FutureEvidenceRead> => {
  const out: FutureEvidence[] = [];
  let skipped = 0;
  if (!fs || !ws) return { evidence: out, skipped, readFailure: "无 fs 或无工作区 ⇒ 读不出 future-evidence" };
  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/future-evidence`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { evidence: out, skipped } : { evidence: out, skipped, readFailure: `定位 future-evidence 失败：${errText(e)}` };
  }
  let files: any[] = [];
  try {
    files = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { evidence: out, skipped } : { evidence: out, skipped, readFailure: `列举 future-evidence 失败：${errText(e)}` };
  }
  for (const f of files) {
    if (!f?.name || !f.name.endsWith(".json")) continue;
    let ev: any;
    try {
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/future-evidence/${f.name}`, { cwd: ws });
      ev = JSON.parse(await fs.readText(p));
    } catch {
      skipped += 1; // **单条坏件只丢这一条**，绝不中断整轮（旧实现会静默截断）
      continue;
    }
    if (hypothesisId && ev.hypothesisId !== hypothesisId) continue;
    out.push(ev);
  }
  return { evidence: out, skipped };
};
