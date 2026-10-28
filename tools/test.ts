/**
 * v2 ops — 串行测试运行器：test/**\/*.test.ts，逐文件一个 node 子进程。
 * 失败即非零退出；不吞输出。
 */

import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const testDir = join(root, "test");

const walk = (dir: string): string[] => {
  let out: string[] = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out = out.concat(walk(p));
    else if (name.endsWith(".test.ts")) out.push(p);
  }
  return out;
};

const files = walk(testDir).sort();
if (!files.length) {
  console.error("[test] no test/**/*.test.ts found");
  process.exit(2);
}

let failed = 0;
const started = Date.now();
for (const file of files) {
  const rel = relative(root, file).replace(/\\/g, "/");
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file], { stdio: "inherit", cwd: root });
  const ms = Date.now() - t0;
  if (r.status !== 0) {
    failed++;
    console.error(`\n[test] FAIL ${rel} (${ms}ms)`);
  } else {
    console.log(`[test] ok ${rel} (${ms}ms)`);
  }
}

const total = Date.now() - started;
console.log(`\n[test] ${files.length - failed}/${files.length} passed in ${total}ms`);
process.exit(failed ? 1 : 0);
