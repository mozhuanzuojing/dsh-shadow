// dsh-shadow —— T6 ②：兜底根写入「未受会话授权」的**可见信号**（`adr/0074` 的已知空白）。
//
// 判据（唯一一份）在 `core/scope.ts` 的 `noteFallbackScope`：**非 fallback 一律不置**
// （否则告警变噪声 ⇒ 会被习惯性忽略）；形态对齐 `core/writer/core.ts` 的 `lastFlushError` 三件套
// （写侧置字段 + `console.error` → 读侧 `getFlushWarn()` 出口）。
//
// ⚠ 本文件为什么必须同时钉住「**有 agent、但 cwd 解析不出**」这一类：
// `v1.21.26` 第一版只把「无 session」写进设计，却**没先查既有断言**就去改生产代码 —— 判据实际取的是
// `scope === "fallback"`，于是两条既有负对照（`test/writer-write.test.ts` 的「无落盘失败警告」、
// `test/t8-silent-degradation.test.ts` 的「显式关掉不得留痕」）同时变红：那两条的 fixture 都是
// 「有 agent、无 cwd」⇒ **顺手**落在兜底根，而它们断言的是**整条横幅逐字节为空**。
// 本轮实测后的处置：**不收窄判据、不削弱断言** —— 把那两条 fixture 的 scope **显式化**
// （它们要测的是「落盘成功」与「关掉不留痕」，不是 scope），并把「有 agent、无 cwd 也置信号」
// **在这里钉死**，免得下次再由某条 fixture 的偶然性决定生产行为。
import assert from "node:assert/strict";
import { noteFallbackScope, resolveShadowScope } from "../dist/core/scope.js";
import { createShadowCollector } from "../dist/core/writer/index.js";

const empty = new Map<string, string>();

// ─────────────────────────────────────────────
// ①–④ 判据单元层（正 / 负对照各两条）
// ─────────────────────────────────────────────
{
  // ① 正对照：**无 session + 无显式 root** ⇒ fallback ⇒ 必须置信号，且话说清「未受会话授权」
  const core: any = {};
  const scope = resolveShadowScope(undefined, empty, {});
  assert.equal(scope.scope, "fallback", "无 session 且无显式 root 时应落到兜底根");
  assert.equal(noteFallbackScope(core, scope), true, "落到兜底根 ⇒ 必须置信号（返回 true）");
  assert.ok(core.lastScopeNotice && typeof core.lastScopeNotice.note === "string", "信号应落在 lastScopeNotice 上");
  assert.match(core.lastScopeNotice.note, /未受会话授权/, "信号必须说清「未受会话授权」");
  assert.match(core.lastScopeNotice.note, /兜底根/, "信号必须点名是兜底根");

  // ② 正对照（`v1.21.26` 第一版正是栽在这一类上）：**有 agent、但 cwd 解析不出**同样是 fallback
  const core2: any = {};
  const scope2 = resolveShadowScope({ id: "S1" } as any, empty, {});
  assert.equal(scope2.scope, "fallback", "有 agent 但解析不出 cwd ⇒ 同样落到兜底根");
  assert.equal(noteFallbackScope(core2, scope2), true, "这一类同样未受会话授权 ⇒ 必须置信号");

  // ③ 负对照：**有显式 root** ⇒ 不得置信号、不得写任何东西
  const core3: any = {};
  const scope3 = resolveShadowScope(undefined, empty, { shadowRoot: "C:/snb" });
  assert.equal(scope3.scope, "explicit");
  assert.equal(noteFallbackScope(core3, scope3), false, "显式 root 不得置信号");
  assert.equal(core3.lastScopeNotice, undefined, "不得写任何东西");

  // ④ 负对照：**session cwd 可得**（隐式 scope）⇒ 同样不得置信号
  const core4: any = {};
  const scope4 = resolveShadowScope({ session: { header: { cwd: "D:/project" } } } as any, empty, {});
  assert.equal(scope4.scope, "implicit");
  assert.equal(noteFallbackScope(core4, scope4), false, "session cwd 可得时不得置信号");
  assert.equal(core4.lastScopeNotice, undefined, "不得写任何东西");
  console.log("✔ T6 ② 判据：① 无 session 置信号 / ② 有 agent 无 cwd 置信号 / ③ 显式 root 不置 / ④ 隐式 scope 不置");
}

// ─────────────────────────────────────────────
// ⑤–⑥ 端到端：信号必须走到**读侧出口**（否则等于把 ② 做回 ③「维持现状、静默」）
// ─────────────────────────────────────────────
{
  const mk = (config: any) => {
    const files = new Map<string, string>();
    const fs = { resolve: async (p: string) => p, writeText: async (p: string, t: string) => { files.set(p, t); }, readText: async (p: string) => files.get(p) || "" };
    const collector = createShadowCollector({
      context: { get: (k: string) => (k === "fs" ? fs : undefined) },
      config: { summary: { enabled: false }, writeConsent: false, forget: { enabled: false }, compact: {}, retention: { enabled: false }, ...config },
      getAgentById: (id: string | undefined) => ({ id }),
    });
    return { collector, files };
  };

  // ⑤ 真实 flush · **有 agent、但解析不出 cwd** —— 这是**唯一可达**的兜底根写路径：
  //    `flush(agent)` 头两行以 `agent.id` 取 pending（`materialize.ts` 的 `flush`），
  //    `agent` 不存在时 `pending.get("")` 为空、**提前 return**（既不落盘也不置信号，见 ⑤b）。
  //    ⇒ `T6` 原话「无 session + 无显式 root」措辞不准：写路径上一定拿得到 id，拿不到的是 **cwd**。
  {
    const { collector, files } = mk({});
    collector.push("a1", { kind: "user", text: "用户：记录这一条", comp: "", source: "user" });
    await collector.onTurnStopping({ agent: { id: "a1" } });
    assert.ok(files.size >= 1, "flush 应落盘 ≥1 个记忆文件（本用例走 mock fs）");
    const warn = collector.getFlushWarn();
    assert.match(warn, /未受会话授权/, `落到兜底根的写入必须在读侧横幅可见（否则 ② 退化成 ③）；实际 ${JSON.stringify(warn)}`);
    assert.match(warn, /兜底根/, "横幅必须点名兜底根");
  }

  // ⑤b 可达性（把 ⑤ 为什么不用 `agent: undefined` 钉成断言）：无 agent ⇒ 写路径**根本到不了**
  //     `resolveShadowScope`（pending 以 id 为键，`""` 取不到）⇒ 无落盘、无信号。
  {
    const { collector, files } = mk({});
    collector.push("a1", { kind: "user", text: "用户：记录这一条", comp: "", source: "user" });
    await collector.onTurnStopping({ agent: undefined });
    assert.equal(files.size, 0, "无 agent ⇒ 写路径提前返回，不落盘（本条是可达性证据，不是缺陷）");
    assert.equal(collector.getFlushWarn(), "", "无 agent ⇒ 未走到 scope 判定，也就没有信号");
  }

  // ⑥ 负对照：**显式 root** 下同样驱动真实 flush ⇒ 横幅**逐字节为空**
  //    （健康路径输出不变 —— 这正是 `writer-write` / `t8-silent-degradation` 两条既有测试所守的契约，
  //     它们现已把 scope 显式化，不再「顺手」落在兜底根）
  {
    const { collector, files } = mk({ shadowRoot: "D:/ws" });
    collector.push("a1", { kind: "user", text: "用户：记录这一条", comp: "", source: "user" });
    await collector.onTurnStopping({ agent: { id: "a1" } });
    assert.ok(files.size >= 1, "flush 应落盘 ≥1 个记忆文件");
    assert.equal(collector.getFlushWarn(), "", "非兜底根的 flush 不得在横幅留痕（逐字节为空）");
  }
  console.log("✔ T6 ② 端到端：有 agent 无 cwd 的真实 flush ⇒ 横幅可见「未受会话授权」；无 agent ⇒ 不可达不落盘；显式 root ⇒ 横幅逐字节为空");
}

console.log("ALL PASS ✅");
