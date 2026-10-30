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
  /** 索引层失败时回退 fs 的原因；调用方应留可见 Signal。 */
  degraded?: string;
}

export class IndexCache {
  private map = new Map<string, Promise<Outcome<IndexDb>>>();
  private opened = new Map<string, IndexDb>();
  /** DB-first 的解析结果缓存：文件集合未变时避免每次重复 `index.allParsed()`。 */
  private parsed = new Map<string, { sig: string; atoms: ParsedAtom[] }>();

  async get(fs: FsPort, ws: string): Promise<Outcome<IndexDb>> {
    const key = norm(ws);
    const hit = this.map.get(key);
    if (hit) return hit;
    const p = IndexDb.open(`${key}/${INDEX_DB}`).then((r) => {
      if (r.ok) this.opened.set(key, r.value);
      else this.map.delete(key);
      return r;
    });
    this.map.set(key, p);
    return p;
  }

  /** DB-first：文件名集合一致 ⇒ 直接读 parsed JSON；`full` 时再比 size/mtime。 */
  async load(index: IndexDb, fs: FsPort, ws: string, verify: "token" | "full" = "token"): Promise<Outcome<IndexLoadResult>> {
    try {
      const files = await listAtomFiles(fs, ws);
      if (!files.ok) return files;
      const names = index.names();
      const sameNames = names.size === files.value.length && files.value.every((f) => names.has(f.rel));
      if (sameNames) {
        let statsOk = true;
        if (verify === "full") {
          const known = index.fileStats();
          for (const f of files.value) {
            const st = await fs.stat(`${ws}/${f.rel}`);
            if (!st.ok) {
              statsOk = false;
              break;
            }
            const prev = known.get(f.rel);
            if (!prev || prev.size !== st.value.size || Math.abs(prev.mtime - st.value.mtimeMs) > 1) {
              statsOk = false;
              break;
            }
          }
        }
        if (statsOk) {
          const key = norm(ws);
          const sig = files.value.map((f) => f.rel).join("\u0000");
          const cached = this.parsed.get(key);
          if (cached && cached.sig === sig) {
            return ok({ atoms: cached.atoms, errors: [], source: "db" });
          }
          const atoms = index.allParsed();
          if (atoms.length === files.value.length) {
            this.parsed.set(key, { sig, atoms });
            return ok({ atoms, errors: [], source: "db" });
          }
        }
      }
      const loaded = await loadAtoms(fs, ws);
      if (!loaded.ok) return loaded;
      const knownStats = index.fileStats();
      const stats = new Map<string, { size: number; mtime: number }>();
      for (const a of loaded.value.atoms) {
        const prev = knownStats.get(a.rel);
        if (prev && verify !== "full") {
          stats.set(a.rel, prev);
          continue;
        }
        const st = await fs.stat(`${ws}/${a.rel}`);
        if (st.ok) stats.set(a.rel, { size: st.value.size, mtime: st.value.mtimeMs });
      }
      const replaced = index.replaceAll(loaded.value.atoms, stats);
      if (!replaced.ok) {
        return ok({ ...loaded.value, source: "fs", degraded: `派生索引写失败：${replaced.error.message}` });
      }
      this.parsed.set(norm(ws), {
        sig: loaded.value.atoms.map((a) => a.rel).join("\u0000"),
        atoms: loaded.value.atoms,
      });
      return ok({ ...loaded.value, source: "fs" });
    } catch (e) {
      // SQLite 查询/解析抛错：回退 fs，读仍可用；调用方负责把它变成可见 Signal。
      const message = e instanceof Error ? e.message : String(e);
      const loaded = await loadAtoms(fs, ws);
      if (!loaded.ok) return loaded;
      return ok({ ...loaded.value, source: "fs", degraded: `派生索引异常：${message}` });
    }
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
    for (const db of this.opened.values()) db.close();
    this.opened.clear();
    this.map.clear();
    this.parsed.clear();
  }
}
