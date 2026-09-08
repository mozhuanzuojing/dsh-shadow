// dsh-shadow —— Phase 1B Projection Store（Performance Feature，默认关）：save/load/invalidate/rebuild + 缓存行为。
import assert from "node:assert/strict";
import { createJsonlProjectionStore, loadOrBuildProjection } from "../dist/core/projection-store.js";
import { ChangeSet } from "../dist/core/change-set.js";

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
const NODE = (id) => ({ id, type: "code", source: `.shadow/x/${id}.md`, title: id, content: [], evidence: [id + ".java"], relations: [], kind: "experience", createdBy: "tool" });

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

console.log("✔ 场景 Projection-Store-1 save/load/invalidate/rebuild");
console.log("✔ 场景 Projection-Store-2 loadOrBuild：store 关闭恒派生 / 开启首次派生+再次命中缓存");
console.log("✔ 场景 Projection-Store-3 invalidateFor change-aware：只移除变更 rel 节点（ADR-0048⑤）");
console.log("ALL PASS ✅");
