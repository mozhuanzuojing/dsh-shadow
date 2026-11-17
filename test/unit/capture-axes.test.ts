import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const clock = fixedClock("2026-09-06T12:00:00");

const flushOne = async (fs: MemoryFs, signals: SignalStore, sid: string): Promise<string> => {
  const capture = new Capture({ fs, config: normalizeConfig({ shadowRoot: WS, capture: { unit: "atom" } }), clock, signals, resolveWs: () => WS });
  capture.onSessionEvent({ id: sid, header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "记住这件事" }] } });
  const r = await capture.flush(sid);
  if (!r.ok) throw new Error(r.error.message);
  const files = await fs.listDir(`${WS}/.shadow/atoms`);
  if (!files.ok) throw new Error(files.error.message);
  const text = await fs.readText(`${WS}/.shadow/atoms/${files.value[0]!.name}`);
  if (!text.ok) throw new Error(text.error.message);
  return text.value;
};

// 1) 有 soul.json → 坐标 soul 填实（不再是空壳 default）
const fs1 = new MemoryFs({ [`${WS}/.shadow/soul/soul.json`]: JSON.stringify({ identity: { name: "tester" } }) });
const t1 = await flushOne(fs1, new SignalStore(), "s1");
assert.ok(/soul\(tester\)/.test(t1), `坐标 soul 应填实为 tester：\n${t1.split("\n").find((l) => l.includes("坐标")) ?? t1.slice(0, 200)}`);

// 2) 无 soul.json → soul(default)，正常（不是降级）
const fs2 = new MemoryFs();
const sig2 = new SignalStore();
const t2 = await flushOne(fs2, sig2, "s2");
assert.ok(/soul\(default\)/.test(t2), "无 soul 应退回 soul(default)");
assert.ok(!sig2.active().some((s) => s.capability === "capture.soul"), "缺件不算降级，不应留信号");

// 3) 坏 soul.json → soul(default) + 可见信号（不静默吞错）
const fs3 = new MemoryFs({ [`${WS}/.shadow/soul/soul.json`]: "{ bad json" });
const sig3 = new SignalStore();
const t3 = await flushOne(fs3, sig3, "s3");
assert.ok(/soul\(default\)/.test(t3), "坏 soul 应退回 soul(default)");
assert.ok(sig3.active().some((s) => s.capability === "capture.soul"), "坏 soul 必须留可见信号");

console.log("✔ capture-axes：soul 坐标填实 / 缺件 default（无信号）/ 坏件 default + 可见信号");
