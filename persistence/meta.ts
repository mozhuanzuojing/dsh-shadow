import { SHADOW_ROOT } from "../core/paths.js";

// dsh-shadow —— persistence/meta.ts：_meta.json 派生状态读写（Derived Artifact）。
// 派生约定（ADR-0003 §3-7）：Memory 文件（.shadow/<date>/<time>-<entry>.md）是 source of truth；
// _meta.json / _recall_log.json / _index.md 都是可从 Memory 重建的派生物，坏了用 rebuild-index 重建。
// 从 index.ts 迁出。
export const readMeta = async (fs: any, ws: string) => {
  if (!fs || !ws) return {};
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_meta.json`, { cwd: ws });
    const txt = await fs.readText(t);
    return txt ? (JSON.parse(txt) || {}) : {};
  } catch {
    return {};
  }
};

export const writeMeta = async (fs: any, ws: string, meta: any) => {
  if (!fs || !ws) return;
  try {
    const t = await fs.resolve(`${ws}/${SHADOW_ROOT}/_meta.json`, { cwd: ws });
    await fs.writeText(t, JSON.stringify(meta));
  } catch (e: any) {
    console.log("[dsh-shadow] meta write failed:", e && e.message);
  }
};
