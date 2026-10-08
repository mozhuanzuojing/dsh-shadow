#!/usr/bin/env node
// dsh-shadow —— tools/audit-layers.selftest.ts：结构门（audit-layers）的**标定测试**。
//
// 为什么必须有：门禁的比较/判定函数如果没有负例测试，**门静默失效也没人知道**
// （hl_mem 那一侧的 `compare_core_v1.py` 就没人调用 —— 见 BACKLOG T14）。
// 本文件用**合成夹具**驱动 `audit-layers.lib.ts` 的同一份判据；⑪ 另用 **CLI 夹具**（真起进程）覆盖
// 「语料存在性 ⇒ 退出码」这一条（它判的是「有没有可判对象」，只在 CLI 层成立）；真仓库的基线由
// `npm run audit:layers`（接在 `npm run verify` 里）执行，不在这里重复。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  auditLayers,
  buildGraph,
  resolveRelative,
  classifySpecifier,
  extractSpecifiers,
  layerOf,
  stronglyConnected,
  tsconfigIncludes,
  tsconfigIncludeViolations,
  PURE_MODULES,
  DIRECTION_RULES,
} from "./audit-layers.lib.ts";

const HERE = dirname(fileURLToPath(import.meta.url));
const CLI = join(HERE, "audit-layers.ts");
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
  // **必须用真判据表**（v1.15.58 修）：旧版这里传 `NO_RULES`（方向禁令**清空**），
  // 于是这条断言与 `DIRECTION_RULES` 的内容**完全无关** —— 往表里加一条 `query→core`
  //（把主方向反过来）也照样绿。只清空白名单即可避开「白名单腐化」噪声，方向禁令必须是真的。
  assert.equal(auditLayers(ok, { pureModules: [] }).violations.length, 0, "query→core 是本仓的**主方向**，用真判据表也必须零违规");

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
  assert.equal(layerOf("stance/agency/engine.ts"), "agency", "伞下看第二段（ADR-0101）");
  assert.equal(layerOf("trajectory/long-horizon/engine/x.ts"), "long-horizon");
  assert.equal(layerOf("epistemic/world/builder/x.ts"), "world");
  assert.equal(layerOf("selfhood/identity/evaluator.ts"), "identity", "第四伞同形（ADR-0103）");
  assert.equal(layerOf("selfhood/dream/sleep.ts"), "dream");
  assert.equal(layerOf("selfhood/temporal/builder.ts"), "temporal");
  assert.equal(layerOf("subject/soul/soul.ts"), "soul", "第五伞同形（ADR-0104）");
  assert.equal(layerOf("subject/observer/core.ts"), "observer");
  console.log("✔ ⑥ 说明符分类与层名：裸内建 ≡ node: 内建、包不入结构门、(root)/伞下第二段 正确");
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

// ⑨ **未解析的相对 import 必须计违规**（v1.15.55：曾经只打印、退出码 0 ⇒ 门可静默放行）
{
  // 构造：`core/a.ts` 引一个不存在的 `./ghost.js`。旧行为下这条边**不进图**，
  // 于是「无环」与「方向禁令」都看不到它 —— 把一个 import 路径改坏就能让违规边消失。
  const ghost = [f("core/a.ts", 'import { g } from "./ghost.js";\n')];
  const rGhost = auditLayers(ghost, NO_RULES);
  assert.equal(rGhost.unresolved.length, 1, "解析不到的相对 import 必须被记为 unresolved");
  assert.ok(rGhost.violations.length >= 1, "★ 而且必须**计违规**（否则门静默放行）");
  assert.ok(rGhost.violations.some((v) => v.rule === "未解析 import"), "违规条目要能点名这条判据");

  // 反例对照：把 import 写对 ⇒ 无 unresolved、无违规
  const okPair = [f("core/a.ts", 'import { b } from "./b.js";\n'), f("core/b.ts", "export const b = 1;\n")];
  const rOk = auditLayers(okPair, NO_RULES);
  assert.equal(rOk.unresolved.length, 0);
  assert.equal(rOk.violations.length, 0, "写对的 import 不得被误判");
  console.log("✔ ⑨ 未解析 import 计违规（改坏路径不再能静默绕过结构门）");
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

// ⑩ `tsconfig*.json` 的 include 条目必须存在（A2）
{
  const cfg = (text: string) => [{ path: "tsconfig.json", text }];
  /** 合成「文件系统」：只认 index.ts 与 core/ 下的任意 .ts（`**` 通配由 CLI 注入的 match 负责，这里模拟其语义）。 */
  const exists = (entry: string): boolean =>
    entry === "index.ts" || (entry.includes("core/") && /\.ts$/.test(entry) && !entry.includes("ghost"));

  // **负对照（本判据存在的理由）**：条目零匹配必须报，且要**点名是哪一条**（否则复审者找不到）
  const r1 = tsconfigIncludeViolations(cfg('{"include":["index.ts","core/ghost.ts"]}'), exists);
  assert.equal(r1.length, 1, "include 里零匹配的条目必须报一条违规（否则门是瞎的）");
  assert.match(r1[0].where, /core\/ghost\.ts/, `报文必须点名那一条：${JSON.stringify(r1[0])}`);
  assert.ok(r1[0].why.length > 0, "每条违规必须带 why（判据来源）");

  // **负对照 2（实测形态）**：`**` 通配零匹配同样要报 —— 本仓 `tsconfig.json` 的 `decision/**/*.ts`
  // 就是这条形态（`decision/` 整层已删），而 `tsc` 不报错。
  assert.equal(
    tsconfigIncludeViolations(cfg('{"include":["decision/**/*.ts"]}'), exists).length,
    1,
    "零匹配的通配条目必须报（`tsc` 只要匹配到一个文件就不说「无输入」）",
  );

  // **正对照**：全部条目都匹配 ⇒ 零违规
  assert.equal(
    tsconfigIncludeViolations(cfg('{"include":["index.ts","core/x.ts"]}'), exists).length,
    0,
    "全部条目都存在时不得报（否则门是红的、会被绕过）",
  );

  // **控制变量（JSONC）**：`tsconfig.test.json` 顶部有大段 `//` 注释、且注释里出现过「include」这个词 ⇒
  // 解析必须只认**带引号的键**，否则会把注释当成配置（而 `JSON.parse` 在这里根本用不了）。
  const jsonc = "// 本文档说明 include 全部 test/**/*.ts\n{\n  \"include\": [\"index.ts\"]\n}\n";
  assert.deepEqual(tsconfigIncludes(jsonc), ["index.ts"], "带引号的 include 键必须被正确解析（JSONC 注释不得干扰）");
  assert.equal(tsconfigIncludeViolations(cfg(jsonc), exists).length, 0);

  // **控制变量（无该键）**：`include` 是可选字段 ⇒ 0 条条目、0 条违规（那是 lib 层判据的边界）。
  // ⚠ 但**「一份配置都没有」是另一回事**：它由 CLI 的语料存在性守卫判成结构缺失（exit 2），
  // 见 ⑪ —— 这里不重复判，只锁「无该键 ⇒ lib 不报违规」。
  assert.deepEqual(tsconfigIncludes('{"compilerOptions":{}}'), []);

  // ★ **防「门被摘掉」**（同 `citation-audit.selftest.ts` ⑧ 的形状）：判据在 lib 里，但只有 CLI
  //   真的调用它、且把结果并进 `violations`（决定退出码的那个数组），它才是一道门 ——
  //   否则「从 CLI 里删掉这一行」会让门更宽松而**照样全绿**。
  //   ⚠ 匹配前先剥掉整行注释：只在注释里写这串文本不算「挂在退出码上」（那正是本断言要防的形态）。
  const cliSrc = readFileSync(join(HERE, "audit-layers.ts"), "utf8");
  const cliCode = cliSrc.split("\n").filter((l) => !l.trim().startsWith("//")).join("\n");
  assert.match(cliCode, /tsconfigIncludeViolations\(/, "audit-layers.ts 的**可执行代码**必须调用 include 存在性判据（注释不算）");
  assert.match(
    cliCode,
    /violations\.push\(\.\.\.includeViolations\)/,
    "include 违规必须并进 `violations`（否则只打印、不改退出码 —— 又是一道「绿而无判别力」的门）",
  );
  console.log("✔ ⑩ tsconfig include 存在性：零匹配被抓到（含 `**` 通配形态与 JSONC 控制变量）、齐备放行、且已真的挂在 CLI 的退出码上");
}

// ⑪ ④ 的**语料存在性**：零 `tsconfig*.json` ⇒ 结构缺失（exit 2），不是 0「全部通过」、也不是 1「有违规」
//
// 为什么这条必须**真起进程**测：它判的是「有没有可判对象」，判据落在 CLI 的前置守卫里（不在 lib），
// 只有走 `process.exit` 的**退出码**才能证明它真的红了。三个方向缺一不可：
//   · 零配置 ⇒ **2**（缺件；ADR-0049 —— 旧版会落进 `全部判据通过 ✅` + exit 0，即我报的那条假绿）
//   · 配置齐备且条目都存在 ⇒ **0**（防「一改就常红 ⇒ 会被绕过」）
//   · 配置在但 include 条目零匹配 ⇒ **1**（与「缺件」的 2 分工，证明两者可区分）
{
  const runCli = (root: string): { code: number; out: string } => {
    try {
      return { code: 0, out: execFileSync("node", [CLI, root], { encoding: "utf8" }) };
    } catch (e: any) {
      return { code: e.status ?? -1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
    }
  };
  // 夹具必须**先过 V7 语料健康门**（哨兵齐备、文件面非空）与 ② 纯模块白名单（白名单里的文件都得在），
  // 否则会在 ④ 之前 exit 2，测到的就不是本条。
  //
  // ⚠ **白名单里的文件由 `PURE_MODULES` 派生，不手抄**（v1.22.2 修）：先前这里硬编码 5 个路径，
  // 而 `PURE_MODULES` 后来加到 7 个 ⇒ 夹具缺两个文件、「白名单不得腐化」正确地报红，整条 selftest 挂。
  // 门判得对、夹具陈旧 —— 本仓口径「能推出来的字段不要手写」在这里同样成立：**列表是唯一权威**。
  // 每个纯模块给一份**无 import** 的最小体（本条只关心「文件在不在」与「有没有 import」）。
  const BASE: Record<string, string> = {
    "index.ts": "export const x = 1;\n",
    ...Object.fromEntries(
      PURE_MODULES.map((rel) => [rel, rel.endsWith(".ts") ? `export const ${rel.replace(/[^a-zA-Z0-9]+(.)/g, (_, c) => c.toUpperCase())} = 1;\n` : "export {};\n"]),
    ),
  };
  const dirs: string[] = [];
  const fixture = (extra: Record<string, string>): string => {
    const d = mkdtempSync(join(tmpdir(), "layers-audit-"));
    dirs.push(d);
    for (const [rel, body] of Object.entries({ ...BASE, ...extra })) {
      const p = join(d, rel);
      mkdirSync(dirname(p), { recursive: true });
      writeFileSync(p, body, "utf8");
    }
    return d;
  };
  try {
    // **负对照（本条的立命之处）**：一份配置都没有 ⇒ 必须非 0，且要是 2（缺件）而不是 1（违规）
    const miss = runCli(fixture({}));
    assert.equal(miss.code, 2, `零 tsconfig*.json 必须按结构缺失 exit 2，不是「全部判据通过」；实际 ${miss.code}：${miss.out}`);
    assert.match(miss.out, /结构缺失（ADR-0049）/, `报文必须写明结构缺失（而不是「本条不判」或「通过」）：${miss.out}`);
    assert.ok(!/全部判据通过/.test(miss.out), `零配置时**不得**出现「全部判据通过 ✅」：${miss.out}`);

    // **正对照**：配置齐备且 include 条目都存在 ⇒ 0
    const ok = runCli(fixture({ "tsconfig.json": '{\n  "include": ["index.ts"]\n}\n' }));
    assert.equal(ok.code, 0, `配置齐备且条目存在时必须放行（0）；实际 ${ok.code}：${ok.out}`);
    assert.match(ok.out, /include 条目必须存在：1 份配置 \/ 1 条条目/, `正对照必须打印 ④ 的读数：${ok.out}`);

    // **负对照 2**：配置在、但 include 条目零匹配 ⇒ 1（有违规 ⇒ 与「缺件」的 2 分工）
    const bad = runCli(fixture({ "tsconfig.json": '{\n  "include": ["core/ghost.ts"]\n}\n' }));
    assert.equal(bad.code, 1, `include 条目零匹配必须按违规 exit 1；实际 ${bad.code}：${bad.out}`);
  } finally {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  }
  console.log("✔ ⑪ ④ 的语料存在性：零配置 ⇒ exit 2（结构缺失，不得「全部通过」）、配置齐备 ⇒ 0、条目零匹配 ⇒ 1");
}

console.log("");
console.log("  · 说明符抽取**不是 AST**（本仓 typescript 7.0.2 = native 移植，`.` 只导出 version，AST 在 unstable 子路径）");
console.log("    ⇒ 字符串里形如 `from \"./x\"` 的文本会误命中；命中项须人工复核；");
console.log("  · 只判**层 → 层**方向，不判「同层内谁依赖谁」；");
console.log("  · **层间环不判**（实测 `{core, evidence, persistence}` 成环；成因是 core 为混合层，见 lib 头注释）；");
console.log("  · 语料**排除 test/ 与 tools/**（它们允许 import 任何东西）⇒ 这两处的结构问题不在本门覆盖内；");
console.log("  · 动态 import（`await import(...)`）与 `export * from` 的形态覆盖靠正则，未逐形态立测试。");
console.log("ALL PASS ✅");
