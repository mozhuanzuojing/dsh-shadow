// dsh-shadow —— 台账「版本号出处」棘轮（ADR-0072）。
//
// 背景（实测，不是推断）：台账每条的 `note` 形如 `winget <pkg> · <verSrc> <ver>`，
// 其中 `verSrc` 是**版本号出处**。`core/toolset.ts` 的定义是：
//   · `"实测"` = 在**本机**跑该条目的 probe（`--version`）拿到的；
//   · `"权威核验"` = 取自 `winget show` 权威目录（**最新发布版**，不代表本机已装）。
//
// 实测发现 v1.15.10 加入的 44 条**全部**被标成 `"实测"`，但数字其实来自 winget 目录：
//   · 44 条里 **35 条与 winget 权威版本逐字一致**（手工取本机版本不可能如此吻合）；
//   · 标「实测 0.74.3」的 `fzf` 本机实为 **0.73.1**（且来自 scoop，非 winget）；
//   · 标「实测 0.10.0」的 `zoxide`，`winget list` 显示**已装 0.9.9 / 可用 0.10.0**
//     —— 台账抄的是**「可用」列**；
//   · 本机可检出的 8 条里 **7 条台账版本比本机新**，方向一致。
// ⇒ **标签比事实强**。默认值已改为 `"权威核验"`。
//
// 本测试用**离线**方式守住两件事（不联网、不重探测，以免把机器状态写进断言）：
//   ① 台账的（出处 + 版本）与 `tools/toolset-authority.json` 记录的一致 —— 改了台账必须重跑生成器；
//   ② **没有任何一条标「实测」而其本机读数不能佐证** —— 这是本 ADR 的核心不变量。
// 并含一组**正对照**：构造一条假「实测」记录，证明②的检测器**真的会报警**（先证工具，再用工具）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { claimOf, ledgerMismatch, unsubstantiatedMeasured, countInconsistency, type AuthorityRow } from "../tools/toolset-authority.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, "..");
const manifest = JSON.parse(readFileSync(join(repoRoot, "tools", "toolset-authority.json"), "utf8"));
const { CAPABILITIES } = await import("../dist/core/toolset.js");

// ─────────────────────────────────────────────
// ① 清单自洽：counts 与 rows 实际相符
// ─────────────────────────────────────────────
{
  const errs = countInconsistency(manifest);
  assert.equal(errs.length, 0, `清单 counts 与实际不符：\n  ${errs.join("\n  ")}`);
  assert.ok(manifest.verifiedAt && /^\d{4}-\d{2}-\d{2}$/.test(manifest.verifiedAt), "应记录核验日期");
  assert.ok(manifest.rows.length >= 90, `清单应覆盖台账里有 winget 包的条目（实际 ${manifest.rows.length}）`);
  console.log(`✔ ① 清单自洽：${manifest.rows.length} 条 · 核验于 ${manifest.verifiedAt} · counts 与实际相符`);
}

// ─────────────────────────────────────────────
// ② 台账侧棘轮：台账的（出处 + 版本）必须与清单一致
//    改了台账版本或出处而没重跑 `node tools/toolset-authority.ts` ⇒ 变红
// ─────────────────────────────────────────────
{
  const mism = ledgerMismatch(CAPABILITIES as any[], manifest.rows);
  assert.equal(mism.length, 0,
    `台账与清单不一致 ${mism.length} 条（改过台账就必须重跑 tools/toolset-authority.ts）：\n  ` +
    mism.slice(0, 12).map((m) => `${m.id}: 清单[${m.was}] → 台账[${m.now}]`).join("\n  "));
  console.log(`✔ ② 台账侧棘轮：${(CAPABILITIES as any[]).filter((c: any) => c.winget).length} 条的（出处+版本）与清单一致`);
}

// ─────────────────────────────────────────────
// ③ **核心不变量**：不得有「标了实测、却无本机读数佐证」的条目
// ─────────────────────────────────────────────
{
  const bad = unsubstantiatedMeasured(manifest.rows);
  assert.equal(bad.length, 0,
    `有 ${bad.length} 条标「实测」但本机读数不能佐证（标签比事实强）：\n  ` +
    bad.map((r) => `${r.id}: 台账 实测 ${r.ledgerVersion} · 本机 ${r.machineVersion ?? "(未检出)"}`).join("\n  "));
  const measured = manifest.rows.filter((r) => r.ledgerVerSrc === "实测");
  console.log(`✔ ③ 标签诚实：标「实测」的 ${measured.length} 条**全部**有本机读数佐证（当前台账 0 条标实测 ⇒ 由默认值改正而来）`);
}

// ─────────────────────────────────────────────
// ④ **正对照**：构造假记录，证明 ③ 的检测器**真会报警**（先证工具，再用工具）
//    —— 否则 ③ 的「0 条」可能只是检测器不工作（本仓 ADR-0062 §2 的纪律）
// ─────────────────────────────────────────────
{
  const fake: AuthorityRow[] = [
    { id: "fake-ok", pkg: "x", ledgerVerSrc: "实测", ledgerVersion: "1.0.0", authorityVersion: "1.0.0", machineVersion: "1.0.0", status: "ok" },
    { id: "fake-lie", pkg: "y", ledgerVerSrc: "实测", ledgerVersion: "9.9.9", authorityVersion: "9.9.9", machineVersion: "1.0.0", status: "ok" },
    { id: "fake-absent", pkg: "z", ledgerVerSrc: "实测", ledgerVersion: "2.0.0", authorityVersion: "2.0.0", machineVersion: null, status: "ok" },
    { id: "fake-authority-ok", pkg: "w", ledgerVerSrc: "权威核验", ledgerVersion: "3.0.0", authorityVersion: "3.0.0", machineVersion: "0.1.0", status: "ok" },
  ];
  const flagged = unsubstantiatedMeasured(fake).map((r) => r.id);
  assert.deepEqual(flagged, ["fake-lie", "fake-absent"],
    `检测器应恰好报出「实测但本机不符」与「实测但无本机读数」两条；实际 ${JSON.stringify(flagged)}`);
  assert.ok(!flagged.includes("fake-ok"), "本机相符的「实测」不得被报（假阳）");
  assert.ok(!flagged.includes("fake-authority-ok"),
    "标「权威核验」的条目**本机版本不同是正常的**（权威核验=目录最新版）⇒ 不得被报（假阳）");
  console.log("✔ ④ 正对照：检测器对 4 条合成记录恰好报 2 条（实测不符 / 实测无读数），2 条不报（含「权威核验本机不同」不误报）");
}

// ─────────────────────────────────────────────
// ⑤ 台账口令的可解析性：每条有 winget 包的条目都应能解析出出处（否则棘轮形同虚设）
// ─────────────────────────────────────────────
{
  const withPkg = (CAPABILITIES as any[]).filter((c) => c.winget);
  const unparsable = withPkg.filter((c) => !claimOf(c.note));
  assert.equal(unparsable.length, 0,
    `这些条目有 winget 包但 note 里解析不出（出处 + 版本）：${unparsable.map((c: any) => c.id).join(", ")}`);
  const dist = new Map<string, number>();
  for (const c of withPkg) { const cl = claimOf(c.note)!; dist.set(cl.verSrc, (dist.get(cl.verSrc) || 0) + 1); }
  console.log(`✔ ⑤ 口令可解析：${withPkg.length} 条全部可解析；出处分布 ${JSON.stringify(Object.fromEntries(dist))}`);
  assert.ok(!dist.has("实测") || manifest.counts.falseMeasured === 0, "若有「实测」条目，清单必须记 falseMeasured=0");
}

// ─────────────────────────────────────────────
// ⑥ **接线棘轮**（v1.15.33）：`countInconsistency` 必须真的**被 CLI 调用**
//    ① 只证明「这个函数是对的」；但一个**从不执行的检查**与没有检查等价 ——
//    这正是 ADR-0062 那一族（「机制对了，断的是谁调用它」）。
//    实测（v1.15.33 接线前）：`tools/toolset-authority.ts:24` 的 import **不含**它，
//    CLI 只调 `unsubstantiatedMeasured` ⇒ `counts` 与 `rows` 的自洽性**生产从未校验过**。
//    本段用**源码级棘轮**锁住接线（不是断言「函数存在」，而是断言「CLI 调了它」）。
// ─────────────────────────────────────────────
{
  const src = readFileSync(join(repoRoot, "tools", "toolset-authority.ts"), "utf8");
  assert.ok(/import\s*\{[^}]*\bcountInconsistency\b[^}]*\}\s*from/.test(src),
    "tools/toolset-authority.ts 必须 import countInconsistency（否则清单自洽检查不会执行）");
  assert.ok(/\bcountInconsistency\s*\(/.test(src),
    "tools/toolset-authority.ts 必须**调用** countInconsistency，不能只 import");
  // 反向不变量：校验必须在**写盘之前** —— 否则会先产出坏清单再报错。
  const callAt = src.indexOf("countInconsistency(");
  const writeAt = src.indexOf("writeFileSync(MANIFEST");
  assert.ok(callAt >= 0 && writeAt >= 0 && callAt < writeAt,
    `自洽校验必须发生在 writeFileSync 之前（否则会先写出坏清单）；call=${callAt} write=${writeAt}`);
  // 且不一致时要**拒绝写入**（exit 1），不是只打印一行。
  const guard = src.slice(callAt, writeAt);
  assert.ok(/process\.exit\(1\)/.test(guard), "自洽校验失败必须拒绝写入（process.exit(1)），不能只打日志");
  console.log("✔ ⑥ 接线棘轮：CLI 真的调用 countInconsistency，且**在写盘前**用 process.exit(1) 拒绝坏清单");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · **本机读数不重新探测** —— `machineVersion` 是生成时那台机器的留档；");
console.log("    重探测会把机器状态写进断言（本仓 `toolset-catalog` ④ 曾因机器相关断言恒红），故不这么做；");
console.log("  · 「老化」（台账版本 < winget 现值，当前 13 条）**不是错误**、不在此测试断言 —— 目录在推进是正常的，");
console.log("    它记录在清单的 `status`/`authorityVersion` 里供人看；");
console.log("  · 「未检出 ≠ 未安装」（探测旗标可能不对，见 BACKLOG V2）：故 machineVersion=null **不**单独构成违规，");
console.log("    但若一条同时标了「实测」，那就是标签无据 ⇒ ③ 会报。");
console.log("ALL PASS ✅");
