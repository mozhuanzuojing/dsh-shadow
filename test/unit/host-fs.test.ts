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

console.log("✔ host-fs：未就绪 UNAVAILABLE、stat=undefined→NOT_FOUND、惰性就绪、无 rename");
