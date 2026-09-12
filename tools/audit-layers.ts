#!/usr/bin/env node
// dsh-shadow —— tools/audit-layers.ts：**结构门**的 CLI（IO 与呈现；判据全在 audit-layers.lib.ts）。
//
// 用法：node tools/audit-layers.ts [repoRoot]
// 退出码：0 = 全部判据通过；1 = 有违规（可接进 `npm run verify`）。
//
// 口径（必须打印出来，否则读数不可解释）：
//   · 语料 = 仓库下所有 `*.ts`（递归），**排除** SOURCE_EXCLUDED_DIRS + `test` + `tools`
//     —— 测试与工具允许 import 任何东西，把它们算进来会让本条门禁失去意义；
//   · 「层」= 仓库相对路径的第一段；根下直接的文件（`index.ts`）落为 `(root)`。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import {
  SOURCE_EXCLUDED_DIRS,
  PURE_MODULES,
  DIRECTION_RULES,
  FORBIDDEN_TARGETS_EVERYWHERE,
  auditLayers,
} from "./audit-layers.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const ROOT = process.argv[2] ?? join(here, "..");
const SKIP = new Set([...SOURCE_EXCLUDED_DIRS, "test", "tools"]);

const collect = (dir: string, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      if (SKIP.has(name)) continue;
      collect(full, out);
    } else if (name.endsWith(".ts") && !name.endsWith(".d.ts")) {
      out.push(relative(ROOT, full).replaceAll("\\", "/"));
    }
  }
  return out;
};

const paths = collect(ROOT).sort();
const files = paths.map((path) => ({ path, text: readFileSync(join(ROOT, path), "utf8") }));

const report = auditLayers(files);
const { violations, fileCycles, layerCycles, unresolved, stats } = report;

console.log("dsh-shadow 结构门（audit-layers）");
console.log(`根：${ROOT}`);
console.log(`口径：*.ts 递归，排除 ${[...SKIP].sort().join(" / ")}；层 = 路径第一段，根下文件 = (root)`);
console.log(`语料：${stats.files} 文件 / ${stats.edges} 条 import 边`);
console.log("");

console.log(`① 文件级依赖图无环：环 ${fileCycles.length} 个`);
for (const c of fileCycles) console.log(`   ✗ { ${c.join(", ")} }`);
console.log(`② 纯模块白名单零副作用（${PURE_MODULES.length} 个）`);
for (const p of PURE_MODULES) console.log(`   · ${p}`);
console.log(`③ 方向禁令（${DIRECTION_RULES.length} 条）+ 任何层 ↛ ${FORBIDDEN_TARGETS_EVERYWHERE.join(" / ")}`);
for (const r of DIRECTION_RULES) console.log(`   · ${r.from} ↛ ${r.to}（${r.why}）`);
console.log("");

if (unresolved.length > 0) {
  console.log(`未解析的相对 import（${unresolved.length} 处，需人工看；暂不计违规）：`);
  for (const u of unresolved.slice(0, 10)) console.log(`   ? ${u.from}:${u.line} → ${u.spec}`);
  console.log("");
}

if (layerCycles.length > 0) {
  console.log("已知**非违规**（留档，不判）：层间成环");
  for (const c of layerCycles) console.log(`   ~ { ${c.join(", ")} }`);
  console.log("   成因：`core/` 是**混合层**（`core/paths.ts`/`types.ts`/`util.ts` 是无依赖纯模块，");
  console.log("   而 `core/memory.ts`/`writer-materialize.ts`/`toolset-exec.ts` 有副作用）⇒ 层间环是命名artifact，");
  console.log("   **文件级**无环（①为 0）。要消掉它得先拆 `core/`，那是架构决策（BACKLOG T13），不是门禁。");
  console.log("");
}

if (violations.length === 0) {
  console.log("全部判据通过 ✅");
  process.exit(0);
}

console.log(`违规 ${violations.length} 处：`);
for (const v of violations) console.log(`  ✗ [${v.rule}] ${v.where}\n      ${v.why}`);
process.exit(1);
