// dsh-shadow —— `_meta.json` 并发写不丢更新（ADR-0068）。
//
// 背景（本仓第五处同类缺陷的**连带风险**，v1.15.24 修命中数累积时**放大**出来的）：
// `_meta.json` 是全工作区共享的一个文件，而它的写入全是「读全量 → 改 → 写回全量」。
// 修复前 `servedDetail` 几乎恒空 ⇒ 这段几乎不执行；修复后**每次有命中的召回都执行**
// ⇒ 并发（多会话 / teammate / 宿主与子代理同时召回）下的**丢更新**从理论变成常态。
//
// fs 契约本身提供守卫：`writeText(target, content, expected?)` 的
// `expected = { kind: "replaceIfVersion", version }`，冲突报 `FS_STALE_VERSION`；
// `stat(target)` 返回 `FsInfo.version`（"the freshness token a write/edit guards against"）。
// 故 `mutateMeta` 用「stat 取版本 → readText → 改 → 带守卫写 → 冲突重读重试」。
//
// **本测试的关键**：mock fs **真的实现** `stat` + `replaceIfVersion` 语义（不像其它测试那样
// 只给 `resolve/readText/writeText/listDir`）。否则测的是 mock 不是系统 —— 本仓踩过这个坑
// （v1.15.15 两处不忠实 mock）。这里必须让「版本冲突」**真的会发生**，才能证明它被处理了。
import assert from "node:assert/strict";

// ⑥（B24）把 `mutateMetaVersioned` 的四态**在消费面**上也锁住：`registerMeta` 必须区分
// 「并发没抢到」与「写失败 / 坏件」—— 见文件末尾 ⑥ 段。

/** 会真的做版本校验的内存 fs：`writeText` 带 replaceIfVersion 时版本不符就抛 FS_STALE_VERSION。 */
const mkCasFs = () => {
  const files = new Map<string, string>();
  const versions = new Map<string, number>();
  let seq = 0;
  const bump = (k: string) => { const v = ++seq; versions.set(k, v); return v; };
  return {
    files,
    /** 测试用：模拟「另一个写入者」直接落盘（不经过守卫），让版本前进。 */
    externalWrite(key: string, text: string) { files.set(key, text); bump(key); },
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async stat(t: any) {
      const k = t.displayPath;
      if (!files.has(k)) return undefined;
      return { version: versions.get(k) ?? 0, type: "file" as const, size: (files.get(k) || "").length };
    },
    async readText(t: any) { return files.get(t.displayPath) ?? ""; },
    async writeText(t: any, c: string, expected?: any) {
      const k = t.displayPath;
      if (expected && expected.kind === "replaceIfVersion") {
        const cur = versions.get(k) ?? 0;
        if (cur !== expected.version) {
          const e: any = new Error("stale version");
          e.code = "FS_STALE_VERSION";
          throw e;
        }
      }
      files.set(k, c);
      const v = bump(k);
      return { operation: files.has(k) ? "update" : "create", version: v };
    },
    async listDir() { return []; },
  };
};

const { readMeta, mutateMeta, readMetaVersioned } = await import("../dist/persistence/meta.js");
const WS = "D:/ws";
const META = `${WS}/.shadow/_meta.json`;

// ── ① 基本事务：一次修改落盘，二次修改叠加（不覆盖） ──
{
  const fs = mkCasFs();
  await mutateMeta(fs, WS, (m) => { m["a.md"] = { hits: 1 }; });
  await mutateMeta(fs, WS, (m) => { m["b.md"] = { hits: 1 }; });
  const meta = JSON.parse(fs.files.get(META)!);
  assert.deepEqual(Object.keys(meta).sort(), ["a.md", "b.md"], "两次事务的写入应叠加");
  console.log("✔ ① 事务叠加：两次 mutateMeta 各自落盘且互不覆盖");
}

// ── ② `mutate` 返回 false = 无需写入（不产生写） ──
{
  const fs = mkCasFs();
  await mutateMeta(fs, WS, (m) => { m["a.md"] = { hits: 1 }; });
  const before = fs.files.get(META);
  const ok = await mutateMeta(fs, WS, () => false);
  assert.equal(ok, true, "「无需写入」应视为成功");
  assert.equal(fs.files.get(META), before, "返回 false 时不得改写文件");
  console.log("✔ ② mutate 返回 false ⇒ 不写（避免无谓的写与版本推进）");
}

// ── ③ **核心**：并发写入者推进版本 ⇒ 事务必须重试，双方的更新都保住 ──
{
  const fs = mkCasFs();
  await mutateMeta(fs, WS, (m) => { m["a.md"] = { hits: 1 }; });
  // 事务在第 2 次 mutate 内部触发一次「别人写入」：模拟读到快照后、写回前有人落了盘。
  let injected = false;
  const ok = await mutateMeta(fs, WS, (m) => {
    if (!injected) {
      injected = true;
      // 直接落盘 + 推进版本，使本事务手上的 version 过期
      fs.externalWrite(META, JSON.stringify({ ...JSON.parse(fs.files.get(META)!), "other.md": { hits: 9 } }));
    }
    m["a.md"] = { hits: (m["a.md"]?.hits || 0) + 1 };
  });
  assert.equal(ok, true, "有冲突时应重试并最终成功");
  const meta = JSON.parse(fs.files.get(META)!);
  assert.equal(meta["other.md"]?.hits, 9, "**并发写入者的更新必须保住**（这正是丢更新的反面）");
  assert.equal(meta["a.md"]?.hits, 2, "本事务的更新也要生效（重读快照后应用）");
  console.log("✔ ③ 并发：冲突被检出并重试 ⇒ 双方更新都保住（此前会丢掉 `other.md`）");
}

// ── ④ 不变量：`stat` 不可用（宿主不提供）时必须**退化但不崩** ──
{
  const m = new Map<string, string>();
  const fs = {
    async resolve(p: string) { return { displayPath: p }; },
    async readText(t: any) { return m.get(t.displayPath) ?? ""; },
    async writeText(t: any, c: string, _expected?: any) { m.set(t.displayPath, c); return { version: 1 }; },
    async listDir() { return []; },
    // 无 stat
  };
  const ok = await mutateMeta(fs as any, WS, (meta) => { meta["x.md"] = { hits: 1 }; });
  assert.equal(ok, true, "无 stat 时应退化为无条件写并成功");
  assert.equal(JSON.parse(String(m.get(META)))["x.md"].hits, 1, "内容仍应落盘");
  const snap = await readMetaVersioned(fs as any, WS);
  assert.equal(snap.version, undefined, "无 stat ⇒ 版本为 undefined（调用方据此退化为无条件写）");
  console.log("✔ ④ 无 stat 的宿主：退化为无条件写，不崩、不改语义（诚实降级）");
}

// ── ⑤ 纯读侧不受影响：readMeta 仍只返回内容 ──
{
  const fs = mkCasFs();
  await mutateMeta(fs, WS, (m) => { m["a.md"] = { hits: 3 }; });
  const meta = await readMeta(fs, WS);
  assert.equal(meta["a.md"].hits, 3, "readMeta 返回内容");
  assert.equal((await readMeta(fs, "D:/nowhere")).constructor, Object, "无文件的 workspace 返回 {}");
  console.log("✔ ⑤ readMeta 纯读语义不变（缺文件 → {}）");
}

// ── ⑥ B24 消费面：`registerMeta` 把「并发没抢到」与「写失败」分开（正/反对照）──────────────
//    为什么在这一层测：`registerMeta` 的返回值不是内部读数 —— `core/writer/materialize.ts`
//    拿它设 `core.lastMetaError`，而那是**给读者看的**横幅（「元数据未登记 ⇒ hits/生命周期/遗忘判据
//    都看不到这条记忆」）。两态若混成一个 `false`，正常并发（多会话 / teammate 同时 flush）就会**误报**
//    系统故障，而 `contended` 实际是**自愈**的（`meta[rel]` 仍不存在 ⇒ 下一条记忆的 flush 会重新登记）。
//    本组正好补上本文件末「诚实标注」里那条「重试耗尽只有代码路径覆盖，未构造极端用例」的缺口。
{
  const { registerMeta } = await import("../dist/core/retention/memory.js");

  // 正对照：健康 CAS fs ⇒ 真的登记上了
  const healthy = mkCasFs();
  assert.equal(await registerMeta(healthy, WS, "a.md", "T7", true), true, "首次登记应成功");
  assert.equal(JSON.parse(healthy.files.get(META)!)["a.md"].status, "active", "且内容真的落盘");

  // 负对照①：**重试耗尽**（每次都撞版本）⇒ `contended` ⇒ **不得**被当成登记失败
  const contended = mkCasFs();
  (contended as any).writeText = async () => { const e: any = new Error("stale version"); e.code = "FS_STALE_VERSION"; throw e; };
  assert.equal(
    await registerMeta(contended, WS, "a.md", "T7", true),
    true,
    "并发没抢到 ⇒ 不报「未登记」（返回 true，自愈）；混成 false 会在正常并发下给读者挂假降级横幅",
  );
  assert.equal(contended.files.has(META), false, "正对照：桩真的拦住了每一次写（不是「恰好没走写」）");

  // 负对照②：**写失败**（readonly / 磁盘满）⇒ 必须返回 false（要人管）
  const failed = mkCasFs();
  (failed as any).writeText = async () => { throw new Error("readonly"); };
  assert.equal(
    await registerMeta(failed, WS, "a.md", "T7", true),
    false,
    "写失败 ⇒ 必须返回 false（调用方据此设 `lastMetaError` 上横幅 —— ADR-0049 缺件不静默）",
  );

  // 负对照③：**坏件**（不是合法 JSON）⇒ false —— 绝不把空快照写回（会把全工作区元数据清零）
  const corrupt = mkCasFs();
  corrupt.files.set(META, "{ not json");
  assert.equal(await registerMeta(corrupt, WS, "a.md", "T7", true), false, "坏件 ⇒ false（不写回、要人管）");
  assert.equal(corrupt.files.get(META), "{ not json", "坏件必须原样保留（没被空快照覆盖）");

  // 控制变量：`retention` 显式关闭 ⇒ 早退 true，且一个字节都不写（「关掉」不是降级）
  const off = mkCasFs();
  assert.equal(await registerMeta(off, WS, "a.md", "T7", false), true, "retention 关闭 ⇒ 直接 true");
  assert.equal(off.files.has(META), false, "且不产生任何写");
  console.log("✔ ⑥ B24 消费面：registerMeta 分开「并发没抢到（自愈 ⇒ true）」与「写失败 / 坏件（⇒ false）」");
}

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 `host.fs` 的 `stat`/`replaceIfVersion` 端到端行为（本测试是按契约写的 mock）；");
console.log("  · 真并发（多会话同时召回）的时序 —— 本测试用「注入一次外部写入」确定性地模拟冲突；");
console.log("  · 端到端「横幅真的出现在读输出里」由 `test/t8-silent-degradation.test.ts` 与");
console.log("    `test/compact-write-side.test.ts` 锁（本文件只锁 seam 层的返回值语义）。");
console.log("ALL PASS ✅");
