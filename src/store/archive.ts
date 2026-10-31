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

import { createHash, randomUUID } from "node:crypto";

import {
  ARCHIVE_DIR,
  ARCHIVE_LOCK,
  ARCHIVE_MANIFEST,
  TRASH_DIR,
} from "../contract/paths.js";
import { err, ok, type Outcome } from "../contract/outcome.js";
import type { ParsedAtom } from "../contract/types.js";
import type { FsPort } from "./fs.js";
import { loadAtoms, type LoadAtomsResult } from "./atoms.js";

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
  /** 移出 atoms 的热文件数（默认进 `.trash`）。 */
  deleted: number;
  /** 从 `.trash` 清理的过期文件数。 */
  purged: number;
}

export interface ArchiveOptions {
  /** 测试注入；默认 Date.now。 */
  now?: number;
  /** 锁超过这么久没有更新就视为陈旧（默认 10 分钟）。 */
  staleLockMs?: number;
  /** 归档并登记成功后才删除热文件；默认 false（安全版）。 */
  deleteHot?: boolean;
  /** 被 pin 的 atom rel：可以归档，但**不删热文件**。 */
  pinned?: Set<string>;
  /** 删热文件前移入 `.shadow/.trash/`；false 则直接 unlink（默认 true）。 */
  trash?: boolean;
  /** `.trash/` 保留天数；默认 7。 */
  keepTrashDays?: number;
}

interface ManifestDay {
  count: number;
  sha256: string;
  jsonl: string;
  md: string;
  archivedAt: string;
  /** 该日包含的 atom rel；用于删热文件后判断 DB 应该有哪些行。 */
  rels?: string[];
  /** rel → 逐条内容摘要；删除热文件前用它验证“archive 就是当前内容”。 */
  recordHashes?: Record<string, string>;
}

interface Manifest {
  version: 1;
  days: Record<string, ManifestDay>;
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
    const atoms = parseJsonl(text.value);
    for (const a of atoms) a.archiveRel = `${rel}#${a.rel}`;
    return ok(atoms);
  } catch (e) {
    return err("CORRUPT", `归档 JSONL 解析失败：${date}（${e instanceof Error ? e.message : String(e)}）`, { rel });
  }
};

/** 规范化 JSON（键排序），用于逐条内容摘要；避免属性顺序造成假差异。 */
const canon = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canon);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = canon((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
};

/** 逐条内容摘要（不含 archiveRel，避免句柄自身进入摘要）。 */
export const digestAtom = (atom: ParsedAtom): string => {
  const { archiveRel: _handle, ...rest } = atom;
  return sha256(JSON.stringify(canon(rest)));
};

/** 写入 JSONL 时去掉运行期句柄字段。 */
const recordForArchive = (atom: ParsedAtom): ParsedAtom => {
  const { archiveRel: _handle, ...rest } = atom;
  return rest as ParsedAtom;
};

const readManifest = async (fs: FsPort, ws: string): Promise<{ manifest: Manifest; exists: boolean }> => {
  const r = await fs.readText(abs(ws, ARCHIVE_MANIFEST));
  return { manifest: parseManifest(r.ok ? r.value : undefined), exists: r.ok };
};

/** 归档目录下已有的日期（按 `<date>.jsonl` 文件名发现；manifest 丢失也能重建）。 */
export const listArchiveDates = async (fs: FsPort, ws: string): Promise<string[]> => {
  const r = await fs.listDir(abs(ws, ARCHIVE_DIR));
  if (!r.ok) return [];
  return r.value
    .filter((e) => e.type === "file" && /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(e.name))
    .map((e) => e.name.slice(0, 10))
    .sort();
};

export interface ArchivedIndex {
  dates: string[];
  /** 已归档 atom 的 rel 集合（DB 应有这些行；热文件未必存在）。 */
  rels: Set<string>;
  /** rel → 冷区句柄（`.shadow/archive/<date>.jsonl#<rel>`）。 */
  byRel: Map<string, string>;
  /** rel → 逐条内容摘要；用于判断 DB 中的归档行是否已陈旧。 */
  recordHashes: Map<string, string>;
}

/**
 * 读归档 manifest/JSONL 的轻量索引：给 `IndexCache` 判断 DB 是否仍覆盖全部记忆。
 * 坏 JSONL 明确返回 CORRUPT，不静默丢历史。
 */
export const archivedIndex = async (fs: FsPort, ws: string): Promise<Outcome<ArchivedIndex>> => {
  const { manifest } = await readManifest(fs, ws);
  const dates = await listArchiveDates(fs, ws);
  const allDates = [...new Set([...Object.keys(manifest.days), ...dates])].sort();
  const rels = new Set<string>();
  const byRel = new Map<string, string>();
  const recordHashes = new Map<string, string>();
  for (const date of allDates) {
    const entry = manifest.days[date];
    const handle = `${ARCHIVE_DIR}/${date}.jsonl`;
    if (entry?.rels && entry.rels.length) {
      let hashes = entry.recordHashes;
      if (!hashes) {
        const atoms = await readArchivedAtoms(fs, ws, date);
        if (!atoms.ok) return atoms;
        hashes = Object.fromEntries(atoms.value.map((a) => [a.rel, digestAtom(a)]));
      }
      for (const rel of entry.rels) {
        rels.add(rel);
        byRel.set(rel, `${handle}#${rel}`);
        const h = hashes[rel];
        if (h) recordHashes.set(rel, h);
      }
      continue;
    }
    const atoms = await readArchivedAtoms(fs, ws, date);
    if (!atoms.ok) {
      if (atoms.error.code === "NOT_FOUND" && !entry) continue;
      return atoms;
    }
    for (const a of atoms.value) {
      rels.add(a.rel);
      byRel.set(a.rel, a.archiveRel ?? `${handle}#${a.rel}`);
      recordHashes.set(a.rel, digestAtom(a));
    }
  }
  return ok({ dates: allDates, rels, byRel, recordHashes });
};

/**
 * 从「热 atoms + 全部归档日」重建完整 atom 集（DB 丢失/首次迁移用）。
 * 热文件优先；坏归档收集为 errors 继续（部分可用），不把历史当空、也不单坏件拖垮全部。
 * 这是删热文件后的权威恢复路径。
 */
export const loadAllAtoms = async (fs: FsPort, ws: string): Promise<Outcome<LoadAtomsResult>> => {
  const hot = await loadAtoms(fs, ws);
  if (!hot.ok) return hot;
  const dates = await listArchiveDates(fs, ws);
  const byRel = new Map<string, ParsedAtom>();
  const errors = [...hot.value.errors];
  for (const date of dates) {
    const archived = await readArchivedAtoms(fs, ws, date);
    if (!archived.ok) {
      errors.push({ rel: `${ARCHIVE_DIR}/${date}.jsonl`, code: archived.error.code, message: archived.error.message });
      continue;
    }
    for (const a of archived.value) byRel.set(a.rel, a);
  }
  // 热文件最后写入 ⇒ 同 rel 时热文件优先（避免 archive 覆盖刚更新/迟到的热版本）。
  for (const a of hot.value.atoms) byRel.set(a.rel, a);
  return ok({ atoms: [...byRel.values()], errors });
};

const acquireLock = async (
  fs: FsPort,
  ws: string,
  now: number,
  staleLockMs: number,
  token: string,
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
  const written = await fs.writeText(lock, JSON.stringify({ pid: process.pid, at: now, token }));
  return written.ok;
};

/** 只释放自己持有的锁：token 不匹配就不删。 */
const releaseLock = async (fs: FsPort, ws: string, token: string): Promise<void> => {
  const lock = abs(ws, ARCHIVE_LOCK);
  const content = await fs.readText(lock);
  if (!content.ok) return;
  try {
    const parsed = JSON.parse(content.value) as { token?: unknown };
    if (parsed.token === token) await fs.unlink(lock);
  } catch {
    /* 坏锁不猜；留给陈旧锁超时 */
  }
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

const cutoffDate = (today: string, days: number): string => {
  const d = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return today;
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
};

/** 清理 `.trash/` 中超过保留期的日期目录（只删文件，不递归；目录可为空）。 */
const purgeTrash = async (
  fs: FsPort,
  ws: string,
  today: string,
  keepDays: number,
): Promise<{ purged: number; errors: string[] }> => {
  const out = { purged: 0, errors: [] as string[] };
  const root = abs(ws, TRASH_DIR);
  const listed = await fs.listDir(root);
  if (!listed.ok) return out;
  const cutoff = cutoffDate(today, keepDays);
  for (const entry of listed.value) {
    if (entry.type !== "dir" || !/^\d{4}-\d{2}-\d{2}$/.test(entry.name)) continue;
    if (entry.name >= cutoff) continue;
    const dir = `${root}/${entry.name}`;
    const files = await fs.listDir(dir);
    if (!files.ok) {
      if (files.error.code !== "NOT_FOUND") out.errors.push(`${TRASH_DIR}/${entry.name}: ${files.error.message}`);
      continue;
    }
    for (const f of files.value) {
      if (f.type !== "file") continue;
      const del = await fs.unlink(`${dir}/${f.name}`);
      if (del.ok) out.purged += 1;
      else if (del.error.code !== "NOT_FOUND") out.errors.push(`${TRASH_DIR}/${entry.name}/${f.name}: ${del.error.message}`);
    }
  }
  return out;
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
  const result: ArchiveResult = { archived: [], skipped: [], errors: [], deleted: 0, purged: 0 };
  const now = Number.isFinite(opts.now) ? Number(opts.now) : Date.now();
  const staleLockMs = Math.max(1_000, Number(opts.staleLockMs ?? 10 * 60_000));
  const deleteHot = opts.deleteHot === true;
  const trash = opts.trash !== false;
  const keepTrashDays = Math.max(0, Math.floor(opts.keepTrashDays ?? 7));
  const pinned = opts.pinned ?? new Set<string>();
  const byDate = new Map<string, ParsedAtom[]>();
  for (const a of atoms) {
    if (!a.date || a.date >= today) continue;
    const list = byDate.get(a.date) ?? [];
    list.push(a);
    byDate.set(a.date, list);
  }
  if (!byDate.size) return result;

  const token = randomUUID();
  const acquired = await acquireLock(fs, ws, now, staleLockMs, token);
  if (!acquired) {
    result.errors.push("归档锁被占用；下次无参读再试");
    return result;
  }
  try {
    const { manifest, exists } = await readManifest(fs, ws);
    let manifestDirty = !exists;
    const deletions = new Map<string, ParsedAtom[]>();

    for (const date of [...byDate.keys()].sort()) {
      const current = byDate.get(date)!;
      const jsonlRel = `${ARCHIVE_DIR}/${date}.jsonl`;
      const jsonlAbs = abs(ws, jsonlRel);
      const mdAbs = abs(ws, `${ARCHIVE_DIR}/${date}.md`);
      const existingText = await fs.readText(jsonlAbs);
      const existingJsonl = existingText.ok ? existingText.value : undefined;

      let archivedAtoms: ParsedAtom[] = [];
      if (existingJsonl !== undefined) {
        try {
          archivedAtoms = parseJsonl(existingJsonl);
        } catch {
          archivedAtoms = [];
        }
      }
      const archiveMap = new Map(archivedAtoms.map((a) => [a.rel, a]));
      const archiveHashes = new Map(archivedAtoms.map((a) => [a.rel, digestAtom(a)]));
      const currentHashes = new Map(current.map((a) => [a.rel, digestAtom(a)]));

      // 只有「当前每个热 atom 在 archive 中且逐条 hash 相同」才允许跳过并删热文件。
      const same =
        existingJsonl !== undefined &&
        current.every((a) => {
          const old = archiveMap.get(a.rel);
          return old !== undefined && archiveHashes.get(a.rel) === currentHashes.get(a.rel);
        });

      if (same) {
        const rels = [...archiveMap.keys()];
        manifest.days[date] = {
          count: archivedAtoms.length,
          sha256: sha256(existingJsonl!),
          jsonl: `${date}.jsonl`,
          md: `${date}.md`,
          archivedAt: manifest.days[date]?.archivedAt ?? new Date(now).toISOString(),
          rels,
          recordHashes: Object.fromEntries(archiveHashes),
        };
        manifestDirty = true;
        result.skipped.push(date);
        if (deleteHot) deletions.set(date, current.filter((a) => !pinned.has(a.rel)));
        continue;
      }

      // 内容变化/新热 atom：以当前热版本为准，和已有归档做 union（保留已归档但热区已不在的旧 rel）。
      const merged = new Map(archiveMap);
      for (const a of current) merged.set(a.rel, a);
      const records = [...merged.values()].sort((a, b) =>
        `${a.date} ${a.time} ${a.rel}`.localeCompare(`${b.date} ${b.time} ${b.rel}`),
      );
      const jsonl = records.map((a) => JSON.stringify(recordForArchive(a))).join("\n") + "\n";
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
      let parsed: ParsedAtom[];
      try {
        parsed = parseJsonl(back.value);
      } catch (e) {
        result.errors.push(`${date}: JSONL 校验异常（${e instanceof Error ? e.message : String(e)}）`);
        continue;
      }
      const expected = new Map(records.map((a) => [a.rel, digestAtom(a)]));
      const verified =
        parsed.length === records.length && parsed.every((a) => expected.get(a.rel) === digestAtom(a));
      if (!verified) {
        result.errors.push(`${date}: JSONL 校验失败（行数/逐条 hash 不一致）`);
        continue;
      }
      const md = digest(date, records);
      const mdExisting = await fs.readText(mdAbs);
      if (!mdExisting.ok || mdExisting.value !== md) {
        const mw = await fs.writeText(mdAbs, md);
        if (!mw.ok) result.errors.push(`${date}: 摘要写入失败（${mw.error.message}）`);
      }
      manifest.days[date] = {
        count: records.length,
        sha256: sha256(back.value),
        jsonl: `${date}.jsonl`,
        md: `${date}.md`,
        archivedAt: new Date(now).toISOString(),
        rels: records.map((a) => a.rel),
        recordHashes: Object.fromEntries(records.map((a) => [a.rel, digestAtom(a)])),
      };
      manifestDirty = true;
      result.archived.push({
        date,
        count: records.length,
        jsonl: `${ARCHIVE_DIR}/${date}.jsonl`,
        md: `${ARCHIVE_DIR}/${date}.md`,
        sha256: sha256(back.value),
      });
      if (deleteHot) deletions.set(date, current.filter((a) => !pinned.has(a.rel)));
    }

    if (manifestDirty) {
      const manifestAbs = abs(ws, ARCHIVE_MANIFEST);
      const tmp = `${manifestAbs}.tmp`;
      const w = await fs.writeText(tmp, JSON.stringify(manifest, null, 2) + "\n");
      if (!w.ok) {
        result.errors.push(`manifest 临时写入失败（${w.error.message}）；为保证可恢复，本次不删除热文件`);
        return result;
      }
      const r = await fs.rename(tmp, manifestAbs);
      if (!r.ok) {
        result.errors.push(`manifest 原子替换失败（${r.error.message}）；为保证可恢复，本次不删除热文件`);
        return result;
      }
    }

    if (deleteHot) {
      for (const records of deletions.values()) {
        for (const a of records) {
          const src = abs(ws, a.rel);
          if (trash) {
            // 归档已验证；先把热文件移进 .trash（可恢复），再由保留期清理。
            const destDir = `${TRASH_DIR}/${a.date}`;
            const mk = await fs.mkdirp(abs(ws, destDir));
            if (!mk.ok) {
              result.errors.push(`${a.rel}: .trash 目录创建失败（${mk.error.message}）`);
              continue;
            }
            const dest = abs(ws, `${destDir}/${a.rel.split("/").pop() ?? a.name}`);
            const mv = await fs.rename(src, dest);
            if (mv.ok) result.deleted += 1;
            else if (mv.error.code !== "NOT_FOUND") {
              result.errors.push(`${a.rel}: 热文件移入 .trash 失败（${mv.error.message}）`);
            }
          } else {
            const del = await fs.unlink(src);
            if (del.ok) result.deleted += 1;
            else if (del.error.code !== "NOT_FOUND") {
              result.errors.push(`${a.rel}: 热文件删除失败（${del.error.message}）`);
            }
          }
        }
      }
    }
    if (trash) {
      const cleaned = await purgeTrash(fs, ws, today, keepTrashDays);
      result.purged += cleaned.purged;
      result.errors.push(...cleaned.errors);
    }
    return result;
  } finally {
    await releaseLock(fs, ws, token);
  }
};