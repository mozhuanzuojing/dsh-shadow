/**
 * v2 store — 每个 workspace 一个 SQLite 句柄；关闭由插件 cleanup 负责。
 */

import { INDEX_DB } from "../contract/paths.js";
import { ok, type Outcome } from "../contract/outcome.js";
import type { ParsedAtom } from "../contract/types.js";
import { listAtomFiles, loadAtoms, type LoadAtomsResult } from "./atoms.js";
import { hashBody, IndexDb } from "./index-db.js";
import type { FsPort } from "./fs.js";

const norm = (ws: string): string => String(ws).replace(/\\/g, "/").replace(/\/+$/, "");

export interface IndexLoadResult extends LoadAtomsResult {
  source: "db" | "fs";
}

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

  /** DB-first：文件名集合一致 ⇒ 直接读 parsed JSON；否则从 fs 全量读并重建。 */
  async load(index: IndexDb, fs: FsPort, ws: string): Promise<Outcome<IndexLoadResult>> {
    const files = await listAtomFiles(fs, ws);
    if (!files.ok) return files;
    const names = index.names();
    if (names.size === files.value.length && files.value.every((f) => names.has(f.rel))) {
      const atoms = index.allParsed();
      if (atoms.length === files.value.length) return ok({ atoms, errors: [], source: "db" });
    }
    const loaded = await loadAtoms(fs, ws);
    if (!loaded.ok) return loaded;
    index.replaceAll(loaded.value.atoms);
    return ok({ ...loaded.value, source: "fs" });
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
