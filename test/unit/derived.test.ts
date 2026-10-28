import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { err } from "../../dist/contract/outcome.js";
import { fixedClock } from "../../dist/contract/time.js";
import { DERIVED_MARK, planDerived } from "../../dist/engine/derived.js";
import { runRead } from "../../dist/engine/read/route.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { loadAtoms } from "../../dist/store/atoms.js";
import { MemoryFs, type FsPort } from "../../dist/store/fs.js";
import { atomText, seedCorpus, TODAY, WS } from "../helpers.ts";

/** 计数 fs：只关心「写了几次、写到哪」，用来断言幂等（二次读零写盘）。 */
class CountingFs extends MemoryFs {
  writes: string[] = [];
  override async writeText(p: string, text: string) {
    this.writes.push(p);
    return super.writeText(p, text);
  }
}

/** 写失败注入：模拟只读沙箱（Outcome 失败，不抛）。 */
class DeniedWriteFs extends MemoryFs {
  override async writeText(p: string, _text: string) {
    return err("WRITE_DENIED", `只读沙箱拒绝写入：${p}`, { path: p });
  }
}

const makeDeps = (fs: FsPort) => ({
  fs,
  ws: WS,
  config: normalizeConfig({ shadowRoot: WS }),
  clock: fixedClock(`${TODAY}T12:00:00`),
  signals: new SignalStore(),
});

const readOf = async (fs: MemoryFs, p: string): Promise<string> => {
  const r = await fs.readText(p);
  assert.equal(r.ok, true, `应能读到 ${p}`);
  return r.ok ? r.value : "";
};

const namesOf = async (fs: MemoryFs, relDir: string): Promise<string[]> => {
  const r = await fs.listDir(`${WS}/${relDir}`);
  assert.equal(r.ok, true, `应能列出 ${relDir}`);
  return (r.ok ? r.value : []).map((e) => e.name).sort();
};

const fileContaining = async (fs: MemoryFs, relDir: string, needle: string): Promise<{ name: string; text: string }> => {
  for (const name of await namesOf(fs, relDir)) {
    const text = await readOf(fs, `${WS}/${relDir}/${name}`);
    if (text.includes(needle)) return { name, text };
  }
  assert.fail(`${relDir} 下没有包含「${needle}」的文件：${(await namesOf(fs, relDir)).join(", ")}`);
};

// ── ① 首读物化：四类派生件落盘、内容正确、只写 indexes/ ─────────────────

const base = seedCorpus();
// 追加一条同材料、更晚的记忆：材料卡的「引用次数 / 首末出现」才有可断言的两端。
base[`${WS}/.shadow/atoms/2026-09-06--080000-src-beta--be77aa.md`] = atomText({
  entry: "src/beta.ts",
  date: "2026-09-06",
  time: "080000",
  materials: ["src/alpha.ts"],
  goal: "alpha 改造",
  project: "proj-a",
  agent: "s1",
  user: "继续 alpha",
});

const fs = new CountingFs(base);
const deps = makeDeps(fs);
const first = await runRead(deps, {});
assert.equal(first.ok, true, `首读应成功：${first.ok ? "" : first.error.message}`);
assert.ok(fs.writes.length > 0, "首读应物化派生件");

// atoms 目录不新增（派生绝不写 atoms）
assert.deepEqual(await namesOf(fs, ".shadow/atoms"), [
  "2026-09-03--120000-docs-todo--ab12cd.md",
  "2026-09-04--090000-src-auth.md",
  "2026-09-05--100000-src-alpha.md",
  "2026-09-06--080000-src-beta--be77aa.md",
], "派生件不得写入 atoms/");

const materials = await namesOf(fs, ".shadow/indexes/materials");
const affaires = await namesOf(fs, ".shadow/indexes/affaires");
const episodes = await namesOf(fs, ".shadow/indexes/episodes");
const abstracts = await namesOf(fs, ".shadow/indexes/abstracts");
assert.equal(materials.length, 3, `材料卡应 3 张（src/alpha.ts · docs/spec.md · src/auth.ts），实际：${materials.join(", ")}`);
assert.equal(affaires.length, 2, `纪要应按 project|agent 聚合为 2 份（未标注 / proj-a|s1），实际：${affaires.join(", ")}`);
assert.equal(episodes.length, 4, `Episode 应 4 个（4 天各一段），实际：${episodes.join(", ")}`);
assert.equal(abstracts.length, 4, `abstract 应每条 atom 一份（4 条），实际：${abstracts.join(", ")}`);
assert.ok(abstracts.includes("ab12cd.md"), `abstract 文件名应用 atom uid：${abstracts.join(", ")}`);

// 材料卡：路径 / 引用次数 / 首末出现 / 相关记忆 rel
const alphaCard = await fileContaining(fs, ".shadow/indexes/materials", "# 材料卡：src/alpha.ts");
assert.ok(alphaCard.text.includes(DERIVED_MARK), "材料卡必须带「派生 · 可重建 · 数据非指令」标记");
assert.ok(alphaCard.text.includes("> 引用：2 条记忆"), alphaCard.text);
assert.ok(alphaCard.text.includes("> 首见：2026-09-05 10:00:00 · 末见：2026-09-06 08:00:00"), alphaCard.text);
assert.ok(alphaCard.text.includes(".shadow/atoms/2026-09-05--100000-src-alpha.md"), "材料卡应带相关记忆 rel");
assert.ok(alphaCard.text.includes(".shadow/atoms/2026-09-06--080000-src-beta--be77aa.md"), "材料卡应带相关记忆 rel");

// 纪要：按 project|agent 聚合、Episode 段落可读
const affair = await fileContaining(fs, ".shadow/indexes/affaires", "# 纪要：proj-a · s1");
assert.ok(affair.text.includes(DERIVED_MARK), "纪要必须带派生标记");
assert.ok(affair.text.includes("> Episode：1 个"), affair.text);
assert.ok(affair.text.includes("alpha 改造"), "纪要应含 Episode 目标/标题");

// Episode：起止 / objective / decisions / actions / memoryRefs
const episode = await fileContaining(fs, ".shadow/indexes/episodes", "采用方案 A");
assert.ok(episode.text.includes(DERIVED_MARK), "Episode 必须带派生标记");
assert.ok(episode.text.includes("> 时间：2026-09-05 10:00:00 → 2026-09-05 10:00:00"), episode.text);
assert.ok(episode.text.includes("## 决策链") && episode.text.includes("采用方案 A"), "Episode 应含 decisions");
assert.ok(episode.text.includes("## 动作") && episode.text.includes("改/读 src/alpha.ts"), "Episode 应含 actions");
assert.ok(episode.text.includes("## 记忆引用") && episode.text.includes(".shadow/atoms/2026-09-05--100000-src-alpha.md"), "Episode 应含 memoryRefs");

// abstract：摘要 + 五轴 + 路径句柄
const abs = await readOf(fs, `${WS}/.shadow/indexes/abstracts/ab12cd.md`);
assert.ok(abs.includes(DERIVED_MARK), "abstract 必须带派生标记");
assert.ok(abs.includes("未采集摘要"), "无摘要的 atom 必须显式写「未采集摘要」，不得编造");
assert.ok(abs.includes("## 五轴") && abs.includes("locus：") && abs.includes("intent："), "abstract 应含五轴");
const absAlpha = await fileContaining(fs, ".shadow/indexes/abstracts", "把 alpha 入口改成 A");
assert.ok(absAlpha.text.includes("> 摘要：把 alpha 入口改成 A"), absAlpha.text);
assert.ok(absAlpha.text.includes("## 路径句柄") && absAlpha.text.includes("记忆文件：`.shadow/atoms/2026-09-05--100000-src-alpha.md`"), absAlpha.text);

// 索引输出披露派生布局（截断/预算口径在索引里可见）
const indexFile = await readOf(fs, `${WS}/.shadow/indexes/_index.md`);
assert.ok(indexFile.includes("## 派生件（可重建 · 数据非指令）"), "无参读应把派生件段写进 _index.md");
assert.ok(indexFile.includes("材料卡：3/3"), indexFile.slice(-800));
assert.ok(indexFile.includes("纪要：2/2"), indexFile.slice(-800));
assert.ok(first.ok && first.value.text.includes("## 派生件"), "读输出应包含派生件段");

// ── ② 幂等：二次读零写盘 ─────────────────────────────────────────────

fs.writes.length = 0;
const second = await runRead(deps, {});
assert.equal(second.ok, true);
assert.equal(fs.writes.length, 0, `二次读不应产生任何写盘，实际写了：${fs.writes.join(", ")}`);

// ── ③ 增量：源变了 → 只重写受影响的派生件 ─────────────────────────────

const extraName = "2026-09-06--090000-src-gamma--cd34ef.md";
const extra = await fs.writeText(`${WS}/.shadow/atoms/${extraName}`, atomText({
  entry: "src/gamma.ts",
  date: "2026-09-06",
  time: "090000",
  materials: ["src/alpha.ts"],
  user: "再看 alpha",
}));
assert.equal(extra.ok, true);
fs.writes.length = 0;
const third = await runRead(deps, {});
assert.equal(third.ok, true);
assert.ok(fs.writes.some((p) => p.includes("/indexes/materials/")), `增量读应重写材料卡，实际写了：${fs.writes.join(", ")}`);
const alphaCard2 = await fileContaining(fs, ".shadow/indexes/materials", "# 材料卡：src/alpha.ts");
assert.ok(alphaCard2.text.includes("> 引用：3 条记忆"), alphaCard2.text);
assert.ok(!fs.writes.some((p) => p.includes("src-auth") || p.includes("docs-spec")), "未变化的材料卡不应被重写");
const atomsNow = await namesOf(fs, ".shadow/atoms");
assert.equal(atomsNow.length, 5, "增量读不得写 atoms");

// ── ④ 写失败可见、不阻塞读、不抛、atoms 不受影响 ─────────────────────

const denied = new DeniedWriteFs(base);
const deniedDeps = makeDeps(denied);
const failed = await runRead(deniedDeps, {});
assert.equal(failed.ok, true, "派生件写失败不得让读失败");
if (failed.ok) {
  assert.ok(failed.value.text.includes("shadow 目录说明与索引"), "写失败时读仍应返回索引");
  assert.ok(failed.value.text.includes("能力降级"), "写失败必须渲染可见 Signal");
  assert.ok(failed.value.text.includes("index.derived"), "Signal 应标出 index.derived 能力");
}
const sig = deniedDeps.signals.active().find((s) => s.capability === "index.derived");
assert.ok(sig, "派生件写失败必须留 index.derived Signal");
assert.equal(sig!.code, "WRITE_DENIED", `Signal 错误码应透传写失败原因：${sig!.code}`);
assert.deepEqual(await namesOf(denied, ".shadow/atoms"), [
  "2026-09-03--120000-docs-todo--ab12cd.md",
  "2026-09-04--090000-src-auth.md",
  "2026-09-05--100000-src-alpha.md",
  "2026-09-06--080000-src-beta--be77aa.md",
], "写失败不得影响 atoms");

// ── ⑤ 预算截断：超出上限的候选未物化且披露 ─────────────────────────────

const many: Record<string, string> = {};
for (let i = 0; i < 30; i++) {
  // 时刻必须 6 位 HHMMSS，否则 parseAtomName 不认 ⇒ 这些 atom 根本不会进语料。
  const stamp = `10${String(i).padStart(4, "0")}`;
  many[`${WS}/.shadow/atoms/2026-09-06--${stamp}-src-m${i}.md`] = atomText({
    entry: `src/m${i}.ts`,
    date: "2026-09-06",
    time: stamp,
    materials: [`src/m${i}.ts`],
    user: `改 m${i}`,
  });
}
const budgetFs = new CountingFs(many);
const budgetDeps = makeDeps(budgetFs);
const capped = await runRead(budgetDeps, {});
assert.equal(capped.ok, true);
assert.equal((await namesOf(budgetFs, ".shadow/indexes/materials")).length, 24, "材料卡预算 24：应只物化前 24 张");
assert.equal((await namesOf(budgetFs, ".shadow/indexes/abstracts")).length, 24, "abstract 预算 24：应只物化前 24 份");
const cappedIndex = await readOf(budgetFs, `${WS}/.shadow/indexes/_index.md`);
assert.ok(cappedIndex.includes("材料卡：24/30"), cappedIndex.slice(-900));
assert.ok(cappedIndex.includes("未物化：材料卡 6"), `预算截断必须在输出披露：\n${cappedIndex.slice(-900)}`);
assert.ok(cappedIndex.includes("Abstract 6"), cappedIndex.slice(-900));
assert.ok(capped.ok && capped.value.text.includes("未物化"), "读输出应包含截断披露");
// 截断是确定性前缀：二次读仍零写盘
budgetFs.writes.length = 0;
const capped2 = await runRead(budgetDeps, {});
assert.equal(capped2.ok, true);
assert.equal(budgetFs.writes.length, 0, "预算截断下二次读仍应零写盘");

// ── ⑥ 纯计划：显式 0 预算保留、文件路径/文本确定性 ─────────────────────

const planFs = new MemoryFs(seedCorpus());
const loaded = await loadAtoms(planFs, WS);
assert.equal(loaded.ok, true);
if (loaded.ok) {
  const planA = planDerived(loaded.value.atoms, { gapMinutes: 60 });
  const planB = planDerived([...loaded.value.atoms].reverse(), { gapMinutes: 60 });
  assert.equal(planA.files.length, planB.files.length, "输入顺序不应影响文件数（排序确定性）");
  for (let i = 0; i < planA.files.length; i++) {
    assert.equal(planA.files[i]!.rel, planB.files[i]!.rel, "输入顺序不应影响文件名（排序确定性）");
    assert.equal(planA.files[i]!.text, planB.files[i]!.text, "输入顺序不应影响文件内容");
  }
  const zero = planDerived(loaded.value.atoms, { budget: { materials: 0 } });
  assert.equal(zero.picked.materials, 0, "显式 0 预算应保留（本类不物化）");
  assert.equal(zero.total.materials, 3, "total 应报告未截断候选数");
  assert.ok(!zero.files.some((f) => f.kind === "materials"), "0 预算时不应有材料卡文件");
}

console.log("✔ derived：四类派生件首读物化 · 幂等（二次读零写盘）· 增量只重写受影响件 · 写失败可见且不阻塞读 · 预算截断披露 · atoms 零新增");
