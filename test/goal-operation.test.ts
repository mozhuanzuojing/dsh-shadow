// dsh-shadow —— goal/changed 载荷字段回归锁（v1.15.1）。
//
// 背景：宿主 `GoalChanged` 的字段是 `{ operation, ref, goal? }` —— 跨 `0.1.0-rc.7` → `0.1.5-rc.1` 逐版核对
// Inspect 目录，四个版本的 declaration **逐字相同**，且与运行时 `cordis_inspect_query` 一致；
// 它**从来没有** `action` / `phase` / `kind`（`phase` 只存在于 `change.goal.phase`）。
// 插件旧写法 `change.action || change.phase || change.kind || "decision"` 三者全不存在 →
// act 恒回退 `"decision"`，goal 的操作语义（create/edit/pause/resume/complete/block/clear）永久丢失且不报错。
//
// 本测试用**宿主真实载荷形状**驱动插件，锁住「operation 被正确读成标签」。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
const { apply } = mod;

const mkFs = (store = new Map<string, string>()) => ({
  async resolve(p: string) { return { targetKey: p, displayPath: p }; },
  async readText(t: any) { return store.get(t.displayPath) ?? ""; },
  async writeText(t: any, c: string) { store.set(t.displayPath, c); return { version: "v1" }; },
  async listDir(t: any) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/"; const names = new Set<string>();
    for (const k of store.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      names.add(nk.slice(prefix.length).split("/")[0]);
    }
    return [...names].map((n) => ({ name: n }));
  },
});

const mkHost = (services: Record<string, any>) => {
  const listeners = new Map<string, Function>();
  const ctx: any = {
    get: (k: string) => services[k],
    on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); },
    inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
  };
  return { ctx, listeners };
};

const mkTools = () => {
  const reg = new Map<string, any>();
  return { register: (t: any) => reg.set(t.name, t), reg };
};

const AG = { id: "S1", session: { header: { cwd: "C:/w" } } };

/** 用宿主真实形状的 payload 驱动一次 goal 事件，落盘后返回全部记忆文本。 */
const run = async (change: any) => {
  const store = new Map<string, string>();
  const services: Record<string, any> = {
    fs: mkFs(store),
    tools: mkTools(),
    systemPrompt: { context: () => {} },
    agents: { get: (id: string) => (id === "S1" ? AG : undefined), currentInitiator: () => AG },
    llm: undefined,
    agentDefaultModel: undefined,
  };
  const { ctx, listeners } = mkHost(services);
  apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
  const onGoal: any = listeners.get("goal/changed");
  assert.ok(onGoal, "必须注册 goal/changed");
  onGoal({ agent: AG, change });
  await (listeners.get("agent/turn-stopping") as any)({ agent: AG, turn: 1, signal: undefined });
  return [...store.values()].join("\n");
};

// ── ① create：operation 必须被读成标签（旧实现恒为 decision）──
{
  const text = await run({ operation: "create", ref: { id: "g1", revision: 1 }, goal: { objective: "把 P99 降下来" } });
  assert.ok(text.includes("〔create〕"), `应带 〔create〕 标签，实际：\n${text.slice(0, 400)}`);
  assert.ok(text.includes("把 P99 降下来"), `应带上 goal objective，实际：\n${text.slice(0, 400)}`);
  assert.ok(!text.includes("〔decision〕") && text.includes("〔create〕"), "goal 事件不应退化成旧 〔decision〕 标记（应带 〔create〕）");
  console.log("✔ ① goal/changed(create) → 落盘记忆带 〔create〕 + objective（不再是 〔decision〕）");
}

// ── ② clear：带 〔clear〕 标签，且必须清掉上一回合的旧目标 ──
{
  const store = new Map<string, string>();
  const services: Record<string, any> = {
    fs: mkFs(store),
    tools: mkTools(),
    systemPrompt: { context: () => {} },
    agents: { get: (id: string) => (id === "S1" ? AG : undefined), currentInitiator: () => AG },
    llm: undefined,
    agentDefaultModel: undefined,
  };
  const { ctx, listeners } = mkHost(services);
  apply(ctx, { shadowRoot: "C:/p", summary: { enabled: false } });
  const onGoal: any = listeners.get("goal/changed");
  const turn = async (n: number) => (listeners.get("agent/turn-stopping") as any)({ agent: AG, turn: n, signal: undefined });

  onGoal({ agent: AG, change: { operation: "create", ref: { id: "g1", revision: 1 }, goal: { objective: "把 P99 降下来" } } });
  await turn(1);
  const first = [...store.values()].join("\n");
  assert.ok(first.includes("把 P99 降下来"), `第一回合应带目标：\n${first.slice(0, 300)}`);

  store.clear();
  onGoal({ agent: AG, change: { operation: "clear", ref: { id: "g1", revision: 5 } } });
  await turn(2);
  const second = [...store.values()].join("\n");
  assert.ok(second.includes("〔clear〕"), `clear 应带 〔clear〕 标签：\n${second.slice(0, 300)}`);
  assert.ok(
    !second.includes("把 P99 降下来"),
    `clear 后不应再带上一回合的旧目标（说明 goalByAgent 没清）：\n${second.slice(0, 300)}`,
  );
  console.log("✔ ② goal/changed(clear) → 带 〔clear〕 且清掉旧目标（不再复用上一回合的 > 目标：）");
}

// ── ③ 七种 operation 全覆盖 ──
for (const op of ["create", "edit", "pause", "resume", "complete", "block", "clear"]) {
  const text = await run({ operation: op, ref: { id: "g1", revision: 1 }, goal: { objective: "目标" } });
  assert.ok(text.includes(`〔${op}〕`), `operation=${op} 应带对应标签，实际：\n${text.slice(0, 300)}`);
}
console.log("✔ ③ create/edit/pause/resume/complete/block/clear 七种 operation 全部正确映射");

console.log("ALL PASS ✅");
