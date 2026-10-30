import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { runLab } from "../../dist/lab/run.js";
import { LAB_MODES, type LabMode } from "../../dist/contract/modes.js";
import { LAB_WRITE_MODES } from "../../dist/lab/registry.js";
import {
  LAB_INPUT_FIELD_UNION,
  LAB_MODE_SCHEMAS,
  labAllowedFields,
  labInputJsonSchema,
  type LabField,
} from "../../dist/lab/schema.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS } from "../helpers.ts";

const makeDeps = () => ({
  fs: new MemoryFs(),
  ws: WS,
  config: normalizeConfig({}),
  signals: new SignalStore(),
  agent: { id: "lab-schema-test" },
});

const runLabWith = (mode: string, input: Record<string, unknown>) =>
  runLab(makeDeps(), { mode, input, write: LAB_WRITE_MODES.has(mode) });

const sampleValue = (field: LabField): unknown => {
  if (field.enum?.length) return field.enum[0];
  switch (field.kind) {
    case "string":
      return "x";
    case "number":
      return 1;
    case "boolean":
      return true;
    case "string_array":
      return ["x"];
    case "object_array":
      return [];
    case "object":
      return {};
  }
};

const minimalInput = (mode: LabMode): Record<string, unknown> => {
  const schema = LAB_MODE_SCHEMAS[mode];
  return Object.fromEntries((schema.required ?? []).map((field) => [field, sampleValue(schema.fields[field])]));
};

const failures: string[] = [];

// ── 1. 覆盖与 descriptor 自洽：51 mode 各一份 schema，无多无少 ─────────────────────
assert.equal(LAB_MODES.length, 51);
assert.deepEqual(Object.keys(LAB_MODE_SCHEMAS).sort(), [...LAB_MODES].sort(), "schema 必须恰覆盖 51 个 mode（多一个/少一个都失败）");
for (const mode of LAB_MODES) {
  const schema = LAB_MODE_SCHEMAS[mode];
  if (!schema.source.trim()) failures.push(mode + "：source 不能为空（字段推导依据）");
  const fieldNames = Object.keys(schema.fields);
  assert.deepEqual([...labAllowedFields(mode)], [...fieldNames].sort(), mode + "：labAllowedFields 必须等于 fields 的排序键");
  const required = schema.required ?? [];
  assert.equal(new Set(required).size, required.length, mode + "：required 不得重复");
  for (const field of required) {
    if (!(field in schema.fields)) failures.push(mode + "：required 字段 " + field + " 不在 fields 里");
  }
  for (const [field, spec] of Object.entries(schema.fields)) {
    if (!spec.description.trim()) failures.push(mode + "/" + field + "：description 不能为空");
    if (spec.enum && spec.kind !== "string") failures.push(mode + "/" + field + "：enum 只允许用在 string 字段");
    if (spec.enum && spec.enum.length === 0) failures.push(mode + "/" + field + "：enum 不得为空");
  }
  if (schema.permissive !== undefined && !schema.permissive.trim()) failures.push(mode + "：permissive 必须写理由");
}
assert.deepEqual(failures, [], "schema descriptor 自洽性失败：\n" + failures.join("\n"));

// ── 2. 透传清单：不假装严格（嵌套任意结构的 mode 必须显式 permissive）───────────────
const opaque = LAB_MODES.filter((m) =>
  Object.values(LAB_MODE_SCHEMAS[m].fields).some((f) => f.kind === "object" || f.kind === "object_array"),
);
const permissive = LAB_MODES.filter((m) => Boolean(LAB_MODE_SCHEMAS[m].permissive));
assert.deepEqual(opaque, ["agency-select", "model-claim", "plan", "recall-event", "recall-index"], "嵌套容器字段集合变了：新增/删除需同步 permissive 判断");
assert.deepEqual(permissive, ["agency-select", "model-claim", "plan", "recall-event"], "permissive 清单（builder 原样透传的 mode）");
for (const mode of permissive) {
  assert.ok(LAB_MODE_SCHEMAS[mode].permissive!.includes("透传"), mode + "：permissive 必须注明「额外子字段透传」");
}
assert.ok((LAB_MODE_SCHEMAS["recall-index"].note ?? "").includes("guard"), "recall-index.records 由 builder 严格校验，应写进 note 而不是 permissive");

// ── 3. 生成的 JSON Schema 与 descriptor 一致（additionalProperties:false）────────
const KIND_JSON_TYPE: Record<LabField["kind"], string> = {
  string: "string",
  number: "number",
  boolean: "boolean",
  string_array: "array",
  object_array: "array",
  object: "object",
};
for (const mode of LAB_MODES) {
  const js = labInputJsonSchema(mode) as { type?: string; additionalProperties?: boolean; required?: string[]; properties?: Record<string, { type?: string; enum?: string[] }> };
  assert.equal(js.type, "object", mode + "：input JSON Schema 必须是 object");
  assert.equal(js.additionalProperties, false, mode + "：additionalProperties 必须 false（PARITY §5.2）");
  assert.deepEqual([...(js.required ?? [])].sort(), [...(LAB_MODE_SCHEMAS[mode].required ?? [])].sort(), mode + "：JSON Schema required 必须与 descriptor 一致");
  assert.deepEqual(Object.keys(js.properties ?? {}).sort(), [...labAllowedFields(mode)], mode + "：JSON Schema properties 必须与允许字段一致");
  for (const [field, spec] of Object.entries(LAB_MODE_SCHEMAS[mode].fields)) {
    const prop = js.properties?.[field];
    assert.equal(prop?.type, KIND_JSON_TYPE[spec.kind], mode + "/" + field + "：JSON Schema 类型应一致");
    if (spec.enum) assert.deepEqual(prop?.enum, [...spec.enum], mode + "/" + field + "：JSON Schema enum 应一致");
  }
}

// ── 4. 未知字段：51 mode 全部显式拒绝，错误里列出该 mode 允许字段 ────────────────
const unknownFailures: string[] = [];
for (const mode of LAB_MODES) {
  const r = await runLabWith(mode, { __nope__: 1 });
  if (r.ok) {
    unknownFailures.push(mode + "：未知字段未拒绝");
    continue;
  }
  if (r.error.code !== "INVALID_INPUT") {
    unknownFailures.push(mode + "：错误码应为 INVALID_INPUT，实际 " + r.error.code);
    continue;
  }
  if (!r.error.message.includes("允许字段：")) unknownFailures.push(mode + "：错误未列出允许字段");
  const allowed = labAllowedFields(mode);
  for (const field of allowed) {
    if (!r.error.message.includes(field)) unknownFailures.push(mode + "：错误未列出允许字段 " + field);
  }
  if (!allowed.length && !r.error.message.includes("（无）")) unknownFailures.push(mode + "：无字段 mode 应写「（无）」");
}
assert.deepEqual(unknownFailures, [], "未知字段拒绝失败：\n" + unknownFailures.join("\n"));

// ── 5. 必填：缺失与空值都必须 INVALID_INPUT（不是把空值塞进 builder）────────────
const requiredFailures: string[] = [];
let requiredChecks = 0;
for (const mode of LAB_MODES) {
  const schema = LAB_MODE_SCHEMAS[mode];
  const required = schema.required ?? [];
  if (!required.length) continue;
  const base = minimalInput(mode);
  for (const field of required) {
    requiredChecks += 1;
    const absent = { ...base };
    delete absent[field];
    const r1 = await runLabWith(mode, absent);
    if (r1.ok) requiredFailures.push(mode + "/" + field + "：缺必填未拒绝");
    else if (r1.error.code !== "INVALID_INPUT" || !r1.error.message.includes("缺必填字段") || !r1.error.message.includes(field)) {
      requiredFailures.push(mode + "/" + field + "：缺必填的错误不对（" + r1.error.code + " " + r1.error.message.slice(0, 80) + "）");
    }
    const spec = schema.fields[field]!;
    const empty: unknown = spec.kind === "string" ? "" : spec.kind === "string_array" || spec.kind === "object_array" ? [] : undefined;
    if (empty === undefined) continue;
    const r2 = await runLabWith(mode, { ...base, [field]: empty });
    if (r2.ok) requiredFailures.push(mode + "/" + field + "：必填给空值未拒绝");
    else if (r2.error.code !== "INVALID_INPUT" || !r2.error.message.includes("缺必填字段")) {
      requiredFailures.push(mode + "/" + field + "：必填空值的错误不对（" + r2.error.code + " " + r2.error.message.slice(0, 80) + "）");
    }
  }
}
assert.ok(requiredChecks >= 20, "应至少覆盖 20 个必填字段，实际 " + requiredChecks);
assert.deepEqual(requiredFailures, [], "必填校验失败：\n" + requiredFailures.join("\n"));

// 有必填的 mode：空 input 必须被拒（v1「空 input 渲染 Rejected 文本」的路径在 schema 层前移为 INVALID_INPUT）
const emptyInputFailures: string[] = [];
for (const mode of LAB_MODES) {
  if (!(LAB_MODE_SCHEMAS[mode].required ?? []).length) continue;
  const r = await runLabWith(mode, {});
  if (r.ok) emptyInputFailures.push(mode + "：空 input 应被 INVALID_INPUT 拒绝");
  else if (r.error.code !== "INVALID_INPUT") emptyInputFailures.push(mode + "：空 input 错误码应为 INVALID_INPUT，实际 " + r.error.code);
}
assert.deepEqual(emptyInputFailures, [], "空 input 的必填拒绝失败：\n" + emptyInputFailures.join("\n"));

// ── 6. 类型：每个 mode 的每个字段给异种类型都必须拒绝（不做静默强转）───────────────
const wrongValue = (field: LabField): unknown => {
  switch (field.kind) {
    case "string":
      return 123;
    case "number":
      return "not-a-number";
    case "boolean":
      return "not-a-boolean";
    case "string_array":
      return "not-an-array";
    case "object_array":
      return {};
    case "object":
      return "not-an-object";
  }
};
const typeFailures: string[] = [];
let typeChecks = 0;
for (const mode of LAB_MODES) {
  for (const [field, spec] of Object.entries(LAB_MODE_SCHEMAS[mode].fields)) {
    typeChecks += 1;
    const r = await runLabWith(mode, { [field]: wrongValue(spec) });
    if (r.ok) typeFailures.push(mode + "/" + field + "：错误类型未拒绝");
    else if (r.error.code !== "INVALID_INPUT" || !r.error.message.includes("类型应为") || !r.error.message.includes(field)) {
      typeFailures.push(mode + "/" + field + "：类型错误不对（" + r.error.code + " " + r.error.message.slice(0, 80) + "）");
    }
  }
}
assert.ok(typeChecks >= 190, "应覆盖 ≥190 个字段/类型组合，实际 " + typeChecks);
assert.deepEqual(typeFailures, [], "类型校验失败：\n" + typeFailures.join("\n"));

// ── 7. 枚举：封闭集之外的字符串必须拒绝，错误带允许值 ───────────────────────────
const enumFailures: string[] = [];
let enumChecks = 0;
for (const mode of LAB_MODES) {
  const base = minimalInput(mode);
  for (const [field, spec] of Object.entries(LAB_MODE_SCHEMAS[mode].fields)) {
    if (!spec.enum) continue;
    enumChecks += 1;
    const r = await runLabWith(mode, { ...base, [field]: "__not_an_enum_value__" });
    if (r.ok) enumFailures.push(mode + "/" + field + "：非法枚举未拒绝");
    else if (r.error.code !== "INVALID_INPUT" || !r.error.message.includes("只接受")) {
      enumFailures.push(mode + "/" + field + "：枚举错误不对（" + r.error.code + " " + r.error.message.slice(0, 80) + "）");
    }
  }
}
assert.ok(enumChecks >= 8, "应至少覆盖 8 个枚举字段，实际 " + enumChecks);
assert.deepEqual(enumFailures, [], "枚举校验失败：\n" + enumFailures.join("\n"));

// ── 8. 代表 mode：合法最小 input 真实跑通（≥10 个，跨族）─────────────────────────
const legalCases: Array<{ mode: string; input: Record<string, unknown>; expect: string }> = [
  { mode: "federation", input: { sourceObserverId: "A", obsClaim: "观察到安全边界缺失", visible: ["deploy"], hidden: ["rollback"], distortion: [] }, expect: "Federation Packet" },
  { mode: "temporal", input: {}, expect: "Temporal Graph" },
  { mode: "identity-advance", input: { minCount: 1 }, expect: "Identity Evolution" },
  { mode: "world-relation", input: { from: "service-A", to: "db", relation: "depends_on", evidence: ["claim-1"] }, expect: "Relation Hypothesis" },
  { mode: "simulate", input: { condition: "Assume 缓存命中率提升", basedOn: ["rep-1"] }, expect: "Simulation Outcome" },
  { mode: "verification", input: { evidenceRefs: ["obs-1"] }, expect: "Verification Run" },
  { mode: "plan", input: { objective: "降低 p99 延迟", criteria: "under constraint p99", candidates: [{ basedOnSimulation: ["sim-1"], actionSequence: ["step-1"], assumptions: ["Assume 缓存命中"], constraints: ["no-prod"], satisfiedConstraints: ["no-prod"], violatedConstraints: [], uncertainty: 0.4 }] }, expect: "Planning Context" },
  { mode: "agency-context", input: { authoritySource: "human", objectiveRef: "goal-1", authorityScope: "config", constraints: ["no-prod"] }, expect: "Agency Context" },
  { mode: "delegation-context", input: { authoritySource: "human", objectiveRef: "goal-1", allowedScope: ["update config"], constraints: ["no-prod"], expiration: "2026-12-31" }, expect: "Delegation Context" },
  { mode: "recall-forget", input: { originalRef: "memory-1", reason: "访问频率低" }, expect: "Forgotten Record" },
  { mode: "adapt-context", input: { sourceExperience: "exp-1", adaptationScope: "method" }, expect: "Adaptation Context" },
  { mode: "horizon-summary", input: { sourceRefs: ["obs-1"], compressionMethod: "window-summary" }, expect: "History Summary" },
  { mode: "evidence", input: { hypothesisId: "h-1", actualOutcome: "latency dropped" }, expect: "[Evidence] registered" },
  { mode: "model-observation", input: { subject: "service-A", observation: "service-A exposes api" }, expect: "Reality Observation" },
];
assert.ok(legalCases.length >= 10, "代表 mode 应 ≥10 个");
for (const c of legalCases) {
  const r = await runLabWith(c.mode, c.input);
  assert.equal(r.ok, true, c.mode + " 应可执行：" + (r.ok ? "" : r.error.code + " " + r.error.message));
  if (r.ok) assert.ok(r.value.data.text.includes(c.expect), c.mode + " 输出应含 " + c.expect + "：" + r.value.data.text.slice(0, 160));
}

// ── 9. permissive 是真的（不假装严格）：额外子字段原样透传，不被 schema 拒绝 ───────
const permissiveCases: Array<{ mode: string; input: Record<string, unknown>; expect: string }> = [
  { mode: "plan", input: { objective: "降低 p99 延迟", candidates: [{ whatever: 1, nested: { extra: true } }] }, expect: "Planning Context" },
  { mode: "agency-select", input: { reason: "constraint_satisfied", candidates: [{ id: "c1", whatever: 1 }] }, expect: "Agency Selection" },
  { mode: "model-claim", input: { validations: [{ id: "v1", outcome: "validated", extra: 1 }] }, expect: "无 RealityObservation" },
  { mode: "recall-event", input: { recalledRef: "r1", trigger: { type: "external cue", sourceRef: "s1", extra: 1 } }, expect: "Recall" },
];
for (const c of permissiveCases) {
  const r = await runLabWith(c.mode, c.input);
  assert.equal(r.ok, true, c.mode + " 的透传子字段不应被 schema 拒绝：" + (r.ok ? "" : r.error.code + " " + r.error.message));
  if (r.ok) assert.ok(r.value.data.text.includes(c.expect), c.mode + " 输出应含 " + c.expect);
}

// ── 10. 写闸/只读闸的优先级保持：未知字段 > write 闸 > 类型/必填 ─────────────────
{
  const r1 = await runLab(makeDeps(), { mode: "execute", input: {} });
  assert.equal(r1.ok, false);
  if (!r1.ok) assert.equal(r1.error.code, "WRITE_REQUIRED", "写型缺 write 必须先报 WRITE_REQUIRED（不得误诊成缺字段）");

  const r2 = await runLab(makeDeps(), { mode: "execute", input: {}, write: true });
  assert.equal(r2.ok, false);
  if (!r2.ok) assert.equal(r2.error.code, "INVALID_INPUT", "写闸通过后缺 candidateId 应报 INVALID_INPUT");

  const r3 = await runLab(makeDeps(), { mode: "execute", input: { __nope__: 1 } });
  assert.equal(r3.ok, false);
  if (!r3.ok) assert.ok(r3.error.code === "INVALID_INPUT" && r3.error.message.includes("不接受字段"), "未知字段闸在 write 闸之前");

  const r4 = await runLab(makeDeps(), { mode: "federation", input: {}, write: true });
  assert.equal(r4.ok, false);
  if (!r4.ok) assert.equal(r4.error.code, "WRITE_DENIED", "只读 mode 带 write:true 必须 WRITE_DENIED");
}

// ── 11. 并集派生 + v1 core 参数不再被 lab 接受 ─────────────────────────────────
{
  const derived = [...new Set(LAB_MODES.flatMap((m) => Object.keys(LAB_MODE_SCHEMAS[m].fields)))].sort();
  assert.deepEqual([...LAB_INPUT_FIELD_UNION], derived, "并集必须派生自逐 mode schema");
  const v1CoreOnly = ["topic", "limit", "debug", "kg", "soul", "experience", "asOf", "observer", "project", "raw", "judgment", "claim", "taste", "verifyEvidence", "identity", "context", "goal", "realityAnchor", "state", "proposal"];
  for (const field of v1CoreOnly) {
    assert.ok(!LAB_INPUT_FIELD_UNION.includes(field), "v1 core 参数不应出现在任何 lab mode 的允许集：" + field);
  }
}

console.log(
  "✔ lab-schema：51 mode 各有 schema · 未知/类型/枚举/必填显式拒绝 · permissive " + permissive.length + "（透传不假装严格）· " +
    legalCases.length + " 个代表 mode 合法最小 input 跑通",
);
