/**
 * v2 engine — 读取工作区根 `.gitignore` 并构造忽略谓词（供代码检索/符号检索复用）。
 */

import type { FsPort } from "../../store/fs.js";
import { makeIgnore } from "../../domain/ignore.js";

export interface IgnoreConfig {
  useGitignore?: boolean;
  exclude?: string[];
}

const rootOf = (ws: string): string => String(ws).replace(/\\/g, "/").replace(/\/+$/, "");

export const loadIgnore = async (fs: FsPort, ws: string, cfg?: IgnoreConfig): Promise<(rel: string, isDir: boolean) => boolean> => {
  let text = "";
  if (cfg?.useGitignore !== false) {
    const r = await fs.readText(`${rootOf(ws)}/.gitignore`);
    if (r.ok) text = r.value;
  }
  return makeIgnore(text, cfg?.exclude ?? []);
};
