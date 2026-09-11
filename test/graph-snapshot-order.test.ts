// dsh-shadow —— 图快照读取必须取**最新**，不是**最旧**（ADR-0071）。
//
// 由来：`tools/audit-drift.ts` 的检测 B 报出 `name=graph.json` 在两个模块被比较
// （`temporal/persistence.ts` + `world/persistence/persist.ts`）。顺着查，两个 `read*Graph`
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
// 本测试用**忠实 mock**（`listDir` 按名字升序，与真机实现一致）+ **真 dist 代码**复现。
import assert from "node:assert/strict";
import { readTemporalGraph, writeTemporalGraph } from "../dist/temporal/persistence.js";
import { readGraph, writeGraph } from "../dist/world/persistence/persist.js";

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
  assert.ok(r, "应读到图（前置：存在三天快照）");
  assert.equal((r as any).tag, "day09",
    `应返回**最新**（2026-09-09 / day09）；实际返回了 ${(r as any).tag} —— 升序列表取第一个 = 最旧`);
  console.log("✔ ① temporal：三天快照读到最新（day09）");
}

// ── ② world：同一约定 ──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/world/2026-09-07/graph.json`, g("w07"));
  files.set(`${WS}/.shadow/world/2026-09-08/graph.json`, g("w08"));
  files.set(`${WS}/.shadow/world/2026-09-09/graph.json`, g("w09"));
  const r = await readGraph(mkFs(files), WS);
  assert.ok(r, "应读到图");
  assert.equal((r as any).tag, "w09", `应返回最新（w09）；实际 ${(r as any).tag}`);
  console.log("✔ ② world：三天快照读到最新（w09）");
}

// ── ③ 不变量：**乱序插入**也必须取最新（不能依赖 map 插入序，只看名字序）──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, g("day09"));
  files.set(`${WS}/.shadow/temporal/2026-09-07/graph.json`, g("day07"));
  files.set(`${WS}/.shadow/temporal/2026-09-08/graph.json`, g("day08"));
  const r = await readTemporalGraph(mkFs(files), WS);
  assert.equal((r as any).tag, "day09", `乱序插入时仍应取最新（按日期，不按插入序）；实际 ${(r as any).tag}`);
  console.log("✔ ③ 不变量：乱序插入仍取最新（按日期排序，不依赖插入序）");
}

// ── ④ 跳过没有 graph.json 的日期目录（别因中间某天缺失就放弃）──
{
  const files = new Map<string, string>();
  files.set(`${WS}/.shadow/temporal/2026-09-07/graph.json`, g("day07"));
  files.set(`${WS}/.shadow/temporal/2026-09-08/other.txt`, "x");   // 该天无图
  files.set(`${WS}/.shadow/temporal/2026-09-09/graph.json`, g("day09"));
  const r = await readTemporalGraph(mkFs(files), WS);
  assert.equal((r as any).tag, "day09", `中间某天缺图时应继续找到最新的有图那天；实际 ${(r as any).tag}`);
  console.log("✔ ④ 跳过缺图日期：仍取到最新那个有图的日期（day09）");
}

// ── ⑤ 反向不变量：一份图都没有 ⇒ null（不得抛、不得编造）──
{
  const files = new Map<string, string>();
  assert.equal(await readTemporalGraph(mkFs(files), WS), null, "无图 ⇒ null");
  assert.equal(await readGraph(mkFs(files), WS), null, "无图 ⇒ null（world 侧）");
  console.log("✔ ⑤ 反向不变量：无任何快照 ⇒ null（不抛、不编造）");
}

// ── ⑥ 往返：写进去的那份能被读回来（同一天写两次时读到的是最后一次）──
{
  const files = new Map<string, string>();
  const fsx = mkFs(files);
  await writeTemporalGraph(fsx as any, WS, { graphVersion: "g1", generatedAt: "2026-09-11" } as any);
  const w = await writeTemporalGraph(fsx as any, WS, { graphVersion: "g1", generatedAt: "2026-09-11", tag: "rewritten" } as any);
  void w;
  const r = await readTemporalGraph(fsx as any, WS);
  assert.ok(r, "写后应能读回");
  assert.equal((r as any).tag, "rewritten", "同一天重写后读到的是最后一次写入");
  console.log("✔ ⑥ 往返：写入快照可读回（同日重写读到最后一次）");
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 `host.fs` 的 `listDir` 排序 —— 本测试按契约（\"stable name order\"）与真机实现");
console.log("    （`localeCompare` 升序）写 mock；");
console.log("  · 两个 reader **当前在生产中零调用**（T4）—— 本测试修的是「若接线则正确」，不是「修一条在跑的路径」；");
console.log("  · 快照文件的**无限增长**（每天一份，从不清理）未处理，属另一议题。");
console.log("ALL PASS ✅");
