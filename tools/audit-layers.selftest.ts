#!/usr/bin/env node
// dsh-shadow —— tools/audit-layers.selftest.ts：结构门（audit-layers）的**标定测试**。
//
// 为什么必须有：门禁的比较/判定函数如果没有负例测试，**门静默失效也没人知道**
// （hl_mem 那一侧的 `compare_core_v1.py` 就没人调用 —— 见 BACKLOG T14）。
// 本文件只用**合成夹具**驱动 `audit-layers.lib.ts` 的同一份判据；真仓库的基线由
// `npm run audit:layers`（接在 `npm run verify` 里）执行，不在这里重复。
import assert from "node:assert/strict";
import {
  auditLayers,
  buildGraph,
  resolveRelative,
  classifySpecifier,
  extractSpecifiers,
  layerOf,
  stronglyConnected,
  PURE_MODULES,
  DIRECTION_RULES,
} from "./audit-layers.lib.ts";

const f = (path: string, text: string) => ({ path, text });

// ⚠ 关键前提：**默认判据表指向真仓库的文件**（`core/paths.ts` 等）。在合成夹具上跑默认表，
// 「纯模块白名单不得腐化」会（**正确地**）对每个不存在的路径各报一条 ⇒ 想要「零违规」的正对照，
// 必须显式清空判据表。这不是测试的将就，而是这条判据在起作用的证据（见 ② 的第三条断言）。
const NO_RULES = { pureModules: [] as string[], directionRules: [] as (typeof DIRECTION_RULES)[number][] };

// ① 环检测：正例（合成 a→b→a）与**负例**（DAG 必须 0）
{
  const cyclic = [f("a.ts", 'import { b } from "./b.js";\n'), f("b.ts", 'import { a } from "./a.js";\n')];
  const r1 = auditLayers(cyclic, NO_RULES);
  assert.equal(r1.fileCycles.length, 1, "a→b→a 必须被抓到（否则门是瞎的）");
  assert.equal(r1.violations.filter((v) => v.rule === "文件级依赖图无环").length, 1);

  const dag = [f("a.ts", 'import { b } from "./b.js";\n'), f("b.ts", "export const b = 1;\n")];
  const r2 = auditLayers(dag, NO_RULES);
  assert.equal(r2.fileCycles.length, 0, "DAG 不得报环（否则门是红的、会被绕过）");
  assert.equal(r2.violations.length, 0, "无违规夹具必须零违规（正对照）");
  console.log("✔ ① 环检测：合成环被抓到、DAG 零违规（正反对照都有）");
}

// ② 纯模块白名单：正例（import node:fs）与**腐化自检**（路径不存在）
{
  const impure = [f("core/util.ts", 'import { readFileSync } from "node:fs";\nexport const u = readFileSync;\n')];
  const r1 = auditLayers(impure, { pureModules: ["core/util.ts"] });
  assert.equal(r1.violations.filter((v) => v.rule === "纯模块零副作用").length, 1, "纯模块 import node:fs 必须违规");

  const pure = [f("core/util.ts", "export const u = 1;\n")];
  assert.equal(auditLayers(pure, { pureModules: ["core/util.ts"] }).violations.length, 0, "零 import 的纯模块必须通过");

  const corrupt = [f("core/util.ts", "export const u = 1;\n")];
  const r2 = auditLayers(corrupt, { pureModules: ["core/ghost.ts"] });
  assert.equal(
    r2.violations.filter((v) => v.rule === "纯模块白名单不得腐化").length,
    1,
    "白名单指向不存在的文件必须自曝（否则该条判据静默失效 —— hl_mem 的 allowlist 腐化自检同形）",
  );
  console.log("✔ ② 纯模块白名单：副作用被抓到；白名单腐化会自曝");
}

// ③ 方向禁令：合成 core → query 必须违规；反向 query → core 不违规
{
  const bad = [f("core/x.ts", 'import { q } from "../query/y.js";\n'), f("query/y.ts", "export const q = 1;\n")];
  const r1 = auditLayers(bad);
  assert.equal(r1.violations.filter((v) => v.rule === "core ↛ query").length, 1, "core→query 必须违规（ADR-0003）");

  const ok = [f("query/x.ts", 'import { c } from "../core/y.js";\n'), f("core/y.ts", "export const c = 1;\n")];
  assert.equal(auditLayers(ok, NO_RULES).violations.length, 0, "query→core 是本仓的**主方向**，不得违规");

  const root = [f("core/x.ts", 'import { i } from "../index.js";\n'), f("index.ts", "export const i = 1;\n")];
  assert.equal(
    auditLayers(root).violations.filter((v) => v.rule === "任何层 ↛ (root)").length,
    1,
    "任何层 import index.ts 必须违规（index 是 Cordis 适配器）",
  );
  console.log("✔ ③ 方向禁令：core→query 违规、query→core 合法、任何层→index.ts 违规");
}

// ④ 相对说明符解析：`.js`→`.ts`、目录 index、未解析记账
{
  const known = new Set(["c/d.ts", "e/index.ts"]);
  assert.equal(resolveRelative("a/b.ts", "../c/d.js", known), "c/d.ts", ".js 说明符必须还原成 .ts");
  assert.equal(resolveRelative("a/b.ts", "../e", known), "e/index.ts", "目录说明符必须解析到 index.ts");
  assert.equal(resolveRelative("a/b.ts", "../ghost.js", known), undefined, "解析不到必须返回 undefined");

  const g = buildGraph([f("a/b.ts", 'import { z } from "../ghost.js";\n')]);
  assert.equal(g.unresolved.length, 1, "未解析的相对 import 必须记账，不得静默丢弃");
  console.log("✔ ④ 相对解析：.js→.ts / index / 未解析记账都对");
}

// ⑤ 注释剥离必须在场（判据收一处的实际效果）：注释里的 `from "./ghost.js"` 不得被当真 import
{
  const text = '// import { g } from "./ghost.js";\nimport { b } from "./b.js";\n';
  const files = [f("a.ts", text), f("b.ts", "export const b = 1;\n")];
  const found = extractSpecifiers(text).map((s) => s.spec);
  assert.deepEqual(found, ["./b.js"], "只应看到真 import；注释里的说明符必须被剥掉");
  assert.equal(buildGraph(files).unresolved.length, 0, "注释里的幽灵 import 不得进入未解析账");
  assert.equal(auditLayers(files, NO_RULES).violations.length, 0);
  console.log("✔ ⑤ 注释剥离在场：注释里的幽灵 import 不被计入（复用 audit-wiring 的 stripComments）");
}

// ⑥ 说明符分类与层名：node: 前缀与裸内建等价；包不进结构门；根文件 = (root)
{
  assert.equal(classifySpecifier("node:fs"), "builtin");
  assert.equal(classifySpecifier("fs"), "builtin", "裸 fs 与 node:fs 必须同判（否则门会漏）");
  assert.equal(classifySpecifier("child_process"), "builtin");
  assert.equal(classifySpecifier("./x.js"), "relative");
  assert.equal(classifySpecifier("@deepseek-ai/cordis"), "package");
  assert.equal(layerOf("index.ts"), "(root)");
  assert.equal(layerOf("core/util.ts"), "core");
  console.log("✔ ⑥ 说明符分类与层名：裸内建 ≡ node: 内建、包不入结构门、(root) 正确");
}

// ⑦ 判据表本身的自检：白名单/禁令表不得为空（否则门「通过」只是因为没有判据）
{
  assert.ok(PURE_MODULES.length > 0, "纯模块白名单不得为空");
  assert.ok(DIRECTION_RULES.length > 0, "方向禁令不得为空");
  for (const r of DIRECTION_RULES) assert.ok(r.why && r.why.length > 0, `禁令 ${r.from}→${r.to} 必须带 why`);
  // 默认表在**空语料**下必须逐条自曝（证明默认表真的被逐条检查，而不是「没文件 ⇒ 没违规」）
  assert.equal(auditLayers([], NO_RULES).violations.length, 0);
  assert.equal(
    auditLayers([]).violations.length,
    PURE_MODULES.length,
    "空语料 + 默认白名单必须逐条报腐化（否则默认表可能根本没被检查）",
  );
  console.log("✔ ⑦ 判据表非空、每条禁令带 why、默认白名单在空语料下逐条自曝");
}

// ⑧ Tarjan 自身的正反例
{
  const nodes = ["a", "b", "c"];
  const succMap: Record<string, string[]> = { a: ["b"], b: ["a"], c: [] };
  const comps = stronglyConnected(nodes, (n) => succMap[n]);
  assert.equal(comps.length, 1);
  assert.deepEqual([...comps[0]].sort(), ["a", "b"]);
  assert.equal(stronglyConnected(nodes, (n) => ({ a: ["b"], b: ["c"], c: [] })[n] ?? []).length, 0, "DAG 必须 0 分量");
  console.log("✔ ⑧ Tarjan：合成环与 DAG 的对照都对");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 说明符抽取**不是 AST**（本仓 typescript 7.0.2 = native 移植，`.` 只导出 version，AST 在 unstable 子路径）");
console.log("    ⇒ 字符串里形如 `from \"./x\"` 的文本会误命中；命中项须人工复核；");
console.log("  · 只判**层 → 层**方向，不判「同层内谁依赖谁」；");
console.log("  · **层间环不判**（实测 `{core, evidence, persistence}` 成环；成因是 core 为混合层，见 lib 头注释）；");
console.log("  · 语料**排除 test/ 与 tools/**（它们允许 import 任何东西）⇒ 这两处的结构问题不在本门覆盖内；");
console.log("  · 动态 import（`await import(...)`）与 `export * from` 的形态覆盖靠正则，未逐形态立测试。");
console.log("ALL PASS ✅");
