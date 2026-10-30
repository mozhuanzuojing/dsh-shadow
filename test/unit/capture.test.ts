import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { err } from "../../dist/contract/outcome.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const clock = fixedClock("2026-09-06T12:00:00");

const make = (fs: MemoryFs, cfg: any = {}) => {
  const signals = new SignalStore();
  const capture = new Capture({
    fs,
    config: normalizeConfig({ shadowRoot: WS, ...cfg }),
    clock,
    signals,
    resolveWs: () => WS,
  });
  return { capture, signals, fs };
};

const fs = new MemoryFs();
const { capture, signals } = make(fs);
capture.onFsObserved({ displayPath: `${WS}/src/alpha.ts` }, {}, { agent: { id: "s1" } });
capture.onSessionEvent(
  { id: "s1", header: { cwd: WS } },
  { type: "user/message", data: { content: [{ type: "text", text: "请把 alpha 入口改成 A，因为可回滚" }] } },
);
const flushed = await capture.flush("s1");
if (!flushed.ok) throw new Error(flushed.error.message);
assert.equal(flushed.value.written, 1);
assert.equal(capture.pendingCount(), 0);
assert.equal(signals.active().length, 0);

const files = await fs.listDir(`${WS}/.shadow/atoms`);
if (!files.ok) throw new Error(files.error.message);
assert.equal(files.value.length, 1);
const name = files.value[0]!.name;
assert.ok(name.includes("src-alpha-ts"), `entry 不应是 shadow：${name}`);
const text = await fs.readText(`${WS}/.shadow/atoms/${name}`);
if (!text.ok) throw new Error(text.error.message);
assert.ok(text.value.startsWith("# src/alpha.ts"), text.value.slice(0, 80));
assert.ok(text.value.includes("> 摘要："));
assert.ok(text.value.includes("> 决策：〔user〕"));
assert.ok(text.value.includes("用户：请把 alpha 入口改成 A"));
assert.ok(text.value.includes("> 项目：ws"));

// afterFlush：成功写 atom 后触发一次（写路径归档的接缝）
const seen: string[] = [];
const capture2 = new Capture({
  fs: new MemoryFs(),
  config: normalizeConfig({ shadowRoot: WS }),
  clock,
  signals: new SignalStore(),
  resolveWs: () => WS,
  afterFlush: (ws) => seen.push(ws),
});
capture2.onSessionEvent(
  { id: "s2", header: { cwd: WS } },
  { type: "user/message", data: { content: [{ type: "text", text: "记住 beta 入口" }] } },
);
const flushed2 = await capture2.flush("s2");
assert.equal(flushed2.ok, true);
assert.deepEqual(seen, [WS], "afterFlush 必须在 atom 写成功后触发一次");

console.log("✔ capture：fs 入口 + 用户决策 → 一条 atom；entry 非 shadow；摘要/决策/项目齐；afterFlush 触发");
