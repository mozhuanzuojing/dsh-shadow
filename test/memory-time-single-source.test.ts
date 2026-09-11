// dsh-shadow —— 记忆文件里的 **date/time 只有一个来源**（v1.15.38 / ADR-0077）。
//
// 根因（实测，且是 hl_mem `historical_predecessor` 视角照出来的）：
//   consolidated 文件的 `time` 由**两条路**各算一次，而不是同源：
//     · 写侧（本进程缓存）：`core/writer-materialize.ts` 用 `ep.startedAt.slice(11,17).replace(/:/g,"")`。
//       `episode.ts:49` 的格式是 `YYYY-MM-DD HH:MM:SS` ⇒ `slice(11,17)` = `"09:00:"` ⇒ `"0900"`
//       —— **4 位，不是 HHMMSS**；
//     · 读侧（重启后磁盘重扫）：`persistence/files.ts` 从**文件名**反解 `^\d{4}-\d{2}-\d{2}--(\d{6})`，
//       而 consolidated 文件名是 `ep-<id>-consolidated.md`（**不含时间戳**）⇒ `time = ""`。
//   后果不是"显示不准"：`time` 是**取代裁决**的输入（`query/query.ts:299` → `verdictOf`），
//   裁决决定打分（×0.7，`:301`）与生命周期标签（`:308`）。
//   `arbitrate.ts:63` 是 **严格** `t < newest` ⇒ 两个同日同 entry 的 consolidated 文件在磁盘路径上
//   **并列**，谁都不被判取代 —— 而其中较早的那个**应当**被取代。
//   ⟹ 同一份语料，本进程与重启后两套裁决（ADR-0069「两条读路径分歧」同族）。
//
// 修复：写侧的文件名带上 `<date>--<HHMMSS>-`，缓存里的 `time` **由文件名反解**（`timeFromName`），
//   使两侧**同源**、不可能再分叉。
import assert from "node:assert/strict";
import * as mod from "../dist/index.js";
import { listMemories, memoryFileName, timeFromName } from "../dist/persistence/files.js";
import { newestByEntryOf, verdictOf } from "../dist/observer/arbitrate.js";

const { apply, name, inject } = mod;
const WS = "D:/ws";

// —— 内存 fs，模拟 DSH fs 服务的 resolve/readText/writeText/listDir（与 episode-lineage.test.ts 同款）——
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
  const listeners = new Map<string, Function>();
  const ctx: any = { get: (k: string) => (services as any)[k], on: (e: string, fn: Function) => { listeners.set(e, fn); return () => listeners.delete(e); }, inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => (services as any)[k] }) };
  return { m, agentsById, agent, listeners, ctx, services };
};

const seed = (store: Map<string, string>, rel: string, entry: string, decision: string, path: string) =>
  store.set(`D:/ws/.shadow/${rel}`,
    `# ${entry}\n\n> 完整线索\n> 背景/材料：${path}\n> 决策：〔user〕${decision}\n> 概况：1 动作 · 1 用户消息 · 1 决策\n> 项目：ws\n> Agent：T7\n\n- [10:00:00] [${entry}] 改/读 ${path}\n`);

// ─────────────────────────────────────────────
// 场景：3 个 episode（09:00 pkg-a / 12:00 pkg-a / 18:00 pkg-z），间隔 > gapMinutes ⇒
//       前两个被收口成 consolidated，第三个（pkg-z）留在活跃集。
//       **关键**：两个 consolidated **同日、同 entry（pkg-a）**，且没有可见的 pkg-a 原子 ⇒
//       它们的先后**只能**靠文件名里的时间戳区分。
// ─────────────────────────────────────────────
const store = new Map<string, string>();
const { m, agent, ctx } = mkCtx(store);
const P = { name, inject, apply };
P.apply(ctx, { summary: { enabled: false }, recall: {}, compact: { enabled: true, gapMinutes: 60 } });
seed(store, "2026-09-07/2026-09-07--090000-pkg-a.md", "pkg-a", "采用 bundle 模式", "pkg-a/x.js");
seed(store, "2026-09-07/2026-09-07--120000-pkg-a.md", "pkg-a", "改为 lazy 模式", "pkg-a/x2.js");
seed(store, "2026-09-07/2026-09-07--180000-pkg-z.md", "pkg-z", "收尾无关任务", "pkg-z/z.js");
const T = agent("T7");
const rs = toolRegistry.get("read_shadow");
assert.ok(rs, "read_shadow 应已注册");
const r0 = await rs.execute({}, { agent: T });
assert.ok(!String(r0).startsWith("ERR"), `read_shadow 不应报错：${r0}`);

// ─────────────────────────────────────────────
// ① 两个 consolidated 文件已生成，且**文件名带 6 位 HHMMSS**
// ─────────────────────────────────────────────
const consolidated = [...store.keys()]
  .map((k) => k.replace(/\\/g, "/"))
  .filter((k) => k.includes("/.shadow/") && k.endsWith("-consolidated.md"));
assert.equal(consolidated.length, 2, `应生成 2 个 consolidated 文件，实际 ${consolidated.length}：${consolidated.join(", ")}`);
for (const k of consolidated) {
  const nm = k.split("/").pop()!;
  assert.match(nm, /^\d{4}-\d{2}-\d{2}--\d{6}-/, `consolidated 文件名必须带 <date>--<HHMMSS>- 前缀（否则读侧反解不到 time）：${nm}`);
}
console.log("✔ ① 两个 consolidated 文件名都带 `<date>--<HHMMSS>-` 前缀");
// 反例正控：**修复前的实际文件名形态**必须反解不到 time —— 证明本组断言不是恒真（修前此组必红）。
const preFixName = "ep-ep-2026-09-07--090000-pkg-a-consolidated.md";
assert.doesNotMatch(preFixName, /^\d{4}-\d{2}-\d{2}--\d{6}-/, "反例正控：修前文件名形态必须不匹配前缀判据");
assert.equal(timeFromName(preFixName), "", "反例正控：修前形态反解不到 time（缺陷本身）");

// ─────────────────────────────────────────────
// ② 时间戳互不相同，且等于各自 episode 的起始时刻（09:00 / 12:00）
//    —— 修前两者同为 `""`（不可区分），这是本测试的核心红线。
// ─────────────────────────────────────────────
const times = consolidated.map((k) => timeFromName(k.split("/").pop()!)).sort();
assert.deepEqual(times, ["090000", "120000"], `两个同日 consolidated 的时间必须是各自 episode 的起始 HHMMSS，实际 ${JSON.stringify(times)}`);
assert.notEqual(times[0], times[1], "两个同日同 entry 的 consolidated 必须可区分（修前同为 \"\" ⇒ 并列）");
console.log(`✔ ② 时间戳可区分且等于 episode 起始时刻：${times.join(" / ")}`);

// ─────────────────────────────────────────────
// ③ 两条读路径同源：磁盘重扫（重启后走的路径）反解出的 time == 文件名反解的 time，且非空
// ─────────────────────────────────────────────
const listed = await listMemories(mkFs(store), WS);
const listedConsolidated = listed.filter((r: any) => String(r.rel).endsWith("-consolidated.md"));
assert.equal(listedConsolidated.length, 2, `磁盘重扫应看到 2 个 consolidated，实际 ${listedConsolidated.length}`);
for (const r of listedConsolidated) {
  assert.equal(r.time, timeFromName(r.name), `磁盘路径的 time 必须等于文件名反解值（rel=${r.rel}）`);
  assert.match(String(r.time), /^\d{6}$/, `磁盘路径的 time 必须是非空 6 位 HHMMSS（修前为空串）：rel=${r.rel} time=${JSON.stringify(r.time)}`);
}
console.log("✔ ③ 磁盘重扫路径的 time 非空 6 位 HHMMSS，且与文件名同源");

// ─────────────────────────────────────────────
// ④ 取代裁决因此**确定**：磁盘路径下，较早的 consolidated 被判 superseded，较新的不判。
//    并附**反例正控**：把 time 换回修前的形态（两个都为空）必须**复现错误裁决** ——
//    证明本断言不是恒真的空话（否则"测试通过"毫无信息量）。
// ─────────────────────────────────────────────
const entryOf = (text: string) => (text.match(/^# (.+)$/m) || [])[1] || "";
const entryList = listedConsolidated.map((r: any) => ({ entry: entryOf(store.get(`D:/ws/${r.rel}`) || ""), date: r.date, time: r.time }));
assert.deepEqual(entryList.map((e: any) => e.entry), ["pkg-a", "pkg-a"], "两个 consolidated 必须同 entry（否则本场景不成立）");
const newest = newestByEntryOf(entryList);
assert.equal(newest["pkg-a"], "2026-09-07 120000", `newest 应取较晚者，实际 ${JSON.stringify(newest["pkg-a"])}`);
const older = entryList.find((e: any) => e.time === "090000")!;
const newer = entryList.find((e: any) => e.time === "120000")!;
assert.equal(verdictOf(0, "pkg-a", older.date, older.time, newest).superseded, true, "较早的 consolidated 应被判 superseded");
assert.equal(verdictOf(0, "pkg-a", newer.date, newer.time, newest).superseded, false, "较晚的 consolidated 不应被判 superseded");
// 反例正控：修前的形态（两条 time 都为空）在同一次裁决下**漏判**取代。
const newestBefore = newestByEntryOf([{ entry: "pkg-a", date: "2026-09-07", time: "" }, { entry: "pkg-a", date: "2026-09-07", time: "" }]);
assert.equal(newestBefore["pkg-a"], "2026-09-07 ", "反例正控：两条空 time 的 newest 形态");
assert.equal(verdictOf(0, "pkg-a", "2026-09-07", "", newestBefore).superseded, false, "反例正控：修前形态确实漏判取代（证明上面的 true 不是恒真）");
console.log("✔ ④ 取代裁决确定（早者取代、晚者不取代），并有修前形态的反例正控");

// ─────────────────────────────────────────────
// ⑤ 兼容与往返：无时间戳的旧文件仍被枚举（time=""，不崩）；`memoryFileName` 对非 6 位时间不加前缀
// ─────────────────────────────────────────────
store.set("D:/ws/.shadow/2026-09-07/ep-legacy-consolidated.md", "# pkg-legacy\n\n> 完整线索\n> 项目：ws\n> Agent：T7\n");
const listed2 = await listMemories(mkFs(store), WS);
const legacy = listed2.find((r: any) => String(r.rel).endsWith("ep-legacy-consolidated.md"));
assert.ok(legacy, "旧的（无时间戳）consolidated 文件仍应被枚举");
assert.equal(legacy.time, "", "旧文件反解不到时间 ⇒ time 为空（向后兼容，不崩）");
assert.equal(timeFromName(memoryFileName("2026-09-07", "090000", "x.md")), "090000", "往返正控：写侧造名 → 读侧反解必须还原");
assert.equal(memoryFileName("2026-09-07", "0900", "x.md"), "2026-09-07--x.md", "非 6 位时间（修前的 \"0900\" 形态）不写前缀 ⇒ 与读侧反解结果自洽（都为空）");
console.log("✔ ⑤ 旧文件兼容（time=\"\"、不崩）+ 写/读往返正控");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · **端到端**：本轮只断言到「文件名/磁盘反解/裁决函数」这一层，没有断言 `read_shadow` 的渲染输出里" +
  "较早的 consolidated 显示为 `裁决 superseded`（该渲染路径由既有召回测试覆盖，但**跨这个修复**未单独断言）；");
console.log("  · `compact.enabled` 默认**关**（`core/types.ts`），故这条路径在默认配置下不会被走到 —— 本测试显式打开它；");
console.log("  · 真机需重启 DSH 才生效（插件 `dist/` 不热加载，ADR-0057）。");
console.log("ALL PASS ✅");
