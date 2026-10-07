// dsh-shadow —— continuity/engine.ts：Observer Continuity Storage Boundary 构建/读取（守卫 232–236）。
import type { ObserverConfig, ObserverBoundary, RecallIndex, ContinuityRecord, WorkspaceRecord } from "./types.js";
import { assertObserverLayerClean, assertObserverLayerNoWorkspaceFact, assertConfigNotPreference, assertRecallIndexNav, assertWorkspaceIsolated, argsHasForbiddenContent } from "./guard.js";
import { writeObserverConfig, writeObserverBoundary, writeRecallIndex, writeLineage, writeWorkspaceRecord, readObserverBoundary, readRecallIndex, readLineage } from "./persist.js";
import { WORKSPACE_SHADOW_ROOT } from "../../core/paths.js";
import { today, isNotFound, errText } from "../../core/util.js";

const cleanGuard = (obj: any): { ok: boolean; reason?: string } => {
  const a = assertObserverLayerClean(obj); if (!a.ok) return { ok: false, reason: a.reason };
  const b = assertObserverLayerNoWorkspaceFact(obj); if (!b.ok) return { ok: false, reason: b.reason };
  return { ok: true };
};

export const buildObserverConfig = (args: any): { ok: boolean; reason?: string; config?: ObserverConfig } => {
  if (argsHasForbiddenContent(args)) return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
  const config: ObserverConfig = { interactionStyle: String(args?.interactionStyle || "default"), outputPreference: String(args?.outputPreference || "adr"), defaultProtocol: String(args?.defaultProtocol || "boundary-first") };
  const c = cleanGuard(config); if (!c.ok) return { ok: false, reason: c.reason };
  const p = assertConfigNotPreference(config); if (!p.ok) return { ok: false, reason: p.reason };
  return { ok: true, config };
};

export const buildObserverBoundary = (args: any): { ok: boolean; reason?: string; boundary?: ObserverBoundary } => {
  if (argsHasForbiddenContent(args)) return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
  const boundary: ObserverBoundary = { planningCannotCreateObjective: Boolean(args?.planningCannotCreateObjective), recallCannotCreateKnowledge: Boolean(args?.recallCannotCreateKnowledge), adaptationCannotIncreaseAuthority: Boolean(args?.adaptationCannotIncreaseAuthority), delegationCannotExpandAuthority: Boolean(args?.delegationCannotExpandAuthority), agencyCannotCreatePurpose: Boolean(args?.agencyCannotCreatePurpose) };
  const c = cleanGuard(boundary); if (!c.ok) return { ok: false, reason: c.reason };
  return { ok: true, boundary };
};

export const buildRecallIndex = (args: any): { ok: boolean; reason?: string; index?: RecallIndex } => {
  if (argsHasForbiddenContent(args)) return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
  const index: RecallIndex = { workspace: String(args?.workspace || ""), records: (args?.records as any[]) || [] };
  const c = cleanGuard(index); if (!c.ok) return { ok: false, reason: c.reason };
  const n = assertRecallIndexNav(index); if (!n.ok) return { ok: false, reason: n.reason };
  return { ok: true, index };
};

export const buildLineage = (args: any): { ok: boolean; reason?: string; record?: ContinuityRecord } => {
  if (argsHasForbiddenContent(args)) return { ok: false, reason: "Global Shadow 只存 observer 层：禁 goal/objective/knowledge/content/memory/likes/preference/identity/value" };
  const record: ContinuityRecord = { observerId: String(args?.observerId || "observer"), continuityRef: String(args?.continuityRef || ""), createdAt: today() };
  const c = cleanGuard(record); if (!c.ok) return { ok: false, reason: c.reason };
  return { ok: true, record };
};

export const buildWorkspaceRecord = (args: any): { ok: boolean; reason?: string; record?: WorkspaceRecord } => {
  const record: WorkspaceRecord = { workspace: String(args?.workspace || ""), kind: String(args?.kind || "observation"), content: String(args?.content || ""), createdAt: today() };
  const w = assertWorkspaceIsolated(record); if (!w.ok) return { ok: false, reason: w.reason };
  return { ok: true, record };
};

export const readObserverContext = async (fs: any, root: string) => {
  // 三件都返回**三态**（`{ok,value,reason}`，见 persist.ts 文件头）—— 读侧不再把
  // 「还没有」与「读不出来」合并成一个 null；调用方据此在输出里留痕（ADR-0049）。
  const boundary = await readObserverBoundary(fs, root);
  const lineage = await readLineage(fs, root);
  const index = await readRecallIndex(fs, root);
  return { boundary, lineage, index };
};

// 读取当前 workspace（ws）的 world 层记录；只返回 workspace===ws 的记录（235 隔离：不跨项目、不落全局）。
// v1.15.12 修正：listDir 必须收 **resolve() 产出的 FsTarget**。
//   旧写法字面构造 `{ targetKey: base, displayPath: base }` 违反 dsh-fs 书面契约
//   （`resolve()` 的注释：*returns the stable target; the same file yields the same `targetKey`*）——
//   `targetKey` 是 branded 值，**不是随便写的路径字符串**。local 后端恰好拿路径当 key 才没炸；
//   **sandbox / 隔离后端下 key 不是路径**，会静默失败，而下面的 `catch` 把它吞成「无记录」。
//   同一函数第 66 行本来就用对了 `fs.resolve(...)`，这次把不一致消掉。
//
// **B4（同一类 `catch` 的漏项，v1.22.x）**：旧实现把「目录不存在」「listDir/readText 失败」
// 「JSON 坏件」三件事并进一个 `catch { /* 无记录 */ }` ⇒ 只读挂载 / 后端故障读出来与
// 「还没有 world 记录」**逐字不可区分**。现在：`isNotFound` ⇒ 正常空；其余 ⇒ 带真实原因返回，
// 由调用方（`query/contverify.ts` 的 `mode:"workspace-context"`）在输出里说明「读的是部分/空」。
export const readWorkspaceContext = async (fs: any, ws: string): Promise<{ rows: any[]; readFailure?: string }> => {
  const rows: any[] = [];
  const base = `${ws}/${WORKSPACE_SHADOW_ROOT}`;
  let baseTarget: any;
  try {
    baseTarget = await fs.resolve(base, { cwd: ws });
  } catch (e: any) {
    if (isNotFound(e)) return { rows }; // 真的还没有 world 层 ⇒ 正常空值
    return { rows, readFailure: `定位 \`${base}\` 失败：${errText(e)}` };
  }
  let dirs: any[] = [];
  try {
    dirs = (await fs.listDir(baseTarget)) || [];
  } catch (e: any) {
    if (isNotFound(e)) return { rows };
    return { rows, readFailure: `列举 \`${base}\` 失败：${errText(e)}` };
  }
  let badFiles = 0;
  for (const d of dirs) {
    const kindBase = `${base}/${d.name}`;
    let kindTarget: any;
    let files: any[] = [];
    try {
      kindTarget = await fs.resolve(kindBase, { cwd: ws });
      files = (await fs.listDir(kindTarget)) || [];
    } catch (e: any) {
      if (isNotFound(e)) continue; // 单个 kind 目录消失 ⇒ 跳过（不因此丢掉其它 kind）
      return { rows, readFailure: `列举 \`${kindBase}\` 失败：${errText(e)}` };
    }
    for (const f of files) {
      const p = `${kindBase}/${f.name}`;
      let raw = "";
      try {
        const t = await fs.resolve(p, { cwd: ws });
        raw = await fs.readText(t);
      } catch (e: any) {
        // 单条读失败**不得**丢弃已累计的记录（旧版落在外层 catch ⇒ 整体吞掉）。
        if (!isNotFound(e)) return { rows, readFailure: `读取 \`${p}\` 失败：${errText(e)}` };
        continue;
      }
      if (!raw) continue;
      try {
        const r = JSON.parse(raw);
        if (r.workspace === ws) rows.push(r);
      } catch {
        badFiles += 1; // **坏件计数**（旧版与「没有记录」不可区分）
      }
    }
  }
  return badFiles ? { rows, readFailure: `${badFiles} 份 world 记录**无法解析**（已跳过）：上面的列表基于被削过的样本` } : { rows };
};

export const readContinuityIndex = async (fs: any, root: string) => readRecallIndex(fs, root);
