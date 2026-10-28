/**
 * v2 store — 宿主 fs 适配器（P0：不绕过 DSH 的 fs / sandbox）。
 *
 * 生产走 `ctx.get("fs")`；写入把 `sandboxPolicy.resolve({session})` 作为第 5 参传给宿主。
 * 测试/CLI 可包 `realFs`（同时兼容返回 Outcome 的实现）。
 */

import { err, ok, type Outcome } from "../contract/outcome.js";
import type { FsEntry, FsPort, FsStat } from "./fs.js";

type AnyRaw = Record<string, any>;
type RawSource = AnyRaw | (() => AnyRaw | undefined);

const hostMessage = (e: unknown): string => (e instanceof Error ? e.message : String(e));

const mapHostError = <T>(e: unknown, p: string): Outcome<T> => {
  const msg = hostMessage(e);
  if (/UNAVAILABLE:\s*fs 服务未就绪/.test(msg)) return err("UNAVAILABLE", "fs 服务未就绪", { path: p }, true);
  if (/ENOENT|FS_NOT_FOUND|not found|no such file/i.test(msg)) return err("NOT_FOUND", `目标不存在：${p}`, { path: p });
  if (/EACCES|EPERM|denied|permission/i.test(msg)) return err("PERMISSION", `无权访问：${p}`, { path: p });
  if (/BUSY|locked|stale version|CONFLICT/i.test(msg)) return err("BUSY", `文件忙/版本冲突：${p}`, { path: p }, true);
  return err("IO", `宿主 fs 失败：${p}（${msg}）`, { path: p }, true);
};

const isOutcome = (x: any): x is Outcome<any> => !!x && typeof x === "object" && "ok" in x;

const unwrap = <T>(x: any, p: string): Outcome<T> => {
  if (isOutcome(x)) return x as Outcome<T>;
  return ok(x as T);
};

export class HostFs implements FsPort {
  constructor(
    private readonly rawSource: RawSource,
    private readonly policy?: any,
    private readonly cwd?: string,
  ) {}

  private rawOrNull(): AnyRaw | undefined {
    return typeof this.rawSource === "function" ? this.rawSource() : this.rawSource;
  }

  private get raw(): AnyRaw {
    const r = this.rawOrNull();
    if (!r) throw new Error("UNAVAILABLE: fs 服务未就绪");
    return r;
  }

  get atomicRename(): boolean {
    return typeof this.rawOrNull()?.rename === "function";
  }

  /** 同一底层 fs，换 session 策略（同一会话/agent 的写围栏）。 */
  withPolicy(policy: any, cwd?: string): HostFs {
    return new HostFs(this.rawSource, policy, cwd ?? this.cwd);
  }

  private async target(p: string): Promise<any> {
    return this.raw.resolve(p, this.cwd ? { cwd: this.cwd } : undefined);
  }

  private display(t: any, fallback: string): string {
    if (typeof t === "string") return t;
    return String(t?.displayPath ?? t?.targetKey ?? fallback);
  }

  async resolve(p: string): Promise<{ displayPath: string }> {
    try {
      return { displayPath: this.display(await this.target(p), p) };
    } catch {
      return { displayPath: p };
    }
  }

  async readText(p: string): Promise<Outcome<string>> {
    try {
      const t = await this.target(p);
      const r = await this.raw.readText(t);
      const u = unwrap<string>(r, p);
      if (!u.ok) return u;
      return ok(String(u.value ?? ""));
    } catch (e) {
      return mapHostError<string>(e, p);
    }
  }

  async writeText(p: string, text: string): Promise<Outcome<FsStat>> {
    try {
      const t = await this.target(p);
      const r = await this.raw.writeText(t, text, undefined, undefined, this.policy);
      const u = unwrap<any>(r, p);
      if (!u.ok) return u;
      const st = await this.stat(p);
      return st.ok ? ok(st.value) : ok({ size: text.length, mtimeMs: Date.now() });
    } catch (e) {
      return mapHostError<FsStat>(e, p);
    }
  }

  async appendText(p: string, text: string): Promise<Outcome<void>> {
    try {
      const t = await this.target(p);
      if (typeof this.raw.appendText === "function") {
        const r = await this.raw.appendText(t, text, undefined, undefined, this.policy);
        return unwrap<void>(r, p);
      }
      const prev = await this.readText(p);
      const w = await this.writeText(p, `${prev.ok ? prev.value : ""}${text}`);
      return w.ok ? ok(undefined) : w;
    } catch (e) {
      return mapHostError<void>(e, p);
    }
  }

  async listDir(p: string): Promise<Outcome<FsEntry[]>> {
    try {
      const t = await this.target(p);
      const r = await this.raw.listDir(t);
      const u = unwrap<any[]>(r, p);
      if (!u.ok) return u;
      const entries = (u.value ?? []).map((e: any) => ({
        name: String(e?.name ?? ""),
        type: e?.type === "dir" || e?.type === "directory" ? "dir" as const : e?.type === "file" ? "file" as const : "other" as const,
        size: e?.size === undefined ? undefined : Number(e.size),
        version: e?.version ? String(e.version) : undefined,
      }));
      return ok(entries);
    } catch (e) {
      return mapHostError<FsEntry[]>(e, p);
    }
  }

  async stat(p: string): Promise<Outcome<FsStat>> {
    try {
      const t = await this.target(p);
      if (typeof this.raw.stat === "function") {
        const r = await this.raw.stat(t);
        if (r === undefined || r === null) return err("NOT_FOUND", `目标不存在：${p}`, { path: p });
        const u = unwrap<any>(r, p);
        if (!u.ok) return u;
        const s = u.value ?? {};
        if (s === undefined || s === null) return err("NOT_FOUND", `目标不存在：${p}`, { path: p });
        return ok({ size: Number(s.size ?? 0), mtimeMs: Number(s.mtimeMs ?? s.mtime ?? 0), version: s.version ? String(s.version) : undefined });
      }
      // 无 stat：从父目录 entry 取 size/version（DSH listDir 的 entry 带这两项）
      const idx = p.replace(/\\/g, "/").lastIndexOf("/");
      if (idx < 0) return err("UNAVAILABLE", `宿主 fs 无 stat：${p}`);
      const parent = p.slice(0, idx);
      const name = p.slice(idx + 1);
      const listed = await this.listDir(parent);
      if (!listed.ok) return listed;
      const e = listed.value.find((x) => x.name === name);
      if (!e) return err("NOT_FOUND", `目标不存在：${p}`, { path: p });
      return ok({ size: Number(e.size ?? 0), mtimeMs: 0, version: e.version });
    } catch (e) {
      return mapHostError<FsStat>(e, p);
    }
  }

  async exists(p: string): Promise<boolean> {
    const s = await this.stat(p);
    return s.ok;
  }

  async rename(from: string, to: string): Promise<Outcome<void>> {
    if (typeof this.raw.rename !== "function") return err("UNAVAILABLE", `宿主 fs 不支持 rename：${from} → ${to}`);
    try {
      const a = await this.target(from);
      const b = await this.target(to);
      const r = await this.raw.rename(a, b);
      return unwrap<void>(r, `${from} → ${to}`);
    } catch (e) {
      return mapHostError<void>(e, `${from} → ${to}`);
    }
  }

  async unlink(p: string): Promise<Outcome<void>> {
    if (typeof this.raw.unlink !== "function") return err("UNAVAILABLE", `宿主 fs 不支持 unlink：${p}`);
    try {
      const r = await this.raw.unlink(await this.target(p));
      return unwrap<void>(r, p);
    } catch (e) {
      return mapHostError<void>(e, p);
    }
  }

  async mkdirp(p: string): Promise<Outcome<void>> {
    if (typeof this.raw.mkdirp !== "function") return ok(undefined);
    try {
      const r = await this.raw.mkdirp(await this.target(p));
      return unwrap<void>(r, p);
    } catch (e) {
      return mapHostError<void>(e, p);
    }
  }
}

