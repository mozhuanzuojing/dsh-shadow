/**
 * v2 store — 单一派生索引（SQLite，Node 26 内置 node:sqlite）。
 *
 * 纪律：SQLite 只做派生；删掉它必须能仅凭 atoms 重建。写入用事务；读失败与坏件可区分。
 */

import { createHash } from "node:crypto";
import { dirname } from "node:path";
import { mkdirSync } from "node:fs";
import type { AtomMeta, ParsedAtom } from "../contract/types.js";
import { err, ok, type Outcome } from "../contract/outcome.js";

export interface AtomRow {
  rel: string;
  name: string;
  date: string;
  time: string;
  slug: string;
  uid: string;
  entry: string;
  project: string;
  agent: string;
  goal: string;
  summary: string;
  body: string;
  kind: string;
  materials: string[];
  decisions: string[];
  userMessages: string[];
  actions: string[];
  hash: string;
}

interface SqliteStatement {
  run(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  get(...params: unknown[]): unknown;
}

interface SqliteDb {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

type DatabaseCtor = new (path: string) => SqliteDb;

const SCHEMA = `
CREATE TABLE IF NOT EXISTS atoms (
  rel TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL,
  slug TEXT NOT NULL,
  uid TEXT NOT NULL DEFAULT '',
  entry TEXT NOT NULL DEFAULT '',
  project TEXT NOT NULL DEFAULT '',
  agent TEXT NOT NULL DEFAULT '',
  goal TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  kind TEXT NOT NULL DEFAULT 'memory',
  materials TEXT NOT NULL DEFAULT '[]',
  decisions TEXT NOT NULL DEFAULT '[]',
  user_messages TEXT NOT NULL DEFAULT '[]',
  actions TEXT NOT NULL DEFAULT '[]',
  hash TEXT NOT NULL DEFAULT '',
  parsed TEXT NOT NULL DEFAULT '',
  size INTEGER NOT NULL DEFAULT 0,
  mtime REAL NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_atoms_date ON atoms(date);
CREATE INDEX IF NOT EXISTS idx_atoms_entry ON atoms(entry);
CREATE TABLE IF NOT EXISTS meta (
  rel TEXT PRIMARY KEY,
  hits INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  first_at TEXT,
  last_at TEXT,
  pinned INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS query_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  mode TEXT NOT NULL,
  query TEXT NOT NULL,
  returned INTEGER NOT NULL DEFAULT 0,
  matched INTEGER NOT NULL DEFAULT 0,
  latency_ms INTEGER NOT NULL DEFAULT 0
);
`;

export const hashBody = (body: string): string =>
  createHash("sha1").update(String(body ?? ""), "utf8").digest("hex");

const rowToAtom = (r: Record<string, unknown>): AtomRow => ({
  rel: String(r.rel ?? ""),
  name: String(r.name ?? ""),
  date: String(r.date ?? ""),
  time: String(r.time ?? ""),
  slug: String(r.slug ?? ""),
  uid: String(r.uid ?? ""),
  entry: String(r.entry ?? ""),
  project: String(r.project ?? ""),
  agent: String(r.agent ?? ""),
  goal: String(r.goal ?? ""),
  summary: String(r.summary ?? ""),
  body: String(r.body ?? ""),
  kind: String(r.kind ?? "memory"),
  materials: parseJsonArray(r.materials),
  decisions: parseJsonArray(r.decisions),
  userMessages: parseJsonArray(r.user_messages),
  actions: parseJsonArray(r.actions),
  hash: String(r.hash ?? ""),
});

const parseJsonArray = (v: unknown): string[] => {
  if (Array.isArray(v)) return v.map(String);
  try {
    const x = JSON.parse(String(v ?? "[]"));
    return Array.isArray(x) ? x.map(String) : [];
  } catch {
    return [];
  }
};

export class IndexDb {
  private constructor(
    private readonly db: SqliteDb,
    readonly path: string,
  ) {}

  static async open(path: string): Promise<Outcome<IndexDb>> {
    try {
      mkdirSync(dirname(path), { recursive: true });
      const mod = (await import("node:sqlite")) as unknown as { DatabaseSync: DatabaseCtor };
      const db = new mod.DatabaseSync(path);
      db.exec("PRAGMA busy_timeout = 3000");
      try {
        db.exec("PRAGMA journal_mode = WAL");
      } catch {
        /* 老版本/受限文件系统不支持 WAL 不构成失败 */
      }
      db.exec(SCHEMA);
      // 兼容旧库：CREATE IF NOT EXISTS 不会补列
      try {
        db.exec("ALTER TABLE atoms ADD COLUMN parsed TEXT NOT NULL DEFAULT ''");
      } catch {
        /* 列已存在 */
      }
      try {
        db.exec("ALTER TABLE atoms ADD COLUMN size INTEGER NOT NULL DEFAULT 0");
      } catch {
        /* 列已存在 */
      }
      try {
        db.exec("ALTER TABLE atoms ADD COLUMN mtime REAL NOT NULL DEFAULT 0");
      } catch {
        /* 列已存在 */
      }
      return ok(new IndexDb(db, path));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return err("UNAVAILABLE", `无法打开派生索引：${message}`, { path }, true);
    }
  }

  close(): void {
    try {
      this.db.close();
    } catch {
      /* 关闭失败不改变结论 */
    }
  }

  count(): number {
    const row = this.db.prepare("SELECT COUNT(*) AS n FROM atoms").get() as { n?: number } | undefined;
    return Number(row?.n ?? 0);
  }

  /** 整库重建（原子批 ≤ 2k 时快；大库由上层增量）。stats 用于 full 新鲜度判定。 */
  replaceAll(atoms: ParsedAtom[], stats?: Map<string, { size: number; mtime: number }>): Outcome<{ count: number }> {
    try {
      this.db.exec("BEGIN");
      this.db.exec("DELETE FROM atoms");
      const stmt = this.db.prepare(
        `INSERT INTO atoms (rel,name,date,time,slug,uid,entry,project,agent,goal,summary,body,kind,materials,decisions,user_messages,actions,hash,parsed,size,mtime)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      );
      for (const a of atoms) {
        const st = stats?.get(a.rel);
        stmt.run(
          a.rel, a.name, a.date, a.time, a.slug, a.uid ?? "", a.entry, a.project, a.agent, a.goal,
          a.summary, a.body, a.kind, JSON.stringify(a.materials), JSON.stringify(a.decisions),
          JSON.stringify(a.userMessages), JSON.stringify(a.actions), hashBody(a.body), JSON.stringify(a),
          st?.size ?? 0, st?.mtime ?? 0,
        );
      }
      this.db.exec("COMMIT");
      return ok({ count: atoms.length });
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      return err("IO", `写派生索引失败：${e instanceof Error ? e.message : String(e)}`, { path: this.path }, true);
    }
  }

  upsert(atoms: ParsedAtom[], stats?: Map<string, { size: number; mtime: number }>): Outcome<{ count: number }> {
    try {
      this.db.exec("BEGIN");
      const stmt = this.db.prepare(
        `INSERT INTO atoms (rel,name,date,time,slug,uid,entry,project,agent,goal,summary,body,kind,materials,decisions,user_messages,actions,hash,parsed,size,mtime)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(rel) DO UPDATE SET
           name=excluded.name,date=excluded.date,time=excluded.time,slug=excluded.slug,uid=excluded.uid,
           entry=excluded.entry,project=excluded.project,agent=excluded.agent,goal=excluded.goal,
           summary=excluded.summary,body=excluded.body,kind=excluded.kind,materials=excluded.materials,
           decisions=excluded.decisions,user_messages=excluded.user_messages,actions=excluded.actions,hash=excluded.hash,parsed=excluded.parsed,size=excluded.size,mtime=excluded.mtime`,
      );
      for (const a of atoms) {
        const st = stats?.get(a.rel);
        stmt.run(
          a.rel, a.name, a.date, a.time, a.slug, a.uid ?? "", a.entry, a.project, a.agent, a.goal,
          a.summary, a.body, a.kind, JSON.stringify(a.materials), JSON.stringify(a.decisions),
          JSON.stringify(a.userMessages), JSON.stringify(a.actions), hashBody(a.body), JSON.stringify(a),
          st?.size ?? 0, st?.mtime ?? 0,
        );
      }
      this.db.exec("COMMIT");
      return ok({ count: atoms.length });
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      return err("IO", `增量写派生索引失败：${e instanceof Error ? e.message : String(e)}`, { path: this.path }, true);
    }
  }

  removeMissing(keepRels: Iterable<string>): Outcome<{ removed: number }> {
    try {
      const keep = new Set(keepRels);
      const rows = this.db.prepare("SELECT rel FROM atoms").all() as { rel?: string }[];
      const del = this.db.prepare("DELETE FROM atoms WHERE rel = ?");
      let removed = 0;
      this.db.exec("BEGIN");
      for (const r of rows) {
        const rel = String(r.rel ?? "");
        if (rel && !keep.has(rel)) {
          del.run(rel);
          removed++;
        }
      }
      this.db.exec("COMMIT");
      return ok({ removed });
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      return err("IO", `清理派生索引失败：${e instanceof Error ? e.message : String(e)}`, { path: this.path }, true);
    }
  }

  all(limit = 2000): AtomRow[] {
    const rows = this.db
      .prepare("SELECT * FROM atoms ORDER BY date DESC, time DESC LIMIT ?")
      .all(limit) as Record<string, unknown>[];
    return rows.map(rowToAtom);
  }

  /** rel → body hash，用于读时增量对账（一次查询，避免 N 次 SELECT）。 */
  hashMap(): Map<string, string> {
    const rows = this.db.prepare("SELECT rel, hash FROM atoms").all() as { rel?: string; hash?: string }[];
    return new Map(rows.map((r) => [String(r.rel ?? ""), String(r.hash ?? "")]));
  }

  /** rel → 文件 size/mtime；full 新鲜度判定用。 */
  fileStats(): Map<string, { size: number; mtime: number }> {
    const rows = this.db.prepare("SELECT rel, size, mtime FROM atoms").all() as { rel?: string; size?: number; mtime?: number }[];
    const out = new Map<string, { size: number; mtime: number }>();
    for (const r of rows) {
      const rel = String(r.rel ?? "");
      if (rel) out.set(rel, { size: Number(r.size ?? 0), mtime: Number(r.mtime ?? 0) });
    }
    return out;
  }

  /** 已索引的 rel 集合（读时快速判断是否需要重建）。 */
  names(): Set<string> {
    const rows = this.db.prepare("SELECT rel FROM atoms").all() as { rel?: string }[];
    return new Set(rows.map((r) => String(r.rel ?? "")));
  }

  /** 从 parsed JSON 直接还原 ParsedAtom（DB-first 读路径）。 */
  allParsed(): import("../contract/types.js").ParsedAtom[] {
    const rows = this.db.prepare("SELECT parsed FROM atoms ORDER BY date DESC, time DESC").all() as { parsed?: string }[];
    const out: import("../contract/types.js").ParsedAtom[] = [];
    for (const r of rows) {
      const s = String(r.parsed ?? "");
      if (!s) continue;
      try {
        const a = JSON.parse(s) as Record<string, unknown>;
        if (typeof a.rel !== "string" || typeof a.name !== "string" || typeof a.body !== "string" || typeof a.date !== "string") continue;
        out.push(a as unknown as import("../contract/types.js").ParsedAtom);
      } catch {
        /* 坏行跳过；下次 replaceAll 重建 */
      }
    }
    return out;
  }

  /** 按 token 做粗筛（SQL LIKE）；精确打分在 domain/rank。 */
  match(tokens: string[], limit = 500): AtomRow[] {
    const list = tokens.map((t) => String(t ?? "").trim().toLowerCase()).filter(Boolean);
    if (!list.length) return this.all(limit);
    const seen = new Map<string, AtomRow>();
    const stmt = this.db.prepare(
      "SELECT * FROM atoms WHERE lower(entry) LIKE ? OR lower(body) LIKE ? OR lower(rel) LIKE ? LIMIT ?",
    );
    for (const t of list) {
      const like = `%${t}%`;
      const rows = stmt.all(like, like, like, limit) as Record<string, unknown>[];
      for (const r of rows) {
        const a = rowToAtom(r);
        if (!seen.has(a.rel)) seen.set(a.rel, a);
      }
      if (seen.size >= limit) break;
    }
    return [...seen.values()];
  }

  getMeta(rel: string): AtomMeta | undefined {
    const row = this.db.prepare("SELECT * FROM meta WHERE rel = ?").get(rel) as Record<string, unknown> | undefined;
    if (!row) return undefined;
    return {
      rel: String(row.rel ?? rel),
      hits: Number(row.hits ?? 0),
      status: String(row.status ?? "active") as AtomMeta["status"],
      firstAt: row.first_at ? String(row.first_at) : undefined,
      lastAt: row.last_at ? String(row.last_at) : undefined,
      pinned: Number(row.pinned ?? 0) === 1,
    };
  }

  /** 一次读出全部 meta（8k 条也只是一次查询）。 */
  metaMap(): Map<string, AtomMeta> {
    const rows = this.db.prepare("SELECT * FROM meta").all() as Record<string, unknown>[];
    const out = new Map<string, AtomMeta>();
    for (const row of rows) {
      const rel = String(row.rel ?? "");
      if (!rel) continue;
      out.set(rel, {
        rel,
        hits: Number(row.hits ?? 0),
        status: String(row.status ?? "active") as AtomMeta["status"],
        firstAt: row.first_at ? String(row.first_at) : undefined,
        lastAt: row.last_at ? String(row.last_at) : undefined,
        pinned: Number(row.pinned ?? 0) === 1,
      });
    }
    return out;
  }

  bumpHits(rel: string, at: string): void {
    this.bumpHitsMany([rel], at);
  }

  /** 批量 hits：单事务；失败返回 Outcome，调用方负责变成可见 Signal。 */
  bumpHitsMany(rels: Iterable<string>, at: string): Outcome<{ count: number }> {
    try {
      const stmt = this.db.prepare(
        `INSERT INTO meta (rel,hits,status,first_at,last_at) VALUES (?,1,'active',?,?)
         ON CONFLICT(rel) DO UPDATE SET hits = meta.hits + 1, last_at = excluded.last_at`,
      );
      let n = 0;
      this.db.exec("BEGIN");
      for (const rel of rels) {
        if (!rel) continue;
        stmt.run(rel, at, at);
        n++;
      }
      this.db.exec("COMMIT");
      return ok({ count: n });
    } catch (e) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        /* ignore */
      }
      return err("IO", `hits 写入失败：${e instanceof Error ? e.message : String(e)}`, { path: this.path }, true);
    }
  }

  recordQuery(mode: string, query: string, returned: number, matched: number, latencyMs: number, at: string): Outcome<void> {
    try {
      this.db.prepare(
        "INSERT INTO query_log (at,mode,query,returned,matched,latency_ms) VALUES (?,?,?,?,?,?)",
      ).run(at, mode, query, returned, matched, latencyMs);
      // 观测表有界：只留最近 1000 条，避免无界增长。
      this.db.exec("DELETE FROM query_log WHERE id NOT IN (SELECT id FROM query_log ORDER BY id DESC LIMIT 1000)");
      return ok(undefined);
    } catch (e) {
      return err("IO", `query-log 写入失败：${e instanceof Error ? e.message : String(e)}`, { path: this.path }, true);
    }
  }

  queryLogSummary(): { total: number; matched: number; returned: number; rows: { mode: string; query: string; returned: number; matched: number }[] } {
    const agg = this.db.prepare("SELECT COUNT(*) AS total, COALESCE(SUM(matched),0) AS m, COALESCE(SUM(returned),0) AS r FROM query_log").get() as {
      total?: number;
      m?: number;
      r?: number;
    } | undefined;
    const rows = this.db.prepare("SELECT mode,query,returned,matched FROM query_log ORDER BY id DESC LIMIT 50").all() as Record<string, unknown>[];
    return {
      total: Number(agg?.total ?? 0),
      matched: Number(agg?.m ?? 0),
      returned: Number(agg?.r ?? 0),
      rows: rows.map((x) => ({
        mode: String(x.mode ?? ""),
        query: String(x.query ?? ""),
        returned: Number(x.returned ?? 0),
        matched: Number(x.matched ?? 0),
      })),
    };
  }
}
