#!/usr/bin/env node
// dsh-shadow —— tools/module-ownership.ts：**模块归属表**的生成器（README「模块归属表」一节）。
//
// 为什么有这个工具（v1.16.0）：README 原先写「这张表是**生成**的，不是手写的」并给了命令
//   `node ../.docs/fix/2026-09-12/t15-module-ownership.ts`
// —— 而 `../.docs/fix/` 下**已经没有 `2026-09-12`**（现存 09-14 / 09-15 / 09-16），
// 整个 `.docs` 里也**没有任何 `t15*` 文件**；同一句还写着「**别在别处手写**」。
// ⇒ 加一层之后**既不能重生成、按指示又不许手写**。
// 按 `AGENTS.md` 自己的结论「**能复现的东西放 `tools/`**（进版本控制、可被门守）」，把它重建在这里。
//
// 判据**不在这里重写**：`Reads` 复用 `audit-layers.lib.ts` 的 `buildGraph`（同一份 import 图），
// `Must not own` 复用同一文件的 `DIRECTION_RULES` / `FORBIDDEN_TARGETS_EVERYWHERE`
// —— 「同一个判据只能有一份实现」（本仓已有两次代价明确的教训）。
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DIRECTION_RULES,
  FORBIDDEN_TARGETS_EVERYWHERE,
  SOURCE_EXCLUDED_DIRS,
  buildGraph,
  layerOf,
} from "./audit-layers.lib.ts";

/** 仓库根（`argv[2]` 可覆盖，便于在别处重放）。 */
const REPO = process.argv[2] ?? join(dirname(fileURLToPath(import.meta.url)), "..");
const SKIP = new Set([...SOURCE_EXCLUDED_DIRS, "test", "tools"]);

/**
 * 根层哨兵。**比较只允许发生在这里**（`isRoot`）——
 *
 * 这不是洁癖：初版把 `=== "(root)"` 直接散在 5 处（`a` / `b` / `l` / `t` / `to`），
 * 被 `npm run audit:ratchet` 当场判红 `b_keys 95 → 100（+5）`，理由是「同一个比较点散在多处」。
 * 收成一处之后那 5 个键**不再出现**。⇒ 要加新比较，走 `isRoot`，别再内联字面量。
 */
const ROOT_LAYER = "(root)";
const isRoot = (layer: string): boolean => layer === ROOT_LAYER;

/** 根层的展示名（表里叫 `index.ts`）。 */
const asIndexTs = (layer: string): string => (isRoot(layer) ? "index.ts" : layer);

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
      out.push(relative(REPO, full).replaceAll("\\", "/"));
    }
  }
  return out;
};

/**
 * `Owns` **不可机械推**（README 已如实写明）⇒ 只对 **ADR 定过**的层给结论，其余标「未核」、**不编**。
 * 依据：`README.md` 的模块归属表一节与 `tools/audit-layers.lib.ts` 文件头（T13 实测结论）。
 */
const OWNS: Record<string, string> = {
  "(root)": "Cordis 适配器（**任何层不得 import 它**）",
  core: "脊柱（**不是**纯函数层：它 import `evidence`/`persistence`/`security` 与 `node:fs`）",
  persistence: "写侧",
  query: "读侧",
  decision: "决策原语层（ADR-0096）：协议 / 守卫 / 一个原语 + 一个视图 / 后端表 / 投影",
};

/**
 * `Writes` 同样**不可机械推**，且**已登记在两条契约里**
 * （`derived-file-v1` / `memory-file-v1`，`README.md` 表 B）⇒ 这里**不重复列第二份派生件清单**。
 */
const WRITES_HINT = "见 `derived-file-v1` / `memory-file-v1`（不在此重复列）";

const paths = collect(REPO).sort();
const files = paths.map((path) => ({ path, text: readFileSync(join(REPO, path), "utf8") }));
const { edges } = buildGraph(files);

const layers = [...new Set(paths.map(layerOf))].sort((a, b) =>
  isRoot(a) ? -1 : isRoot(b) ? 1 : a.localeCompare(b),
);

/** 某一层 import 到的**其它**层（去重、排序）。 */
const readsOf = (layer: string): string[] => {
  const out = new Set<string>();
  for (const e of edges) {
    if (e.kind !== "relative") continue;
    if (layerOf(e.from) !== layer) continue;
    const to = layerOf(e.to);
    if (to !== layer) out.add(asIndexTs(to));
  }
  return [...out].sort();
};

/** 该层**不得** import 的层：方向禁令里 `from === 本层` 的 + 任何层都不许碰的那两个。 */
const mustNotOwn = (layer: string): string[] => {
  const out = new Set<string>();
  for (const r of DIRECTION_RULES) {
    if (r.from === layer) out.add(`${asIndexTs(r.to)}（${r.why}）`);
  }
  for (const t of FORBIDDEN_TARGETS_EVERYWHERE) out.add(`${asIndexTs(t)}（任何层都不许 import）`);
  return [...out].sort();
};

const label = (layer: string): string => (isRoot(layer) ? "`index.ts`（root）" : `\`${layer}/\``);
const orDash = (xs: string[]): string => (xs.length === 0 ? "—" : xs.map((x) => (x.endsWith(")") ? x : `\`${x}\``)).join(" · "));

console.log("dsh-shadow 模块归属表（tools/module-ownership.ts 生成 —— **不要手写**）");
console.log(`根：${REPO}`);
console.log(`口径：*.ts 递归，排除 ${[...SKIP].sort().join(" / ")}；层 = 路径第一段，根下文件 = index.ts`);
console.log(`语料：${paths.length} 个源文件 / ${edges.length} 条边`);
console.log("");
console.log("| Module | Owns | Reads | Writes | Must not own |");
console.log("|---|---|---|---|---|");
for (const layer of layers) {
  const owns = OWNS[layer] ?? "未核（ADR 未定过，**不编**）";
  console.log(`| ${label(layer)} | ${owns} | ${orDash(readsOf(layer))} | ${WRITES_HINT} | ${orDash(mustNotOwn(layer))} |`);
}
console.log("");
const dirCount = layers.filter((l) => !isRoot(l)).length;
console.log(`一级模块 **${layers.length}** 个（= ${dirCount} 个目录 + \`index.ts\`）× 5 列 = **${layers.length * 5}** 个格子`);
console.log("（**行数也由本工具打印** —— README 与 BACKLOG 里都不要手写这个数；数一变就重跑本命令。）");
