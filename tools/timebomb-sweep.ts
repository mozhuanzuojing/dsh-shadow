// dsh-shadow —— tools/timebomb-sweep.ts：T12「时间炸弹 fixture」的**可复现探针**。
//
// 为什么有它（T12 第二次被「默认值变更」推翻之后，v1.15.98）：
//   v1.15.43 那次判定「22 个文件、只有 1 个真炸弹」的前提是 **`forget` 默认关**；
//   v1.15.85「默认全开」把**默认值**翻了过来，而那次判定**没有重跑** ⇒
//   6 个测试（`hit-accumulation` / `memory-time-single-source` / `abstract-sidecar` /
//   `fs-sandbox-scope` / `t8-silent-degradation` / `t8-explicit-zero`）在 2026-09-20 起陆续到期必炸。
//   ⇒ 判据：凡**改默认值**（而不是改代码）的变更，都要能**一条命令重跑**这份判定 —— 靠记性就是第三次。
//
// 做法（与 `tools/run-tests.ts` 同款纪律）：
//   · **每个文件一个子进程**：插件在模块级注册表（工具注册表等）上有全局副作用，同进程串跑会互相污染；
//   · `stdio` 走**文件描述符**而不是管道（受约束沙箱下 pipe 会被拒 EPERM），屏幕只留汇总；
//   · 假日期 shim 用 **`data:` URL** 交给 `--import`，**不落任何临时文件**（本仓禁止手写 `.js` / `.mjs`）。
//
// 怎么跑（复审者要能重放）：
//   node tools/timebomb-sweep.ts                      # 默认日期集：今天 +1/+2/+4/+7/+14/+30/+60/+90/+180/+365/+730/+1229 天
//   node tools/timebomb-sweep.ts --dates 2026-09-21,2027-01-01
//   node tools/timebomb-sweep.ts --file test/hit-accumulation.test.ts
//   npm run sweep:timebomb                            # 同第一条
//
// 退出码：0 = 全部日期 × 全部文件通过；1 = 有红（逐个列出并给断言首行）；2 = 结构性缺件（找不到测试文件）。
// ⚠ 它**刻意不进 `verify`**：一次全量是分钟级（51 文件 × 12 日期），而 `verify` 要的是快速缝合线。
import { spawnSync } from "node:child_process";
import { closeSync, openSync, readFileSync, readdirSync, rmSync, writeSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 只用「今天」这一个变量；与 `core/util.ts` 的 `today()` 同口径（**本地**日期，不是 UTC）。 */
const iso = (offsetDays: number) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** 默认日期集：跨越已知阈值的边界 —— 7（`retention.staleDays` 默认）/ 14（`forget.staleDays` 默认）/ 90（halfLife 常见值）。 */
const OFFSETS = [1, 2, 4, 7, 14, 30, 60, 90, 180, 365, 730, 1229];

/** 只改 `Date` 的构造与 `Date.now`；`Date.parse` / `Date.UTC` 等静态方法随 `extends` 继承。 */
const SHIM =
  "const raw=process.env.FAKE_NOW;" +
  "if(raw){const F=Date.parse(raw);const R=Date;" +
  "class D extends R{constructor(...a){if(a.length===0)super(F);else super(...a)}static now(){return F}}" +
  'Object.defineProperty(D,"name",{value:"Date"});globalThis.Date=D}';
const IMPORT_URL = `data:text/javascript,${encodeURIComponent(SHIM)}`;

const argv = process.argv.slice(2);
const argOf = (flag: string) => {
  const i = argv.indexOf(flag);
  return i >= 0 ? argv[i + 1] : undefined;
};

const dates = (argOf("--dates")?.split(",").map((s) => s.trim()).filter(Boolean)) ?? OFFSETS.map(iso);
const only = argOf("--file");
const badDate = dates.find((d) => !/^\d{4}-\d{2}-\d{2}$/.test(d));
if (badDate) {
  console.error(`[sweep] 非法日期：${badDate}（要 YYYY-MM-DD）`);
  process.exit(2);
}

const testDir = join(repoRoot, "test");
let files: string[] = [];
try {
  files = readdirSync(testDir).filter((f) => f.endsWith(".test.ts")).sort();
} catch { /* 下面统一判失败 */ }
if (only) files = files.filter((f) => f === only || `test/${f}` === only);
if (!files.length) {
  console.error("[sweep] 没找到任何 test/*.test.ts —— 结构性缺件，不是「通过」");
  process.exit(2);
}

const logPath = join(tmpdir(), `timebomb-sweep-${process.pid}.log`);
const started = Date.now();
const failures: { date: string; file: string; head: string }[] = [];
const runs = dates.length * files.length;
console.log(
  `[sweep] files=${files.length} dates=${dates.length} runs=${runs}\n` +
    `[sweep] dates=${dates.join(" ")}`,
);

for (const date of dates) {
  let dayFail = 0;
  for (const file of files) {
    const fd = openSync(logPath, "w");
    const r = spawnSync(process.execPath, ["--import", IMPORT_URL, join(testDir, file)], {
      cwd: repoRoot,
      env: { ...process.env, FAKE_NOW: date },
      stdio: ["ignore", fd, fd], // 不用管道：受约束沙箱下 pipe 会 EPERM
    });
    closeSync(fd);
    if (r.status !== 0) {
      dayFail += 1;
      let head = "(没有日志)";
      try {
        const txt = readFileSync(logPath, "utf8");
        head = (txt.split("\n").find((l) => /AssertionError|Error:/.test(l)) || txt.trim().split("\n").slice(-1)[0] || "").trim();
      } catch { /* 日志读不到就如实说 */ }
      failures.push({ date, file, head: head.slice(0, 180) });
    }
  }
  console.log(`[sweep] ${date} : fail=${dayFail}/${files.length}`);
}

rmSync(logPath, { force: true });
const minutes = ((Date.now() - started) / 60000).toFixed(1);
console.log(`[sweep] 完成：runs=${runs} elapsed=${minutes}min fail=${failures.length}`);

if (failures.length) {
  console.log("[sweep] 失败清单（日期 × 文件）：");
  for (const f of failures) console.log(`  ${f.date}  ${f.file}\n      ${f.head}`);
  const byFile = new Map<string, string[]>();
  for (const f of failures) byFile.set(f.file, [...(byFile.get(f.file) ?? []), f.date]);
  console.log("[sweep] 按文件归并：");
  for (const [file, ds] of byFile) console.log(`  ${file}  ← ${ds.join(", ")}`);
  console.log(
    "[sweep] 下一步：逐个读断言定根因；若根因是某个**默认判据**（forget/retention/compact），" +
      "按 T12 既有形态在该场景**显式声明无关**（如 `forget: { enabled: false }`），而不是改 fixture 日期。",
  );
  process.exit(1);
}

writeSync(1, "[sweep] 全部日期 × 全部文件通过（0 红）\n");
process.exit(0);
