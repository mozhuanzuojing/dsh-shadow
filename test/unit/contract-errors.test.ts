import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { writeAtom } from "../../dist/store/atoms.js";
import { queryView, decisionView, factsView } from "../../dist/engine/read/modes.js";
import { conflictRels } from "../../dist/engine/read/modes.js";
import { supersededBy } from "../../dist/engine/read/recall.js";
import { renderAtomEntry } from "../../dist/engine/read/render.js";
import { correctAtom, withdrawCorrection } from "../../dist/engine/write/adjudicate.js";
import type { ReadDeps } from "../../dist/engine/read/types.js";

const WS = "/ws";
const clock = fixedClock("2026-10-31T12:00:00");
const fs = new MemoryFs();
const deps: ReadDeps = {
  fs,
  ws: WS,
  config: normalizeConfig({}),
  clock,
  signals: new SignalStore(),
  meta: new Map(),
  limit: 5,
  verify: async (p) => (p.includes("missing") ? "stale" : "validated"),
};

const text = (entry: string, date: string, body: string): string =>
  `# ${entry}\n\n> 完整线索\n> 坐标：locus(${WS}) · when(${date} 10:00:00) · soul(default) · role(default) · intent(test)\n${body}`;

const write = async (entry: string, date: string, time: string, uid: string, body: string) => {
  const r = await writeAtom(fs, WS, { entry, date, time, uid, text: text(entry, date, body) }, clock);
  if (!r.ok) throw new Error(r.error.message);
  return r.value;
};

// 1) 假理由：Atom 有决策但没有“决策理由”；读侧只能显示未明确，不能补写。
const fakeReason = await write(
  "src/fake-reason.ts",
  "2026-10-29",
  "100000",
  "fr0001",
  "> 摘要：做了决定\n\n- [10:00:00] [src/fake-reason.ts] 决定 采用方案 A\n",
);
const dv = decisionView([fakeReason.atom], { topic: "" });
assert.match(dv.body, /未明确/, "无明确理由必须显示未明确");
assert.doesNotMatch(dv.body, /因为/, "不得编造“因为…”理由");

// 2) 错路径：材料路径失效 → conflictRels 标 stale（不是静默成功）。
const wrongPath = await write(
  "src/wrong-path.ts",
  "2026-10-29",
  "100001",
  "wp0001",
  "> 摘要：错误路径\n> 背景/材料：missing/config.json\n\n- [10:00:00] [src/wrong-path.ts] 改/读 missing/config.json\n",
);
const conflicts = await conflictRels(deps, [wrongPath.atom]);
assert.equal(conflicts.has(wrongPath.atom.rel), true, "失效材料必须被标 stale");
const staleView = queryView(deps, [wrongPath.atom], { topic: "错误路径", limit: 5 });
assert.match(staleView.body, /可能过时|stale|证据/, "输出必须提示证据问题");

// 3) 旧版本：同 entry 新 Atom 必须让旧项可见地指向新项；纠正/撤回可定位。
const oldV = await write("src/version.ts", "2026-10-29", "100002", "v00001", "> 摘要：old version\n\n- [10:00:00] [src/version.ts] 决定 old\n");
const newV = await write("src/version.ts", "2026-10-30", "100003", "v00002", "> 摘要：new version\n\n- [10:00:00] [src/version.ts] 决定 new\n");
const map = supersededBy([oldV.atom, newV.atom]);
assert.equal(map.get(oldV.atom.rel), newV.atom.rel, "旧版本必须指向新版本");
assert.match(renderAtomEntry(oldV.atom, 1, [], "old", map.get(oldV.atom.rel)), /⚠被取代→/, "旧版本必须标注");
const corr = await correctAtom(fs, WS, clock, oldV.atom.rel, "旧版本已纠正");
if (!corr.ok) throw new Error(corr.error.message);
const withdrew = await withdrawCorrection(fs, WS, clock, corr.value.rel, "撤回");
assert.equal(withdrew.ok, true, "纠正/撤回必须可定位、可撤回");

// 4) 无证据断言：用户原话里的路径不可验证 → facts 显示 not_found，不显示 verified。
const noEvidence = await write(
  "src/no-evidence.ts",
  "2026-10-29",
  "100004",
  "ne0001",
  "> 摘要：无证据断言\n\n- [10:00:00] [src/no-evidence.ts] 用户：配置是 missing/conf.json\n",
);
const facts = await factsView(deps, [noEvidence.atom], "");
assert.match(facts, /not_found/, "缺证据必须显示 not_found");
assert.doesNotMatch(facts, /✓ verified/, "缺证据不得显示 verified");

// 5) 伪造历史：查一个从未发生过的主题，必须明确“无匹配”，不能生成过去。
const fakeHistory = queryView(deps, [oldV.atom, newV.atom, fakeReason.atom], { topic: "从未发生过的主题 zzz", limit: 5 });
assert.match(fakeHistory.body, /无匹配|无记录/, "不存在的历史必须返回无匹配");

console.log("✔ contract-errors：假理由/错路径/旧版本/无证据/伪造历史 五类均可见、可定位、可撤回");
