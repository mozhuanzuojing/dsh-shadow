/**
 * v1 lab 代码的 fs 门面：把 v2 `FsPort`（path + Outcome）适配成 v1 的 target 风格。
 *
 * vendored 算法全部经这一个门面访问存储；写仍走宿主 fs（沙箱策略已由上层 ReadDeps.fs 绑定）。
 */

import type { FsPort } from "../store/fs.js";

const pathOf = (t: any): string => String(t?.displayPath ?? t?.targetKey ?? t ?? "");

/**
 * 硬边界：lab **永不写 atoms**（docs/v2/LAB.md / ARCHITECTURE §8：atoms 是唯一记忆权威）。
 *
 * 为什么在 fs 门面拦而不是只靠字段 schema：写路径可能由 vendored builder 用 input 拼出来
 * （典型：workspace-record 的 kind 拼进 `.shadow/<kind>/`）。只校验字段值挡不住所有拼法，
 * 在**所有写操作汇合的唯一门面**上按路径段判定，才是不依赖调用方式的契约。
 * 判定用「相邻两段 = .shadow + atoms」而不是字符串包含：兼容相对/绝对、正反斜杠、大小写。
 */
const hitsAtomsPath = (raw: string): boolean => {
  const parts = String(raw ?? "").replace(/\\/g, "/").toLowerCase().split("/").filter((s) => s && s !== ".");
  for (let i = 0; i < parts.length - 1; i++) {
    if (parts[i] === ".shadow" && parts[i + 1] === "atoms") return true;
  }
  return false;
};
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
      if (hitsAtomsPath(pathOf(t))) fail("lab 不允许写 .shadow/atoms（atoms 是唯一记忆权威，写操作被拒绝）", "WRITE_DENIED");
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
      if (hitsAtomsPath(pathOf(t))) fail("lab 不允许写 .shadow/atoms（atoms 是唯一记忆权威，写操作被拒绝）", "WRITE_DENIED");
      return unwrap(await port.appendText(pathOf(t), text));
    },
    processPath(t: any) {
      return pathOf(t);
    },
  };
  return fs;
};
