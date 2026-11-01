import assert from "node:assert/strict";
import { normalizeConfig } from "../../dist/contract/config.js";
import { fixedClock } from "../../dist/contract/time.js";
import { MemoryFs } from "../../dist/store/fs.js";
import { writeAtom, loadAtoms } from "../../dist/store/atoms.js";
import { archiveDays, loadAllAtoms } from "../../dist/store/archive.js";
import { correctAtom, withdrawCorrection, restoreAtom } from "../../dist/engine/write/adjudicate.js";
import { supersededBy } from "../../dist/engine/read/recall.js";
import { renderAtomEntry } from "../../dist/engine/read/render.js";
import { queryView } from "../../dist/engine/read/modes.js";

const WS = "/ws";
const clock = fixedClock("2026-10-31T12:00:00");
const fs = new MemoryFs();
const text = (entry: string, body: string): string =>
  `# ${entry}\n\n> 完整线索\n> 坐标：locus(${WS}) · when(2026-10-29 10:00:00) · soul(default) · role(default) · intent(test)\n> 摘要：${body}\n\n- [10:00:00] [${entry}] 用户：${body}\n`;

const old = await writeAtom(fs, WS, { entry: "src/alpha.ts", date: "2026-10-29", time: "100000", uid: "old001", text: text("src/alpha.ts", "alpha old") }, clock);
if (!old.ok) throw new Error(old.error.message);

const corr = await correctAtom(fs, WS, clock, old.value.rel, "用户纠正：alpha 已改名");
if (!corr.ok) throw new Error(corr.error.message);
assert.equal(corr.ok, true);

const all = await loadAllAtoms(fs, WS);
if (!all.ok) throw new Error(all.error.message);
const corrAtom = all.value.atoms.find((a) => a.rel === corr.value.rel);
assert.equal(corrAtom?.corrects, old.value.rel, "correction Atom 必须解析出 corrects");

const map = supersededBy(all.value.atoms);
assert.equal(map.get(old.value.rel), corr.value.rel, "旧 Atom 必须可见地指向纠正记录");
const rendered = renderAtomEntry(old.value.atom, 5, [], "alpha", map.get(old.value.rel));
assert.match(rendered, /⚠被取代→/, "召回渲染必须标注被取代关系");

const q = queryView(
  {
    fs,
    ws: WS,
    config: normalizeConfig({}),
    clock,
    signals: { note() {}, clear() {} } as any,
    meta: new Map(),
    limit: 5,
  },
  [old.value.atom, corrAtom!],
  { topic: "alpha", limit: 5 },
);
assert.match(q.body, /⚠被取代→/, "shadow_query 型输出也必须标注冲突");

const withdrew = await withdrawCorrection(fs, WS, clock, corr.value.rel, "撤回纠正");
if (!withdrew.ok) throw new Error(withdrew.error.message);
assert.equal(withdrew.ok, true);
const all2 = await loadAllAtoms(fs, WS);
if (!all2.ok) throw new Error(all2.error.message);
const map2 = supersededBy(all2.value.atoms);
assert.equal(map2.get(old.value.rel), undefined, "撤回后纠正不再生效");

// 归档后从 archive 恢复；旧 Atom 的 body 必须原样回来。
const ar = await archiveDays(fs, WS, all2.value.atoms.filter((a) => a.date === "2026-10-29"), "2026-10-31", { deleteHot: true });
assert.equal(ar.errors.length, 0);
assert.equal(await fs.exists(`${WS}/${old.value.rel}`), false, "归档后热文件应移走");
const restored = await restoreAtom(fs, WS, old.value.rel);
if (!restored.ok) throw new Error(restored.error.message);
assert.equal(restored.ok, true);
const hot = await loadAtoms(fs, WS);
if (!hot.ok) throw new Error(hot.error.message);
assert.ok(hot.value.atoms.some((a) => a.rel === old.value.rel && a.body.includes("alpha old")), "restore 必须从 archive/trash 原样恢复");

console.log("✔ adjudicate：correct 追加纠正、supersededBy 可见标注、withdraw 撤销、restore 从 archive 恢复");
