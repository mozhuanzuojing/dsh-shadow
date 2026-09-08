// dsh-shadow —— query/materialize.ts：把「读记忆→过滤遗忘/收口→parseMemory」脚手架收敛成一次（唯一定义）。
// 历史摩擦：query.ts 里这段被复制粘贴 7–12 次（listMemories/readMeta/readRel/parseMemory/isForgettable/isCompacted ×N）。
// 本模块把它集中为一处（locality），供所有「读记忆的查询」复用，消除副本。
import { listMemories, readRel } from "../persistence/files.js";
import { readMeta } from "../persistence/meta.js";
import { isForgettable, isCompacted } from "../core/forget.js";
import { parseMemory } from "../core/episode.js";

export interface MaterializedView {
  memories: any[];          // 过滤后的记忆条目（{date,time,name,rel}）
  parsed: any[];            // parseMemory 结果（含 kind/lineage）
  meta: any;                // _meta.json（status/寿命）
  config: any;              // 原 config（供分支读 forget/context 等）
}

/** 唯一一次「物化」：读全部记忆 → 剔除遗忘/收口 → parseMemory。 */
export const materializeAtoms = async (fs: any, ws: string, config: any): Promise<MaterializedView> => {
  let memories = await listMemories(fs, ws);
  const meta = await readMeta(fs, ws);
  const forget = config?.forget ?? {};
  memories = memories.filter((mm: any) => !isForgettable(mm.rel, meta, forget) && !isCompacted(meta, mm.rel));
  const parsed: any[] = [];
  for (const mm of memories) {
    const text = await readRel(fs, ws, mm.rel);
    if (!text) continue;
    try { parsed.push(parseMemory(text, mm.rel, mm.name)); } catch { /* 单条解析失败跳过 */ }
  }
  return { memories, parsed, meta, config };
};
