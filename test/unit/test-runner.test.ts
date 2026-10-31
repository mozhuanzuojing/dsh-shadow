import assert from "node:assert/strict";
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const repo = process.cwd();
const runner = join(repo, "tools", "test.ts");

const makeRoot = (files: Record<string, string>): string => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-shadow-runner-"));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
};

const run = (root: string, extra: string[] = []) =>
  spawnSync(process.execPath, [runner, `--root=${root}`, `--timings=${join(root, "timings.json")}`, ...extra], {
    cwd: repo,
    encoding: "utf8",
    timeout: 20_000,
  });

const okRoot = makeRoot({
  "a.test.ts": 'console.log("A-OK");\n',
  "b.test.ts": 'console.log("B-OK");\n',
});
const okRun = run(okRoot, ["--concurrency=2"]);
assert.equal(okRun.status, 0, okRun.stderr);
assert.match(okRun.stdout, /2\/2 passed/);
assert.equal(existsSync(join(okRoot, "timings.json")), true, "并行 runner 必须写耗时文件");

const failRoot = makeRoot({ "c.test.ts": "process.exit(3);\n" });
const failRun = run(failRoot, ["--concurrency=1"]);
assert.equal(failRun.status, 1, "失败测试必须让 runner 非零退出");
assert.match(failRun.stdout + failRun.stderr, /0\/1 passed/);

const slowRoot = makeRoot({ "slow.test.ts": "setTimeout(() => {}, 5000);\n" });
const t0 = Date.now();
const slowRun = run(slowRoot, ["--concurrency=1", "--timeout=300"]);
const elapsed = Date.now() - t0;
assert.equal(slowRun.status, 1, "超时必须失败");
assert.match(slowRun.stderr, /timeout/);
assert.ok(elapsed < 5_000, `超时应在 5s 内被杀死，实际 ${elapsed}ms`);

console.log("✔ test runner：并发执行、失败非零、超时杀进程、耗时文件");
