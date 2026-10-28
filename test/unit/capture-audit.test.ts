import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { Capture } from "../../dist/engine/write/capture.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const clock = fixedClock("2026-09-06T12:00:00");
const make = (cfg: any = {}) => {
  const fs = new MemoryFs();
  const signals = new SignalStore();
  const capture = new Capture({
    fs,
    config: normalizeConfig({ shadowRoot: WS, ...cfg }),
    clock,
    signals,
    resolveWs: () => WS,
  });
  return { fs, signals, capture };
};

// 纯动作 → audit，不产生 atom
{
  const { fs, capture } = make();
  capture.onToolsResult({ name: "pwsh", agent: { id: "s1" } });
  capture.onToolsResult({ name: "rg", agent: { id: "s1" } });
  const r = await capture.flush("s1");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.audit, 2);
  const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
  assert.equal(atoms.ok, true);
  if (atoms.ok) assert.equal(atoms.value.length, 0);
  const audit = await fs.readText(`${WS}/.shadow/audit/2026-09-06.jsonl`);
  assert.equal(audit.ok, true);
  if (audit.ok) assert.ok(audit.value.includes("\"tool\""));
}

// consent=true 且无显式「记住」→ audit + 可见 signal
{
  const { fs, signals, capture } = make({ capture: { consent: true } });
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "请把 alpha 入口改成 A" }] } });
  const r = await capture.flush("s1");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.audit, 2);
  assert.ok(signals.active().some((s) => s.capability === "capture.consent"));
  const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
  assert.equal(atoms.ok, true);
  if (atoms.ok) assert.equal(atoms.value.length, 0);
}

// 显式「记住」→ 落 atom
{
  const { fs, capture } = make({ capture: { consent: true } });
  capture.onSessionEvent({ id: "s1", header: { cwd: WS } }, { type: "user/message", data: { content: [{ type: "text", text: "记住：alpha 入口用 A 方案" }] } });
  const r = await capture.flush("s1");
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.value.written, 1);
  const atoms = await fs.listDir(`${WS}/.shadow/atoms`);
  assert.equal(atoms.ok, true);
  if (atoms.ok) assert.equal(atoms.value.length, 1);
}

console.log("✔ capture audit/consent：纯动作进 audit；consent 无「记住」只进 audit 且可见；显式记住落 atom");
