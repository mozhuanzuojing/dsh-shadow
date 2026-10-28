import { realFs } from "../dist/store/fs.js";

const target = (t: any): any => (typeof t === "string" ? { displayPath: t } : t);
const pathOf = (t: any): string => String(t?.displayPath ?? t?.targetKey ?? t);
const unwrap = (r: any): any => {
  if (r && typeof r === "object" && "ok" in r) {
    if (!r.ok) throw Object.assign(new Error(r.error.message), { code: r.error.code });
    return r.value;
  }
  return r;
};

/** 测试用宿主 fs 形状（方法收 target、失败抛错），底层是 realFs。 */
export const hostFs = {
  async resolve(p: string) {
    return { displayPath: String(p), targetKey: String(p) };
  },
  async readText(t: any) {
    return String(unwrap(await realFs.readText(pathOf(t))) ?? "");
  },
  async writeText(t: any, text: string) {
    return unwrap(await realFs.writeText(pathOf(t), text));
  },
  async appendText(t: any, text: string) {
    return unwrap(await realFs.appendText(pathOf(t), text));
  },
  async listDir(t: any) {
    const entries = unwrap(await realFs.listDir(pathOf(t))) as any[];
    return entries.map((e) => ({ name: e.name, type: e.type === "dir" ? "directory" : e.type, size: e.size, version: e.version }));
  },
  async stat(t: any) {
    return unwrap(await realFs.stat(pathOf(t)));
  },
  async rename(a: any, b: any) {
    return unwrap(await realFs.rename(pathOf(a), pathOf(b)));
  },
  async unlink(t: any) {
    return unwrap(await realFs.unlink(pathOf(t)));
  },
  async mkdirp(t: any) {
    return unwrap(await realFs.mkdirp(pathOf(t)));
  },
};
