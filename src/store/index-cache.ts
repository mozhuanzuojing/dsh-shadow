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
          const atoms = index.allParsed();
          if (atoms.length === files.value.length) return ok({ atoms, errors: [], source: "db" });
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
      await this.importLegacyMeta(index, fs, ws, loaded.value.atoms);
      return ok({ ...loaded.value, source: "fs" });
    } catch (e) {
      // SQLite 查询/解析抛错：回退 fs，读仍可用；调用方负责把它变成可见 Signal。
      const message = e instanceof Error ? e.message : String(e);
      const loaded = await loadAtoms(fs, ws);
      if (!loaded.ok) return loaded;
      return ok({ ...loaded.value, source: "fs", degraded: `派生索引异常：${message}` });
    }
  }

  /** v1 `_meta.json` 一次性导入（只补缺，不覆盖 v2 新 hits）。 */
  private async importLegacyMeta(index: IndexDb, fs: FsPort, ws: string, atoms: ParsedAtom[]): Promise<void> {
    const text = await fs.readText(`${ws}/.shadow/_meta.json`);
    if (!text.ok) return;
    try {
      const parsed = JSON.parse(text.value) as Record<string, { hits?: number; status?: string; pinned?: boolean; created?: string }>;
      index.importMeta(parsed, new Set(atoms.map((a) => a.rel)));
    } catch {
      /* 坏件不阻塞读；hits/status 缺失可见于 query-log/report */
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
    for (const db of this.map.values()) db.close();
    this.map.clear();
  }
}
