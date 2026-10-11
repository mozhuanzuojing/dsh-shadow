// dsh-shadow —— tools/materials-ledger.selftest.ts：`materials-ledger.ts` 的 **walk 守卫门**（2026-10-11 立）。
//
// **它回答什么**：`walk` 在**有 link 环 / 菱形**的树上**终止**，并且**每份真实目录只计一次**。
//
// **由来（真缺陷）**：材料落盘那一轮，`node tools/materials-ledger.ts G:\project\dsh1` 卡在
// `dsh-w` **40+ 分钟 / 1716 s CPU** 被 kill —— `dsh-w/deepseek-harness` 下有大量 reparse point，
// 且 `vendor` 子树**互相成环**；旧 `walk` 用 `statSync` 判目录后直接递归 ⇒ 路径被指数化。
//
// **为什么夹具是真的 junction 而不是纯函数**：纯函数只能验「判据说的是不是它说的」，
// 验不了「`statSync`/`realpathSync` 在本平台**真的**把 junction 当目录、且 realpath 真的咬得住」——
// 而这条缺陷的**全部内容**就是平台行为。⇒ 这里用 `symlinkSync(..., "junction")` 造**真环**并 spawn 真 CLI。
//   · `mklink /J` / `symlinkSync(..., "junction")` 建 junction **不需要管理员权限**；
//   · `type` 参数只在 Windows 生效（POSIX 上被忽略）⇒ 同一行代码两端可跑；
//   · 夹具**全部在系统临时目录**里、链接目标也**全在夹具内** ⇒ 自清理是安全的。
//
// **能力边界（诚实标注）**：
//   · 若本机**不允许建 junction/symlink**（权限、沙箱、特殊文件系统）⇒ 本门**红**（不静默跳过）：
//     报错里带一条可重放的人工命令。**它不会因为「建不出来」而放行**。
//   · 它只锁**计数语义**（同一真实目录一次）与**终止性**，不锁耗时上限（CI 机器差异大）。
//   · 实测对照（`harness/vendor`，真实 90 目录 / 346 文件）：祖先栈守卫 → 635 目录 / 3,624 文件；
//     目录级去重 → 90 目录 / 346 文件。**本门的 `loops` 例正是这两者的判别器**：
//     去掉守卫 ⇒ 超时（红）；只留祖先栈守卫 ⇒ 计到 **2** 个文件（红）；目录级去重 ⇒ **1**（绿）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, realpathSync, rmdirSync, rmSync, statSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "materials-ledger.ts");

/** 夹具里链接的建立方式：**绝对路径**（Windows 的 junction 目标必须是绝对路径）。 */
const linkDir = (target: string, link: string): void => {
  try {
    // ⚠ `"junction"` 只在 Windows 生效（那里不需要管理员）；POSIX 上按 dir symlink 建。
    symlinkSync(target, link, "junction");
  } catch (e: any) {
    assert.fail(
      `✗ 夹具建不出来（本机不允许 junction/symlink）：${link} → ${target}\n` +
        `  原因：${e?.message ?? e}\n` +
        `  ⇒ 本门**不静默跳过**。人工复现（不需要管理员）：\n` +
        `     $t = Join-Path $env:TEMP "ml-repro"; Remove-Item $t -Recurse -Force -EA 0\n` +
        `     New-Item -ItemType Directory -Force "$t\\mat\\real\\deep" | Out-Null\n` +
        `     Set-Content "$t\\mat\\real\\deep\\leaf.txt" "x"\n` +
        `     cmd /c mklink /J "$t\\mat\\real\\deep\\loop" "$t\\mat\\real"\n` +
        `     cmd /c mklink /J "$t\\mat\\mirror" "$t\\mat\\real"\n` +
        `     node tools/materials-ledger.ts $t   # 期望：1 文件；不返回 ⇒ 守卫没了`,
    );
  }
};

/** 一行 `| <name> | … |`；取不到就失败（**不做「找不到就算了」** —— 那样门会假绿）。 */
const rowOf = (out: string, name: string): string => {
  const line = out.split("\n").find((l) => l.startsWith(`| \`${name}\` |`));
  assert.ok(line, `输出里找不到材料 \`${name}\` 的那一行：\n${out}`);
  return line as string;
};

/** 取该行的「含 .git」「不含 .git」两栏读数。 */
const numbersOf = (row: string): { withGit: number; files: number; kb: number } => {
  const m = /\| (\d+) 文件 \/ ([\d.]+) MB \| \*\*(\d+) 文件 \/ ([\d,]+) KB\*\* \|/.exec(row);
  assert.ok(m, `行格式不认识（生成器改了格式就得同步改本门）：${row}`);
  return {
    withGit: Number(m![1]),
    files: Number(m![3]),
    kb: Number(m![4].replace(/,/g, "")),
  };
};

const root = mkdtempSync(join(tmpdir(), "dsh-ledger-"));
const links: string[] = [];
try {
  // ── 夹具 A `plain`：**没有链接**的树 ⇒ 读数必须与修前一致（2 文件 / 2 KB） ──
  mkdirSync(join(root, "plain", "sub"), { recursive: true });
  writeFileSync(join(root, "plain", "a.txt"), Buffer.alloc(1024, 0x61));
  writeFileSync(join(root, "plain", "sub", "b.txt"), Buffer.alloc(1024, 0x62));

  // ── 夹具 B `loops`：**真环**（real/deep/loop → real）+ **菱形**（mirror → real） ──
  const real = join(root, "loops", "real");
  mkdirSync(join(real, "deep"), { recursive: true });
  writeFileSync(join(real, "deep", "leaf.txt"), Buffer.alloc(2048, 0x63));
  const loop = join(real, "deep", "loop");
  linkDir(real, loop);
  links.push(loop);
  const mirror = join(root, "loops", "mirror");
  linkDir(real, mirror);
  links.push(mirror);

  // **夹具自证**（防「vacuous pass」）：两个链接**真的是**会被 `statSync` 当目录的链接，
  // 且 realpath 真的指回目标 —— 否则这一门测的就不是它声称的东西。
  assert.ok(statSync(loop).isDirectory(), `夹具失效：${loop} 没被当成目录（旧 walk 也不会跟进去）`);
  assert.equal(realpathSync(loop), realpathSync(real), `夹具失效：${loop} 的 realpath 没指回 real`);
  assert.equal(realpathSync(mirror), realpathSync(real), `夹具失效：${mirror} 的 realpath 没指回 real`);

  // ── spawn 真 CLI（**带超时**：守卫若丢了，环会让它不返回 ⇒ 这一支就是「能红」的地方） ──
  const t0 = Date.now();
  let out = "";
  let code = 0;
  let timedOut = false;
  try {
    out = execFileSync(process.execPath, [CLI, root], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: 20000,
    });
  } catch (e: any) {
    timedOut = e.killed === true;
    code = e.status ?? -1;
    out = `${e.stdout || ""}${e.stderr || ""}`;
  }
  const ms = Date.now() - t0;

  assert.equal(timedOut, false, `walk 在有环的树上**不返回**（超时）⇒ 守卫失效：\n${out.slice(0, 400)}`);
  assert.equal(code, 0, `生成器应正常退出（0）；实际 ${code}：\n${out.slice(0, 400)}`);
  assert.match(out, /材料数：2/, `两根夹具都该被枚举到：\n${out.slice(0, 400)}`);
  assert.match(out, /按 realpath 去重/, "口径行必须**自己说明**去重（口径要打印出来）");

  // ① 无链接 ⇒ 2 文件 / 2 KB（**读数不变**：去重不该动没有链接的树）
  const plain = numbersOf(rowOf(out, "plain"));
  assert.deepEqual(plain, { withGit: 2, files: 2, kb: 2 }, `无链接树读数必须逐字不变：${JSON.stringify(plain)}`);
  console.log("✔ ① 无链接：`plain` = 2 文件 / 2 KB（去重不改无链接树的读数）");

  // ② 环 + 菱形 ⇒ **1 文件 / 2 KB**（每份真实目录只算一次；只切环会得 2）
  const loops = numbersOf(rowOf(out, "loops"));
  assert.deepEqual(loops, { withGit: 1, files: 1, kb: 2 }, `环/菱形必须只计一次：${JSON.stringify(loops)}（得 2 ⇒ 只切了环、没切菱形）`);
  console.log("✔ ② 环 + 菱形：`loops` = 1 文件 / 2 KB（同一真实目录只下降一次，且已终止）");

  console.log(`✔ ③ 终止性：本次 spawn 用时 ${ms}ms（上限 20000ms；守卫在时是亚秒级）`);
} finally {
  // **自清理**：先摘链接（`rmdirSync` 删的是链接本身，不动目标），再删夹具 —— 链接目标全在夹具内，安全。
  for (const l of links) {
    try {
      rmdirSync(l);
    } catch {
      try {
        unlinkSync(l);
      } catch {
        /* 已经不在 */
      }
    }
  }
  rmSync(root, { recursive: true, force: true });
}

console.log("ALL PASS ✅");
