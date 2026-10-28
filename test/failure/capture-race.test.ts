import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const clock = fixedClock("2026-09-06T12:00:00");

class SlowFs extends MemoryFs {
  override async writeText(p: string, text: string) {
    await new Promise((r) => setTimeout(r, 20));
    return super.writeText(p, text);
  }
}

// 1) 同一 agent 并发 flush：串行，只写一条
{
  const fs = new SlowFs();
  const capture = new Capture({ fs, config: normalizeConfig({ shadowRoot: WS }), clock, signals: new SignalStore(), resolveWs: () => WS });
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "alpha 方案 A" }] } });
  const [a, b] = await Promise.all([capture.flush("s1"), capture.flush("s1")]);
  assert.equal(a.ok && b.ok, true);
  const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
  if (!atoms.ok) throw new Error(atoms.error.message);
  assert.equal(atoms.value.filter((e) => e.name.endsWith(".md")).length, 1, "并发 flush 不得重复写");
}

// 2) flush 期间新 push：快照只消费开始时的事件，新事件留到下一次
{
  const gate = Promise.withResolvers<void>();
  const started = Promise.withResolvers<void>();
  let gated = false;
  class GateFs extends MemoryFs {
    override async writeText(p: string, text: string) {
      if (!gated && p.includes("/.shadow/atoms/")) {
        gated = true;
        started.resolve();
        await gate.promise;
      }
      return super.writeText(p, text);
    }
  }
  const gfs = new GateFs();
  const capture = new Capture({ fs: gfs, config: normalizeConfig({ shadowRoot: WS }), clock, signals: new SignalStore(), resolveWs: () => WS });
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "第一条 alpha" }] } });
  const p = capture.flush("s1");
  await started.promise;
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "第二条 beta" }] } });
  gate.resolve();
  const first = await p;
  assert.equal(first.ok, true);
  assert.equal(capture.pendingCount(), 1, "flush 期间新事件必须留在 pending");
  const second = await capture.flush("s1");
  assert.equal(second.ok, true);
  const atoms = await gfs.listDir(`${WS}/.shadow/atoms`);
  if (!atoms.ok) throw new Error(atoms.error.message);
  assert.equal(atoms.value.filter((e) => e.name.endsWith(".md")).length, 2, "两次快照应落 2 条 atom");
}

console.log("✔ capture race：并发 flush 串行不重复；flush 期间新事件不丢、下一次落盘");
