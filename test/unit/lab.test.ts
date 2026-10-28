import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { runLab } from "../../dist/lab/run.js";
import { LAB_MODES } from "../../dist/contract/modes.js";
import { LAB_WRITE_MODES } from "../../dist/lab/registry.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const makeDeps = () => ({
  fs: new MemoryFs(),
  ws: WS,
  config: normalizeConfig({ lab: { enabled: true } }),
  signals: new SignalStore(),
  agent: { id: "lab-test" },
});

assert.equal(LAB_MODES.length, 51);
assert.equal(LAB_WRITE_MODES.size, 31, "写型 mode 必须是 31 个");

const failures: string[] = [];
for (const mode of LAB_MODES) {
  const write = LAB_WRITE_MODES.has(mode);
  const r = await runLab(makeDeps(), { mode, input: {}, write });
  if (!r.ok) failures.push(`${mode}: ${r.error.code} ${r.error.message}`);
  else if (!r.value.data.text.trim()) failures.push(`${mode}: empty body`);
}
assert.deepEqual(failures, [], `所有 51 mode 必须可执行且不抛：\n${failures.join("\n")}`);

// 写权限闸：不是提示，是拒绝
const writeMode = [...LAB_WRITE_MODES][0]!;
const noWrite = await runLab(makeDeps(), { mode: writeMode, input: {} });
assert.equal(noWrite.ok, false);
if (!noWrite.ok) assert.equal(noWrite.error.code, "WRITE_REQUIRED");

const readMode = "federation";
const badWrite = await runLab(makeDeps(), { mode: readMode, input: {}, write: true });
assert.equal(badWrite.ok, false);
if (!badWrite.ok) assert.equal(badWrite.error.code, "WRITE_DENIED");

const unknown = await runLab(makeDeps(), { mode: "no-such-mode", input: {} });
assert.equal(unknown.ok, false);
if (!unknown.ok) assert.equal(unknown.error.code, "UNKNOWN_MODE");

const badField = await runLab(makeDeps(), { mode: "temporal", input: { bogus: 1 } });
assert.equal(badField.ok, false);
if (!badField.ok) assert.equal(badField.error.code, "INVALID_INPUT");

const indexWrite = await runLab(makeDeps(), { mode: "index", input: {}, write: true });
assert.equal(indexWrite.ok, false);
if (!indexWrite.ok) assert.equal(indexWrite.error.code, "WRITE_DENIED");

// 写型真实落盘 + 读回（不是只渲染内存对象）
{
  const d = makeDeps();
  const w = await runLab(d, { mode: "observer-config", input: {}, write: true });
  assert.equal(w.ok, true);
  if (w.ok) assert.equal(w.value.wrote, true);
  const listed = await d.fs.listDir(`${WS}/.shadow/lab/observer`);
  assert.equal(listed.ok, true);
  if (listed.ok) assert.ok(listed.value.length > 0, "observer-config 必须落盘");
  const c = await runLab(d, { mode: "observer-context", input: {} });
  assert.equal(c.ok, true);
  if (c.ok) assert.ok(c.value.data.text.includes("Observer Context"), "observer-context 应读回刚写的配置");
}

// 代表性 mode 的真实成功路径（不是只拒绝空输入）
const cases: Array<{ mode: string; input: Record<string, unknown>; expect: string }> = [
  { mode: "federation", input: { sourceObserverId: "A", obsClaim: "观察到安全边界缺失" }, expect: "Federation Packet" },
  { mode: "temporal", input: {}, expect: "Temporal Graph" },
  { mode: "identity-advance", input: { minCount: 1 }, expect: "Identity Evolution" },
  { mode: "world-relation", input: { from: "a", to: "b", relation: "depends_on", evidence: ["claim-1"] }, expect: "Relation Hypothesis" },
  { mode: "simulate", input: { condition: "Assume 缓存命中率提升", basedOn: ["rep-1"] }, expect: "Simulation Outcome" },
];
for (const c of cases) {
  const write = LAB_WRITE_MODES.has(c.mode);
  const r = await runLab(makeDeps(), { mode: c.mode, input: c.input, write });
  assert.equal(r.ok, true, `${c.mode} 应可执行`);
  if (r.ok) assert.ok(r.value.data.text.includes(c.expect), `${c.mode} 输出应含 ${c.expect}：${r.value.data.text.slice(0, 120)}`);
}

console.log("✔ lab：51 mode 全部可执行 · 31 写型 · write/unknown/field 闸显式拒绝 · 写后读回 · 代表性成功路径");
