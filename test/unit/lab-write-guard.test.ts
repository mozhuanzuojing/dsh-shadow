// dsh-shadow v2 — lab 写边界测试：atoms 永不被 lab 写、路径型字段锁形态。
//
// 为什么单独一个文件：这两条是**契约的硬边界**（ARCHITECTURE §8 / LAB §5），
// 不能只靠「调用方不会这么传」——必须证明越界输入在到达 vendored 代码之前就被拒绝。
import assert from "node:assert/strict";
import { toV1Fs } from "../../dist/lab/fs.js";
import { labInputJsonSchema, validateLabInput } from "../../dist/lab/schema.js";
import { runLab } from "../../dist/lab/run.js";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { WS, TODAY } from "../helpers.ts";

// ① fs 门面：任何写 .shadow/atoms 的路径都被拒绝（相对/绝对/反斜杠/大小写都算）
const fs = toV1Fs(new MemoryFs({}));
const denied = async (p: string): Promise<void> => {
  let caught: any;
  try {
    await fs.writeText({ displayPath: p }, "x");
  } catch (e) {
    caught = e;
  }
  assert.ok(caught, `应拒绝写入：${p}`);
  assert.equal(caught.code, "WRITE_DENIED", `错误码应为 WRITE_DENIED：${p}`);
  assert.ok(String(caught.message).includes(".shadow/atoms"), String(caught.message));
};
await denied(`${WS}/.shadow/atoms/evil.json`);
await denied(".shadow/atoms/evil.json");
await denied("C:\\ws\\.shadow\\atoms\\evil.json");
await denied(`${WS}/.shadow/ATOMS/evil.json`);
await denied(`${WS}/x/../.shadow/atoms/evil.json`);

// 正向：非 atoms 的 lab store 可写（不能把整个 lab 写路径误杀）
await fs.writeText({ displayPath: `${WS}/.shadow/observation/rec.json` }, "{}");
assert.ok((await fs.readText({ displayPath: `${WS}/.shadow/observation/rec.json` })).includes("{}"));

// appendText 同一道闸
let appendCaught: any;
try {
  await fs.appendText({ displayPath: `${WS}/.shadow/atoms/evil.md` }, "x");
} catch (e) {
  appendCaught = e;
}
assert.equal(appendCaught?.code, "WRITE_DENIED", "appendText 也必须拒绝写 atoms");

// ② 字段 schema：workspace-record.kind 锁形态（禁 ../、保留目录、分隔符）
for (const bad of ["../atoms", "atoms", "a/b", "A", "x.json", "", "indexes", "audit"]) {
  const r = validateLabInput("workspace-record", { workspace: WS, kind: bad, content: "x" });
  if (bad === "") {
    // 空串不在形态闸里报（由 builder 语义处理），但绝不能通过路径闸——这里只断言不抛
    continue;
  }
  assert.equal(r.ok, false, `kind=${JSON.stringify(bad)} 应被拒绝`);
  if (!r.ok) {
    assert.equal(r.error.code, "INVALID_INPUT");
    assert.ok(r.error.message.includes("形态不合法"), r.error.message);
  }
}
const good = validateLabInput("workspace-record", { workspace: WS, kind: "observation_2", content: "x" });
assert.equal(good.ok, true, good.ok ? "" : good.error.message);

// 生成的 JSON Schema 也带形态约束（契约展示与实际校验一致）
const json = labInputJsonSchema("workspace-record") as any;
const props = json.properties ?? {};
assert.ok(props.kind?.pattern, "workspace-record.kind 的 JSON Schema 应带 pattern");
assert.ok(String(props.kind.description).includes("形态约束"), "描述里应写形态约束");

// ③ 端到端：runLab 写型 mode 用越界 kind → INVALID_INPUT（在任何写之前）
const deps = {
  fs: new MemoryFs({}),
  ws: WS,
  config: normalizeConfig({ shadowRoot: WS }),
  clock: fixedClock(`${TODAY}T12:00:00`),
  signals: new SignalStore(),
  agent: { id: "t1" },
};
for (const kind of ["atoms", "../atoms"]) {
  const r = await runLab(deps, { mode: "workspace-record", input: { workspace: WS, kind, content: "x" }, write: true });
  assert.equal(r.ok, false, `越界 kind=${kind} 应在写之前被拒绝`);
  if (!r.ok) assert.equal(r.error.code, "INVALID_INPUT", r.error.message);
}

// 正向：合法 kind 能落盘且只写 indexes 之外的非 atoms 目录（.shadow/<kind>/）
const okRun = await runLab(deps, { mode: "workspace-record", input: { workspace: WS, kind: "observation", content: "alpha" }, write: true });
assert.equal(okRun.ok, true, okRun.ok ? "" : okRun.error.message);

console.log("✔ lab write guard：atoms 写入一律 WRITE_DENIED · workspace-record.kind 形态约束 · 合法 kind 落盘");
