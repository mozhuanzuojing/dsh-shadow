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

/**
 * 工作区是否在「非本地 / 无法给 SQLite 加锁」的文件系统上。
 *
 * WSL 的 `\\wsl.localhost\<distro>\...`（经 9P 暴露）、`\\wsl$\...` 以及 SMB/UNC 网络共享上，
 * SQLite 需要的 POSIX 字节范围锁不可靠：`PRAGMA journal_mode=WAL` 与随后的建表会各自
 * busy-wait 到超时（默认 3s）再报 `database is locked`。而 `node:sqlite` 的 `DatabaseSync`
 * 是**同步**的——这几秒里整个宿主 Node 事件循环被占满，DSH 的所有会话、Web UI、以及 WSL
 * 桥接都无法响应，表现为整个应用「卡死」，用户往往只能强制结束进程（于是本轮工具被记成
 * interrupted / outcome unknown）。
 *
 * 派生索引本来就是「删掉也能仅凭 atoms 重建」的可选项，所以这类工作区**跳过 SQLite、
 * 直接从 atoms 读**是正确的降级，而不是绕过：数据不丢，只是 hits/query-log/生命周期
 * 这类派生观测不生效（调用方会留可见 Signal）。
 *
 * 判定口径（保守，宁可跳过索引也不冒同步阻塞的险）：
 * - 归一化后以 `//` 开头 → UNC / 网络共享（`\\wsl.localhost\…`、`\\server\share\…`）。
 * - Windows 宿主上出现 POSIX 绝对路径（`/home/g/…`）→ 没有本地盘根，属异世界路径。
 */
export const isRemoteWorkspace = (ws: string, platform: string = process.platform): boolean => {
  const s = String(ws ?? "").replace(/\\/g, "/");
  if (s.startsWith("//")) return true;
  if (platform === "win32" && s.startsWith("/") && !/^\/[A-Za-z]:/.test(s)) return true;
  return false;
};
