// dsh-shadow —— T8-B 回归锁：**显式 0 不得被默认值吞掉**（v1.15.64）。
//
// 缺陷类（adr/0083 T8，2026-09-12 用户指定的泳道 `T8 → T15 → …` 的第一步）：
//   `Number(v) || dflt` 把「**显式 0**」与「**未传**」混为一谈 —— `0` 是 falsy ⇒ 用户写的 0 被默认值吞掉。
//   本仓因此有**三处文档/闸门承诺 0 有意义、代码却不认**：
//     · `abstracts.showInIndex: 0` —— `core/types.ts:55` **明写**「默认 3，0 = 不列」，实被 `|| 3` 吞；
//     · `episodes.showInIndex: 0` —— 被 `|| 8` 吞 ⇒ `core/writer-materialize.ts:212` 的
//       `episodeShow > 0` **恒真 = 死分支**，即「关掉 Episodes 段」这个开关**不存在**；
//     · `episodes` / `compact` 的 `gapMinutes: 0` —— 被 `|| 60` 吞 ⇒ 无法表达「同一分钟才算同一段」。
//
// 本文件锁三层（判据只在 `core/util.ts:numOr` 一处）：
//   ① `numOr` 自身语义：0 认、未传/非法回落默认、钳到 min、错类型不当作 0；
//   ② `deriveEpisodes` 层：`gapMinutes: 0` 必须真的产生**更多** episode（修前 0→60，与 60 相等）；
//   ③ 端到端：`_index.md` 里 Episodes 段 / 目录摘要段各自**能被 0 关掉**，且**未传时仍在**（正对照）。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { numOr } from "../dist/core/util.js";
import { deriveEpisodes, type ParsedMemory } from "../dist/core/episode.js";

const { apply, name, inject } = mod;
const WS = "D:/ws";

// ─────────────────────────────────────────────
// ① numOr 自身语义
// ─────────────────────────────────────────────
{
  // 显式 0 必须原样保留（这是本条的**红线**：修前 `Number(0) || 60` = 60）
  assert.equal(numOr(0, 60), 0, "显式 0 必须保留（不得回落默认值）");
  assert.equal(numOr(0, 8), 0, "显式 0 必须保留（showInIndex 形态）");
  assert.equal(numOr("0", 3), 0, "字符串 \"0\" 也是显式 0");
  // 未传 ⇒ 默认
  assert.equal(numOr(undefined, 60), 60, "undefined ⇒ 默认");
  assert.equal(numOr(null, 60), 60, "null ⇒ 视为未传 ⇒ 默认");
  assert.equal(numOr("", 60), 60, "空串 ⇒ 视为未传 ⇒ 默认");
  assert.equal(numOr("   ", 60), 60, "空白串 ⇒ 视为未传 ⇒ 默认");
  // 正常数值
  assert.equal(numOr(30, 60), 30, "正常数值原样使用");
  assert.equal(numOr("30", 60), 30, "数字串可解析");
  assert.equal(numOr(0.5, 60), 0.5, "小数保留（不取整）");
  // 非法 ⇒ 默认（不伪造精度、不当成 0）
  assert.equal(numOr(NaN, 60), 60, "NaN ⇒ 默认");
  assert.equal(numOr(Infinity, 60), 60, "Infinity ⇒ 默认（不返回 Infinity）");
  assert.equal(numOr(-Infinity, 60), 60, "-Infinity ⇒ 默认");
  assert.equal(numOr("abc", 60), 60, "非数字串 ⇒ 默认");
  // 错类型 ⇒ **视为未传**（判为 0 会静默关掉一个功能，正是本条要修的毛病）
  assert.equal(numOr(false, 60), 60, "布尔 false 是错类型 ⇒ 默认（**不是** 0）");
  assert.equal(numOr(true, 60), 60, "布尔 true 是错类型 ⇒ 默认（**不是** 1）");
  assert.equal(numOr({}, 60), 60, "对象 ⇒ 默认");
  assert.equal(numOr([], 60), 60, "数组 ⇒ 默认");
  // 钳位（min 只在 min>0 的调用点有用；本条只用于 min=0 的调用点）
  assert.equal(numOr(-5, 60), 0, "负数钳到 0（与修前 Math.max(0, -5) 一致）");
  assert.equal(numOr(-5, 60, 3), 3, "min 生效");
  assert.equal(numOr(0, 60, 3), 3, "min>0 时 0 被钳（这类调用点**未纳入**本次修复，行为与修前一致）");
  console.log("✔ ① numOr：显式 0 保留 · 未传/非法/错类型回落默认 · 负数钳到 0");

  // 反例正控：**修前的表达式**必须表现出缺陷 —— 证明①不是恒真
  const before = (v: any, dflt: number) => Math.max(0, Number(v) || dflt);
  assert.equal(before(0, 60), 60, "反例正控：修前 `Number(0) || 60` = 60（缺陷本身：0 被吞）");
  assert.notEqual(before(0, 60), numOr(0, 60), "反例正控：修前修后必须**不同**（否则本组断言恒真）");
  assert.equal(before(undefined, 60), numOr(undefined, 60), "未传时修前修后必须**相同**（不得改变默认行为）");
  console.log("✔ ①b 反例正控：修前 0→60、未传→60；修后 0→0、未传→60（只改显式 0 这一种输入）");
}

// ─────────────────────────────────────────────
// ② deriveEpisodes 层：gapMinutes: 0 必须真的更细
// ─────────────────────────────────────────────
{
  const pm = (time: string, entry = "pkg-a"): ParsedMemory => ({
    rel: `.shadow/2026-09-07/2026-09-07--${time}-${entry}.md`,
    date: "2026-09-07", time, entry, project: "ws", agent: "T7", goal: "",
    decisions: [], decisionEvents: [], userMessages: [], materials: [], actions: [], thinkLines: [],
    body: "", kind: "experience",
    lineage: { source: "test", createdBy: "agent", evidence: [], createdAt: `2026-09-07 ${time}` },
  });
  // 09:00 · 09:00（同一分钟）· 10:00 · 12:00 —— 全部同 project/agent
  const mem = [pm("090000"), pm("090000"), pm("100000"), pm("120000")];

  const ep0 = deriveEpisodes(mem, { gapMinutes: 0 });
  const ep60 = deriveEpisodes(mem, { gapMinutes: 60 });
  const epAbsent = deriveEpisodes(mem, {});

  // gap=0 的语义：只有**同一分钟**才并入同一段 ⇒ 09:00 的两条合一段，其余各一段
  assert.equal(ep0.length, 3, `gapMinutes:0 应产出 3 段（0900 两条合一段 · 1000 · 1200），实际 ${ep0.length}`);
  assert.equal(ep0[0].memoryCount, 2, "gapMinutes:0 只合并**同一分钟**的记忆 ⇒ 首段 2 条");
  assert.equal(ep60.length, 2, `gapMinutes:60 应产出 2 段（1200 超 60 分钟另起），实际 ${ep60.length}`);
  assert.ok(ep0.length > ep60.length, `gap=0 必须比 gap=60 **更细**（3 > 2），实际 ${ep0.length} vs ${ep60.length}`);

  // 未传 ⇒ 默认 60（与显式 60 同结果）—— 证明本条修复**不改变默认行为**
  assert.equal(epAbsent.length, ep60.length, "未传 gapMinutes 必须等于显式 60（默认行为不得被改动）");

  // 反例正控：修前的表达式把 0 读成 60 ⇒ 两档结果**相等**，上面的 `>` 必红
  const gapBefore = (v: any) => Math.max(0, Number(v) || 60);
  const epBefore0 = deriveEpisodes(mem, { gapMinutes: gapBefore(0) });
  assert.equal(epBefore0.length, ep60.length, "反例正控：修前 gap=0 被读成 60 ⇒ 与 60 同结果（3>2 的断言因此会红）");
  console.log(`✔ ② deriveEpisodes：gap=0 → ${ep0.length} 段（首段 ${ep0[0].memoryCount} 条）· gap=60 → ${ep60.length} 段 · 未传 → ${epAbsent.length} 段（=60）`);
}

// ─────────────────────────────────────────────
// ③ 端到端：两个 showInIndex 开关在 _index.md 上真的有效
// ─────────────────────────────────────────────
const mkFs = (m: Map<string, string>) => ({
  async resolve(path: string) { return { targetKey: path, displayPath: path }; },
  async readText(t: any) { return m.get(t.displayPath) ?? ""; },
  async writeText(t: any, c: string) { m.set(t.displayPath, c); return { version: "v1" }; },
  async listDir(t: any) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/";
    const names = new Set<string>();
    for (const k of m.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      const f = nk.slice(prefix.length).split("/")[0];
      if (f !== "_index.md") names.add(f);
    }
    return [...names].map((n) => ({ name: n }));
  },
});

const toolRegistry = new Map<string, any>();
const mkCtx = (m: Map<string, string>) => {
  const agentsById = new Map<string, any>();
  const agent = (id: string, cwd = WS) => { const a = { id, session: { header: { cwd } } }; agentsById.set(id, a); return a; };
  const services = { fs: mkFs(m), agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) }, systemPrompt: { context: () => {} }, tools: { register: (d: any) => toolRegistry.set(d.name, d) }, llm: undefined, agentDefaultModel: undefined };
  const ctx: any = { get: (k: string) => (services as any)[k], on: () => () => {}, inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => (services as any)[k] }) };
  return { m, agent, ctx };
};

const seed = (store: Map<string, string>, rel: string, entry: string, path: string) =>
  store.set(`D:/ws/.shadow/${rel}`,
    `# ${entry}\n\n> 完整线索\n> 背景/材料：${path}\n> 决策：〔user〕采用 ${entry}\n> 概况：1 动作 · 1 用户消息 · 1 决策\n> 项目：ws\n> Agent：T7\n\n- [10:00:00] [${entry}] 改/读 ${path}\n`);

const EP_SECTION = "## 任务回溯（Episodes）";
const AB_SECTION = "## 目录摘要（L0 · 派生物）";

/** 跑一次 read_shadow（触发 ensureIndex ⇒ 写 _index.md），返回索引全文。 */
const indexWith = async (cfg: any): Promise<string> => {
  const store = new Map<string, string>();
  // 两条**不同日期**的记忆：日期数 ≥ 2 才能让目录摘要段有内容；时间间隔跨 episode 边界。
  seed(store, "2026-09-06/2026-09-06--090000-pkg-a.md", "pkg-a", "pkg-a/x.js");
  seed(store, "2026-09-07/2026-09-07--090000-pkg-z.md", "pkg-z", "pkg-z/z.js");
  const { agent, ctx } = mkCtx(store);
  const P = { name, inject, apply };
  P.apply(ctx, { summary: { enabled: false }, recall: {}, ...cfg });
  const rs = toolRegistry.get("read_shadow");
  assert.ok(rs, "read_shadow 应已注册");
  const out = await rs.execute({}, { agent: agent("T7") });
  assert.ok(!String(out).startsWith("ERR"), `read_shadow 不应报错：${out}`);
  const idx = store.get(`${WS}/.shadow/_index.md`);
  assert.ok(typeof idx === "string" && idx.length > 0, "_index.md 必须已落盘（否则本组的『不在索引里』是假绿）");
  return idx;
};

{
  // 正对照：**都未传** ⇒ 两段都存在（证明段名判据本身有效，不是「永远找不到」）
  const idxDefault = await indexWith({});
  assert.ok(idxDefault.includes(EP_SECTION), `未传时 Episodes 段必须在（正对照）；索引尾部：${JSON.stringify(idxDefault.slice(-200))}`);
  assert.ok(idxDefault.includes(AB_SECTION), `未传时 目录摘要段必须在（正对照）；索引尾部：${JSON.stringify(idxDefault.slice(-200))}`);
  console.log("✔ ③a 正对照：两段在未传配置时都在索引里（段名判据有效）");

  // episodes.showInIndex: 0 ⇒ 索引里**没有** Episodes 段（修前 `|| 8` ⇒ 恒有）
  const idxNoEp = await indexWith({ episodes: { showInIndex: 0 } });
  assert.ok(!idxNoEp.includes(EP_SECTION), `episodes.showInIndex:0 必须关掉 Episodes 段（修前被 || 8 吞 ⇒ 恒真死分支）。实际索引：${JSON.stringify(idxNoEp.slice(-300))}`);
  assert.ok(idxNoEp.length > 0, "关掉 Episodes 段不得让整个索引为空");
  console.log("✔ ③b episodes.showInIndex:0 ⇒ _index.md **无** Episodes 段（死分支已变成真开关）");

  // abstracts.showInIndex: 0 ⇒ 索引里**没有** 目录摘要 段（types.ts:55 明写「0 = 不列」）
  const idxNoAb = await indexWith({ abstracts: { showInIndex: 0 } });
  assert.ok(!idxNoAb.includes(AB_SECTION), `abstracts.showInIndex:0 必须关掉目录摘要段（types.ts:55 承诺「0 = 不列」）。实际索引：${JSON.stringify(idxNoAb.slice(-300))}`);
  console.log("✔ ③c abstracts.showInIndex:0 ⇒ _index.md **无** 目录摘要段（文档承诺与代码一致了）");

  // **0 = 不列 ≠ 不写**：sidecar 文件仍应生成（否则就把「不列」误改成「不生成」）
  const store = new Map<string, string>();
  seed(store, "2026-09-07/2026-09-07--090000-pkg-a.md", "pkg-a", "pkg-a/x.js");
  const { agent, ctx } = mkCtx(store);
  apply(ctx, { summary: { enabled: false }, recall: {}, abstracts: { showInIndex: 0 } });
  await toolRegistry.get("read_shadow").execute({}, { agent: agent("T7") });
  const sidecars = [...store.keys()].filter((k) => k.endsWith("_abstract.md") || k.includes("abstract"));
  assert.ok(sidecars.length > 0, `showInIndex:0 只抑制**索引里的列示**，sidecar 文件仍必须生成（否则「不列」被误改成「不生成」）。实际键：${[...store.keys()].join(", ")}`);
  console.log(`✔ ③d showInIndex:0 只抑制索引列示，sidecar 仍落盘（${sidecars.length} 份）`);
}

console.log("ALL PASS ✅");
