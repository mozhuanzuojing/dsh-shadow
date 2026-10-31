import assert from "node:assert/strict";
import { HostFs } from "../../dist/store/host-fs.js";

// 1) 服务未就绪：返回 UNAVAILABLE，而不是悄悄读 node:fs
{
  const fs = new HostFs(() => undefined);
  const r = await fs.readText("/x");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "UNAVAILABLE");
  assert.equal(await fs.exists("/x"), false);
}

// 2) 宿主 stat 对缺失返回 undefined：必须当 NOT_FOUND（不能把“不存在”当 size=0 的存在）
{
  const raw = {
    resolve: async (p: string) => ({ displayPath: p }),
    stat: async () => undefined,
    readText: async () => "",
    listDir: async () => [],
  };
  const fs = new HostFs(raw);
  assert.equal(await fs.exists("/missing"), false);
  const st = await fs.stat("/missing");
  assert.equal(st.ok, false);
  if (!st.ok) assert.equal(st.error.code, "NOT_FOUND");
}

// 3) 惰性服务：先无、后就绪
{
  let raw: any;
  const fs = new HostFs(() => raw);
  const before = await fs.readText("/x");
  assert.equal(before.ok, false);
  raw = { resolve: async (p: string) => ({ displayPath: p }), readText: async () => "hello" };
  const after = await fs.readText("/x");
  assert.equal(after.ok, true);
  if (after.ok) assert.equal(after.value, "hello");
  assert.equal(fs.atomicRename, false);
}

// 4) 宿主无 rename：退化为 copy→回读校验→unlink，不声称原子但必须可用
{
  const files = new Map<string, string>();
  const raw = {
    resolve: async (p: string) => ({ displayPath: p }),
    readText: async (t: any) => {
      const p = t.displayPath;
      if (!files.has(p)) throw new Error(`ENOENT: ${p}`);
      return files.get(p)!;
    },
    writeText: async (t: any, text: string) => {
      files.set(t.displayPath, text);
      return { size: text.length };
    },
    unlink: async (t: any) => {
      if (!files.delete(t.displayPath)) throw new Error(`ENOENT: ${t.displayPath}`);
    },
    listDir: async () => [],
  };
  const fs = new HostFs(raw);
  files.set("/a", "hello");
  const r = await fs.rename("/a", "/b");
  assert.equal(r.ok, true);
  assert.equal(files.has("/a"), false, "源必须删除");
  assert.equal(files.get("/b"), "hello", "目标内容必须回读一致");
  assert.equal(fs.atomicRename, false, "fallback 不能把 rename 宣称为原子");
  const missing = await fs.rename("/missing", "/c");
  assert.equal(missing.ok, false);
  if (!missing.ok) assert.equal(missing.error.code, "NOT_FOUND");
}

console.log("✔ host-fs：未就绪 UNAVAILABLE、stat=undefined→NOT_FOUND、惰性就绪、无 rename 时 copy+verify+unlink");
