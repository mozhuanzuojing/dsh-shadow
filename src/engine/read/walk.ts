/**
 * v2 engine — 统一的代码文件遍历（BFS、跳过点目录/依赖产物、套 .gitignore+exclude）。
 * 供 code-search / symbols / embedding 复用，避免三份重复实现。只读。
 */

import { isCodeFile, shouldSkipDir } from "../../domain/code-search.js";
import type { FsPort } from "../../store/fs.js";

export const absOf = (ws: string, rel: string): string =>
  `${String(ws).replace(/\\/g, "/").replace(/\/+$/, "")}/${rel}`.replace(/\/+/g, "/");

export const snippetOf = (text: string): string =>
  (String(text ?? "").split(/\r?\n/).map((s) => s.trim()).find((s) => s.length > 0) ?? "").slice(0, 140);

export interface WalkOptions {
  ignore?: (rel: string, isDir: boolean) => boolean;
  maxFiles?: number;
}

export interface WalkResult {
  scanned: number;
  skippedDirs: number;
  truncated: boolean;
}

/** 访问回调：返回 false 可提前停止遍历。 */
export type FileVisitor = (rel: string, abs: string) => Promise<boolean | void>;

export const walkCodeFiles = async (
  deps: { fs: FsPort; ws: string },
  opts: WalkOptions,
  visit: FileVisitor,
): Promise<WalkResult> => {
  const maxFiles = Math.max(1, Number(opts.maxFiles ?? 1_000_000));
  const queue: string[] = [""];
  let scanned = 0;
  let skippedDirs = 0;
  while (queue.length) {
    const dirRel = queue.shift()!;
    const listed = await deps.fs.listDir(absOf(deps.ws, dirRel));
    if (!listed.ok) continue;
    for (const e of listed.value) {
      const rel = dirRel ? `${dirRel}/${e.name}` : e.name;
      if (e.type === "dir") {
        if (shouldSkipDir(e.name) || opts.ignore?.(rel, true)) {
          skippedDirs += 1;
          continue;
        }
        queue.push(rel);
        continue;
      }
      if (e.type !== "file" || !isCodeFile(e.name)) continue;
      if (opts.ignore?.(rel, false)) continue;
      if (scanned >= maxFiles) return { scanned, skippedDirs, truncated: true };
      scanned += 1;
      const stop = await visit(rel, absOf(deps.ws, rel));
      if (stop === false) return { scanned, skippedDirs, truncated: false };
    }
  }
  return { scanned, skippedDirs, truncated: false };
};
