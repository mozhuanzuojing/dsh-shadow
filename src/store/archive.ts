/**
 * v2 store — 按日归档（冷区）。
 *
 * 目的：让 `.shadow/atoms/` 只保留“今天”的活文件；历史按 **日** 收敛成
 * `.shadow/archive/<date>.jsonl`（完整原文，机器权威备份）+ `<date>.md`（人读导航）。
 *
 * 安全纪律（这一版**只归档、不删热文件**）：
 *  1. 只有 `atom.date < today` 的日期才归档；
 *  2. 先写 JSONL，回读校验（行数 / uid 集合 / sha256）通过后才登记 manifest；
 *  3. 校验失败保留 manifest 不变、报错；下次可重试；
 *  4. `atoms/` 一个文件都不删——删除是后续独立步骤，需人工确认。
 *  5. 幂等：manifest 已有且 JSONL 存在就直接跳过；manifest 缺失但 JSONL 合法则补登记。
 */

import { createHash } from "node:crypto";

import {
  ARCHIVE_DIR,
  ARCHIVE_LOCK,
  ARCHIVE_MANIFEST,
} from "../contract/paths.js";
import { err, ok, type Outcome } from "../contract/outcome.js";
import type { ParsedAtom } from "../contract/types.js";
import type { FsPort } from "./fs.js";

export interface ArchiveDayRecord {
  date: string;
  count: number;
  jsonl: string;
  md: string;
  sha256: string;
}

export interface ArchiveResult {
  archived: ArchiveDayRecord[];
  /** 已存在且 manifest 命中，未重写。 */
  skipped: string[];
  errors: string[];
}

export interface ArchiveOptions {
  /** 测试注入；默认 Date.now。 */
  now?: number;
  /** 锁超过这么久没有更新就视为陈旧（默认 10 分钟）。 */
  staleLockMs?: number;
}

interface Manifest {
  version: 1;
  days: Record<string, { count: number; sha256: string; jsonl: string; md: string; archivedAt: string }>;
}

const norm = (p: string): string => String(p).replace(/\\/g, "/").replace(/\/+$/, "");
const abs = (ws: string, rel: string): string => `${norm(ws)}/${rel}`;
const sha256 = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex");

const emptyManifest = (): Manifest => ({ version: 1, days: {} });

const parseManifest = (text: string | undefined): Manifest => {
  if (!text) return emptyManifest();
  try {
    const raw = JSON.parse(text) as Partial<Manifest>;
    if (!raw || raw.version !== 1 || typeof raw.days !== "object" || raw.days === null) return emptyManifest();
    return { version: 1, days: raw.days as Manifest["days"] };
  } catch {
    return emptyManifest();
  }
};

const uidOf = (a: ParsedAtom): string => `${a.rel}\u0000${a.uid ?? ""}`;

const isAtom = (value: unknown): value is ParsedAtom => {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.rel === "string" &&
    typeof v.name === "string" &&
    typeof v.date === "string" &&
    typeof v.time === "string" &&
    typeof v.body === "string"
  );
};

const parseJsonl = (text: string): ParsedAtom[] => {
  const out: ParsedAtom[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    const parsed: unknown = JSON.parse(line);
    if (!isAtom(parsed)) throw new Error("archive JSONL 含非 atom 行");
    out.push(parsed);
  }
  return out;
};

/** 读某日归档；不存在 → NOT_FOUND，坏件 → CORRUPT（不静默当空）。 */
export const readArchivedAtoms = async (
  fs: FsPort,
  ws: string,
  date: string,
): Promise<Outcome<ParsedAtom[]>> => {
  const rel = `${ARCHIVE_DIR}/${date}.jsonl`;
  const text = await fs.readText(abs(ws, rel));
  if (!text.ok) return text;
  try {
    return ok(parseJsonl(text.value));
  } catch (e) {
    return err("CORRUPT", `归档 JSONL 解析失败：${date}（${e instanceof Error ? e.message : String(e)}）`, { rel });
  }
};

const readManifest = async (fs: FsPort, ws: string): Promise<{ manifest: Manifest; exists: boolean }> => {
  const r = await fs.readText(abs(ws, ARCHIVE_MANIFEST));
  return { manifest: parseManifest(r.ok ? r.value : undefined), exists: r.ok };
};

const acquireLock = async (
  fs: FsPort,
  ws: string,
  now: number,
  staleLockMs: number,
): Promise<boolean> => {
  const lock = abs(ws, ARCHIVE_LOCK);
  if (await fs.exists(lock)) {
    const content = await fs.readText(lock);
    let at = 0;
    if (content.ok) {
      try {
        const parsed = JSON.parse(content.value) as { at?: unknown };
        at = typeof parsed.at === "number" ? parsed.at : 0;
      } catch {
        at = 0;
      }
    }
    if (!at) {
      const st = await fs.stat(lock);
      at = st.ok ? st.value.mtimeMs : 0;
    }
    if (at > 0 && now - at < staleLockMs) return false;
  }
  const written = await fs.writeText(lock, JSON.stringify({ pid: process.pid, at: now }));
  return written.ok;
};

const digest = (date: string, atoms: ParsedAtom[]): string => {
  const lines = [
    `# Shadow archive ${date}`,
    "",
    `> 归档 ${atoms.length} 条；完整原文见 \`${date}.jsonl\`（本文件只是导航，不是唯一来源）。`,
    "",
    ...atoms
      .slice()
      .sort((a, b) => `${a.time} ${a.rel}`.localeCompare(`${b.time} ${b.rel}`))
      .map((a) => {
        const summary = String(a.summary || a.goal || "").replace(/\s+/g, " ").trim().slice(0, 160);
        return `- ${a.time} · ${a.entry || a.slug}${summary ? ` · ${summary}` : ""} · \`${a.rel}\``;
      }),
  ];
  return lines.join("\n") + "\n";
};

/**
 * 归档 `date < today` 的全部 atom 日。
 * @param fs FsPort
 * @param ws workspace 根
 * @param atoms 当前全部 atoms
 * @param today 本地日期 `YYYY-MM-DD`
 * @returns 归档/跳过/错误；**不删除任何 atoms 文件**
 */
export const archiveDays = async (
  fs: FsPort,
  ws: string,
  atoms: ParsedAtom[],
  today: string,
  opts: ArchiveOptions = {},
): Promise<ArchiveResult> => {
  const result: ArchiveResult = { archived: [], skipped: [], errors: [] };
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const staleLockMs = Math.max(1_000, Number(opts.staleLockMs ?? 10 * 60_000));
  const byDate = new Map<string, ParsedAtom[]>();
  for (const a of atoms) {
    if (!a.date || a.date >= today) continue;
    const list = byDate.get(a.date) ?? [];
    list.push(a);
    byDate.set(a.date, list);
  }
  if (!byDate.size) return result;

  const { manifest, exists } = await readManifest(fs, ws);
  let manifestDirty = !exists;
  const dates = [...byDate.keys()].sort();
  for (const date of dates) {
    const list = byDate.get(date)!;
    if (manifest.days[date] && (await fs.exists(abs(ws, `${ARCHIVE_DIR}/${date}.jsonl`)))) {
      result.skipped.push(date);
      continue;
    }
    const acquired = await acquireLock(fs, ws, now, staleLockMs);
    if (!acquired) {
      result.errors.push(`归档锁被占用（${date}）；下次无参读再试`);
      break;
    }
    try {
      const jsonlAbs = abs(ws, `${ARCHIVE_DIR}/${date}.jsonl`);
      const mdAbs = abs(ws, `${ARCHIVE_DIR}/${date}.md`);
      const records = list.slice().sort((a, b) => `${a.date} ${a.time} ${a.rel}`.localeCompare(`${b.date} ${b.time} ${b.rel}`));
      const expected = records.map((a) => uidOf(a)).sort().join("\n");
      const existing = await fs.readText(jsonlAbs);
      let jsonl = "";
      let count = 0;
      let hash = "";
      if (existing.ok) {
        try {
          const parsed = parseJsonl(existing.value);
          const same = parsed.length === records.length && parsed.map(uidOf).sort().join("\n") === expected;
          if (same) {
            jsonl = existing.value;
            count = parsed.length;
            hash = sha256(existing.value);
          }
        } catch {
          /* 坏件：下面重写 */
        }
      }
      if (!jsonl) {
        jsonl = records.map((a) => JSON.stringify(a)).join("\n") + "\n";
        const w = await fs.writeText(jsonlAbs, jsonl);
        if (!w.ok) {
          result.errors.push(`${date}: JSONL 写入失败（${w.error.message}）`);
          continue;
        }
        const back = await fs.readText(jsonlAbs);
        if (!back.ok) {
          result.errors.push(`${date}: JSONL 回读失败（${back.error.message}）`);
          continue;
        }
        try {
          const parsed = parseJsonl(back.value);
          if (parsed.length !== records.length || parsed.map(uidOf).sort().join("\n") !== expected) {
            result.errors.push(`${date}: JSONL 校验失败（行数/uid 不一致）`);
            continue;
          }
          count = parsed.length;
          hash = sha256(back.value);
        } catch (e) {
          result.errors.push(`${date}: JSONL 校验异常（${e instanceof Error ? e.message : String(e)}）`);
          continue;
        }
      }
      const md = digest(date, records);
      const mdExisting = await fs.readText(mdAbs);
      if (!mdExisting.ok || mdExisting.value !== md) {
        const w = await fs.writeText(mdAbs, md);
        if (!w.ok) result.errors.push(`${date}: 摘要写入失败（${w.error.message}）`);
      }
      manifest.days[date] = {
        count,
        sha256: hash,
        jsonl: `${date}.jsonl`,
        md: `${date}.md`,
        archivedAt: new Date(now).toISOString(),
      };
      manifestDirty = true;
      result.archived.push({ date, count, jsonl: `${ARCHIVE_DIR}/${date}.jsonl`, md: `${ARCHIVE_DIR}/${date}.md`, sha256: hash });
    } finally {
      const lock = abs(ws, ARCHIVE_LOCK);
      if (await fs.exists(lock)) await fs.unlink(lock);
    }
  }
  if (manifestDirty) {
    const w = await fs.writeText(abs(ws, ARCHIVE_MANIFEST), JSON.stringify(manifest, null, 2) + "\n");
    if (!w.ok) result.errors.push(`manifest 写入失败（${w.error.message}）`);
  }
  return result;
};
