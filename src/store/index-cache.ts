/**
 * v2 store — 每个 workspace 一个 SQLite 句柄；关闭由插件 cleanup 负责。
 */

import { INDEX_DB } from "../contract/paths.js";
import { err, ok, type Outcome } from "../contract/outcome.js";
import type { ParsedAtom } from "../contract/types.js";
import { hashBody, IndexDb } from "./index-db.js";
import type { FsPort } from "./fs.js";

const norm = (ws: string): string => String(ws).replace(/\\/g, "/").replace(/\/+$/, "");

export class IndexCache {
  private map = new Map<string, IndexDb>();

  async get(fs: FsPort, ws: string): Promise<Outcome<IndexDb>> {
    const key = norm(ws);
    const hit = this.map.get(key);
    if (hit) return ok(hit);
    const opened = await IndexDb.open(`${key}/${INDEX_DB}`);
    if (!opened.ok) return opened;
    this.map.set(key, opened.value);
    return opened;
  }

  /** 读时增量对账：count 不符 → 整库重建；否则只 upsert 内容变化/新增的 rel。 */
  sync(index: IndexDb, atoms: ParsedAtom[]): Outcome<{ added: number; removed: number }> {
    const count = index.count();
    if (count !== atoms.length) {
      const r = index.replaceAll(atoms);
      return r.ok ? ok({ added: atoms.length, removed: 0 }) : r;
    }
    const hashes = index.hashMap();
    const changed = atoms.filter((a) => hashes.get(a.rel) !== hashBody(a.body));
    if (changed.length) {
      const u = index.upsert(changed);
      if (!u.ok) return u;
    }
    const keep = new Set(atoms.map((a) => a.rel));
    const removed = index.removeMissing(keep);
    if (!removed.ok) return removed;
    return ok({ added: changed.length, removed: removed.value.removed });
  }

  closeAll(): void {
    for (const db of this.map.values()) db.close();
    this.map.clear();
  }
}

export const indexUnavailable = (message: string): Outcome<never> =>
  err("UNAVAILABLE", message, undefined, true);
