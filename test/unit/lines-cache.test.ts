import assert from "node:assert/strict";
import { loadAtomsFromLinesCached } from "../../dist/engine/lines.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

class CountingFs extends MemoryFs {
  reads = 0;
  override async readText(p: string) {
    if (String(p).includes("/.shadow/lines")) this.reads += 1;
    return super.readText(p);
  }
}

const lineText = `# 线 x\n> 坐标：session(s) · entry(dsh1) · 起(2026-11-17T10:00:00)\n> 完整线索\n- [点#1 10:00:00 turn] a {{rel=.shadow/lines/x.md#1}} {{b64=${Buffer.from("# dsh1\n\n> 坐标：locus(WS) · when(2026-11-17 10:00:00) · soul(lead) · role(default) · intent(capture)\n\n- [10:00:00] [dsh1] 用户：a", "utf8").toString("base64")}}}\n`;
const fs = new CountingFs({ [`${WS}/.shadow/lines/x.md`]: lineText });

const r1 = await loadAtomsFromLinesCached(fs, WS);
const c1 = fs.reads;
assert.ok(r1.atoms.length === 1, "应解析 1 点");
assert.ok(c1 >= 1, "首次应读线文件");

const r2 = await loadAtomsFromLinesCached(fs, WS);
assert.equal(fs.reads, c1, "签名不变时第二次应命中缓存、不再读线文件");
assert.equal(r2.atoms.length, r1.atoms.length);

console.log("✔ lines-cache：签名不变 → 二次读命中内存缓存（不重复读+解析线）");
