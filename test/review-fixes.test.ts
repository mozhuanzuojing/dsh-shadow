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
  const { validateHypothesis } = await import("../dist/epistemic/validation/validate.js");
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

  // **②b v1.15.95：读失败 ≠ 空件**（同一后果的**第二个入口**，项②扫桩扫出来的同类缺陷）。
  // 上面那个桩是**宽松桩**：`readText` 对缺失返回 `""`、且**永不抛读错** ⇒ 它表达不出
  // 「文件存在但读不出」这个状态 —— 而真实宿主会抛（EACCES / 只读挂载 / I/O / 后端报错）。
  // ⇒ 本条用**严格桩**把两侧都表达出来：缺失抛 `FS_NOT_FOUND`、读失败抛 `EACCES`。
  {
    const mkStrictFs = () => {
      const files = new Map<string, string>();
      const fail = new Set<string>(); // 这些路径：存在但读不出
      return {
        files,
        fail,
        async resolve(path: string) { return { targetKey: path, displayPath: path }; },
        async stat(t: any) { return files.has(t.displayPath) ? { version: 1, type: "file" as const, size: (files.get(t.displayPath) || "").length } : undefined; },
        async readText(t: any) {
          const k = t.displayPath;
          if (fail.has(k)) throw Object.assign(new Error(`cannot read "${k}": permission denied`), { code: "FS_PERMISSION_DENIED" });
          if (!files.has(k)) throw Object.assign(new Error(`cannot read "${k}": not found`), { code: "FS_NOT_FOUND" });
          return files.get(k)!;
        },
        async writeText(t: any, c: string) { files.set(t.displayPath, c); return { operation: "update", version: 2 }; },
        async listDir() { return []; },
      };
    };
    // (i) 正对照：**真的还没有** ⇒ 空件是正常的，正常写入
    const fresh = mkStrictFs();
    assert.equal((await readMetaVersioned(fresh as any, WS)).corrupt, false, "宿主形状的「不存在」⇒ 不是坏件（不得把全新工作区判坏）");
    assert.equal(await mutateMeta(fresh as any, WS, (m: any) => { m["a.md"] = { hits: 1 }; }), true, "全新工作区必须真的能首写");
    // (ii) **负对照（本条要锁的缺陷）**：`_meta.json` 存在但**读失败** ⇒ 绝不写回空快照
    const denied = mkStrictFs();
    denied.files.set(META, JSON.stringify({ "a.md": { hits: 5, pinned: true } }));
    denied.fail.add(META);
    const snap = await readMetaVersioned(denied as any, WS);
    assert.equal(snap.corrupt, true, "★ 读失败必须标 corrupt（旧版 `catch { txt = \"\" }` ⇒ false ⇒ 「坏件不写回」闸门不生效）");
    const mutated = await mutateMeta(denied as any, WS, (m: any) => { m["b.md"] = { hits: 1 }; });
    assert.equal(mutated, false, "★ 读失败时事务必须报**未落盘**（旧版返回 true = 谎报成功）");
    assert.ok(String(denied.files.get(META)).includes("a.md"), "★★ `a.md` 的 hits/pinned **必须原样保留** —— 旧版会把它整体覆盖成 {\"b.md\":…}（全工作区元数据清零，不可恢复）");
    console.log("✔ ②b `_meta.json` 读失败（≠ 不存在）：不写回空快照、报未落盘、既有 pinned/hits 原样保留（旧版此处清零且报成功）");
  }
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
  const { appendValidationEvent, readTimeline, readTimelineDetailed } = await import("../dist/epistemic/validation/history.js");
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

  // **宿主契约的严格桩（v1.15.94）**：`dsh-fs-local` 对不存在的路径抛
  // `FsError('cannot read "…": not found', "FS_NOT_FOUND")` —— 这条消息**不含**
  // `ENOENT` / `no such file` / `not exist` 任何一个，码也是 `FS_NOT_FOUND` 而不是 `ENOENT`。
  // 上面那个桩抛的是 `ENOENT`，**恰好**落在旧判据里 ⇒ 长期掩盖了这条缺陷（真实后端上必现）：
  // 旧判据 `code === "ENOENT" || /ENOENT|no such file|not exist/i` 认不出宿主形状 ⇒
  // `missing=false` ⇒ `corrupt: true` ⇒ `appendValidationEvent` **拒绝覆盖**（见本文件上方 ③ 的策略）
  // ⇒ **validation timeline 在全新工作区永远建不起来**（每次都判坏件、每次都不落盘）。
  const mkHostFs = (denyRead: (p: string) => boolean = () => false) => {
    const files = new Map<string, string>();
    return {
      files,
      async resolve(path: string) { return { targetKey: path, displayPath: path }; },
      async readText(t: any) {
        const k = t.displayPath;
        if (denyRead(k)) throw Object.assign(new Error(`cannot read "${k}": permission denied`), { code: "FS_PERMISSION_DENIED" });
        if (!files.has(k)) throw Object.assign(new Error(`cannot read "${k}": not found`), { code: "FS_NOT_FOUND" });
        return files.get(k)!;
      },
      async writeText(t: any, c: string) { files.set(t.displayPath, c); return { operation: "create", version: 1 }; },
      async listDir() { return []; },
    };
  };
  const host = mkHostFs();
  const hPath = `${WS}/.shadow/validation/h3.timeline.json`;
  const tlHost = await appendValidationEvent(host as any, WS, "h3", { evidenceIds: ["e9"], result: "validated", alternativeWinner: null, perceptionDelta: "x" } as any);
  assert.equal(tlHost.events.length, 1, "宿主形状的「不存在」必须被当成**还没有时间线**（而不是坏件）");
  assert.ok(String(host.files.get(hPath)).includes("e9"), "★ 全新工作区必须真的把时间线写出来（修复前：误判 corrupt ⇒ 拒绝覆盖 ⇒ 永远建不起来）");

  // **负对照**：真读失败（权限）仍必须算坏件、仍**拒绝覆盖**（修的是误判，不是把「坏件不落盘」这道闸门拆掉）
  const hostDenied = mkHostFs((p) => p.includes("h4.timeline.json"));
  hostDenied.files.set(`${WS}/.shadow/validation/h4.timeline.json`, '{"hypothesisId":"h4","events":[]}');
  await appendValidationEvent(hostDenied as any, WS, "h4", { evidenceIds: ["e1"], result: "validated", alternativeWinner: null, perceptionDelta: "x" } as any);
  assert.equal(hostDenied.files.get(`${WS}/.shadow/validation/h4.timeline.json`), '{"hypothesisId":"h4","events":[]}', "**负对照**：读失败（非「不存在」）仍算坏件 ⇒ 原样保留、不落盘");
  console.log("✔ ③b 宿主形状（FS_NOT_FOUND / `cannot read …: not found`）的「不存在」不再被误判成坏件 ⇒ 全新工作区的时间线能建起来；真读失败仍拒绝覆盖");
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
  // v1.15.94 补：这个严格桩（缺失 ⇒ 抛 `ENOENT`）此前**只断言了 `corrupt`**，
  // 而「不存在被当成读不到（`unreadable`）」正是本轮那个假横幅的形态 ——
  // 少断言一个字段，缺陷就在这条测试眼皮底下活了很久。
  assert.equal(fresh.unreadable, undefined, "文件不存在 ⇒ 也不是「读不到」（与「真的还没有」必须同解）");

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
  const { writeHypothesis, registerFutureEvidence } = await import("../dist/epistemic/validation/evidence.js");
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

// ── ⑥ 报告不得说谎：候选统计必须暴露「有记录被拒」，观测统计必须暴露「有坏行被剔除」 ──
{
  const { candidateStats, projectFacts } = await import("../dist/core/admission/proposal.js");
  const P = (id: string) => ({ type: "proposal", id, kind: "outcome", source: "user", inputRefs: [{ file: "a.ts", line: 1 }], proposedRelation: "x", createdAt: "2026-09-01T00:00:00Z" });
  const C = (id: string, proposal: string) => ({ type: "confirmation", id, proposal, actor: "human", action: "confirm", timestamp: "2026-09-02T00:00:00Z" });
  const good = [P("p1"), C("c1", "p1")];
  assert.equal(candidateStats(good, "2026-09-12T00:00:00Z").violations, 0, "干净输入 ⇒ 0 违规");

  // 一条 `type:"fact"` 冒充（会被拒收）+ 一条缺 inputRefs 的 proposal
  const dirty = [...good, { type: "fact", id: "f1", source: "model-proposal" } as any, { ...P("p2"), inputRefs: [] } as any];
  const s = candidateStats(dirty, "2026-09-12T00:00:00Z");
  assert.ok(s.violations >= 2, "★ 被拒记录必须露出条数（旧版把 collect() 的 violations 直接丢掉）");
  assert.equal(s.confirmed, 1, "统计口径不受坏记录影响（它们本来就进不来）");
  assert.equal(projectFacts(dirty).violations.length, s.violations, "事实面与统计面看到的违规数必须一致（判据收一处）");
  console.log("✔ ⑥ 候选统计露出 `violations`：有记录被拒 与 本来就没那些记录 是两件事");
}

// ── ⑦ query-log 坏行必须计数并披露（统计不得基于「被削过的样本」而不出声） ──
{
  const mkFs = (lines: string[]) => {
    const files = new Map<string, string>([["D:/ws/.shadow/query-log/2026-09-01.jsonl", lines.join("\n")]]);
    return {
      async resolve(p: string) { return { displayPath: p }; },
      async readText(t: any) { return files.get(t.displayPath) ?? ""; },
      async listDir() { return [{ name: "2026-09-01.jsonl" }]; },
      async writeText(t: any, c: string) { files.set(t.displayPath, c); return { operation: "create", version: 1 }; },
    };
  };
  const { summarizeQueryLog } = await import("../dist/query/observatory.js");
  const ok = await summarizeQueryLog(mkFs(['{"type":"recall","latencyMs":10}', '{"type":"query","latencyMs":20}']) as any, "D:/ws");
  assert.equal(ok.badLines, undefined, "没有坏行 ⇒ 不带该字段（不是 0，免得误以为有坏行）");
  assert.equal(ok.total, 2);

  const bad = await summarizeQueryLog(mkFs(['{"type":"recall","latencyMs":10}', "{ 半截", "not json at all"]) as any, "D:/ws");
  assert.equal(bad.badLines, 2, "★ 坏行必须计数");
  assert.equal(bad.total, 1, "统计只用能解析的行");
  assert.ok(String(bad.badLinesNote).includes("无法解析"), "★ 而且必须**说清楚**统计基于被削样本");
  console.log("✔ ⑦ query-log 坏行计数 + 披露（覆盖率/drift 不再无声地基于残缺样本）");
}

// ── ⑧ v1.15.95：`isNotFound` 的**边界锁**（项①反例）+ `summarizeQueryLog` 的**读失败可见**（项③） ──
//
// 项①：`evidence/filesystem.ts` / `federation/reality.ts` 改用共享判据后**行为扩宽**。
//   逐条造反例后确认：**该扩宽的扩了（宿主真读缺失），不该扩的一个都没扩**。
//   本组把两类形状分别锁死，并带**正对照**（真缺失必须仍判 true）—— 缺了正对照，
//   「一律 return false」也能让负例全绿。
// 项③：`summarizeQueryLog` 旧版把「目录还没有」与「读失败」并进同一个 `catch {}`，
//   两者都渲染成「尚无 shadow_query 记录」⇒ 事故被一句「多查几次」掩盖（ADR-0049）。
{
  const { isNotFound } = await import("../dist/core/util.js");
  const { fsExists } = await import("../dist/evidence/filesystem.js");
  const { referenceEvidence } = await import("../dist/epistemic/federation/reality.js");

  // (a) **正对照：宿主真读缺失** ⇒ 必须 true（形状抄自 `dsh-fs-local/lib/index.js:339`/`:249`）
  assert.equal(isNotFound(Object.assign(new Error('cannot read "D:/ws/x.json": not found'), { code: "FS_NOT_FOUND" })), true);
  assert.equal(isNotFound(Object.assign(new Error('cannot list "D:/ws/dir": not found'), { code: "FS_NOT_FOUND" })), true);
  assert.equal(isNotFound(Object.assign(new Error("ENOENT: no such file or directory, open 'x'"), { code: "ENOENT" })), true);
  assert.equal(isNotFound(new Error("FS_NOT_FOUND")), true, "测试桩裸抛宿主码仍要认");

  // (b) **写侧形状必须 false**（宿主写失败同码 `FS_NOT_FOUND`，内层 cause 含 ENOENT ⇒ 最毒的一个）
  assert.equal(
    isNotFound(Object.assign(new Error("write failed (ENOENT: no such file or directory, open 'x') and temp close failed (ENOENT)"), { code: "FS_NOT_FOUND" })),
    false,
    "★ 写失败（含内层 ENOENT）绝不能被读成「不存在」——否则「先读后写」会用空内容覆盖已有文件",
  );
  assert.equal(isNotFound(Object.assign(new Error('cannot write "D:/ws/x": ENOENT: no such file or directory, open \'x\''), { code: "FS_IO_ERROR" })), false);

  // (c) 权限 / 坏件 / 目录 / 二进制：判不了就是判不了（不得伪装成「确认不存在」）
  assert.equal(isNotFound(Object.assign(new Error("EACCES: permission denied, open 'D:/x/y'"), { code: "EACCES" })), false, "EACCES 不是「不存在」");
  assert.equal(isNotFound(Object.assign(new Error('cannot list "D:/x/y": permission denied'), { code: "FS_PERMISSION_DENIED" })), false);
  assert.equal(isNotFound(Object.assign(new Error('cannot read "D:/ws/dir": not a regular file'), { code: "FS_NOT_REGULAR_FILE" })), false, "目录不是「不存在」（`fsExists` 另有 `listDir` 兜底判 exists）");
  assert.equal(isNotFound(Object.assign(new Error('cannot read "D:/ws/bin": binary file'), { code: "FS_NOT_TEXT" })), false);
  assert.equal(new Error("backend exploded") instanceof Error && isNotFound(new Error("backend exploded")), false, "无码的普通后端异常 = 判不了");

  // (d) **v1.15.95 修的误扩宽**：空路径是**调用方传坏参数**，不是「目标不存在」
  //     （宿主形状：`dsh-fs-local/lib/index.js:154`/`:772`，码也是 `FS_NOT_FOUND`）
  assert.equal(isNotFound(Object.assign(new Error("file_path must be a non-empty string"), { code: "FS_NOT_FOUND" })), false, "★ 空路径不得被判成「确认不存在」（旧版 true ⇒ 调用点 bug 被静默成「还没有数据」）");

  // (e) 两个调用点：**严格桩**（缺失 ⇒ 抛宿主形状）+ 各类错误 → 三态分类
  const notFoundErr = Object.assign(new Error('cannot read "D:/ws/x": not found'), { code: "FS_NOT_FOUND" });
  const strict = (behavior: () => any) => ({
    resolve: async (p: string) => ({ targetKey: p, displayPath: p }),
    readText: async () => behavior(),
    listDir: async () => behavior(),
    writeText: async () => behavior(),
  });
  const boom = (e: any) => () => { throw e; };
  assert.equal(await fsExists(strict(boom(notFoundErr)) as any, "D:/ws", "rel/x"), "missing", "宿主真缺失 ⇒ missing");
  assert.equal(await fsExists(strict(boom(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))) as any, "D:/ws", "rel/x"), "undecidable", "EACCES ⇒ undecidable（不得判 missing ⇒ 假漂移）");
  assert.equal(await fsExists(strict(boom(Object.assign(new Error("write failed (ENOENT: x) and temp close failed (x)"), { code: "FS_NOT_FOUND" }))) as any, "D:/ws", "rel/x"), "undecidable", "★ 写失败 ⇒ undecidable（不是 missing）");
  assert.equal((await referenceEvidence(strict(boom(notFoundErr)) as any, "D:/ws", "re-1", "obs-1")).reason, "not_found", "宿主真缺失 ⇒ not_found（修复前旧判据只看 message ⇒ 误报 unreadable「存在但读不出」）");
  assert.equal((await referenceEvidence(strict(boom(Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" }))) as any, "D:/ws", "re-1", "obs-1")).reason, "unreadable", "EACCES ⇒ unreadable（不是 not_found）");
  assert.equal((await referenceEvidence(strict(boom(Object.assign(new Error("write failed (ENOENT: x) and temp close failed (x)"), { code: "FS_NOT_FOUND" }))) as any, "D:/ws", "re-1", "obs-1")).reason, "unreadable", "★ 写失败 ⇒ unreadable");

  // (f) 项③：**「还没有采集」静默 / 「读失败」可见**（正反对照）
  const { summarizeQueryLog, renderQueryLogSummary, renderFitnessReport, buildFitnessReport } = await import("../dist/query/observatory.js");
  const mk = (listDir: () => Promise<any>, readText: (t: any) => Promise<any>) => ({
    resolve: async (p: string) => ({ targetKey: p, displayPath: p }),
    listDir, readText,
  });
  const notCollected = await summarizeQueryLog(mk(boom(notFoundErr), boom(notFoundErr)) as any, "D:/ws");
  assert.equal(notCollected.total, 0);
  assert.equal(notCollected.readFailureNote, undefined, "「还没有采集」是正常的 ⇒ 不得报错（否则每次全新工作区都吓人）");
  assert.match(renderQueryLogSummary(notCollected, ""), /尚无 shadow_query 记录/, "「还没有采集」照旧提示去查几次");

  const denied = await summarizeQueryLog(mk(boom(Object.assign(new Error('cannot list "D:/ws/.shadow/query-log": permission denied'), { code: "FS_PERMISSION_DENIED" })), boom(notFoundErr)) as any, "D:/ws");
  assert.equal(denied.total, 0);
  assert.ok(String(denied.readFailureNote || "").includes("读取 .shadow/query-log 失败"), "★ 读失败必须留痕（旧版与「还没采集」不可区分）；实际 " + JSON.stringify(denied.readFailureNote));
  const deniedText = renderQueryLogSummary(denied, "");
  assert.ok(deniedText.includes("读不到 query-log") && !deniedText.includes("尚无 shadow_query 记录"), "★ 渲染必须说真话，不能把读失败说成「尚无记录」；实际：\n" + deniedText);
  assert.match(renderFitnessReport(buildFitnessReport(denied, [])), /读不到查询样本/, "★ `mode:\"shadow-report\"` 是同一个静默口的第二出口，也必须说真话");

  // **单个文件读失败不得丢弃已累计样本**（旧版落在外层 catch ⇒ 整体归零且与「目录为空」不可区分）
  const mixed = await summarizeQueryLog(mk(async () => [{ name: "a.jsonl" }, { name: "b.jsonl" }], async (t: any) => {
    if (String(t.displayPath).includes("b.jsonl")) throw Object.assign(new Error("EACCES: permission denied"), { code: "EACCES" });
    return '{"type":"recall","latencyMs":10}';
  }) as any, "D:/ws");
  assert.equal(mixed.total, 1, "★ 一个文件读失败不得把另一个文件读到的样本丢掉");
  assert.ok(String(mixed.readFailureNote || "").includes("b.jsonl"), "★ 且必须点名是哪个文件读失败");
  assert.ok(renderQueryLogSummary(mixed, "").includes("b.jsonl"), "★ 有样本时披露也要落到正文（旧版 `badLinesNote` 只挂在对象上、渲染时丢掉）");
  console.log("✔ ⑧ isNotFound 边界锁：宿主真缺失=是、写失败/EACCES/目录/空路径=否；query-log「还没有采集」静默、「读失败」可见");
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 本轮审查是**抽样**的：三名审查者各只读了一部分目录（`adaptation/`、`agency/`、`federation/`、");
console.log("    `long-horizon/`、`simulation/`、`soul/` 等**整目录未读**，`tools/*.selftest.ts` 全部未读）；");
console.log("  · **未做**端到端复现：坏件的**发生频率**（磁盘满 / EACCES / 半截写）在真机上未测；");
console.log("  · 本文件只锁「坏件不被写回」这一条**机制**，不证明「运维上不会再出现坏件」。");
console.log("ALL PASS ✅");
