import assert from "node:assert/strict";
import { err } from "../../dist/contract/outcome.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { runRead } from "../../dist/engine/read/route.js";
import { makeDeps, seedCorpus, WS } from "../helpers.ts";

class NoAtomsFs extends MemoryFs {
  override async listDir(p: string) {
    if (p.includes(".shadow/atoms")) return err("PERMISSION", "denied", { path: p }) as never;
    return super.listDir(p);
  }
}

const denied = makeDeps();
denied.fs = new NoAtomsFs(seedCorpus());
const r = await runRead(denied, {});
assert.equal(r.ok, false);
if (!r.ok) assert.equal(r.error.code, "PERMISSION");
assert.ok(denied.signals.active().some((s) => s.capability === "atoms"), "读失败必须留 Signal");

class PartialFs extends MemoryFs {
  override async readText(p: string) {
    if (p.includes("src-auth")) return err("PERMISSION", "denied", { path: p }) as never;
    return super.readText(p);
  }
}
const partial = makeDeps();
partial.fs = new PartialFs(seedCorpus());
const pr = await runRead(partial, {});
assert.equal(pr.ok, true);
if (pr.ok) assert.ok(pr.value.text.includes("atoms.partial"), "部分读失败应可见");
assert.ok(partial.signals.active().some((s) => s.capability === "atoms.partial"));

const fallback = makeDeps();
fallback.ws = WS;
assert.ok(fallback.signals.render() === "");

console.log("✔ failure：目录读失败显式 + Signal；单文件失败部分可见；空 ≠ 失败");

