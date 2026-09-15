#!/usr/bin/env node
// dsh-shadow —— tools/audit-scripts.selftest.ts：**脚本扩展名门**的标定测试（v1.15.87）。
//
// 为什么必须有：门如果判错了，两个方向都有代价 —— 判松（`dist/**.js` 也报）会逼人习惯性忽略它；
// 判紧（`.py` 也报）会与用户 2026-09-15 定的边界冲突。故每一类判据都要有**正/负对照**，
// 尤其要有一条**「把门弄坏」的对照**（证明排除表真的在起作用，而不是恰好没命中）。
import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { walkTree } from "./audit-corpus.lib.ts";
import { SCRIPT_SKIP_DIRS, corpusVerdict, findForbiddenScripts, isForbiddenScript } from "./audit-scripts.lib.ts";

const relOf = (root: string, ps: string[]) => ps.map((p) => relative(root, p).replace(/\\/g, "/"));

// ① 正对照：干净语料 ⇒ 0 违规
assert.deepEqual(findForbiddenScripts(["index.ts", "tools/x.ts", "core/util.ts", "README.md"]), []);
console.log("✔ ① 正对照：全是 `.ts` / `.md` ⇒ 0 违规");

// ② 负对照：三种被禁扩展名逐个报，且**点名**
{
  const bad = ["a.js", "b.mjs", "c.cjs"];
  assert.deepEqual(findForbiddenScripts(bad), bad);
  console.log("✔ ② 负对照：`.js` / `.mjs` / `.cjs` 都报（顺序保持、逐条点名）");
}

// ③ 边界（用户 2026-09-15 立的）：`.ts` 与 `.py` / `.ps1` 等**其它脚本语言**不算违规
{
  const ok = ["a.ts", "b.py", "c.ps1", "d.psm1", "e.sh", "f.json", "g.mjs.bak", "h.js.txt"];
  assert.deepEqual(findForbiddenScripts(ok), [], `这些都不该报：${JSON.stringify(ok)}`);
  console.log("✔ ③ 边界：`.ts` / `.py` / `.ps1` / `.sh` / `.json` 不报；**后缀后面还跟着东西**（`x.mjs.bak`）也不报");
}

// ④ 大小写不敏感（Windows 上 `.JS` 与 `.js` 是同一类；门若漏了它，本机照样会出现 js 脚本）
{
  assert.deepEqual(findForbiddenScripts(["A.JS", "B.Mjs", "C.CJS"]), ["A.JS", "B.Mjs", "C.CJS"]);
  console.log("✔ ④ 大小写不敏感：`.JS` / `.Mjs` / `.CJS` 都报");
}

// ⑤ 排除面：`.git` / `node_modules` / `dist` 下的 **不报**；**同一条文件名换个目录就报**（控：是「排除」不是「漏判」）
{
  assert.deepEqual(findForbiddenScripts(["dist/index.js", "node_modules/x/y.js", ".git/hooks/z.mjs"]), []);
  assert.deepEqual(findForbiddenScripts(["src/index.js", "x/y.js", "hooks/z.mjs"]), ["src/index.js", "x/y.js", "hooks/z.mjs"]);
  console.log("✔ ⑤ 排除面：`dist/` / `node_modules/` / `.git/` 下不报；**同样的文件名换个目录立刻报**");
}

// ⑥ 排除只看**目录段**：顶层有个文件就叫 `dist.js` ⇒ 仍要报（否则「排除」会误伤文件名）
{
  assert.deepEqual(findForbiddenScripts(["dist.js", "a/dist.js"]), ["dist.js", "a/dist.js"]);
  console.log("✔ ⑥ 排除只作用于**目录段**：顶层文件 `dist.js` 仍报（不误伤同名文件）");
}

// ⑦ 端到端（真 IO）：临时树里造出「该报的」与「该被排除的」，走 `walkTree` + 判据这一**整条路**
{
  const root = mkdtempSync(join(tmpdir(), "dsh-scripts-"));
  mkdirSync(join(root, "sub"), { recursive: true });
  mkdirSync(join(root, "dist"), { recursive: true });
  mkdirSync(join(root, "node_modules", "pkg"), { recursive: true });
  writeFileSync(join(root, "ok.ts"), "");
  writeFileSync(join(root, "ok.py"), "");
  writeFileSync(join(root, "sub", "bad.mjs"), "");
  writeFileSync(join(root, "dist", "built.js"), "");
  writeFileSync(join(root, "node_modules", "pkg", "dep.js"), "");
  const { files, dirCount } = walkTree(root, { match: () => true, skip: SCRIPT_SKIP_DIRS });
  const got = findForbiddenScripts(relOf(root, files));
  assert.deepEqual(got, ["sub/bad.mjs"], `端到端只该报 sub/bad.mjs，实得 ${JSON.stringify(got)}`);
  // 控：被排除的那两个文件**确实在磁盘上**（否则「没报」可能只是因为它们不存在 —— 假绿）
  assert.ok(existsSync(join(root, "dist", "built.js")), "`dist/built.js` 必须真的存在，才说明「没报」是排除在起作用");
  assert.ok(existsSync(join(root, "node_modules", "pkg", "dep.js")), "`node_modules/pkg/dep.js` 同理");
  // 被跳过的目录**不进遍历**（`dirCount` 只数真正走进去的目录）⇒ 只数到 `sub` 一个
  assert.equal(dirCount, 1, `只该数到 sub 一个目录（dist/node_modules 被跳过），实得 ${dirCount}`);
  console.log(`✔ ⑦ 端到端（临时树）：只报 \`sub/bad.mjs\` —— \`dist/built.js\` 与 \`node_modules/pkg/dep.js\` **在磁盘上确实存在**却被排除；扫描到 ${files.length} 个文件 / ${dirCount} 个目录（跳过的目录不计数）`);
}

// ⑧ 假绿对照：**把门弄坏**（拿掉 `dist` 的排除）⇒ 立刻报 —— 证明上面那条「不报」确实是排除在起作用
{
  const broken = SCRIPT_SKIP_DIRS.filter((d) => d !== "dist");
  assert.deepEqual(findForbiddenScripts(["dist/index.js"], broken), ["dist/index.js"]);
  assert.deepEqual(findForbiddenScripts(["dist/index.js"]), []);
  console.log("✔ ⑧ 假绿对照：把 `dist` 从排除表里拿掉 ⇒ 同一条路径立刻变红（排除表真的在起作用）");
}

// ⑨ 零文件语料 ⇒ **非零退出**（v1.15.45 的同族假绿：漏根参数 ⇒ 0 文件 ⇒ 报「全部通过」）
//    本仓另两个 CLI 也实现了这条闸，但**只手工验证过**（要 spawn 子进程）⇒ 这里做成纯判据自动断言。
{
  assert.equal(corpusVerdict(0).ok, false, "0 个文件不得判「通过」");
  assert.equal(corpusVerdict(0).code, 2, "0 个文件 ⇒ 结构缺失(2)，不是违规(1)");
  assert.ok(corpusVerdict(0).why.includes("0 个文件"), "报文要说清是「0 个文件」");
  assert.equal(corpusVerdict(1).ok, true);
  assert.equal(corpusVerdict(470).ok, true);
  console.log("✔ ⑨ 零文件语料 ⇒ 结构缺失(2)（不是「通过」）；有文件 ⇒ 交给扩展名判据");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · CLI 的**根不存在 ⇒ exit 2** 与**违规 ⇒ exit 1** 两条路径**未做成自动断言**（要 spawn 子进程）；已手工跑过三条：根不存在 ⇒ 2、临时树放 `.mjs` ⇒ 1、真仓 ⇒ 0。（零文件那条**已**做成纯判据 ⑨。）");
console.log("  · 本门只答「有没有手写 `.js`/`.mjs`/`.cjs`」，答不了「`.ts` 里写的是不是 TypeScript」——那不是它的问题。");
console.log("ALL PASS ✅");