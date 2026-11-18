import assert from "node:assert/strict";
import { appendPoint, renderLineHeader, type LinePoint } from "../../dist/domain/lines.js";
import { loadAtomsFromLines, loadAtomsFromLinesCached } from "../../dist/engine/lines.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

// 线源性能冒烟：N 点一条线，冷解析 < 宽松上限 + 热缓存命中不更慢（防大语料退化，非精确基准）。
const N = 1500;
const H = { lineId: "perf", session: "s", entry: "dsh1", startAt: "2026-11-18T10:00:00" };
let text = renderLineHeader(H);
for (let i = 1; i <= N; i++) {
  const mm = String(Math.floor(i / 60) % 60).padStart(2, "0");
  const ss = String(i % 60).padStart(2, "0");
  const p: LinePoint = {
    seq: i,
    at: `10:${mm}:${ss}`,
    kind: "turn",
    rel: `.shadow/lines/perf.md#${i}`,
    text: `p${i}`,
    body: `# dsh1\n\n> 坐标：locus(${WS}) · when(2026-11-18 10:${mm}:${ss}) · soul(lead) · role(default) · intent(capture)\n\n- [10:${mm}:${ss}] [dsh1] 用户：p${i}`,
  };
  text = appendPoint(text, H, p);
}
const fs = new MemoryFs({ [`${WS}/.shadow/lines/perf.md`]: text });

const t0 = performance.now();
const cold = await loadAtomsFromLines(fs, WS);
const coldMs = performance.now() - t0;
assert.equal(cold.atoms.length, N, `应解析 ${N} 点，实际 ${cold.atoms.length}`);
assert.ok(coldMs < 5000, `冷解析 ${N} 点应 < 5000ms（宽松上限），实际 ${coldMs.toFixed(0)}ms`);

// 预热缓存后，二次读应命中（< 冷解析，且点数一致）
await loadAtomsFromLinesCached(fs, WS);
const t1 = performance.now();
const r2 = await loadAtomsFromLinesCached(fs, WS);
const warmMs = performance.now() - t1;
assert.equal(r2.atoms.length, N);
assert.ok(warmMs <= coldMs + 5, `命中缓存不应比冷解析更慢（warm ${warmMs.toFixed(1)}ms vs cold ${coldMs.toFixed(1)}ms）`);

console.log(`✔ lines-perf：${N} 点冷解析 ${coldMs.toFixed(0)}ms（<5000 上限）· 缓存命中 ${warmMs.toFixed(1)}ms`);
