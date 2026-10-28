/**
 * v2 ops — 结构门：层方向（contract < domain < store < engine < surface），无反向 import。
 * 只判方向，不判环；文件级环由 test/unit/imports.test.ts 另行断言。
 */

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const src = join(root, "src");

const walk = (dir: string): string[] => {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
};

const layer = (rel: string): number => {
  if (rel === "index.ts") return 5;
  if (rel.startsWith("contract/")) return 0;
  if (rel.startsWith("domain/")) return 1;
  if (rel.startsWith("store/")) return 2;
  if (rel.startsWith("engine/")) return 3;
  if (rel.startsWith("surface/")) return 4;
  return 9;
};

const files = walk(src);
const violations: string[] = [];
for (const f of files) {
  const rel = relative(src, f).replace(/\\/g, "/");
  const from = layer(rel);
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const spec = m[1]!;
    const target = spec.replace(/^\.\//, "").replace(/\.js$/, ".ts");
    // 解析相对路径：相对当前文件目录
    const baseParts = rel.split("/");
    baseParts.pop();
    const combined = [...baseParts, ...target.split("/")];
    const norm: string[] = [];
    for (const part of combined) {
      if (!part || part === ".") continue;
      if (part === "..") norm.pop();
      else norm.push(part);
    }
    const toRel = norm.join("/");
    const to = layer(toRel);
    if (from === 0 && to !== 0) violations.push(`${rel} → ${toRel}（contract 只能依赖 contract）`);
    else if (from === 1 && to > 1) violations.push(`${rel} → ${toRel}（domain 只能依赖 contract/domain）`);
    else if (from === 2 && to > 2) violations.push(`${rel} → ${toRel}（store 不能依赖 engine/surface）`);
    else if (from === 3 && to > 3) violations.push(`${rel} → ${toRel}（engine 不能依赖 surface）`);
    else if (from === 4 && to > 4) violations.push(`${rel} → ${toRel}（surface 不能依赖 index）`);
    else if (toRel === "index.ts" && from < 5) violations.push(`${rel} → index.ts（任何层不得 import 入口）`);
  }
}

if (violations.length) {
  console.error(`[audit-layers] ${violations.length} violation(s):`);
  for (const v of violations) console.error(`  - ${v}`);
  process.exit(1);
}
console.log(`[audit-layers] ok · ${files.length} files`);
