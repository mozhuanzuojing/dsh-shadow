// dsh-shadow —— ADR-0048⑧：Shadow Manifest（索引元数据 + 诊断）。
import assert from "node:assert/strict";
import { buildManifest, writeManifest, readManifest, renderManifest } from "../dist/core/manifest.js";

const files = new Map();
const fs = {
  async resolve(p) { return { targetKey: p, displayPath: p }; },
  async readText(t) { const v = files.get(t.displayPath); return v === undefined ? "" : v; },
  async writeText(t, c) { files.set(t.displayPath, c); return { version: "v1" }; },
};
const WS = "D:/ws";
const NODE = (id, source) => ({ id, type: "code", source, title: id, content: [], evidence: [], relations: [] });

// 构建 + 写 + 读
const m = buildManifest("1", [NODE("a", ".shadow/x/a.md"), NODE("b", ".shadow/y/b.md"), NODE("c", ".shadow/x/a.md")], [{ path: ".shadow/z/z.md", reason: "parse error" }]);
assert.equal(m.nodeCount, 3, "节点数");
assert.equal(m.sourceCount, 2, "来源数（去重）");
assert.equal(m.failures.length, 1, "失败项");
await writeManifest(fs, WS, m);
const read = await readManifest(fs, WS);
assert.equal(read.nodeCount, 3, "读回节点数");
const out = renderManifest(read);
assert.ok(out.includes("Shadow Manifest") && out.includes("失败项：1") && out.includes("parse error"), "诊断渲染含失败项");

// 无 manifest → 提示
assert.ok(renderManifest(null).includes("尚无"), "无 manifest 给提示");

console.log("✔ 场景 Manifest-1 构建/写/读 + 诊断渲染（版本/节点/来源/失败项, ADR-0048⑧）");
console.log("ALL PASS ✅");
