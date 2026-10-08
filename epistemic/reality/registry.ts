// dsh-shadow —— reality/registry.ts：RealityObservation 注册表（append-only，弱事实，不可篡改）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { RealityObservation } from "./types.js";
import { isNotFound, errText } from "../../core/util.js";

/**
 * 登记一条 RealityObservation。返回**本体 + 是否真的落盘**（v1.15.61）。
 * 旧版写失败只 `console.log` 就 `return ro` ⇒ 调用方随后照常渲染 `[Reality Observation] id …`，
 * **「没写下去」被渲染成「已登记」**（ADR-0049：缺件不静默）。
 */
export const registerObservation = async (fs: any, ws: string, ro: RealityObservation): Promise<{ observation: RealityObservation; persisted: boolean }> => {
  try {
    const rel = `${SHADOW_ROOT}/model/observations/${ro.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(ro));
    return { observation: ro, persisted: true };
  } catch (e: any) {
    console.log("[dsh-shadow] reality observation write failed:", e && e.message);
    return { observation: ro, persisted: false };
  }
};

/**
 * 读 RealityObservation，并**区分「还没有」与「读不出」**（v1.15.61）。
 *
 * 旧实现把整个循环包在一个 `try` 里、外层 `catch {}`：结果是
 *   ① 第 k 个文件解析失败 ⇒ **静默返回前 k-1 条**，后面的文件永不读；
 *   ② 目录读失败与目录为空**不可区分**；
 *   ③ 调用方无法区分「观测只有 2 条」与「10 条里 8 条坏了」——
 *      而下游 `claimOf` 的 `supported` 判据恰恰吃 `obs.length`（ADR-0049 的反面）。
 */
export interface ObservationsRead {
  observations: RealityObservation[];
  /** 单条坏件数（>0 ⇒ 下游 `claimOf` 的 `supported` 判据吃 `obs.length`，结论基于不完整输入）。 */
  corrupt: number;
  /**
   * **目录级读不出来**的真实原因（EACCES / 后端故障 / 只读挂载）—— 「还没有 `model/observations` 目录」
   * **不算**（那是全新工作区，正常空值）。
   *
   * **B4 同类补扫（v1.22.x；规格轴复审 (a)-2）**：旧版外层只有一个「无 model 目录」注释的 `catch`，
   * 于是「读不出来」与「真的还没有」给出**逐字相同**的返回值 ⇒ 事故被读成「观测只有这些」，
   * 而下游 `claimOf` 的 `supported` 恰恰吃 `obs.length`（ADR-0049 的反面）。判据复用 `core/util.ts#isNotFound`。
   */
  readFailure?: string;
}

export const readObservationsDetailed = async (fs: any, ws: string, subjectRef?: string): Promise<ObservationsRead> => {
  const out: RealityObservation[] = [];
  let corrupt = 0;
  if (!fs || !ws) return { observations: out, corrupt, readFailure: "无 fs 或无工作区 ⇒ 读不出 model/observations" };
  let root: any;
  try {
    root = await fs.resolve(`${ws}/${SHADOW_ROOT}/model/observations`, { cwd: ws });
  } catch (e: any) {
    return isNotFound(e) ? { observations: out, corrupt } : { observations: out, corrupt, readFailure: `定位 model/observations 失败：${errText(e)}` };
  }
  let files: any[] = [];
  try {
    files = (await fs.listDir(root)) || [];
  } catch (e: any) {
    return isNotFound(e) ? { observations: out, corrupt } : { observations: out, corrupt, readFailure: `列举 model/observations 失败：${errText(e)}` };
  }
  for (const f of files) {
    if (!f?.name || !f.name.endsWith(".json")) continue;
    try {
      const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/model/observations/${f.name}`, { cwd: ws });
      const ro = JSON.parse(await fs.readText(p));
      if (subjectRef && ro.subjectRef !== subjectRef) continue;
      out.push(ro);
    } catch {
      // **单条坏件只丢这一条**（不再中断整个循环），但**必须计数**
      corrupt += 1;
      console.log(`[dsh-shadow] reality observation 坏件（已跳过并计数）：${f.name}`);
    }
  }
  return { observations: out, corrupt };
};
