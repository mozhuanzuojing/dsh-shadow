// dsh-shadow —— federation/reality.ts：G2 Reality Evidence Registry（弱事实，append-only，Observer 只能引用不能拥有）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { RealityEvidence } from "./types.js";
import { today, isNotFound, newId, errText } from "../../core/util.js";

export const registerRealityEvidence = async (fs: any, ws: string, ev: { observedAt?: string; source: string; observation: string; linkedHypothesis?: string[] }): Promise<{ evidence: RealityEvidence; persisted: boolean }> => {
  const full: RealityEvidence = {
    id: newId("re"),   // A12：id 生成**收一处**到 `core/util.ts`（此前 7 个模块各写一遍，且位宽分叉）
    observedAt: ev.observedAt || today(),
    source: ev.source,
    observation: ev.observation,          // 弱事实："某事件在某时间被观察到"
    linkedHypothesis: ev.linkedHypothesis || [],
    referencedBy: [],
    status: "observed",
  };
  try {
    const rel = `${SHADOW_ROOT}/reality/${full.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(full));
    return { evidence: full, persisted: true };
  } catch (e: any) {
    console.log("[dsh-shadow] reality evidence write failed:", e && e.message);
    return { evidence: full, persisted: false }; // **没落盘就说没落盘**（旧版照常渲染成功）
  }
};

/**
 * 给一条 reality evidence 追加 `referencedBy`。
 *
 * 返回**带原因的三态**（v1.15.61）：旧版把所有异常压成 `null`，调用方渲染成
 * 「（无 reality evidence X）」—— **把「工具报错/坏件」当成「不存在」**。
 * 一条存在的证据若因缺 `referencedBy` 字段（旧版本/手工编辑）而抛错，读的人会以为它根本没被登记过。
 */
export const referenceEvidence = async (fs: any, ws: string, id: string, observerId: string): Promise<{ evidence: RealityEvidence | null; reason?: "not_found" | "unreadable" }> => {
  let txt = "";
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality/${id}.json`, { cwd: ws });
    txt = await fs.readText(t);
  } catch (e: any) {
    // v1.15.94：判据收一处到 `core/util.ts` 的 `isNotFound`（原先本文件只看 message、
    // 且正则里没有 `no such file`，与 `evidence/filesystem.ts` 的那份**不同**）。
    return { evidence: null, reason: isNotFound(e) ? "not_found" : "unreadable" };
  }
  try {
    const ev = JSON.parse(txt);
    if (!ev || !Array.isArray(ev.referencedBy)) return { evidence: null, reason: "unreadable" }; // 形状不对 = 坏件
    // append-only：只追加 referencedBy，不改 observation/observedAt（弱事实不可篡改）
    if (!ev.referencedBy.includes(observerId)) ev.referencedBy.push(observerId);
    const t2 = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality/${id}.json`, { cwd: ws });
    await fs.writeText(t2, JSON.stringify(ev));
    return { evidence: ev };
  } catch {
    return { evidence: null, reason: "unreadable" };
  }
};

/** 读全部 reality evidence，并**区分「还没有」与「读不出」**（v1.15.61，与 registry/claims 同型）。 */
export interface RealityEvidenceRead {
  evidence: RealityEvidence[];
  /** 单条坏件数（>0 ⇒ 下游「弱事实只有这些」的读数基于不完整输入）。 */
  corrupt: number;
  /**
   * **目录级读不出来**的真实原因（「还没有 `.shadow/reality` 目录」**不算**）。
   *
   * **B4 同类补扫（v1.22.x；规格轴复审 (a)-2）**：旧版外层只有一个「无 reality 目录」注释的 `catch`，把
   * 「读不出来」与「真的还没有」压成同一个返回值。
   * ⚠ **消费点已接（v1.22.2）**：`query/federation.ts` 的 stability 分支改用 `readRealityEvidenceDetailed`
   * 并把 `readFailure` 打进输出；**薄包装 `readRealityEvidence` 随之删除**（它拿不到这个字段，
   * 留着只会让下一个调用方再踩一遍「读不出来 = 没有」）。
   */
  readFailure?: string;
}

export const readRealityEvidenceDetailed = async (fs: any, ws: string): Promise<RealityEvidenceRead> => {
  const out: RealityEvidence[] = [];
  let corrupt = 0;
  if (!fs || !ws) return { evidence: out, corrupt, readFailure: "无 fs 或无工作区 ⇒ 读不出 .shadow/reality" };
  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { evidence: out, corrupt } : { evidence: out, corrupt, readFailure: `定位 .shadow/reality 失败：${errText(e)}` };
  }
  let files: any[] = [];
  try {
    files = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { evidence: out, corrupt } : { evidence: out, corrupt, readFailure: `列举 .shadow/reality 失败：${errText(e)}` };
  }
  for (const f of files) {
    if (!f?.name || !f.name.endsWith(".json")) continue;
    try {
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/reality/${f.name}`, { cwd: ws });
      out.push(JSON.parse(await fs.readText(p)));
    } catch {
      corrupt += 1;
      console.log(`[dsh-shadow] reality evidence 坏件（已跳过并计数）：${f.name}`);
    }
  }
  return { evidence: out, corrupt };
};

export const renderRealityEvidence = (ev: RealityEvidence) => {
  const lines = ["[Reality Evidence]"];
  lines.push(`id ${ev.id} · ${ev.observedAt} · source ${ev.source}`);
  lines.push(`observation ${ev.observation}（弱事实：只记录观察到，不解释规律）`);
  lines.push(`linkedHypothesis ${ev.linkedHypothesis.join("、") || "—"} · referencedBy ${ev.referencedBy.join("、") || "—"} status ${ev.status}`);
  return lines.join("\n");
};
