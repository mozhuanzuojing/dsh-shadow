import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = join(process.cwd(), "src");
const walk = (dir: string): string[] => {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".ts")) out.push(p);
  }
  return out;
};

const files = walk(root);
const set = new Set(files.map((f) => relative(root, f).replace(/\\/g, "/")));
const graph = new Map<string, Set<string>>();
for (const f of set) graph.set(f, new Set());
for (const f of files) {
  const rel = relative(root, f).replace(/\\/g, "/");
  const text = readFileSync(f, "utf8");
  for (const m of text.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const spec = m[1]!.replace(/\.js$/, ".ts");
    const parts = rel.split("/");
    parts.pop();
    const combined = [...parts, ...spec.split("/")];
    const norm: string[] = [];
    for (const p of combined) {
      if (!p || p === ".") continue;
      if (p === "..") norm.pop();
      else norm.push(p);
    }
    const to = norm.join("/");
    if (set.has(to)) graph.get(rel)!.add(to);
  }
}

// DFS 环检测
const color = new Map<string, 0 | 1 | 2>();
const cycles: string[][] = [];
const stack: string[] = [];
const dfs = (v: string): void => {
  color.set(v, 1);
  stack.push(v);
  for (const w of graph.get(v) ?? []) {
    const c = color.get(w) ?? 0;
    if (c === 0) dfs(w);
    else if (c === 1) {
      const i = stack.indexOf(w);
      cycles.push(stack.slice(i).concat(w));
    }
  }
  stack.pop();
  color.set(v, 2);
};
for (const v of set) if ((color.get(v) ?? 0) === 0) dfs(v);

assert.equal(cycles.length, 0, `文件级 import 环：${cycles.map((c) => c.join(" → ")).join(" | ")}`);
assert.equal(set.size, files.length);
console.log(`✔ imports：${files.length} 个源文件、0 个文件级环`);

