/**
 * v2 store — 派生件垃圾回收（GC）。
 *
 * 边界：**只删 `.shadow/indexes/**` 的派生物**，绝不碰 atoms（atoms 是唯一权威）。
 * 两类目标：
 *   1. 四类派生卡的**孤儿文件**：本轮的 `DerivedPlan` 没再生成它（预算截断/源记忆消失/改名），
 *      留着只会让目录越来越像“第二个记忆库”。
 *   2. `*.history/` 下的**旧版本**：每张卡保留最近 `keepHistory` 个（默认 2），其余删除。
 *
 * 失败不阻塞读：所有错误收集成字符串，由调用方转成可见 Signal。
 */

import { INDEXES_DIR } from "../contract/paths.js";
import type { FsPort } from "./fs.js";

/** 由 `planDerived()` 产出的四类派生目录（不含 v1 遗留的 projections）。 */
const DERIVED_DIRS = new Set(["materials", "affaires", "episodes", "abstracts"]);

export interface GcResult {
  /** 删除的派生卡/版本文件数。 */
  deleted: number;
  /** 每个 history 目录保留的版本数（用于披露）。 */
  keepHistory: number;
  /** 非致命错误（无权限/IO）；调用方把它变成可见 Signal。 */
  errors: string[];
}

const norm = (p: string): string => String(p).replace(/\\/g, "/").replace(/\/+$/, "");

/**
 * 回收 `.shadow/indexes/` 里的派生物。
 * @param fs - FsPort
 * @param ws - workspace 根
 * @param expectedAbs - 本轮应存在的派生文件绝对路径（`plan.files` 换算后）
 * @param opts.keepHistory - 每个 `.history/` 保留的最近版本数
 */
export const gcDerivedIndexes = async (
  fs: FsPort,
  ws: string,
  expectedAbs: Set<string>,
  opts: { keepHistory?: number } = {},
): Promise<GcResult> => {
  const keepHistory = Math.max(0, Math.floor(opts.keepHistory ?? 2));
  const result: GcResult = { deleted: 0, keepHistory, errors: [] };
  const root = `${norm(ws)}/${INDEXES_DIR}`;
  const listed = await fs.listDir(root);
  if (!listed.ok) {
    if (listed.error.code !== "NOT_FOUND") result.errors.push(`${INDEXES_DIR}: ${listed.error.message}`);
    return result;
  }
  for (const entry of listed.value) {
    if (entry.type !== "dir") continue;
    const dirAbs = `${root}/${entry.name}`;
    if (entry.name.endsWith(".history")) {
      await pruneHistory(fs, ws, dirAbs, keepHistory, result);
      continue;
    }
    if (!DERIVED_DIRS.has(entry.name)) continue;
    await pruneOrphans(fs, ws, dirAbs, expectedAbs, result, keepHistory);
  }
  return result;
};

const pruneOrphans = async (
  fs: FsPort,
  ws: string,
  dirAbs: string,
  expectedAbs: Set<string>,
  result: GcResult,
  keepHistory: number,
): Promise<void> => {
  const listed = await fs.listDir(dirAbs);
  if (!listed.ok) {
    if (listed.error.code !== "NOT_FOUND") result.errors.push(`${relOf(ws, dirAbs)}: ${listed.error.message}`);
    return;
  }
  for (const entry of listed.value) {
    if (entry.type === "dir" && entry.name.endsWith(".history")) {
      await pruneHistory(fs, ws, `${dirAbs}/${entry.name}`, keepHistory, result);
      continue;
    }
    if (entry.type !== "file" || !entry.name.endsWith(".md")) continue;
    const abs = `${dirAbs}/${entry.name}`;
    if (expectedAbs.has(abs)) continue;
    const del = await fs.unlink(abs);
    if (del.ok) result.deleted += 1;
    else result.errors.push(`${relOf(ws, abs)}: ${del.error.message}`);
  }
};

const pruneHistory = async (
  fs: FsPort,
  ws: string,
  dirAbs: string,
  keep: number,
  result: GcResult,
): Promise<void> => {
  const listed = await fs.listDir(dirAbs);
  if (!listed.ok) {
    if (listed.error.code !== "NOT_FOUND") result.errors.push(`${relOf(ws, dirAbs)}: ${listed.error.message}`);
    return;
  }
  const files: { abs: string; mtime: number }[] = [];
  for (const entry of listed.value) {
    if (entry.type !== "file") continue;
    const abs = `${dirAbs}/${entry.name}`;
    const st = await fs.stat(abs);
    if (!st.ok) {
      result.errors.push(`${relOf(ws, abs)}: ${st.error.message}`);
      continue;
    }
    files.push({ abs, mtime: st.value.mtimeMs });
  }
  files.sort((a, b) => b.mtime - a.mtime || b.abs.localeCompare(a.abs));
  for (const f of files.slice(keep)) {
    const del = await fs.unlink(f.abs);
    if (del.ok) result.deleted += 1;
    else result.errors.push(`${relOf(ws, f.abs)}: ${del.error.message}`);
  }
};

const relOf = (ws: string, abs: string): string => norm(abs).slice(norm(ws).length + 1);
