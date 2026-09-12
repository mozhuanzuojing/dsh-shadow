// dsh-shadow —— tools/version-consistency.selftest.ts：三方版本门的**标定**（v1.15.66）。
//
// 纪律（ADR-0062 / v1.15.60）：**CLI 的行为要 spawn 子进程验**，不能只测纯函数 ——
// 否则「退出码写错」这类缺陷在测试里永远看不见，而 `npm run verify` 正是靠**退出码**串起来的。
//
// 本文件用临时目录造四种语料，逐个 spawn 真 CLI，断言退出码与关键报文：
//   ① 三方一致            ⇒ **0**（正对照：门必须放行）
//   ② README 那一行落后    ⇒ **1**（本门存在的理由；`v1.15.66` 之前真发生过，落后 26 个版本）
//   ③ README 缺「当前版本」行 ⇒ **2**（结构缺失 ≠ 不一致：前者要人补结构，后者要人改数字）
//   ④ CHANGELOG 缺首条标题  ⇒ **2**
// ②③④ 都是**负对照** —— 若把门改成「永远返回 0」，②③④ 全红；若改成「永远返回 1」，①红。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "version-consistency.ts");

/** 造一份语料并 spawn CLI，返回 `{code, out}`。 */
const run = (opts: { pkg: string; readmeVersion?: string; changelogVersion?: string }) => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-ver-"));
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: opts.pkg }));
    const readmeLine = opts.readmeVersion === undefined ? "" : `**当前版本：\`v${opts.readmeVersion}\`** —— 摘要：\n`;
    writeFileSync(join(dir, "README.md"), `# x\n\n${readmeLine}\n| 版本 | 主题 |\n|---|---|\n| v0.0.1 | 旧行（归档层，**不该**参与判据） |\n`);
    const head = opts.changelogVersion === undefined ? "" : `## [v${opts.changelogVersion}] 标题\n\n正文\n`;
    // ② 旧条目**只在给了版本号时**才写：否则「缺首条标题」这个 fixture 里会残留一个 `## [v0.0.1]`，
    //    而 CLI 取的是**第一条**标题 ⇒ 它会正确地报「0.0.1 与 1.2.3 不一致（退出 1）」而不是「结构缺失（2）」。
    //    （第一版就踩了这个：期望 2 实得 1。**这是 fixture 的错，不是门的错** —— 而且门给的那个答案更有信息量。）
    const older = opts.changelogVersion === undefined ? "" : `## [v0.0.1] 更旧的一条\n`;
    writeFileSync(join(dir, "CHANGELOG.md"), `# Changelog\n\n${head}${older}`);
    let code = 0, out = "";
    try {
      out = execFileSync(process.execPath, [CLI, dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      code = e.status ?? -1;
      out = `${e.stdout || ""}${e.stderr || ""}`;
    }
    return { code, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// ① 正对照：三方一致 ⇒ 放行（0）
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 0, `三方一致必须放行（0）；实际 ${r.code}，输出：${r.out}`);
  assert.match(r.out, /三方版本一致/, "报文应明确说「一致」");
  assert.match(r.out, /1\.2\.3/, "报文应打印实际版本号");
  console.log("✔ ① 正对照：三方一致 ⇒ 退出 0（含实际值打印）");
}

// ② README 落后 ⇒ 红（1）—— 这是本门存在的理由（v1.15.66 之前真发生过）
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.0", changelogVersion: "1.2.3" });
  assert.equal(r.code, 1, `README 落后必须报红（1）；实际 ${r.code}`);
  assert.match(r.out, /不一致/, "报文应说「不一致」");
  assert.match(r.out, /README\.md.*1\.2\.0/s, `报文应指出是 README 那一行落后；实际：${r.out.slice(0, 200)}`);
  assert.match(r.out, /package\.json[\s\S]*1\.2\.3/, "报文应同时打印另两处的值（否则读者不知道以谁为准）");
  console.log("✔ ② 负对照：README 那一行落后 ⇒ 退出 1，且打印三处实际值");
}

// ③ README 缺「当前版本」行 ⇒ 结构缺失（2），与「不一致」分开
{
  const r = run({ pkg: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 2, `缺「当前版本」行应报**结构缺失**（2）而不是不一致（1）；实际 ${r.code}`);
  assert.match(r.out, /结构缺失/, "报文应说「结构缺失」");
  console.log("✔ ③ 负对照：README 缺「当前版本」行 ⇒ 退出 2（结构缺失 ≠ 数字不一致）");
}

// ④ CHANGELOG 缺首条 `## [vX]` ⇒ 结构缺失（2）
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3" });
  assert.equal(r.code, 2, `缺 CHANGELOG 首条标题应报结构缺失（2）；实际 ${r.code}`);
  console.log("✔ ④ 负对照：CHANGELOG 缺首条版本标题 ⇒ 退出 2");
}

// ⑤ 归档层**不得**参与判据：README 的版本历史表里有一条更旧的 `v0.0.1`，
//    而「当前版本」行与另两处一致 ⇒ 必须**放行**。
//    这条锁住一个真实的设计决定：**只查「当前版本」行，不查全篇最大版本号**（否则归档与当前态会互相误报）。
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 0, `README 归档表里的旧版本号不得影响判据；实际 ${r.code}`);
  console.log("✔ ⑤ 归档层隔离：README 历史表里的 `v0.0.1` 不参与判据（只认「当前版本」行）");
}

console.log("ALL PASS ✅");
