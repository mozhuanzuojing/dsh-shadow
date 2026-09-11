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

console.log("");
console.log("未在本文件验证（诚实标注）：");
console.log("  · 真机 `host.fs` 的 `stat`/`replaceIfVersion` 端到端行为（本测试是按契约写的 mock）；");
console.log("  · 真并发（多会话同时召回）的时序 —— 本测试用「注入一次外部写入」确定性地模拟冲突；");
console.log("  · 重试耗尽（连续 3 次冲突）时的行为只有代码路径覆盖，未构造极端用例。");
console.log("ALL PASS ✅");
