// dsh-shadow —— 图快照读取必须取**最新**，不是**最旧**（ADR-0071）；且**回退到更旧快照必须可见**（B3）。
//
// 由来：`tools/audit-drift.ts` 的检测 B 报出 `name=graph.json` 在两个模块被比较
// （`selfhood/temporal/persistence.ts` + `world/persistence/persist.ts`）。顺着查，两个 `read*Graph`
// 都是**逐字近重复**，且都是 **write-only**（T4：生产者 + 测试引用皆为零）；再查发现**顺序地雷**：
//
//   `listDir` 的契约是「List direct children of a directory in **stable name order**」，
//   真机实现是 `entries.sort((l, r) => l.name.localeCompare(r.name))` ⇒ **升序**。
//   而两个 reader 都是「**碰到第一个**含 graph.json 的日期就 return」⇒ 日期目录名是 `YYYY-MM-DD`
//   （字典序 = 时间序）⇒ **返回的是最旧的那份快照**。
//
// 为什么这仍然是**该修的**（即便当前无人调用）：
//   · 它是一枚**地雷** —— 谁按名字直觉（`read*` 想拿「当前图」）接线，就会静默拿到最旧的；
//   · 而 ADR-0017/0024 把 graph.json 定义为**可重建的派生快照**（ADR-0003）——
//     回读一份**更旧**的派生件，正是本仓这几轮反复修的「投影与源头脱钩」那一类。
//
// B3（v1.22.x）：`readLatestSnapshot` 的契约由 `T | null` 收紧为 `SnapshotRead<T>` ——
//   `{ value, usedRel, skipped, readFailure }`。两个薄包装（`readTemporalGraph` / `readGraph`）
//   **原样透传、不解包**（两侧口径必须一致，见 fix-outer 的适配），故本文件两半都读 `.value`。
//   旧形态只有一句 `console.log("…已回退到更旧的…")`，而 ADR-0085 明示 `console.log` **不算**可见信号
//   ⇒「读到旧图」与「投影就是当前状态」不可区分。现在 `skipped` 会列出被跳过的更新候选**及原因**。
//
// 本测试用**忠实 mock**（`listDir` 按名字升序，与真机实现一致）+ **真 dist 代码**复现。
import assert from "node:assert/strict";
import { readTemporalGraph, writeTemporalGraph } from "../dist/selfhood/temporal/persistence.js";
import { readGraph, writeGraph } from "../dist/epistemic/world/persistence/persist.js";

/** 忠实 mock：`listDir` 按名字升序（真机是 localeCompare 升序），目录条目带 `target`。 */
const mkFs = (files: Map<string, string>) => ({
  async resolve(p: string) { return { targetKey: p, displayPath: p }; },
  async readText(t: any) { return files.get(t.displayPath) ?? ""; },
  async writeText(t: any, c: string) { files.set(t.displayPath, c); return { version: "v1" }; },
  async listDir(t: any) {
    const base = t.displayPath.replace(/\\/g, "/").replace(/\/+$/, "");
    const prefix = base + "/";
    const names = new Map<string, "file" | "directory">();
    for (const k of files.keys()) {
      const nk = k.replace(/\\/g, "/");
      if (!nk.startsWith(prefix)) continue;
      const rest = nk.slice(prefix.length);
      const seg = rest.split("/")[0];
      if (!seg) continue;
      names.set(seg, rest.includes("/") ? "directory" : "file");
    }
    // **升序**（与 listDir 契约的 "stable name order" 及真机实现一致）
    return [...names.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([n, type]) => ({ name: n, type, target: { displayPath: `${base}/${n}` } }));
  },
});

const WS = "D:/ws";
const g = (tag: string) => JSON.stringify({ graphVersion: "g1", generatedAt: "2026-09-11", tag });

// ── ① temporal：三天快照，读到最新那天（2026-09-09）──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/temporal/2026-09-07/graph.json`, g("day07"));
  files.set(`${WS}/.shadow/temporal/2026-09-08/graph.json`, g("day08"));
  files.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, g("day09"));
  const r = await readTemporalGraph(mkFs(files), WS);
  assert.ok(r.value, "应读到图（前置：存在三天快照）");
  assert.equal((r.value as any).tag, "day09",
    `应返回**最新**（2026-09-09 / day09）；实际返回了 ${(r.value as any).tag} —— 升序列表取第一个 = 最旧`);
  assert.equal(r.usedRel, "2026-09-09/graph.json", "B3：必须告诉调用方**用的是哪一份**");
  assert.deepEqual(r.skipped, [], "B3 负对照：健康路径不得报「跳过了什么」（否则披露变成噪声）");
  console.log("✔ ① temporal：三天快照读到最新（day09），并带出 usedRel");
}

// ── ② world：同一约定 ──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/world/2026-09-07/graph.json`, g("w07"));
  files.set(`${WS}/.shadow/world/2026-09-08/graph.json`, g("w08"));
  files.set(`${WS}/.shadow/world/2026-09-09/graph.json`, g("w09"));
  const r = await readGraph(mkFs(files), WS);
  assert.ok(r.value, "应读到图");
  assert.equal((r.value as any).tag, "w09", `应返回最新（w09）；实际 ${(r.value as any).tag}`);
  console.log("✔ ② world：三天快照读到最新（w09）");
}

// ── ③ 不变量：**乱序插入**也必须取最新（不能依赖 map 插入序，只看名字序）──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, g("day09"));
  files.set(`${WS}/.shadow/temporal/2026-09-07/graph.json`, g("day07"));
  files.set(`${WS}/.shadow/temporal/2026-09-08/graph.json`, g("day08"));
  const r = await readTemporalGraph(mkFs(files), WS);
  assert.equal((r.value as any).tag, "day09", `乱序插入时仍应取最新（按日期，不按插入序）；实际 ${(r.value as any).tag}`);
  console.log("✔ ③ 不变量：乱序插入仍取最新（按日期排序，不依赖插入序）");
}

// ── ④ 跳过没有 graph.json 的日期目录（别因中间某天缺失就放弃）──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/temporal/2026-09-07/graph.json`, g("day07"));
  files.set(`${WS}/.shadow/temporal/2026-09-08/other.txt`, "x");   // 该天无图
  files.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, g("day09"));
  const r = await readTemporalGraph(mkFs(files), WS);
  assert.equal((r.value as any).tag, "day09", `中间某天缺图时应继续找到最新的有图那天；实际 ${(r.value as any).tag}`);
  console.log("✔ ④ 跳过缺图日期：仍取到最新那个有图的日期（day09）");
}

// ── ⑤ 反向不变量：一份图都没有 ⇒ value:null（不得抛、不得编造）──
{
  const files = new Map<string, string>();
  const rt = await readTemporalGraph(mkFs(files), WS);
  assert.equal(rt.value, null, "无图 ⇒ value:null");
  assert.equal(rt.readFailure, undefined, "**无图 ≠ 读不出来**：全新工作区不得报读失败（ADR-0049 的两侧）");
  assert.deepEqual(rt.skipped, [], "无图时没有任何东西可跳过");
  const rw = await readGraph(mkFs(files), WS);
  assert.equal(rw.value, null, "无图 ⇒ value:null（world 侧）");
  assert.equal(rw.readFailure, undefined, "world 侧同一判据：无图不是读失败");
  console.log("✔ ⑤ 反向不变量：无任何快照 ⇒ value:null（不抛、不编造），且不与「读失败」混淆");
}

// ── ⑥ 往返：写进去的那份能被读回来（同一天写两次时读到的是最后一次）──
{
  const files = new Map<string, string>();
  const fsx = mkFs(files);
  const w1 = await writeTemporalGraph(fsx as any, WS, { graphVersion: "g1", generatedAt: "2026-09-11" } as any);
  const w = await writeTemporalGraph(fsx as any, WS, { graphVersion: "g1", generatedAt: "2026-09-11", tag: "rewritten" } as any);
  // B2：写侧**必须报结果**（旧版 `Promise<void>` + `catch { console.log }` ⇒ 调用方无从知道没落盘）。
  assert.equal(w1.ok, true, "写成功必须 ok:true");
  assert.equal(w.ok, true, "写成功必须 ok:true（同日重写）");
  const r = await readTemporalGraph(fsx as any, WS);
  assert.ok(r.value, "写后应能读回");
  assert.equal((r.value as any).tag, "rewritten", "同一天重写后读到的是最后一次写入");
  console.log("✔ ⑥ 往返：写入快照可读回（同日重写读到最后一次）；写侧返回 {ok:true}");
}

// ── ⑦ **B3：回退到更旧快照必须可见**（正/负对照；旧形态只有一句 `console.log`）──
{
  // (a) 正：最新那天是**坏件** ⇒ 回退到更旧的那份，且 `skipped` 点名它 + 带原因
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/temporal/2026-09-08/graph.json`, g("day08"));
  files.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, "{ 这不是 JSON");
  const r = await readTemporalGraph(mkFs(files), WS);
  assert.equal((r.value as any).tag, "day08", "坏件那天的图应被跳过、回退到更旧的（不因一份坏文件就让整条读路径返回 null）");
  assert.equal(r.usedRel, "2026-09-08/graph.json", "B3：`usedRel` 必须说清**实际用的是旧图**");
  assert.equal(r.skipped.length, 1, "B3：被跳过的更新候选必须列出来（旧形态只有一句不可见的 console.log）");
  assert.match(r.skipped[0], /2026-09-09\/graph\.json/, `skipped 必须点名是哪一份；实际 ${JSON.stringify(r.skipped)}`);
  assert.match(r.skipped[0], /坏件/, `skipped 必须说清**为什么**跳过（坏件 ≠ 读失败 ≠ 空文件）；实际 ${JSON.stringify(r.skipped)}`);

  // (b) 正：空文件也被跳过，且原因与「坏件」区分得开
  const files2 = new Map<string, string>();
  files2.set(`${WS}/.shadow/temporal/2026-09-08/graph.json`, g("day08"));
  files2.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, "");
  const r2 = await readTemporalGraph(mkFs(files2), WS);
  assert.equal((r2.value as any).tag, "day08", "空快照 ⇒ 跳过、继续找更旧的");
  assert.match(String(r2.skipped[0] || ""), /空文件/, `空文件要有自己的原因（与「坏件」是两种事）；实际 ${JSON.stringify(r2.skipped)}`);

  // (c) **负对照**：全是好件 ⇒ 一次都不许报「跳过」（否则披露变成噪声，读者会学会忽略它）
  const files3 = new Map<string, string>();
  files3.set(`${WS}/.shadow/temporal/2026-09-08/graph.json`, g("day08"));
  files3.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, g("day09"));
  const r3 = await readTemporalGraph(mkFs(files3), WS);
  assert.equal(r3.usedRel, "2026-09-09/graph.json", "健康路径取最新");
  assert.deepEqual(r3.skipped, [], "**负对照**：全好件时 skipped 必须为空");
  assert.equal(r3.readFailure, undefined, "**负对照**：全好件时不得报读失败");
  console.log("✔ ⑦ B3：回退时 skipped/usedRel 说清「读的是旧图 + 为什么」；全好件时零披露（正/负对照齐备）");
}

// ── ⑧ **B4：目录不存在 ≠ 读不出来**（旧形态两者都落进同一个 `catch`/`.catch(() => [])`）──
{
  // (a) 正：目录真的不存在 ⇒ 正常空值（不报 readFailure）
  const notFound = Object.assign(new Error('cannot list "D:/ws/.shadow/temporal": not found'), { code: "FS_NOT_FOUND" });
  const strictMissing = {
    async resolve(p: string) { return { targetKey: p, displayPath: p }; },
    async readText(t: any) { throw notFound; },
    async listDir() { throw notFound; },
  };
  const a = await readTemporalGraph(strictMissing as any, WS);
  assert.equal(a.value, null, "目录不存在 ⇒ 没有快照（正常）");
  assert.equal(a.readFailure, undefined, "**「还没有」不是事故**：不得报 readFailure（否则全新工作区每次读都吓人）");

  // (b) 负对照：真读失败（EACCES）⇒ 必须报 readFailure 且带真实原因
  const denied = Object.assign(new Error('cannot list "D:/ws/.shadow/temporal": permission denied'), { code: "FS_PERMISSION_DENIED" });
  const strictDenied = {
    async resolve(p: string) { return { targetKey: p, displayPath: p }; },
    async readText() { throw denied; },
    async listDir() { throw denied; },
  };
  const b = await readTemporalGraph(strictDenied as any, WS);
  assert.equal(b.value, null, "读不出来 ⇒ 没有值（但**不等于**「还没有」）");
  assert.match(String(b.readFailure || ""), /permission denied/, `B4：读失败必须带真实原因；实际 ${JSON.stringify(b.readFailure)}`);
  console.log("✔ ⑧ B4：目录不存在 ⇒ 静默空值；EACCES ⇒ readFailure 带真实原因（不是「还没有采集」）");
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 `host.fs` 的 `listDir` 排序 —— 本测试按契约（\"stable name order\"）与真机实现");
console.log("    （`localeCompare` 升序）写 mock；");
console.log("  · 两个 reader **当前在生产中零调用**（T4）—— 本测试修的是「若接线则正确」，不是「修一条在跑的路径」；");
console.log("  · 快照文件的**无限增长**（每天一份，从不清理）未处理，属另一议题。");
console.log("ALL PASS ✅");
