// dsh-shadow —— continuity/persist.ts：双层存储边界持久化。
// Global ~/.dsh-observer（observer 层）：observer/{config,boundary}.json + recall-index/index.json + lineage/continuity.json。
// Workspace ~/.dsh-shadow（world 层）：<ws>/.dsh-shadow/<kind>/<id>.json。
//
// ## 为什么五个 `write*` 全都返回三态（P0，ADR-0049 规则 2/3）
//
// 旧形态是 `Promise<void>` + `catch (err) { console.log(...) }`：**写失败与写成功在调用方眼里逐字相同**，
// 而唯一租户 `query/contverify.ts` 紧接着无条件渲染 `[Observer Config] …` 这类**成功文案**
// ⇒ 读者据此认为「已配置」，而 `mode:"observer-context"` 下一次读会返回空。那不是「降级」，是**冒充成功**
//（ADR-0049 规则 3 明文禁止）。`console.log` **不算**可见信号（ADR-0085）。
//
// 现在返回 `{ ok, reason }`（形状收在 `persistence/outcomes.ts`，与 `AppendOutcome` 同一份），
// 由调用方把「未落盘 + 真实原因」写进**它自己的输出**里 —— 读者在同一段文本里就能看到。
//
// ## 读侧：**「还没有这个文件」与「读不出来」必须分开**（B4）
//
// 旧形态 `catch { return null }` 把 EACCES / 只读挂载 / 后端故障 / JSON 坏件 与「还没采集」
// 合并成同一个 `null`，两者后果**相反**（前者正常、后者是事故）。现在判据复用 `core/util.ts#isNotFound`，
// 且 `JSON.parse` 与 `readText` **分开 try**（坏件要有自己的原因，不能借读失败的说辞）。
import path from "node:path";
import os from "node:os";
import { WORKSPACE_SHADOW_ROOT, OBSERVER_GLOBAL_ROOT } from "../../core/paths.js";
import { isNotFound, errText } from "../../core/util.js";
import type { PersistOutcome, ReadOutcome } from "../../persistence/outcomes.js";
import type { ObserverConfig, ObserverBoundary, RecallIndex, ContinuityRecord, WorkspaceRecord } from "./types.js";

export const DEFAULT_OBSERVER_ROOT = path.join(os.homedir(), OBSERVER_GLOBAL_ROOT);

/** 写一个 JSON（**唯一一份**）—— 五个 `write*` 共用，免得「失败原因」五处各写一遍。 */
const writeJson = async (fs: any, ws: string, rel: string, body: unknown, what: string): Promise<PersistOutcome> => {
  if (!fs || !ws) return { ok: false, reason: `无 fs 或无根路径 ⇒ 未写 ${what}` };
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(body));
    return { ok: true };
  } catch (e: any) {
    // 真实原因原样带出（不写死「不可写」—— 磁盘满 / EACCES / 后端故障的处置不同）。`what` 让调用方
    // 的标签与目标路径都出现在同一句里（例：「未落盘（写入 observer/config.json 失败：readonly）」）。
    return { ok: false, reason: `写入 ${what} 失败：${errText(e)}` };
  }
};

/**
 * 读一个 JSON（**唯一一份**）—— 三个 `read*` 共用。三态语义见文件头：
 * `ok:true,value:null` = 真的还没有（正常）；`ok:false` = 读不出来 / 坏件（事故，调用方必须留痕）。
 * 原因里**不带文件名** —— 调用方的标签已经点明了是哪一个（免得同一句里出现两遍）。
 */
const readJson = async <T>(fs: any, root: string, rel: string): Promise<ReadOutcome<T>> => {
  if (!fs || !root) return { ok: false, value: null, reason: "无 fs 或无根路径 ⇒ 读不出" };
  let target: any;
  try {
    target = await fs.resolve(`${root}/${rel}`, { cwd: root });
  } catch (e: any) {
    return isNotFound(e) ? { ok: true, value: null } : { ok: false, value: null, reason: `定位失败：${errText(e)}` };
  }
  let raw = "";
  try {
    raw = await fs.readText(target);
  } catch (e: any) {
    return isNotFound(e) ? { ok: true, value: null } : { ok: false, value: null, reason: `读取失败：${errText(e)}` };
  }
  if (!raw) return { ok: true, value: null };
  // **`JSON.parse` 独立 try**（B4）：它与 readText 是两种不同的失败，混在一起会让坏件借读失败的说辞。
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (e: any) {
    return { ok: false, value: null, reason: `**坏件**（无法解析）：${errText(e)}` };
  }
};

export const writeObserverConfig = async (fs: any, root: string, c: ObserverConfig): Promise<PersistOutcome> =>
  writeJson(fs, root, "observer/config.json", c, "observer/config.json");
export const writeObserverBoundary = async (fs: any, root: string, b: ObserverBoundary): Promise<PersistOutcome> =>
  writeJson(fs, root, "observer/boundary.json", b, "observer/boundary.json");
export const writeRecallIndex = async (fs: any, root: string, ri: RecallIndex): Promise<PersistOutcome> =>
  writeJson(fs, root, "recall-index/index.json", ri, "recall-index/index.json");
export const writeLineage = async (fs: any, root: string, lr: ContinuityRecord): Promise<PersistOutcome> =>
  writeJson(fs, root, "lineage/continuity.json", lr, "lineage/continuity.json");
export const writeWorkspaceRecord = async (fs: any, ws: string, r: WorkspaceRecord): Promise<PersistOutcome> =>
  // 文件名带 `Date.now()`：每次写一份**不可变**记录（world 层只追加，不覆盖）。
  writeJson(fs, r.workspace, `${WORKSPACE_SHADOW_ROOT}/${r.kind}/${Date.now()}.json`, r, `${WORKSPACE_SHADOW_ROOT}/${r.kind}/<id>.json`);

/** observer 层三件读取（`observer-context` / `continuity-index` 用）。 */
export const readObserverBoundary = (fs: any, root: string): Promise<ReadOutcome<ObserverBoundary>> =>
  readJson<ObserverBoundary>(fs, root, "observer/boundary.json");
export const readRecallIndex = (fs: any, root: string): Promise<ReadOutcome<RecallIndex>> =>
  readJson<RecallIndex>(fs, root, "recall-index/index.json");
export const readLineage = (fs: any, root: string): Promise<ReadOutcome<ContinuityRecord>> =>
  readJson<ContinuityRecord>(fs, root, "lineage/continuity.json");
