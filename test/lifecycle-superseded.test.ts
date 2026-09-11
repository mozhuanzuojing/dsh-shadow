// dsh-shadow —— core/lifecycle.ts：生命周期与**读时取代裁决**的一致性 + 优先级（v1.15.18，ADR-0061）
//
// 背景（实测的真缺陷）：`lifecycleOf` 原本只认 `rec.status === "superseded"`（持久化的 `_meta.json`），
// 而**生产代码从不写这个值** —— 唯一写入者是测试夹具（`recall-attribution.test.ts` 手工塞入）。
// 与此同时 `query/query.ts` 的 `verdictOf` **确实**算出了 `superseded`（按同 `entry` 是否有更新记忆），
// 并已用于降权（×0.7）与报告。两条机制没接上，后果是**同一条记忆自相矛盾**：
//   修前实测：`生命周期 NEW · 状态 active · 裁决 superseded`
//
// 为什么不改成持久化：取代是「**相对当前可见记忆集**」的判断，写进派生文件会随可见集变化而失效。
// ⇒ 正确做法是让 `lifecycleOf` **接受读时裁决**（新增可选参数），由调用方回填。
import assert from "node:assert/strict";
import { lifecycleOf } from "../dist/core/lifecycle.js";

// ─────────────────────────────────────────────
// ① 读时裁决真的能产生 SUPERSEDED（修前此断言红：只有持久化那条路，且无写入者）
// ─────────────────────────────────────────────
assert.equal(lifecycleOf({}, 0, 0, false, true), "SUPERSEDED", "读时 superseded=true → SUPERSEDED");
assert.equal(lifecycleOf({}, 0, 0, false, false), "NEW", "未取代、无命中、无确认 → NEW");
assert.equal(lifecycleOf({}, 0, 0, false), "NEW", "不传该参数时行为不变（向后兼容）");
console.log("✔ ① 读时裁决可产生 SUPERSEDED；缺省参数不改变既有行为");

// ─────────────────────────────────────────────
// ② 优先级：外部权威状态（pinned / archived）**不被派生判断盖掉**
//    依据：pinned 是人工显式信任、archived 是人工归档，均属 External Authority；
//    取代是派生的读时判断，不该覆盖它们。
// ─────────────────────────────────────────────
assert.equal(lifecycleOf({ pinned: true }, 0, 0, false, true), "TRUSTED", "pinned 优先于读时取代");
assert.equal(lifecycleOf({ status: "archived" }, 0, 0, false, true), "ARCHIVED", "archived 优先于读时取代");
assert.equal(lifecycleOf({ status: "superseded" }, 0, 0, false, false), "SUPERSEDED", "持久化的 superseded 仍有效（外部显式标记）");
console.log("✔ ② 优先级正确：pinned > archived > superseded（外部权威不被派生判断覆盖）");

// ─────────────────────────────────────────────
// ③ 取代**优先于**冲突/衰减等派生态（它是最强的「已有更新版本」信号）
// ─────────────────────────────────────────────
assert.equal(lifecycleOf({}, 30, 3, true, true), "SUPERSEDED", "取代优先于 STALE/DECAYING");
assert.equal(lifecycleOf({}, 30, 3, true, false), "STALE", "无取代时冲突仍判 STALE");
assert.equal(lifecycleOf({}, 30, 0, true, false), "DECAYING", "无冲突但 stale → DECAYING");
console.log("✔ ③ 取代优先于 STALE/DECAYING；无取代时原有分支不变");

// ─────────────────────────────────────────────
// ④ 其余既有分支全部不变（回归）
// ─────────────────────────────────────────────
assert.equal(lifecycleOf({ confirmedBy: ["a", "b"] }, 0, 0, false), "TRUSTED", "确认 ≥2 → TRUSTED");
assert.equal(lifecycleOf({ confirmedBy: ["a"] }, 0, 0, false), "VERIFIED", "确认 1 → VERIFIED");
assert.equal(lifecycleOf({ hits: 2 }, 0, 0, false), "OBSERVED", "有命中 → OBSERVED");
assert.equal(lifecycleOf({ status: "archived" }, 0, 0, false), "ARCHIVED", "archived 不变");
assert.equal(lifecycleOf({ pinned: true }, 0, 0, false), "TRUSTED", "pinned 不变");
console.log("✔ ④ 既有分支全部不变（TRUSTED/VERIFIED/OBSERVED/ARCHIVED/NEW）");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `forget.ts` 的 superseded 遗忘臂与 `rank.ts` 的 `superseded` 权重仍**只认持久化 status**，" +
  "故在生产中不可达 —— 这是**有意保留**（外部显式标记可用），已在 ADR-0061 记录，不在本轮接线；");
console.log("  · 真机端到端需重启 DSH 才生效（本插件 `dist/` 改动不热加载，见 ADR-0057）。");
console.log("ALL PASS ✅");
