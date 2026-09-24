// dsh-shadow —— 「默认全开」（v1.15.85）的**正面覆盖**与它的**边界**。
//
// 为什么单独一份：`retention` / `forget` / `compact` 三个量控开关改成默认开后，
//   · 既有测试各自「钉住它声称测的东西」（见 `test/recall-attribution.test.ts` 与 `test/episode-lineage.test.ts`
//     的包装器与就地注释）—— 它们不该顺带测默认值；
//   · 而**默认值本身**必须有门守 ⇒ 就是本文件。
//
// 本文件同时把一条**边界**钉住（这是被反复问到的「文件太多」的正解）：
//   **Forget ≠ Delete、收口不删原子** ⇒ 这三个开关缩的是**活跃集 / 索引**，**不是磁盘占用**。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { onByDefault, today } from "../dist/core/util.js";

const WS = "D:/ws";
const D0 = today();
const DOLD = today(30);   // 30 天前 ⇒ 越过 forget 默认 staleDays = 14

const makeHost = (config: any) => {
  const files = new Map<string, string>();
  const registry = new Map<string, any>();
  const listeners = new Map<string, Function>();
  const fs = {
    async resolve(p: string) { return { targetKey: p, displayPath: p }; },
    async readText(t: any) { const v = files.get(t.displayPath); return v === undefined ? "" : v; },
    async writeText(t: any, c: string) { files.set(t.displayPath, c); return { version: "v1" }; },
    async listDir(t: any) {
      const base = String(t.displayPath).replace(/\\/g, "/").replace(/\/+$/, "") + "/";
      const names = new Set<string>();
      for (const k of files.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(base)) continue;
        const first = nk.slice(base.length).split("/")[0];
        if (first !== "_index.md" && first !== "_meta.json") names.add(first);
      }
      return [...names].map((n) => ({ name: n }));
    },
  };
  const A = { id: "T", session: { header: { cwd: WS } } };
  // llm / agentDefaultModel 给**占位服务**：本文件会真的跑一个回合（`turn-stopping`）⇒ 首次探测会打印降级告警，
  //   而这里要测的不是宿主缺件（那条有 `test/host-probe.test.ts` 专测）。
  const services: any = { fs, agents: { currentInitiator: () => null, get: () => A }, systemPrompt: { context: () => {} }, tools: { register: (d: any) => registry.set(d.name, d) }, llm: {}, agentDefaultModel: { currentSelection: () => undefined } };
  const ctx: any = {
    get: (k: string) => services[k],
    on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); },
    inject: (_d: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
  };
  mod.apply(ctx, config);
  return {
    files,
    fire: (ev: string, ...a: any[]) => { const fn = listeners.get(ev); assert.ok(fn, `missing ${ev}`); return fn(...a); },
    read: (args: any) => registry.get("read_shadow").execute(args, { agent: A }),
  };
};

const seed = (h: any, rel: string, entry: string, text: string) =>
  h.files.set(`${WS}/.shadow/atoms/${String(rel).split('/').pop()}`, `# ${entry}\\n\\n> 完整线索\\n> 概况：0 动作 · 1 用户消息 · 0 决策\\n\\n- [10:00:00] [${entry}] ${text}\\n`);

const writeTurn = async (h: any) => {
  h.fire("session/event", { id: "T", header: { cwd: WS } }, { type: "user/message", seq: 1, time: Date.now(), data: { id: "m1", role: "user", content: [{ type: "text", text: "记住：默认全开" }], source: { kind: "user" } } });
  await h.fire("agent/turn-stopping", { agent: { id: "T", session: { header: { cwd: WS } } }, turn: 1, signal: undefined });
};

// ① 判据（收一处）：`undefined` = 开，只有显式 `false` 才关
assert.equal(onByDefault(undefined), true, "未传 ⇒ 开");
assert.equal(onByDefault(false), false, "显式 false ⇒ 关");
assert.equal(onByDefault(true), true, "显式 true ⇒ 开");
console.log("✔ ① 判据 onByDefault：undefined ⇒ 开 · 只有显式 false 才关（`core/util.ts`，三个开关共用）");

// ② retention 默认开 ⇒ 落盘时给记忆建档 `_meta.json`（显式关 ⇒ 不建 = 正控）
const hOn = makeHost({ summary: { enabled: false } });
await writeTurn(hOn);
assert.ok(hOn.files.has(`${WS}/.shadow/_meta.json`), `retention 默认开 ⇒ 应建 _meta.json（现有：${[...hOn.files.keys()].join(",")}）`);
const hOffR = makeHost({ summary: { enabled: false }, retention: { enabled: false }, compact: { enabled: false } });
await writeTurn(hOffR);
assert.ok(!hOffR.files.has(`${WS}/.shadow/_meta.json`), "显式 retention:{enabled:false} ⇒ 不建 _meta.json（正控）");
console.log("✔ ② retention 默认开：落盘即建档（关回去则不建）");

// ③ forget 默认开 ⇒ 「≥14 天 + 零命中」移出**活跃集**（索引与召回都看不到），但**文件仍在**
const hF = makeHost({ summary: { enabled: false }, compact: { enabled: false } });
seed(hF, `${DOLD}/${DOLD}--100000-old-entry.md`, "old-entry", "三十天前、零命中的旧记忆");
seed(hF, `${D0}/${D0}--100000-new-entry.md`, "new-entry", "今天的新记忆");
const rDefault = String(await hF.read({ topic: "记忆", max_tokens: 8000 }));
assert.ok(!rDefault.includes("old-entry"), `forget 默认开 ⇒ 旧记忆不应进召回：\\n${rDefault.slice(0, 300)}`);
assert.ok(rDefault.includes("new-entry"), "今天的记忆仍应召回");
assert.ok(hF.files.has(`${WS}/.shadow/atoms/${DOLD}--100000-old-entry.md`), "**Forget ≠ Delete**：被遗忘的记忆**文件仍在**（这正是「默认全开」不减磁盘占用的边界）");
const rIdxF = String(await hF.read({ max_tokens: 8000 }));
assert.ok(!rIdxF.includes("old-entry"), "索引也只剩活跃集（`_index.md` 会随遗忘变瘦）");
const hKeep = makeHost({ summary: { enabled: false }, compact: { enabled: false }, forget: { enabled: false } });
seed(hKeep, `${DOLD}/${DOLD}--100000-old-entry.md`, "old-entry", "三十天前、零命中的旧记忆");
const rKeep = String(await hKeep.read({ topic: "记忆", max_tokens: 8000 }));
assert.ok(rKeep.includes("old-entry"), `forget:{enabled:false} ⇒ 旧记忆仍在召回（正控）：\\n${rKeep.slice(0, 300)}`);
console.log("✔ ③ forget 默认开：旧记忆移出活跃集（索引 + 召回），**文件保留**；关回去即恢复");

// ④ compact 默认开 ⇒ Episode 收口产出 `-consolidated.md`（原原子仍在；显式关 ⇒ 不产出 = 正控）
//    ⚠ 触发条件是「**至少两个 episode**」（`runCompact` 只收口**除当前打开那段之外**的）⇒ 两个原子必须隔开 > gapMinutes。
const hC = makeHost({ summary: { enabled: false }, forget: { enabled: false } });
seed(hC, `${D0}/${D0}--090000-ep-a.md`, "ep-entry", "同任务第一步");
seed(hC, `${D0}/${D0}--113000-ep-b.md`, "ep-entry", "另一个任务（间隔 > gapMinutes=60 ⇒ 成第二个 episode）");
await hC.read({});
const madeC = [...hC.files.keys()].filter((k) => k.endsWith("-consolidated.md"));
assert.ok(madeC.length >= 1, `compact 默认开 ⇒ 应收口出 consolidated 文件（现有：${[...hC.files.keys()].join(",")}）`);
assert.ok(hC.files.has(`${WS}/.shadow/atoms/${D0}--090000-ep-a.md`), "收口后**原原子仍在**（可回放 —— 合并同样不减文件数）");
const hNoC = makeHost({ summary: { enabled: false }, forget: { enabled: false }, compact: { enabled: false } });
seed(hNoC, `${D0}/${D0}--090000-ep-a.md`, "ep-entry", "同任务第一步");
seed(hNoC, `${D0}/${D0}--113000-ep-b.md`, "ep-entry", "另一个任务（间隔 > gapMinutes=60）");
await hNoC.read({});
assert.equal([...hNoC.files.keys()].filter((k) => k.endsWith("-consolidated.md")).length, 0, "compact:{enabled:false} ⇒ 不产出 consolidated（正控）");
console.log("✔ ④ compact 默认开：Episode 收口产出 consolidated 文件，原子保留（关回去即不产出）");

console.log("\nALL PASS ✅");
