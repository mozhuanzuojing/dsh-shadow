// dsh-shadow —— reality/claim/persist.ts：RealityClaim 持久化（append-only，RealityModel immutable history）。
import { SHADOW_ROOT } from "../../core/paths.js";
import type { RealityClaim } from "../types.js";

/** 写一条 RealityClaim。返回**是否真的落盘**（v1.15.61，旧版只 log 就返回 void）。 */
export const writeClaim = async (fs: any, ws: string, c: RealityClaim): Promise<boolean> => {
  try {
    const rel = `${SHADOW_ROOT}/model/claims/${c.id}.json`;
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(c));
    return true;
  } catch (e: any) {
    console.log("[dsh-shadow] reality claim write failed:", e && e.message);
    return false;
  }
};

/**
 * 读 RealityClaim，并**区分「还没有」与「读不出」**（v1.15.61）。
 *
 * 旧实现的整个循环在一个 `try` 里 ⇒ 第 k 个文件坏就**静默返回前 k-1 条**（后续永不读）。
 * 这在本文件尤其危险：`mode:"world"` 会把**由残缺 claims 建出的图写回** `graph.json`，
 * 于是一份坏 claim 能让落盘图被更小的图**覆盖**（不可逆）。故单条坏件只丢这一条并**计数**。
 */
export const readClaimsDetailed = async (fs: any, ws: string): Promise<{ claims: RealityClaim[]; corrupt: number }> => {
  const out: RealityClaim[] = [];
  let corrupt = 0;
  try {
    const root = await fs.resolve(`${ws}/${SHADOW_ROOT}/model/claims`, { cwd: ws });
    const files = (await fs.listDir(root).catch(() => [])) || [];
    for (const f of files) {
      if (!f?.name || !f.name.endsWith(".json")) continue;
      try {
        const p = await fs.resolve(`${ws}/${SHADOW_ROOT}/model/claims/${f.name}`, { cwd: ws });
        out.push(JSON.parse(await fs.readText(p)));
      } catch {
        corrupt += 1;
        console.log(`[dsh-shadow] reality claim 坏件（已跳过并计数）：${f.name}`);
      }
    }
  } catch { /* 无 claims 目录（真的还没有） */ }
  return { claims: out, corrupt };
};

export const readClaims = async (fs: any, ws: string): Promise<RealityClaim[]> =>
  (await readClaimsDetailed(fs, ws)).claims;
