// dsh-shadow —— tools/run-tests.ts：**确定性测试的串行运行器**（`npm run verify` 的一部分）。
//
// 为什么需要它（吸收 hl_mem 的「前置冒烟门」，见 ADR-0077）：
//   本仓库长期是「人工逐个 `node test/*.test.ts`」——41 个文件靠人记得跑全，
//   于是「便宜且确定性的完整缝合线检查」实际上**没有单一命令**。hl_mem 的代价最直白的教训是：
//   **任何昂贵的、烧语料/烧 LLM 的验证之前，必须先跑一条零 LLM 的完整缝合线命令；命令失败就不许开工。**
//   没有这条命令，「先冒烟」只能靠自觉 ⇒ 这不是闸门，是习惯。
//
// 设计取舍：
//   · **每个文件一个子进程**（而不是同进程 `await import()`）：插件在模块级注册表（工具注册表等）
//     上有全局副作用，同进程串跑会互相污染，出现「单跑绿、全跑红」的假红/假绿。
//   · `stdio: "inherit"`（**不用管道**）：受约束沙箱下 pipe 会被拒（EPERM），inherit 不会；
//     顺带让每个测试自己的输出原样可见，失败时能直接看到是哪一行断言。
//   · 串行而非并行：测试里有共享的 mock 目录/临时文件约定，串行换来确定性，代价是可接受的总时长。
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// 两批**确定性**检查，一条命令跑完：
//   · `test/*.test.ts`        —— 插件行为（跑构建产物）
//   · `tools/*.selftest.ts`   —— 审计工具**自己**的标定/自检（这是把 V6「审计工具未接入任何自动门禁」
//                                从「靠人记得跑」变成「门禁里就有」的那一步）
// `test/replay-real.ts` 之类的**人工回放脚本**不收（它们不是断言，是需要真语料的观察工具）。
const batches: { dir: string; suffix: string; label: string }[] = [
  { dir: join(repoRoot, "test"), suffix: ".test.ts", label: "test" },
  { dir: join(repoRoot, "tools"), suffix: ".selftest.ts", label: "tools" },
];

const jobs: { file: string; label: string }[] = [];
for (const b of batches) {
  let names: string[] = [];
  try { names = readdirSync(b.dir); } catch { /* 目录缺失，下面统一判失败 */ }
  for (const f of names.filter((f) => f.endsWith(b.suffix)).sort()) jobs.push({ file: join(b.dir, f), label: `${b.label}/${f}` });
}

if (!jobs.length) {
  console.log("[run-tests] 没找到任何测试或自检文件 —— 这本身是失败（运行器接错目录了）");
  process.exit(1);
}

const failed: string[] = [];
for (const { file, label } of jobs) {
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [file], { cwd: repoRoot, stdio: "inherit" });
  const ms = Date.now() - t0;
  if (r.status !== 0) failed.push(`${label}（exit ${r.status}${r.error ? ` · ${r.error.message}` : ""} · ${ms}ms）`);
  else console.log(`  · ${label} 通过（${ms}ms）`);
}

console.log(`\n[run-tests] 共 ${jobs.length} 个检查（${jobs.length - failed.length} 通过 / ${failed.length} 失败）`);
if (failed.length) {
  console.log("[run-tests] 失败清单：");
  for (const f of failed) console.log(`  ✗ ${f}`);
  process.exit(1);
}
console.log("[run-tests] ALL PASS ✅");
