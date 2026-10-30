import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { runLab } from "../../dist/lab/run.js";
import { LAB_MODES } from "../../dist/contract/modes.js";
import { LAB_WRITE_MODES } from "../../dist/lab/registry.js";
import { LAB_MODE_SCHEMAS, type LabField } from "../../dist/lab/schema.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const makeDeps = () => ({
  fs: new MemoryFs(),
  ws: WS,
  config: normalizeConfig({}),
  signals: new SignalStore(),
  agent: { id: "lab-test" },
});

assert.equal(LAB_MODES.length, 51);
assert.equal(LAB_WRITE_MODES.size, 31, "写型 mode 必须是 31 个");

// per-mode schema 落地后，必填字段缺失会在写闸之后被 INVALID_INPUT 拒绝（PARITY §5.2）。
// 「51 mode 全部可执行」的基线保留，但循环改为喂该 mode 的最小合法字段 —— 断言强度不降：
// 仍然是 51/51 成功且正文非空，另外由 lab-schema.test.ts 锁住「空必填 → 显式拒绝」。
const sampleValue = (field: LabField): unknown => {
  if (field.enum?.length) return field.enum[0];
  switch (field.kind) {
    case "string": return "x";
    case "number": return 1;
    case "boolean": return true;
    case "string_array": return ["x"];
    case "object_array": return [];
    case "object": return {};
  }
};
const minimalInput = (mode: (typeof LAB_MODES)[number]): Record<string, unknown> => {
  const schema = LAB_MODE_SCHEMAS[mode];
  return Object.fromEntries((schema.required ?? []).map((field) => [field, sampleValue(schema.fields[field])]));
};

const failures: string[] = [];
for (const mode of LAB_MODES) {
  const write = LAB_WRITE_MODES.has(mode);
  const r = await runLab(makeDeps(), { mode, input: minimalInput(mode), write });
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
