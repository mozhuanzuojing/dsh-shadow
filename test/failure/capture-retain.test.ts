import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { err } from "../../dist/contract/outcome.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

class FlakyFs extends MemoryFs {
  failNext = true;
  override async writeText(p: string, text: string) {
    if (this.failNext) {
      this.failNext = false;
      return err("PERMISSION", "denied", { path: p }) as never;
    }
    return super.writeText(p, text);
  }
}

const fs = new FlakyFs();
const signals = new SignalStore();
const capture = new Capture({
  fs,
  config: normalizeConfig({ shadowRoot: WS, capture: { summary: "deterministic" } }),
  clock: fixedClock("2026-09-06T12:00:00"),
  signals,
  resolveWs: () => WS,
});

capture.onSessionEvent(
  { id: "s1", header: { cwd: WS } },
  { type: "user/message", data: { content: [{ type: "text", text: "请把 alpha 入口改成 A" }] } },
);

const first = await capture.flush("s1");
assert.equal(first.ok, false);
if (!first.ok) assert.equal(first.error.code, "PERMISSION");
assert.ok(capture.pendingCount() > 0, "写失败后 pending 必须保留");
assert.ok(signals.active().some((s) => s.capability === "capture.flush"), "写失败必须留 Signal");

const second = await capture.flush("s1");
assert.equal(second.ok, true, "重试必须成功");
if (second.ok) assert.equal(second.value.written, 1);
assert.equal(capture.pendingCount(), 0);
assert.ok(!signals.active().some((s) => s.capability === "capture.flush"), "成功后 Signal 清除");

console.log("✔ capture failure：写失败 pending 保留 + Signal；重试成功且清除，不丢整回合");
