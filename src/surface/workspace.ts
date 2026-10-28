/**
 * v2 surface — workspace 解析：显式 root > 会话 cwd > 兜底；兜底必须可见。
 */

import type { NormalizedConfig } from "../contract/config.js";

export interface ResolvedWorkspace {
  ws: string;
  kind: "explicit" | "session" | "fallback";
  notice?: string;
}

export interface ExecLike {
  agent?: { id?: string; session?: { header?: { cwd?: string } } };
}

const norm = (p: string): string => String(p ?? "").replace(/\\/g, "/").replace(/\/+$/, "");

const stripShadow = (p: string): string => {
  const s = norm(p);
  return s.endsWith("/.shadow") ? s.slice(0, -"/.shadow".length) : s;
};

export const resolveWorkspace = (exec: ExecLike | undefined, config: NormalizedConfig): ResolvedWorkspace | null => {
  const explicit = config.shadowRoot || config.projectRoot;
  if (explicit && explicit.trim()) return { ws: stripShadow(explicit.trim()), kind: "explicit" };
  const cwd = exec?.agent?.session?.header?.cwd;
  if (typeof cwd === "string" && cwd.trim()) return { ws: norm(cwd.trim()), kind: "session" };
  const fallback = norm(process.cwd());
  if (!fallback) return null;
  return {
    ws: fallback,
    kind: "fallback",
    notice: "未配置 shadowRoot/projectRoot，且解析不出会话 cwd；本次使用进程 cwd 作为工作区（未受会话授权）。",
  };
};
