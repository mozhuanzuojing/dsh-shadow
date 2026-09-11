// dsh-shadow —— toolset 可达性棘轮（v1.15.13）
//
// 根因（v1.15.9 → v1.15.12 潜伏三个版本）：`query/reads.ts` 定义了 `toolset` ReadQuery，
// 但**没有把它放进 `readQueries` 数组**。于是 `dispatchReadQuery` 找不到它、返回 undefined，
// `{mode:"toolset"}` 落到 `query.ts` 的「无 topic」分支，**静默返回 `_index.md`**——
// 整块工具集台账没有任何可达入口，但对外文档（README / CONTEXT / ADR-0055）都把它写成现行入口。
//
// 为什么既有测试全绿也发现不了：三个 toolset 测试（toolset / toolset-exec / toolset-catalog）
// **全部直接 import 执行函数**（`surveyCapabilities` / `installCapability` / `resolveInstall` …），
// **从不走 `dispatchReadQuery`**。执行函数是对的，断的是「接线」。
//
// 故本测试的纪律：**只走真实入口** `dispatchReadQuery`，并加一条「可 dispatch 的 mode 必须被文档登记」的棘轮。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { dispatchReadQuery, findReadQuery, readQueries } from "../dist/query/reads.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

// ─────────────────────────────────────────────
// ① 真实入口可达：dispatchReadQuery 必须接住 {mode:"toolset"}
//     （修复前：findReadQuery 返回 undefined → 这里会红）
// ─────────────────────────────────────────────
assert.ok(findReadQuery({ mode: "toolset" }), `{mode:"toolset"} 必须能解析到 ReadQuery（现状：不可达）`);
const deps = { getFlushWarn: () => "", approval: undefined };
const out = await dispatchReadQuery(deps, { mode: "toolset" }, {}, {});
assert.ok(out !== undefined, `{mode:"toolset"} 必须被 dispatchReadQuery 接住（返回 undefined 即静默回落到 _index.md）`);
assert.ok(out.includes("工具集台账"), `应渲染工具集台账；实际开头：${String(out).slice(0, 120)}`);
console.log("✔ ① dispatch 可达：{mode:'toolset'} 被接住并渲染台账（不再静默回落到 _index.md）");

// ─────────────────────────────────────────────
// ② mode 不得重复占用（一个 mode 只归一个 ReadQuery）
// ─────────────────────────────────────────────
const owner = new Map<string, string>();
for (const q of readQueries) {
  for (const m of q.modes) {
    assert.ok(!owner.has(m), `mode "${m}" 被重复占用（${owner.get(m)} 与 ${q.modes.join("/")}）`);
    owner.set(m, q.modes.join("/"));
  }
}
console.log(`✔ ② mode 无重复：${readQueries.length} 个 ReadQuery · ${owner.size} 个 mode`);

// ─────────────────────────────────────────────
// ③ 棘轮：可被 dispatch 接住的 mode，必须在 index.ts 的 mode 描述里登记
//     否则模型只读 mode 字段，发现不了这个 mode（与 ① 一起构成「接得上 + 说得出」双向约束）
// ─────────────────────────────────────────────
const idxSrc = readFileSync(join(repoRoot, "index.ts"), "utf8");
const undocumented = [...owner.keys()].filter((m) => !idxSrc.includes(m));
assert.equal(
  undocumented.length,
  0,
  `这些 mode 可被 dispatch 接住，但 index.ts 的 mode 描述未登记（模型发现不了）：${undocumented.join(", ")}`,
);
console.log(`✔ ③ 文档棘轮：${owner.size} 个可达 mode 全部已在 index.ts mode 描述中登记`);

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 真机 `read_shadow({mode:'toolset'})` 的端到端返回——本测试走的是 dispatch 层，");
console.log("    未经过 index.ts 的工具注册与 DSH 工具调用栈。");
console.log("ALL PASS ✅");
