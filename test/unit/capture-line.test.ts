import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { loadAtomsFromLines } from "../../dist/engine/lines.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const clock = fixedClock("2026-09-05T10:00:00");
const fs = new MemoryFs();
const signals = new SignalStore();
const capture = new Capture({
  fs,
  config: normalizeConfig({ shadowRoot: WS, capture: { unit: "line" } }),
  clock,
  signals,
  resolveWs: () => WS,
});

// 同一会话连续两回合
capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "第一句" }] } });
const f1 = await capture.flush("s1");
assert.equal(f1.ok, true, `flush1 应成功：${f1.ok ? "" : f1.error.message}`);
capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "第二句" }] } });
const f2 = await capture.flush("s1");
assert.equal(f2.ok, true, `flush2 应成功：${f2.ok ? "" : f2.error.message}`);

// 1) 只有 1 个线文件，装 2 个点（多回合一条线，不再一话一文件）
const linesDir = await fs.listDir(`${WS}/.shadow/lines`);
assert.ok(linesDir.ok, "lines 目录应存在");
assert.equal(linesDir.value.length, 1, `应只有 1 个线文件，实际 ${linesDir.value.length}`);
const lineText = await fs.readText(`${WS}/.shadow/lines/${linesDir.value[0]!.name}`);
assert.ok(lineText.ok);
const pts = (lineText.value.match(/- \[点#/g) ?? []).length;
assert.equal(pts, 2, `一条线应装 2 点，实际 ${pts}`);

// 2) line 模式不写 atom 文件
const atomsDir = await fs.listDir(`${WS}/.shadow/atoms`);
assert.ok(!atomsDir.ok || atomsDir.value.length === 0, "line 模式不应写 atom 文件");

// 3) 从线可重建 2 个 atom（读路径并集/降维）
const rec = await loadAtomsFromLines(fs, WS);
assert.equal(rec.atoms.length, 2, "从线应重建 2 个点");
assert.equal(rec.errors.length, 0, `重建不应有错：${rec.errors.join("；")}`);

console.log("✔ capture-line：同会话连续两回合 → 1 个线文件装 2 点 · 不写 atom · 可从线重建");

// 模拟「重启」：新 Capture 实例（内存 openLines 空）应按磁盘同 session|entry + gap 续接同一条线
{
  const fs2 = new MemoryFs();
  const mk = () => new Capture({ fs: fs2, config: normalizeConfig({ shadowRoot: WS, capture: { unit: "line" } }), clock, signals: new SignalStore(), resolveWs: () => WS });
  const c1 = mk();
  c1.onSessionEvent({ id: "s9", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "重启前一句" }] } });
  await c1.flush("s9");
  const c2 = mk(); // 重启后的新实例
  c2.onSessionEvent({ id: "s9", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "重启后一句" }] } });
  await c2.flush("s9");
  const ls = await fs2.listDir(`${WS}/.shadow/lines`);
  assert.ok(ls.ok);
  assert.equal(ls.value.length, 1, `重启后续接：应仍只有 1 条线，实际 ${ls.value.length}`);
  const t = await fs2.readText(`${WS}/.shadow/lines/${ls.value[0]!.name}`);
  assert.ok(t.ok);
  assert.equal((t.value.match(/- \[点#/g) ?? []).length, 2, "重启前后两回合应并进同一条线（2 点）");
}
console.log("✔ capture-line：重启后按 session|entry+gap 续接同一条线（不新开）");
