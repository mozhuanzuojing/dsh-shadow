// dsh-shadow —— ADR-0048⑧：Shadow Manifest（索引元数据 + 诊断）。
// A15：`readManifest` 是**三态**（正常 / 真的没有 / 坏件）—— 本文件锁「坏件不得被渲染成『尚未构建』」。
import assert from "node:assert/strict";
import { buildManifest, writeManifest, readManifest, renderManifest, isManifestCorrupt, manifestRel } from "../dist/core/manifest.js";
import type { ShadowManifest } from "../dist/core/manifest.js";
import type { ShadowNode } from "../dist/core/view/node.js";

const files = new Map();
const fs = {
  async resolve(p) { return { targetKey: p, displayPath: p }; },
  async readText(t) { const v = files.get(t.displayPath); return v === undefined ? "" : v; },
  async writeText(t, c) { files.set(t.displayPath, c); return { version: "v1" }; },
};
const WS = "D:/ws";
const NODE = (id, source): ShadowNode => ({ id, type: "code", source, title: id, content: [], evidence: [], relations: [] });

// 构建 + 写 + 读
const m = buildManifest("1", [NODE("a", ".shadow/x/a.md"), NODE("b", ".shadow/y/b.md"), NODE("c", ".shadow/x/a.md")], [{ path: ".shadow/z/z.md", reason: "parse error" }]);
assert.equal(m.nodeCount, 3, "节点数");
assert.equal(m.sourceCount, 2, "来源数（去重）");
assert.equal(m.failures.length, 1, "失败项");
await writeManifest(fs, WS, m);
const read = await readManifest(fs, WS);
assert.ok(read && !isManifestCorrupt(read), "读回的必须是正常态（不是坏件）");
assert.equal((read as ShadowManifest).nodeCount, 3, "读回节点数");
const out = renderManifest(read);
assert.ok(out.includes("Shadow Manifest") && out.includes("失败项：1") && out.includes("parse error"), "诊断渲染含失败项");

// 无 manifest → 提示（**真的没有**这一态）；把它的渲染**派生**出来，供下面「坏件 ≠ 尚无」比对。
const nullOut = renderManifest(null);
assert.ok(nullOut.includes("尚无"), "无 manifest 给提示");

// A15 负对照：坏件（文件在、但不是合法 JSON）必须**判成坏件**且**不得**渲染成「尚未构建」
files.set(`${WS}/${manifestRel()}`, "{ 这不是 JSON");
const bad = await readManifest(fs, WS);
assert.ok(isManifestCorrupt(bad), `坏件必须被识别（不得压成 null）：${JSON.stringify(bad)}`);
const badOut = renderManifest(bad);
assert.ok(badOut.includes("坏件"), `坏件渲染必须点名坏件：${badOut}`);
// ⚠ 判据要**精确**：坏件的渲染文案里本来就会写「这与『尚未构建』不是同一件事」——
// 用 `includes("尚未构建")` 去否证会把那句解释本身当成违规（v1.22.1 实测红过）。
// 要锁的是「它不等于『尚无』那一态」⇒ 比对**派生出来的**那一态原文（**不写死文案**：
// 本仓规矩「能推出来的字段不要手写」——空态文案将来改了，这里的断言会跟着改，而不是静默变弱）。
assert.ok(!badOut.includes(nullOut), `坏件不得包含「尚无」那一态的原文（那是把损坏说成「还没建」）：${badOut}`);
assert.notEqual(badOut, nullOut, "坏件与「尚无」必须是两种不同的渲染");

// A15 负对照②：**合法 JSON 但形状不对**（截断常留下 `[]`）同样是坏件
files.set(`${WS}/${manifestRel()}`, "[]");
const wrongShape = await readManifest(fs, WS);
assert.ok(isManifestCorrupt(wrongShape), "合法 JSON 但形状不对 ⇒ 也是坏件（否则会渲染成 vundefined · 节点数：undefined）");

// 正对照：清掉坏件 ⇒ 回到「尚无」（三态可逆、判据不粘）
files.delete(`${WS}/${manifestRel()}`);
assert.equal(await readManifest(fs, WS), null, "文件确实不存在 ⇒ null（不是坏件）");

console.log("✔ 场景 Manifest-1 构建/写/读 + 诊断渲染（版本/节点/来源/失败项, ADR-0048⑧）");
console.log("✔ 场景 Manifest-2 A15 三态：坏件 ≠「尚未构建」（含合法 JSON 形状不符）；文件不存在 ⇒ null");
console.log("ALL PASS ✅");
