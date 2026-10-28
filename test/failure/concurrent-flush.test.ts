import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const fs = new MemoryFs();
const config = normalizeConfig({ shadowRoot: WS });
const clock = fixedClock("2026-09-06T12:00:00");
const signals = new SignalStore();
const a = new Capture({ fs, config, clock, signals, resolveWs: () => WS });
const b = new Capture({ fs, config, clock, signals, resolveWs: () => WS });

const event = { type: "user/message", data: { content: [{ type: "text", text: "请把 alpha 入口改成 A" }] } };
a.onSessionEvent({ id: "s1", header: { cwd: WS } }, event);
b.onSessionEvent({ id: "s2", header: { cwd: WS } }, event);

const ra = await a.flush("s1");
const rb = await b.flush("s2");
assert.equal(ra.ok, true);
assert.equal(rb.ok, true);

const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
if (!atoms.ok) throw new Error(atoms.error.message);
const md = atoms.value.filter((e) => e.name.endsWith(".md"));
assert.equal(md.length, 2, `同秒两会话必须 2 个文件，实际 ${md.map((e) => e.name).join(",")}`);
assert.notEqual(md[0]!.name, md[1]!.name);

console.log("✔ concurrency：同秒/同入口两会话并发 flush → 2 个唯一 atom，0 覆盖");
