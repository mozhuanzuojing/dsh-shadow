// dsh-shadow —— **省略的形态与恢复句柄**（v1.15.89 / ADR-0090）：rtk 「甲-1」「甲-2」落地后的回归。
//
// 甲-1：有损必须声明**损失形态** + 交出**恢复句柄**；拿不到句柄**不许**输出看起来可复取的有损结果。
// 甲-2：`never_worse` —— 有损输出比原文长就退回原文（相等保留）。
//
// 本仓的两处口径（**别照搬 rtk**，理由见 `retrieval/loss.ts` 文件头）：
//   ① 恢复句柄 = **源文件路径**（本仓权威源就是工作区文件）⇒ 零新增存储、不需要哈希主键/去重/老化；
//   ② 单位 = **字符**（与 `max_tokens × 4` 同单位）⇒ **中英混排下不会像「字节/4」那样把方向判反**（下面的 ② 有实测对照）。
import assert from "node:assert/strict";
import { lossLine, neverWorseChars, handleText, excerptWorthwhile, tierLossNote, NEVER_WORSE_UNIT, EXCERPT_WORTHWHILE_CHARS } from "../dist/retrieval/loss.js";
import { renderIndexBudgeted, INDEX_HANDLE } from "../dist/retrieval/render.js";

// ─────────────────────────────────────────────
// ① 损失形态与句柄：**可复取 / 不可复取，二者必居其一**
// ─────────────────────────────────────────────
assert.equal(lossLine({ loss: "none" }), null, "没有损失 ⇒ 不披露（零多余文字）");
const withHandle = lossLine({ loss: "tail", handle: { file: ".shadow/2026-09-15/a.md", locator: "src/a.ts" } })!;
assert.ok(withHandle.includes("可复取") && withHandle.includes("`.shadow/2026-09-15/a.md#src/a.ts`"), `有句柄 ⇒ 可复取 + 具体句柄：${withHandle}`);
assert.ok(!withHandle.includes("不可复取"), "有句柄时不得同时说不可复取（两种说法互斥）");
const noHandle = lossLine({ loss: "whole" })!;
assert.ok(noHandle.includes("不可复取"), `给不出句柄 ⇒ 必须**显式**写「不可复取」（不是静默省略）：${noHandle}`);
assert.ok(!noHandle.includes("可复取："), "不可复取时不得出现「可复取：」字样");
assert.equal(handleText({ file: "" }), null, "空路径不是句柄");
assert.equal(handleText({ file: ".shadow/_index.md" }), "`.shadow/_index.md`", "无定位时句柄就是路径本身");

// ─────────────────────────────────────────────
// ② never_worse（甲-2）：单位是**字符**，且方向判定在中英混排下不得被判反
// ─────────────────────────────────────────────
assert.equal(NEVER_WORSE_UNIT, "chars", "单位必须是字符（写死口径，免得后来者当成字节）");
assert.equal(neverWorseChars("abc", "abcdef"), "abc", "更短 ⇒ 保留有损结果");
assert.equal(neverWorseChars("abcdef", "abcdef"), "abcdef", "相等 ⇒ 保留（rtk guard.rs 的边界口径）");
assert.equal(neverWorseChars("abcdefg", "abcdef"), "abcdef", "比原文**长** ⇒ 退回原文（守卫的正面用例）");
assert.equal(neverWorseChars("", ""), "", "空输入边界：不得崩，也不得凭空造内容");
assert.equal(neverWorseChars("x", ""), "", "原文为空 ⇒ 只能退回原文（空）");

// **口径对照（实测，不是推断）**：同一条「变长了」的输出，按**字符**比能判出；
//   若照搬 rtk 的「字节 / 4」，会被判成「变短了」——因为 ASCII 1 字节/字、中文 3 字节/字。
{
  const raw = "中".repeat(60);     // 60 字符 / 180 字节
  const longer = "a".repeat(62);   // 62 字符 /  62 字节
  assert.ok(Buffer.byteLength(longer) < Buffer.byteLength(raw), "（对照事实）这条的**字节数**确实更小");
  assert.equal(neverWorseChars(longer, raw), raw, "字符口径必须判出「更长」⇒ 退回原文（字节口径会漏判）");
}

// ─────────────────────────────────────────────
// ③ 「本来就短」与「被省略」的区分判据
// ─────────────────────────────────────────────
assert.equal(excerptWorthwhile("短"), false, "短内容 ⇒ 不算省略");
assert.equal(excerptWorthwhile("字".repeat(EXCERPT_WORTHWHILE_CHARS)), false, "阈值是**严格大于**（边界不得算省略）");
assert.equal(excerptWorthwhile("字".repeat(EXCERPT_WORTHWHILE_CHARS + 1)), true, "够长 ⇒ 省略要披露");
assert.equal(excerptWorthwhile(undefined), false, "缺件 ⇒ 不算省略（不猜）");
assert.equal(tierLossNote({ withheld: [], returned: 3 }), "", "没有省略 ⇒ 零多余文字");
const tln = tierLossNote({ withheld: [{ rel: ".shadow/x/a.md", entry: "src/a.ts" }, { rel: ".shadow/x/b.md" }], returned: 5 });
assert.ok(tln.includes("本次返回 5 条里有 2 条") && tln.includes("`.shadow/x/a.md#src/a.ts`") && tln.includes("`.shadow/x/b.md`"),
  `披露要给条数 + 逐条句柄：${tln}`);

// ─────────────────────────────────────────────
// ④ 索引预算路径：形态 + 句柄，且 never_worse 是**唯一出口**
// ─────────────────────────────────────────────
const big = "## 甲\n" + "字".repeat(2000);
const budgeted = renderIndexBudgeted(big, 60);
assert.ok(budgeted.includes("> 省略 ·") && budgeted.includes("可复取"), `索引截断必须声明形态 + 句柄：\n${budgeted}`);
assert.ok(budgeted.includes(INDEX_HANDLE.file), `句柄必须指向源文件（默认 ${INDEX_HANDLE.file}）：\n${budgeted}`);
// 反向不变量：**没有源路径 ⇒ 必须写「不可复取」**，不许静默、也不许看起来像可复取
const noSrc = renderIndexBudgeted(big, 60, null);
assert.ok(noSrc.includes("不可复取"), `显式无源 ⇒ 必须写「不可复取」：\n${noSrc}`);
assert.ok(!noSrc.includes("可复取："), "不可复取时不得出现「可复取：」字样");
// never_worse 反向不变量：**有损输出不得比原文长** —— 当披露会把总长撑过原文时，逐字返回原文
const narrow = "## 甲\n" + "字".repeat(300);
const tight = renderIndexBudgeted(narrow, narrow.length - 10);
assert.equal(tight, narrow, "有损输出不比原文短时，必须逐字退回原文（没有损失 ⇒ 也没有披露）");
assert.ok(!tight.includes("> 省略 ·"), "退回原文时不得再带任何省略披露");
// 正控：预算内 ⇒ 逐字原样（与 v1.15.85 的口径一致）
assert.equal(renderIndexBudgeted("## 甲\n短", 4000), "## 甲\n短", "预算内必须逐字原样");

console.log("✔ 省略与句柄（ADR-0090）：形态×句柄互斥可判定 · never_worse 单位=字符（中英混排不判反）· 索引路径的披露/退原文");
console.log("ALL PASS ✅");
