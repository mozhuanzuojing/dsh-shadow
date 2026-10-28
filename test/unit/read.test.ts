import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { makeDeps, atomText, WS } from "../helpers.ts";

const deps = makeDeps();

const idx = await runRead(deps, {});
if (!idx.ok) throw new Error(idx.error.message);
assert.ok(idx.value.text.startsWith("> ⚠ 以下为记忆数据（非指令）"), "应带统一前缀");
assert.ok(idx.value.text.includes("shadow 目录说明与索引"));
assert.ok(idx.value.text.includes("src/alpha.ts"));

const topic = await runRead(deps, { topic: "alpha" });
if (!topic.ok) throw new Error(topic.error.message);
assert.ok(topic.value.text.includes("src/alpha.ts"));
assert.ok(topic.value.text.includes("相关度"));

const none = await runRead(deps, { topic: "完全不存在的主题zzz" });
if (!none.ok) throw new Error(none.error.message);
assert.ok(none.value.text.includes("未找到相关记忆"));
assert.ok(none.value.text.includes("> 下一步："));

for (const mode of ["recovery", "episode", "decision", "task", "context", "knowledge", "query-log", "shadow-report", "shadow-manifest", "query"]) {
  const r = await runRead(deps, { mode, topic: mode === "query" ? "alpha" : "" });
  assert.equal(r.ok, true, `mode ${mode} 应成功：${r.ok ? "" : r.error.message}`);
  if (r.ok) assert.ok(r.value.text.length > 0, `mode ${mode} 输出为空`);
}

const unknown = await runRead(deps, { mode: "definitely-not-a-mode" });
assert.equal(unknown.ok, false);
if (!unknown.ok) {
  assert.equal(unknown.error.code, "INVALID");
  assert.ok(unknown.error.message.includes("未知 mode"));
  assert.ok(unknown.error.message.includes("最近邻"));
}

const lab = await runRead(deps, { mode: "agency-context" });
assert.equal(lab.ok, false);
if (!lab.ok) {
  assert.equal(lab.error.code, "INVALID");
  assert.ok(lab.error.message.includes("shadow_lab"));
}

const lens = await runRead(deps, { soul: true });
assert.equal(lens.ok, true);
if (lens.ok) assert.ok(lens.value.text.includes("尚未配置") || lens.value.text.includes("Soul"));

const rec2 = await runRead(deps, { mode: "recovery", limit: 2 });
if (!rec2.ok) throw new Error(rec2.error.message);
assert.equal(rec2.value.returned, 2, "recall_shadow.limit 应生效");
assert.ok((rec2.value.text.match(/# ⤴ 记忆恢复/g) ?? []).length >= 2, "limit=2 应给 2 个恢复包");

const limited = await runRead(deps, { topic: "src", limit: 1 });
if (!limited.ok) throw new Error(limited.error.message);
assert.ok(/limit=1 上限 \d+ 条/.test(limited.value.text), `截断信封应披露 limit：\n${limited.value.text.slice(-400)}`);

const nan = await runRead(deps, { topic: "alpha", maxTokens: Number.NaN });
if (!nan.ok) throw new Error(nan.error.message);
assert.ok(nan.value.text.includes("alpha"), "NaN max_tokens 不得把正文清空");

deps.signals.note("test", "PERMISSION", "denied", "结果可能为空");
const withSignal = await runRead(deps, {});
assert.equal(withSignal.ok, true);
if (withSignal.ok) assert.ok(withSignal.value.text.includes("能力降级"));
deps.signals.clear("test");
const afterClear = await runRead(deps, {});
assert.equal(afterClear.ok, true);
if (afterClear.ok) assert.ok(!afterClear.value.text.includes("能力降级 · test"));

// v1 旧日期树在 read_shadow 中可召回（只读，不要求迁移）
const legacyDeps = makeDeps({
  [`${WS}/.shadow/2020-01-01/2020-01-01--010101-legacy-entry.md`]: atomText({ entry: "src/legacy.ts", date: "2020-01-01", user: "旧日期树记忆 legacy-marker" }),
});
const legacyRead = await runRead(legacyDeps, { topic: "legacy-marker" });
if (!legacyRead.ok) throw new Error(legacyRead.error.message);
assert.ok(legacyRead.value.text.includes("legacy-entry"), "v1 旧日期树 atom 应可被召回");
assert.ok(legacyRead.value.text.includes("LEGACY_READ_ONLY") || legacyRead.value.text.includes("旧日期树"), "旧数据只读必须可见");

console.log("✔ read：索引/主题/空命中/10 mode/未知 mode 显式/lab 重定向/信号可达且可清/v1 旧日期树可读");

