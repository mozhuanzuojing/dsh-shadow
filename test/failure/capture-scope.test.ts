import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const clock = fixedClock("2026-09-06T12:00:00");

// 1) 写侧解析不出工作区：拒绝落盘、pending 保留、可见 Signal（不写 process.cwd）
{
  const fs = new MemoryFs();
  const signals = new SignalStore();
  const capture = new Capture({
    fs,
    config: normalizeConfig({}),
    clock,
    signals,
    resolveWs: () => null,
  });
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "alpha 方案 A" }] } });
  const r = await capture.flush("s1");
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "UNAVAILABLE");
  assert.equal(capture.pendingCount(), 1, "pending 必须保留");
  assert.ok(signals.active().some((s) => s.capability === "capture.scope"));
  const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
  assert.equal(atoms.ok, true);
  if (atoms.ok) assert.equal(atoms.value.length, 0, "不得写任何 atom");
}

// 2) 工具名不是材料；goal 必须落成 > 目标：
{
  const fs = new MemoryFs();
  const signals = new SignalStore();
  const capture = new Capture({ fs, config: normalizeConfig({ shadowRoot: WS }), clock, signals, resolveWs: () => WS });
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "请改 alpha 入口，因为可回滚" }] } });
  capture.onGoalChanged({ agent: { id: "s1" }, change: { goal: { objective: "完成 alpha 改造" } } });
  capture.onFsObserved({ displayPath: `${WS}/src/alpha.ts` }, {}, { agent: { id: "s1" } });
  capture.onToolsResult({ name: "pwsh", agent: { id: "s1" } });
  const r = await capture.flush("s1");
  assert.equal(r.ok, true);
  const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
  if (!atoms.ok) throw new Error(atoms.error.message);
  const name = atoms.value.find((e) => e.name.endsWith(".md"))!.name;
  const text = await fs.readText(`${WS}/.shadow/atoms/${name}`);
  if (!text.ok) throw new Error(text.error.message);
  assert.ok(text.value.includes("> 目标：完成 alpha 改造"), "goal 必须写入线索头");
  assert.ok(!text.value.includes("> 背景/材料：pwsh"), "工具名不得当材料");
  assert.ok(!/背景\/材料：.*pwsh/.test(text.value));
}

console.log("✔ capture scope/quality：无 ws 拒绝落盘 + Signal；goal 落盘；工具名不进材料");
