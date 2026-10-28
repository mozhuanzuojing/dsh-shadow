/**
 * v1 lab 代码的 fs 门面：把 v2 `FsPort`（path + Outcome）适配成 v1 的 target 风格。
 *
 * vendored 算法全部经这一个门面访问存储；写仍走宿主 fs（沙箱策略已由上层 ReadDeps.fs 绑定）。
 */

import type { FsPort } from "../store/fs.js";

const pathOf = (t: any): string => String(t?.displayPath ?? t?.targetKey ?? t ?? "");
const fail = (message: string, code?: string): never => {
  throw Object.assign(new Error(message), { code: code ?? "IO" });
};

const unwrap = <T>(r: { ok: true; value: T } | { ok: false; error: { code: string; message: string } }): T => {
  if (r.ok) return r.value;
  return fail(r.error.message, r.error.code);
};

export const toV1Fs = (port: FsPort): any => {
  const fs: any = {
    async resolve(p: string, _opts?: any) {
      return { displayPath: String(p), targetKey: String(p) };
    },
    async readText(t: any) {
      return unwrap(await port.readText(pathOf(t)));
    },
    async writeText(t: any, text: string) {
      return unwrap(await port.writeText(pathOf(t), text));
    },
    async listDir(t: any) {
      const root = pathOf(t).replace(/\\/g, "/").replace(/\/+$/, "");
      const entries = unwrap(await port.listDir(pathOf(t)));
      return entries.map((e) => ({
        name: e.name,
        type: e.type === "dir" ? "directory" : e.type,
        target: { displayPath: `${root}/${e.name}` },
        size: e.size,
        version: e.version,
      }));
    },
    async stat(t: any) {
      return unwrap(await port.stat(pathOf(t)));
    },
    async appendText(t: any, text: string) {
      return unwrap(await port.appendText(pathOf(t), text));
    },
    processPath(t: any) {
      return pathOf(t);
    },
  };
  return fs;
};
