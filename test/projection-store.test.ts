// dsh-shadow —— Phase 1B Projection Store（Performance Feature，默认关）：save/load/invalidate/rebuild + 缓存行为。
import assert from "node:assert/strict";
import { createJsonlProjectionStore, loadOrBuildProjection } from "../dist/core/projection-store.js";
import { ChangeSet } from "../dist/core/change-set.js";
import type { ShadowNode } from "../dist/core/node.js";

const makeFs = () => {
  const files = new Map();
  return {
    fs: {
      async resolve(path) { return { targetKey: path, displayPath: path }; },
      async readText(t) { const v = files.get(t.displayPath); return v === undefined ? "" : v; },
      async writeText(t, c) { files.set(t.displayPath, c); return { version: "v1" }; },
      async listDir() { return []; },
    },
    files,
  };
};
const WS = "D:/ws";
const NODE = (id): ShadowNode => ({ id, type: "code", source: `.shadow/x/${id}.md`, title: id, content: [], evidence: [id + ".java"], relations: [], kind: "experience", createdBy: "tool" });

// —— 块 1：store 直接 save/load/invalidate/rebuild ——
{
  const { fs, files } = makeFs();
  const store = createJsonlProjectionStore(fs, WS);
  await store.save([NODE("a"), NODE("b")]);
  let loaded = await store.load();
  assert.equal(loaded.length, 2, "load 应返回 2 节点");
  assert.equal(loaded[0].id, "a", "save 的节点可回读");
  assert.ok(files.size > 0, "store 写文件");
  await store.invalidate();
  loaded = await store.load();
  assert.ok(loaded === null || loaded.length === 0, "invalidate 后 load 为空/无缓存");
  let deriveCalls = 0;
  const rebuilt = await store.rebuild(async () => { deriveCalls++; return [NODE("c"), NODE("d")]; });
  assert.equal(rebuilt.length, 2, "rebuild 返回派生结果");
  assert.equal(deriveCalls, 1, "rebuild 调一次 derive");
  assert.equal((await store.load()).length, 2, "rebuild 后缓存可读");
}

// —— 块 2：store 关闭 → 恒直接派生，cached=false ——
{
  const { fs } = makeFs();
  let deriveCalls = 0;
  const r = await loadOrBuildProjection(fs, WS, {}, async () => { deriveCalls++; return [NODE("e")]; });
  assert.equal(r.cached, false, "store 关闭 → 不缓存");
  assert.equal(r.nodes.length, 1, "store 关闭 → 直接派生");
  assert.equal(deriveCalls, 1, "store 关闭 → 每次都派生");
}

// —— 块 3：store 开启 → 首次派生(cached=false)，再次命中缓存(cached=true) ——
{
  const { fs } = makeFs();
  const cfgOn = { projectionStore: { enabled: true } };
  let deriveCalls = 0;
  const rb = async () => { deriveCalls++; return [NODE("f"), NODE("g")]; };
  const r1 = await loadOrBuildProjection(fs, WS, cfgOn, rb);
  assert.equal(r1.cached, false, "首次（无缓存）→ rebuild，cached=false");
  assert.equal(deriveCalls, 1, "首次派生 1 次");
  const r2 = await loadOrBuildProjection(fs, WS, cfgOn, rb);
  assert.equal(r2.cached, true, "二次 → 命中缓存，cached=true");
  assert.equal(deriveCalls, 1, "二次不再派生（用缓存）");
  assert.equal(r2.nodes.length, 2, "缓存节点数量正确");
}

// —— 块 4：change-aware invalidateFor（ADR-0048⑤）——只移除变更 rel 的节点，保留其余 ——
{
  const { fs } = makeFs();
  const store = createJsonlProjectionStore(fs, WS);
  await store.save([
    { id: "a", type: "code", source: ".shadow/2026-09-08/a.md", title: "a", content: [], evidence: [], relations: [], kind: "experience", createdBy: "tool" },
    { id: "b", type: "code", source: ".shadow/2026-09-08/b.md", title: "b", content: [], evidence: [], relations: [], kind: "experience", createdBy: "tool" },
  ]);
  const set = new ChangeSet({ root: WS });
  set.add(".shadow/2026-09-08/a.md", "changed");
  await store.invalidateFor!(set);
  const left = await store.load();
  assert.equal(left.length, 1, "只移除变更 rel 的节点");
  assert.equal(left[0].id, "b", "保留未变更节点");
}

// —— 块 5：FsTarget 契约（v1.15.12 回归锁）——
// 曾经：`abs()` 返回 `.displayPath` **字符串**，却当作 FsTarget 传给 writeText/readText。
// 该 bug 长期隐藏，因为 `invalidate()` **零调用点**；一旦写侧开始调用它就会在 mock/sandbox 后端上炸
// （`undefined.displayPath` → 污染 fs 层 → `listDir` 抛错 → `listMemories` 被自己的 catch 吞成空）。
// 这里锁住：**传给 fs 的一律是 `resolve()` 产出的对象**。
{
  const seen: [string, any][] = [];
  const files = new Map<string, string>();
  const fs = {
    async resolve(p: string) { return { targetKey: p, displayPath: p }; },
    async readText(t: any) { seen.push(["read", t]); return files.get(t.displayPath) ?? ""; },
    async writeText(t: any, c: string) { seen.push(["write", t]); files.set(t.displayPath, c); return { version: "v1" }; },
    async listDir() { return []; },
  };
  const store = createJsonlProjectionStore(fs, WS);
  await store.save([NODE("a")]);
  await store.invalidate();
  await store.load();
  assert.ok(seen.length > 0, "应有 fs 调用");
  for (const [op, t] of seen) {
    assert.equal(typeof t, "object", `${op} 的 target 必须是对象（实际 ${typeof t}）`);
    assert.ok(t && typeof t.displayPath === "string", `${op} 的 target 应带 displayPath`);
  }
  console.log("✔ 场景 Projection-Store-4 FsTarget 契约：save/load/invalidate 一律传 resolve() 产出的对象");
}

// —— 块 6：源指纹（v1.15.12 修「缓存不感知源变化」）——
{
  const { fs } = makeFs();
  const cfgOn = { projectionStore: { enabled: true } };
  let derives = 0;
  const derive = async () => { derives++; return [NODE("h")]; };
  let fp = "v1";
  const fpFn = async () => fp;
  assert.equal((await loadOrBuildProjection(fs, WS, cfgOn, derive, fpFn)).cached, false, "首次 → 派生");
  assert.equal((await loadOrBuildProjection(fs, WS, cfgOn, derive, fpFn)).cached, true, "源未变 → 命中缓存");
  assert.equal(derives, 1, "源未变不重派生");
  fp = "v2";
  assert.equal((await loadOrBuildProjection(fs, WS, cfgOn, derive, fpFn)).cached, false, "源指纹变化 → 必须重建");
  assert.equal(derives, 2, "指纹变化触发一次重建");
  assert.equal((await loadOrBuildProjection(fs, WS, cfgOn, derive, async () => undefined)).cached, false, "指纹取不到 → 保守重建");
  // **不传指纹**必须保持旧行为（命中即用）——否则「不传指纹的调用方」永不命中，把性能特性变成纯开销
  const { fs: fs2 } = makeFs();
  let d2 = 0;
  const rb2 = async () => { d2++; return [NODE("i")]; };
  await loadOrBuildProjection(fs2, WS, cfgOn, rb2);
  const noFp = await loadOrBuildProjection(fs2, WS, cfgOn, rb2);
  assert.equal(noFp.cached, true, "不传指纹 → 保持旧行为（命中即用）");
  assert.equal(d2, 1, "不传指纹不应导致重复派生");
  console.log("✔ 场景 Projection-Store-5 源指纹：一致→命中 / 变化→重建 / 取不到→保守重建 / 不传→旧行为");
}

console.log("✔ 场景 Projection-Store-1 save/load/invalidate/rebuild");
console.log("✔ 场景 Projection-Store-2 loadOrBuild：store 关闭恒派生 / 开启首次派生+再次命中缓存");
console.log("✔ 场景 Projection-Store-3 invalidateFor change-aware：只移除变更 rel 节点（ADR-0048⑤）");
console.log("ALL PASS ✅");
