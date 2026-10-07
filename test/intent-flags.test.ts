// dsh-shadow —— A10/A28 的门：工具 schema 的 boolean 旗标必须都有 goal 映射。
//
// 为什么需要这个文件（报告的 A10/A28 两条是同一个根因）：
//   · `core/admission/intent.ts` 的 `FLAG_GOAL` 原先只有 **7** 个键，而 `index.ts` 的
//     `read_shadow` schema 有 **19** 个 boolean 参数 ⇒ `{soul:true}` / `{taste:true}` / `{claim:true}` /
//     `{kg:true}` 等 12 个旗标**不在表里**，`intentOf` 于是静默回落 `DEFAULT_GOAL`「召回相关记忆」。
//     而 Intent 有落盘副作用（写进 `ObserverContext`）⇒ 一次灵魂投影会被记成「召回相关记忆」。
//   · `FLAG_ORDER` 原先是**手写的第二份 7 键清单**：往 `FLAG_GOAL` 加第 8 个旗标而忘改顺序表，
//     该旗标就永远取不到 goal（`activeFlag` 恒 `undefined`）—— 静默，且原先无任何测试覆盖该交叉约束。
//
// 本文件用**真实插件注册面**（mock host 驱动 `apply`）取 schema，而不是正则扫源码：
// 判据是「宿主真正看到的参数面」，不是「源码里有几处 `type: "boolean"`」。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { FLAG_GOAL, FLAG_ORDER, intentOf } from "../dist/core/admission/intent.js";

const WS = "D:/ws";
const registry = new Map<string, any>();
const services: any = {
  fs: {
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText() { return ""; },
    async writeText() { return { version: "v1" }; },
    async listDir() { return []; },
  },
  agents: { currentInitiator: () => null, get: () => undefined },
  systemPrompt: { context: () => {} },
  tools: { register: (def: any) => registry.set(def.name, def) },
  llm: undefined,
  agentDefaultModel: undefined,
};
const ctx: any = {
  get: (k: string) => services[k],
  on: () => () => {},
  inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
};
mod.apply(ctx, { summary: { enabled: false }, recall: {}, forget: { enabled: false }, compact: { enabled: false } });

// ── ① 取注册面里**全部** boolean 参数（三个工具都要扫，不只是 read_shadow） ──
const boolFlags = new Set<string>();
for (const def of registry.values()) {
  const props = def?.parameters?.properties || {};
  for (const [name, spec] of Object.entries(props)) {
    if ((spec as any)?.type === "boolean") boolFlags.add(name);
  }
}
assert.ok(registry.size >= 3, `插件必须注册三个工具；实测 ${registry.size}：${[...registry.keys()].join(", ")}`);
assert.ok(boolFlags.size > 0, "注册面里一个 boolean 旗标都没有 ⇒ 本门失去判别对象（不是通过）");

// ② ⊆：schema 的每个 boolean 旗标都必须在 FLAG_GOAL 里有 goal（缺表项 = 静默回落默认 goal）
const missing = [...boolFlags].filter((n) => !(n in FLAG_GOAL)).sort();
assert.deepEqual(
  missing,
  [],
  `index.ts 的 boolean 参数缺 goal 映射（会在 intentOf 里静默回落「召回相关记忆」）：${missing.join(", ")}`,
);

// ③ A28：FLAG_ORDER 由 FLAG_GOAL 派生 ⇒ 两表键集必须相等（顺序表里有的、表里没有也算漂移）
assert.deepEqual(
  [...FLAG_ORDER].sort(),
  Object.keys(FLAG_GOAL).sort(),
  "FLAG_ORDER 必须与 FLAG_GOAL 的键集相等（否则某旗标永远取不到 goal：表里有、顺序表里没有 = 静默丢映射）",
);
assert.equal(new Set(FLAG_ORDER).size, FLAG_ORDER.length, "FLAG_ORDER 不得有重复键");

// ④ 原有 7 个键的**相对顺序**不得被改写（改顺序 = 改「混用多个旗标时谁定 goal」的既有语义）
assert.equal(intentOf({ identity: true }, "x").goal, "确认主体", "identity 保留原有映射");
assert.equal(intentOf({ context: true, identity: true }, "x").goal, "确认主体", "identity 仍优先于 context");
assert.equal(intentOf({ project: true, observer: true }, "x").goal, "观测窗口", "observer 仍优先于 project");
assert.equal(intentOf({}, "topic").goal, "召回相关记忆", "无旗标/无 mode ⇒ 默认 goal 不变");

// ⑤ 补上的 12 个旗标：逐个断言真的有自己的 goal（不再落回默认）
const NEW_FLAGS = [
  "soul", "taste", "kg", "claim", "debug", "raw",
  "perceptionOnly", "identityContext", "hasValidation",
  "changeObserved", "revocation", "planningCannotCreateObjective",
];
for (const f of NEW_FLAGS) {
  const want = FLAG_GOAL[f];
  assert.ok(want, `FLAG_GOAL 必须覆盖旗标 ${f}`);
  assert.equal(intentOf({ [f]: true }, "x").goal, want, `旗标 ${f} 必须映射到自己的 goal`);
  assert.notEqual(intentOf({ [f]: true }, "x").goal, "召回相关记忆", `旗标 ${f} 不得落回默认 goal`);
}

console.log(`✔ A10/A28 旗标门：schema boolean 旗标 ${boolFlags.size} 个 ⊆ FLAG_GOAL ${Object.keys(FLAG_GOAL).length} 键；`
  + `FLAG_ORDER ${FLAG_ORDER.length} 项与表键集相等；12 个补入旗标各有自己的 goal`);
console.log("ALL PASS ✅");
