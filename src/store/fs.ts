/**
 * v2 store — fs port：真实文件系统与忠实内存实现共用同一接口。
 *
 * 关键语义：NOT_FOUND 与 IO/PERMISSION 必须可区分；空目录是 ok([])，读失败是 err。
 */

import * as fsp from "node:fs/promises";
import * as path from "node:path";
import { err, ok, type Outcome } from "../contract/outcome.js";

export interface FsEntry {
  name: string;
  type: "file" | "dir" | "other";
  size?: number;
  version?: string;
}

export interface FsStat {
  size: number;
  mtimeMs: number;
  version?: string;
}

export interface FsPort {
  /** false = 宿主没有原子 rename（如 DSH fs 只暴露 writeText）；writeAtom 直接写目标并依赖 exists 守卫。 */
  atomicRename?: boolean;
  resolve(p: string): Promise<{ displayPath: string }>;
  readText(p: string): Promise<Outcome<string>>;
  writeText(p: string, text: string): Promise<Outcome<FsStat>>;
  appendText(p: string, text: string): Promise<Outcome<void>>;
  listDir(p: string): Promise<Outcome<FsEntry[]>>;
  stat(p: string): Promise<Outcome<FsStat>>;
  exists(p: string): Promise<boolean>;
  rename(from: string, to: string): Promise<Outcome<void>>;
  unlink(p: string): Promise<Outcome<void>>;
  mkdirp(p: string): Promise<Outcome<void>>;
}

const codeOf = (e: unknown): string => {
  if (e && typeof e === "object" && "code" in e && typeof (e as { code?: unknown }).code === "string") {
    return (e as { code: string }).code;
  }
  return "IO";
};

const notFound = (p: string): Outcome<never> => err("NOT_FOUND", `目标不存在：${p}`, { path: p });

const mapError = (e: unknown, p: string): Outcome<never> => {
  const code = codeOf(e);
  if (code === "ENOENT") return notFound(p);
  if (code === "EACCES" || code === "EPERM") return err("PERMISSION", `无权访问：${p}`, { path: p, code });
  return err("IO", `读/写失败：${p}（${code}）`, { path: p, code }, true);
};

export const realFs: FsPort = {
  async resolve(p) {
    return { displayPath: path.resolve(String(p)) };
  },
  async readText(p) {
    try {
      return ok(await fsp.readFile(p, "utf8"));
    } catch (e) {
      return mapError(e, p);
    }
  },
  async writeText(p, text) {
    try {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.writeFile(p, text, "utf8");
      const st = await fsp.stat(p);
      return ok({ size: st.size, mtimeMs: st.mtimeMs, version: `${st.size}:${Math.floor(st.mtimeMs)}` });
    } catch (e) {
      return mapError(e, p);
    }
  },
  async appendText(p, text) {
    try {
      await fsp.mkdir(path.dirname(p), { recursive: true });
      await fsp.appendFile(p, text, "utf8");
      return ok(undefined);
    } catch (e) {
      return mapError(e, p);
    }
  },
  async listDir(p) {
    try {
      const entries = await fsp.readdir(p, { withFileTypes: true });
      return ok(
        entries.map((e) => ({
          name: e.name,
          type: e.isDirectory() ? "dir" : e.isFile() ? "file" : "other",
        })),
      );
    } catch (e) {
      if (codeOf(e) === "ENOTDIR") return notFound(p);
      return mapError(e, p);
    }
  },
  async stat(p) {
    try {
      const st = await fsp.stat(p);
      return ok({ size: st.size, mtimeMs: st.mtimeMs, version: `${st.size}:${Math.floor(st.mtimeMs)}` });
    } catch (e) {
      return mapError(e, p);
    }
  },
  async exists(p) {
    try {
      await fsp.access(p);
      return true;
    } catch {
      return false;
    }
  },
  async rename(from, to) {
    try {
      await fsp.mkdir(path.dirname(to), { recursive: true });
      await fsp.rename(from, to);
      return ok(undefined);
    } catch (e) {
      return mapError(e, `${from} → ${to}`);
    }
  },
  async unlink(p) {
    try {
      await fsp.unlink(p);
      return ok(undefined);
    } catch (e) {
      return mapError(e, p);
    }
  },
  async mkdirp(p) {
    try {
      await fsp.mkdir(p, { recursive: true });
      return ok(undefined);
    } catch (e) {
      return mapError(e, p);
    }
  },
};

/** 测试用内存 fs：目录隐式存在；写版本单调递增；与 realFs 语义一致。 */
export class MemoryFs implements FsPort {
  private files = new Map<string, string>();
  private clock = 0;

  constructor(seed: Record<string, string> = {}) {
    for (const [k, v] of Object.entries(seed)) this.files.set(this.norm(k), v);
  }

  private norm(p: string): string {
    return String(p).replace(/\\/g, "/").replace(/\/+/g, "/");
  }

  async resolve(p: string): Promise<{ displayPath: string }> {
    return { displayPath: this.norm(p) };
  }

  async readText(p: string): Promise<Outcome<string>> {
    const v = this.files.get(this.norm(p));
    return v === undefined ? notFound(p) : ok(v);
  }

  async writeText(p: string, text: string): Promise<Outcome<FsStat>> {
    const key = this.norm(p);
    this.files.set(key, text);
    this.clock += 1;
    return ok({ size: Buffer.byteLength(text, "utf8"), mtimeMs: this.clock, version: `v${this.clock}` });
  }

  async appendText(p: string, text: string): Promise<Outcome<void>> {
    const key = this.norm(p);
    this.files.set(key, (this.files.get(key) ?? "") + text);
    this.clock += 1;
    return ok(undefined);
  }

  async listDir(p: string): Promise<Outcome<FsEntry[]>> {
    const base = this.norm(p).replace(/\/+$/, "");
    const prefix = base + "/";
    const names = new Map<string, FsEntry["type"]>();
    for (const k of this.files.keys()) {
      if (!k.startsWith(prefix)) continue;
      const rest = k.slice(prefix.length);
      const first = rest.split("/")[0]!;
      if (!first) continue;
      names.set(first, rest.includes("/") ? "dir" : "file");
    }
    return ok([...names.entries()].map(([name, type]) => ({ name, type })));
  }

  async stat(p: string): Promise<Outcome<FsStat>> {
    const key = this.norm(p);
    const v = this.files.get(key);
    if (v === undefined) {
      const prefix = key.replace(/\/+$/, "") + "/";
      return [...this.files.keys()].some((k) => k.startsWith(prefix))
        ? ok({ size: 0, mtimeMs: this.clock, version: `d${this.clock}` })
        : notFound(p);
    }
    return ok({ size: Buffer.byteLength(v, "utf8"), mtimeMs: this.clock, version: `f${this.clock}` });
  }

  async exists(p: string): Promise<boolean> {
    const key = this.norm(p);
    if (this.files.has(key)) return true;
    const prefix = key.replace(/\/+$/, "") + "/";
    return [...this.files.keys()].some((k) => k.startsWith(prefix));
  }

  async rename(from: string, to: string): Promise<Outcome<void>> {
    const a = this.norm(from);
    const b = this.norm(to);
    const v = this.files.get(a);
    if (v === undefined) return notFound(from);
    this.files.delete(a);
    this.files.set(b, v);
    this.clock += 1;
    return ok(undefined);
  }

  async unlink(p: string): Promise<Outcome<void>> {
    const key = this.norm(p);
    if (!this.files.delete(key)) return notFound(p);
    this.clock += 1;
    return ok(undefined);
  }

  async mkdirp(_p: string): Promise<Outcome<void>> {
    return ok(undefined);
  }
}
