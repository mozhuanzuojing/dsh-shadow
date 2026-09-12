#!/usr/bin/env node
// dsh-shadow —— tools/cli-wiring.selftest.ts：**CLI 接线**的标定测试（v1.15.59 新增）。
//
// 为什么必须有（此前所有 selftest 的共同盲区）：6 个 `*.selftest.ts` **100% 只调纯函数**，
// 而本仓历史上真实踩过的两类缺陷都长在 **CLI 接线**上：
//   ① v1.15.45：`node tools/audit-wiring.ts --ratchet`（**漏了 root 参数**）⇒ ROOT 取到旗标
//      ⇒ 扫到 0 个文件 ⇒ **静默全绿**，差一点被当成「全仓零线索」写进基线；
//   ② 同轮：两个工具量的是**不同语料**却共用基线里的同一个 `corpus` 键 ⇒ 互相覆盖，
//      drift 录基线时被 wiring 的数字判成「骤降 76%」。
// 两处都在 footer 里被「诚实标注」为「未做成自动断言（要 spawn 子进程）」——
// 本文件就是把它做成断言：**spawn 真的 CLI，断言退出码与基线文件的实际变化**。
//
// 探针证明（v1.15.59 实测）：本环境下 `execFileSync` 管道捕获可用、非零退出码可读。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, "..");
const BASELINE = join(here, "audit-ratchet.baseline.json");

/** 跑一个 CLI 并**始终**返回退出码（不抛）。 */
const run = (args: string[]) => {
  try {
    const out = execFileSync(process.execPath, args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { code: 0, out: String(out) };
  } catch (e: any) {
    return { code: e?.status ?? -1, out: `${e?.stdout ?? ""}${e?.stderr ?? ""}` };
  }
};

const emptyRoot = mkdtempSync(join(tmpdir(), "dsh-empty-corpus-"));

// ── ① **漏 root 参数**不得静默全绿（v1.15.45 的真实缺陷） ──
{
  // 旗标写在 root 位置上 ⇒ 旧实现会把 "--ratchet" 当成仓库根、扫到 0 文件、**退出码 0**。
  const w = run(["tools/audit-wiring.ts", "--ratchet"]);
  assert.equal(w.code, 2, `★ audit-wiring 缺 root 参数必须 exit 2（否则 0 文件会静默全绿）；实际 ${w.code}：${w.out.slice(0, 200)}`);
  assert.ok(/拒|空|ROOT|退出/.test(w.out), "拒绝理由必须打印出来（不得只改退出码不解释）");

  const d = run(["tools/audit-drift.ts", "--ratchet"]);
  assert.equal(d.code, 2, `★ audit-drift 缺 root 参数必须 exit 2；实际 ${d.code}：${d.out.slice(0, 200)}`);
  console.log("✔ ① 两个 CLI 漏 root 参数 ⇒ exit 2（不再「0 文件 ⇒ 0 线索 ⇒ 全绿」）");
}

// ── ② 显式给一个**空语料根**也必须 exit 2（同一条闸的另一面） ──
{
  const w = run(["tools/audit-wiring.ts", emptyRoot]);
  assert.equal(w.code, 2, `空语料根必须 exit 2；实际 ${w.code}`);
  const d = run(["tools/audit-drift.ts", emptyRoot]);
  assert.equal(d.code, 2, `空语料根必须 exit 2；实际 ${d.code}`);
  console.log("✔ ② 空语料根 ⇒ 两个 CLI 都 exit 2（0 文件不是「没问题」）");
}

// ── ③ `--update-ratchet` 在坏语料上**拒绝写入**，且**真的没写** ──
//    这是「闸不许把坏读数写进基线」那条判据的接线面：拒绝必须在 `writeFileSync` **之前**。
//    安全性：跑之前先把真实基线备份到内存，`finally` 里按字节还原（即使断言失败也不留下损坏的基线）。
{
  const before = readFileSync(BASELINE);
  let after = before;
  try {
    const r = run(["tools/audit-wiring.ts", emptyRoot, "--update-ratchet"]);
    assert.equal(r.code, 2, `★ 坏语料上 --update-ratchet 必须 exit 2；实际 ${r.code}：${r.out.slice(0, 200)}`);
    after = readFileSync(BASELINE);
    assert.ok(before.equals(after), "★ 拒绝录制时**不得**改动基线文件（若这里红：拒绝逻辑被写在写盘之后）");
  } finally {
    if (!before.equals(readFileSync(BASELINE))) writeFileSync(BASELINE, before);
  }
  console.log("✔ ③ `--update-ratchet` 在坏语料上 exit 2 且**未写盘**（拒绝先于 writeFileSync）");
}

// ── ④ 两个工具**共用同一个基线文件**，但段必须**分开**（v1.15.45 的第二处缺陷） ──
{
  const b = JSON.parse(readFileSync(BASELINE, "utf8"));
  assert.ok(b.wiring && typeof b.wiring === "object", "基线必须有 `wiring` 段");
  assert.ok(b.drift && typeof b.drift === "object", "基线必须有 `drift` 段");
  // 语料段**按消费者分键**：共用 `corpus` 键会让两个不同口径的语料互相覆盖。
  assert.ok(b.corpus && b.corpus.wiring && b.corpus.drift, "★ 语料必须按消费者分键（`corpus.wiring` / `corpus.drift`）—— 共用会被判成「骤降」");
  assert.notEqual(JSON.stringify(b.corpus.wiring), JSON.stringify(b.corpus.drift),
    "两个工具量的是不同语料（wiring 含 dist/，drift 只扫生产面）⇒ 两段不应完全相同（相同说明又合并成一个口径了）");
  console.log(`✔ ④ 基线分段：wiring(${b.wiring.b_keys ?? "?"} 键) / drift(${b.drift.drift_keys ?? "?"} 键) 各自独立，corpus 按消费者分键`);
}

// ── ⑤ 运行器必须**真的收**这些 selftest（否则本文件等于没接进 verify） ──
{
  const rt = readFileSync(join(here, "run-tests.ts"), "utf8");
  assert.ok(/tools/.test(rt) && /\.selftest\.ts/.test(rt), "★ run-tests 必须扫描 tools/*.selftest.ts，否则标定测试不在门禁里");
  console.log("✔ ⑤ run-tests 确实扫描 tools/*.selftest.ts（标定测试在门禁里，不是死文件）");
}

try { rmSync(emptyRoot, { recursive: true, force: true }); } catch { /* best-effort */ }

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 只断言了**退出码与基线文件**，没有逐字比对 CLI 的**报告文本**（格式会动，锁死它会制造假红）；");
console.log("  · `--update-ratchet` 的**成功**路径（NORMAL 时真写入）未自动化 —— 那会改真实基线；");
console.log("  · `toolset-authority.ts --check` **未接进 verify**：实测本机 >120s（winget 探测），原因是**耗时**；");
console.log("  · 本文件依赖 spawn 子进程（本环境实测可用）；若某环境禁止 spawn，它会**红**而不是静默跳过 —— 那是刻意的。");
console.log("ALL PASS ✅");
