// dsh-shadow —— test/review-fixes.test.ts：v1.15.54 对抗性审查修复的闸（三类缺陷）。
//
// 三类缺陷（都是「同一份数据会不会给出两个答案」/「报了错是否仍然生效」）：
//   ① **判据分叉**：正/负结果分类器曾在**三处**各写一份并给出**不同答案**（实测）⇒ 收进 `core/polarity.ts`；
//   ② **坏件 ≠ 空件**：`_meta.json` 解析失败后返回空快照，`mutateMeta` 把它整体写回 ⇒ 全工作区元数据清零；
//   ③ **坏件被覆盖**：validation timeline 解析失败后返回空历史，`appendValidationEvent` 用 1 条新事件
//      覆盖整个文件 ⇒ append-only 历史**永久销毁**。
import assert from "node:assert/strict";

// ── ① 判据分叉：三处必须给同一个答案 ──
{
  const { isPositiveOutcome } = await import("../dist/core/polarity.js");
  const fromReflection = (await import("../dist/reflection/patterns/success-rate.js")).isPositiveOutcome;

  // 曾经分叉的实例（`"unstable"` 因 `includes("stable")` 恰好相反；另两例词表不同）
  const divergent = ["依赖降低", "solved", "成本下降", "维护成本下降", "验收通过", "unstable", "上升", "阻塞"];
  for (const w of divergent) {
    assert.equal(isPositiveOutcome(w), fromReflection(w), `「${w}」在两处必须同答案`);
  }
  assert.equal(isPositiveOutcome("unstable"), false, "`unstable` 含子串 `stable`，但负向否决必须赢");
  assert.equal(isPositiveOutcome("依赖降低"), true, "两处词表并集：reflection 侧认它是正面");
  assert.equal(isPositiveOutcome("solved"), true);
  assert.equal(isPositiveOutcome("上升"), false, "负向否决");
  assert.equal(isPositiveOutcome("优化了接口"), true);
  assert.equal(isPositiveOutcome(""), false, "空串不算正面（无命中）");

  // `validateHypothesis` 必须**真的**走这条判据（否则「收一处」只收了一半）
  const { validateHypothesis } = await import("../dist/validation/validate.js");
  const h = { id: "h1", statement: "s", source: "x", createdAt: "2026-01-01", status: "open", alternativeExplanation: [{}] } as any;
  const ev = (id: string, actualOutcome: string) => ({
    id, hypothesisId: "h1", observationType: "t", observedAt: "2026-02-01", actualOutcome, sourceRef: "r",
  }) as any;
  const r = validateHypothesis(h, [ev("e1", "依赖降低"), ev("e2", "unstable"), ev("e3", "优化了接口")]);
  assert.equal(r.applied.support, 2, "`依赖降低`/`优化了接口` 算支持（修复前 `依赖降低` 算反例）");
  assert.equal(r.applied.contradiction, 1, "`unstable` 算反例（修复前因 includes(\"stable\") 算支持）");
  console.log("✔ ① 判据收一处：`polarity` 单一来源，三处同答案，`validateHypothesis` 真的用它");
}

// ── ② `_meta.json` 坏件：**拒绝把空快照写回** ──
{
  const mkFs = () => {
    const files = new Map<string, string>();
    return {
      files,
      async resolve(path: string) { return { targetKey: path, displayPath: path }; },
      async stat(t: any) { return files.has(t.displayPath) ? { version: 1, type: "file" as const, size: (files.get(t.displayPath) || "").length } : undefined; },
      async readText(t: any) { return files.get(t.displayPath) ?? ""; },
      async writeText(t: any, c: string) { files.set(t.displayPath, c); return { operation: "update", version: 2 }; },
      async listDir() { return []; },
    };
  };
  const { mutateMeta, readMetaVersioned } = await import("../dist/persistence/meta.js");
  const WS = "D:/ws";
  const META = `${WS}/.shadow/_meta.json`;

  const fs = mkFs();
  fs.files.set(META, "{ 这不是 JSON"); // 坏件
  const called: string[] = [];
  const ok = await mutateMeta(fs as any, WS, (m: any) => { called.push("mutate"); m["a.md"] = { hits: 1 }; });
  assert.equal(ok, false, "坏件时事务必须报**未落盘**");
  assert.equal(called.length, 0, "**连 mutate 都不该被调用**（拿空快照去改是在给清零做准备）");
  assert.equal(fs.files.get(META), "{ 这不是 JSON", "坏件必须**原样保留**，不得被空快照覆盖");
  assert.equal((await readMetaVersioned(fs as any, WS)).corrupt, true, "必须显式标记 corrupt");

  // 对照：空文件（真的还没有 meta）不算坏件，正常写入
  const fs2 = mkFs();
  assert.equal((await readMetaVersioned(fs2 as any, WS)).corrupt, false, "文件不存在 ⇒ 不是坏件");
  const ok2 = await mutateMeta(fs2 as any, WS, (m: any) => { m["a.md"] = { hits: 1 }; });
  assert.equal(ok2, true, "正常路径必须仍然成功");
  assert.ok(String(fs2.files.get(META)).includes("hits"), "正常路径必须真的落盘");
  console.log("✔ ② `_meta.json` 坏件：拒绝写回空快照、明确标记 corrupt；正常路径不受影响");
}

// ── ③ validation timeline 坏件：**拒绝覆盖**（append-only 历史不得被销毁） ──
{
  const mkFs = () => {
    const files = new Map<string, string>();
    return {
      files,
      async resolve(path: string) { return { targetKey: path, displayPath: path }; },
      async readText(t: any) {
        const k = t.displayPath;
        if (!files.has(k)) { const e: any = new Error("ENOENT: no such file"); e.code = "ENOENT"; throw e; }
        return files.get(k)!;
      },
      async writeText(t: any, c: string) { files.set(t.displayPath, c); return { operation: "create", version: 1 }; },
      async listDir() { return []; },
    };
  };
  const { appendValidationEvent, readTimeline, readTimelineDetailed } = await import("../dist/validation/history.js");
  const WS = "D:/ws";
  const P = `${WS}/.shadow/validation/h1.timeline.json`;

  const fs = mkFs();
  fs.files.set(P, '{"hypothesisId":"h1","events":[{"time":"2026-01-01"}'); // 半截 JSON
  const before = await readTimelineDetailed(fs as any, WS, "h1");
  assert.equal(before.corrupt, true, "坏件必须被识别出来");
  await appendValidationEvent(fs as any, WS, "h1", { evidenceIds: ["e1"], result: "validated", alternativeWinner: null, perceptionDelta: "x" } as any);
  assert.equal(fs.files.get(P), '{"hypothesisId":"h1","events":[{"time":"2026-01-01"}', "★ 坏件**原样保留**（修复前会被 1 条新事件覆盖，历史永久销毁）");
  assert.deepEqual((await readTimeline(fs as any, WS, "h1")).events, [], "读到的仍是空（因为文件确实读不出）—— 但 corrupt 标记已告知调用方");

  // 对照：不存在 ⇒ 正常新建并追加
  const fs2 = mkFs();
  const tl = await appendValidationEvent(fs2 as any, WS, "h2", { evidenceIds: ["e1"], result: "validated", alternativeWinner: null, perceptionDelta: "x" } as any);
  assert.equal(tl.events.length, 1, "全新时间线正常追加");
  assert.ok(String(fs2.files.get(`${WS}/.shadow/validation/h2.timeline.json`)).includes("e1"), "必须真的落盘");
  console.log("✔ ③ validation timeline 坏件：拒绝覆盖（历史保留），全新时间线正常追加");
}

// ── ④ 台账坏件：**坏件 ≠ 空件**（否则冷却静默清零 ⇒ 已冷却的记忆被重新返回） ──
{
  const mkFs = (content: string | undefined) => {
    const files = new Map<string, string>();
    if (content !== undefined) files.set("D:/ws/.shadow/_recall_log.json", content);
    return {
      files,
      async resolve(path: string) { return { targetKey: path, displayPath: path }; },
      async readText(t: any) {
        const k = t.displayPath;
        if (!files.has(k)) { const e: any = new Error("ENOENT"); e.code = "ENOENT"; throw e; }
        return files.get(k)!;
      },
      async writeText(t: any, c: string) { files.set(t.displayPath, c); return { operation: "create", version: 1 }; },
      async listDir() { return []; },
    };
  };
  const { readLedger, writeLedger } = await import("../dist/retrieval/ledger.js");

  const fresh = await readLedger(mkFs(undefined) as any, "D:/ws");
  assert.equal(fresh.corrupt, undefined, "文件不存在 ⇒ 是「真的还没有」，不是坏件");

  const broken = await readLedger(mkFs("{ 半截") as any, "D:/ws");
  assert.equal(broken.corrupt, true, "★ 坏件必须显式标记，否则与「第一次运行」不可区分");
  assert.deepEqual(broken.served, {}, "坏件时仍是空台账（但已标记）");

  const shaped = await readLedger(mkFs('{"turn":3}') as any, "D:/ws");
  assert.equal(shaped.corrupt, true, "形状不对（无 served）同样算坏件");

  const good = await readLedger(mkFs('{"turn":3,"served":{"a.md":1}}') as any, "D:/ws");
  assert.equal(good.turn, 3);
  assert.equal(good.corrupt, undefined);

  // 写失败必须能被调用方看见（旧版返回 void）
  const deadFs = { async resolve() { throw new Error("readonly"); } };
  assert.equal(await writeLedger(deadFs as any, "D:/ws", { turn: 1, served: {} }), false, "★ 写失败必须报 false");
  assert.equal(await writeLedger(undefined as any, "D:/ws", {}), false, "无 fs/ws 也算没写成功");
  assert.equal(await writeLedger(mkFs(undefined) as any, "D:/ws", { turn: 1, served: {} }), true);
  console.log("✔ ④ 召回台账：坏件标记 corrupt、写失败报 false（冷却不再静默清零）");
}

// ── ⑤ 证据/假设落盘失败必须能被上层播报（旧版只 console.log） ──
{
  const deadFs = { async resolve() { throw new Error("readonly"); } };
  const { writeHypothesis, registerFutureEvidence } = await import("../dist/validation/evidence.js");
  assert.equal(await writeHypothesis(deadFs as any, "D:/ws", { id: "h1" } as any), false, "★ 假设没写下去就必须报 false");
  const r = await registerFutureEvidence(deadFs as any, "D:/ws", { hypothesisId: "h1", observedAt: "2026-02-01", actualOutcome: "优化", observationType: "t" } as any);
  assert.equal(r.persisted, false, "★ 证据没写下去必须能被调用方看见（否则照样播报 registered）");
  assert.equal(r.evidence.hypothesisId, "h1", "但证据本体仍返回（调用方可用它渲染「未落盘」）");

  const memFs = {
    files: new Map<string, string>(),
    async resolve(p: string) { return { displayPath: p }; },
    async writeText(t: any, c: string) { this.files.set(t.displayPath, c); return { operation: "create", version: 1 }; },
  };
  const ok = await registerFutureEvidence(memFs as any, "D:/ws", { hypothesisId: "h2", observedAt: "2026-02-01", actualOutcome: "优化", observationType: "t" } as any);
  assert.equal(ok.persisted, true);
  assert.ok([...memFs.files.keys()].some((k) => k.includes("future-evidence")), "正常路径必须真的落盘");
  console.log("✔ ⑤ 假设/证据：落盘失败返回 false/persisted=false，调用方得以改写播报");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 本轮审查是**抽样**的：三名审查者各只读了一部分目录（`adaptation/`、`agency/`、`federation/`、");
console.log("    `long-horizon/`、`simulation/`、`soul/` 等**整目录未读**，`tools/*.selftest.ts` 全部未读）；");
console.log("  · **未做**端到端复现：坏件的**发生频率**（磁盘满 / EACCES / 半截写）在真机上未测；");
console.log("  · 本文件只锁「坏件不被写回」这一条**机制**，不证明「运维上不会再出现坏件」。");
console.log("ALL PASS ✅");
