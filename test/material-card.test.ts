// dsh-shadow —— 材料卡回归（adr/0110 §2.3/§2.4/§2.5）：key 规范化 · 平衡三律 · 确认闸 · 并卡 · 写侧落盘。
//
// 为什么单独一个用例：材料卡是「螺旋」的主轴，四条判据（新证据 / 不矛盾 / 可回退 / 未确认不改写进化层）
// 都必须是**可测的机器判据**，不是散文。
import assert from "node:assert/strict";
import {
  applyEvidence, emptyCard, materialFileName, mergeCards, normalizeMaterialKey, parseCard, renderCard,
} from "../dist/core/materials/card.js";
import { recordMaterials } from "../dist/core/materials/store.js";

// ── ① key 规范化（唯一实现）：同一份材料的不同写法必须收敛成同一个 key ──────────────────
assert.equal(normalizeMaterialKey("C:\\Proj\\Doc\\Readme.MD"), "c:/proj/doc/readme.md", "反斜杠/盘符/大小写应归一");
assert.equal(normalizeMaterialKey("c:/proj/doc/readme.md/"), "c:/proj/doc/readme.md", "尾斜杠应去掉");
assert.equal(normalizeMaterialKey("c://proj//doc//readme.md"), "c:/proj/doc/readme.md", "重复斜杠应折叠");
assert.equal(normalizeMaterialKey("DOI: 10.1000/XYZ"), "doi:10.1000/xyz", "非路径类：doi 前缀 + 空白 + 小写归一");
assert.equal(normalizeMaterialKey("  arXiv:2502.04801  "), "arxiv:2502.04801", "非路径类：首尾空白去掉");
assert.notEqual(materialFileName("c:/a/x.md"), materialFileName("c:/b/x.md"), "不同 key（同尾名）不得撞文件名");
console.log("✔ ① key 规范化：路径/非路径两类各自收敛，不同 key 不撞文件名");

// ── ② 律 1（新证据）：既无新结论也无新证据 ⇒ 不写 ─────────────────────────────────────
const A1 = ".shadow/atoms/2026-09-30--100000-a.md";
const A2 = ".shadow/atoms/2026-09-30--110000-a.md";
let card = emptyCard("c:/doc/x.md", "C:/Doc/X.md");
const p1 = applyEvidence(card, { affaire: "ws|T1", atomRel: A1, at: "2026-09-30 100000", decisions: ["采用方案甲"], confirmed: true });
assert.ok(p1.ok && p1.changed, "首条证据应开圈");
card = p1.card;
const again = applyEvidence(card, { affaire: "ws|T1", atomRel: A1, at: "2026-09-30 100000", decisions: ["采用方案甲"], confirmed: true });
assert.ok(!again.ok && again.reason.startsWith("no-new-evidence"), "重复的同一条结论+证据 ⇒ 不写（律 1）");
console.log("✔ ② 律 1：无新证据不写（不无脑追加）");

// ── ③ 律 3（可回退）：开新圈必须交出上一圈快照 ────────────────────────────────────────
const p2 = applyEvidence(card, { affaire: "ws|T1", atomRel: A2, at: "2026-09-30 110000", decisions: ["改用方案乙"], confirmed: true });
assert.ok(p2.ok && p2.history && p2.history.includes("采用方案甲"), "开新圈应带上一圈快照（落 history/<圈号>.md）");
assert.ok(p2.card.rings.length === 2 && p2.card.rings[0].statement === "采用方案甲", "旧圈必须保留（成长可回退）");
console.log("✔ ③ 律 3：开圈留归档圈快照，旧圈不丢");

// ── ④ 律 2（不矛盾）：冲突显式可见，且不删旧圈 ────────────────────────────────────────
const p3 = applyEvidence(p2.card, { affaire: "ws|T2", atomRel: ".shadow/atoms/2026-09-30--120000-a.md", at: "2026-09-30 120000", decisions: ["回到方案甲"], confirmed: true, contradicts: [2] });
const text3 = renderCard(p3.card);
assert.ok(text3.includes("> 矛盾：本圈与圈 2"), "声明冲突必须渲染成 `> 矛盾：` 行（不静默覆盖）");
assert.ok(text3.includes("改用方案乙") && text3.includes("回到方案甲"), "冲突双方都要在卡上（两圈都保留）");
console.log("✔ ④ 律 2：冲突可见、双方保留（不静默覆盖）");

// ── ⑤ 确认闸（§2.5）：未 confirmed 的结论不进「重要在哪」 ─────────────────────────────
const cand = applyEvidence(emptyCard("c:/doc/y.md"), { affaire: "ws|T9", atomRel: A1, at: "2026-09-30 100000", decisions: ["（agent 自己的结论）"], confirmed: false });
assert.equal(cand.card.affaires.length, 0, "未 confirmed ⇒ 不得进「它对哪些事重要」（进化层只接受确认过的结论）");
assert.equal(cand.card.rings[0].status, "candidate", "未 confirmed ⇒ 圈标 candidate");
const conf = applyEvidence(emptyCard("c:/doc/z.md"), { affaire: "ws|T9", atomRel: A1, at: "2026-09-30 100000", decisions: ["（用户拍板的结论）"], confirmed: true });
assert.deepEqual(conf.card.affaires, ["ws|T9"], "confirmed ⇒ 进「重要在哪」");
console.log("✔ ⑤ 确认闸：未 confirmed 只作候选、不改写进化层视图");

// ── ⑥ 序列化往返 + 并卡（证据一条不丢） ──────────────────────────────────────────────
const round = parseCard(renderCard(p3.card), "c:/doc/x.md");
assert.equal(round.rings.length, 3, "渲染→解析应保住全部圈");
assert.deepEqual(round.rings[2].contradicts, [2], "矛盾声明应往返保住");
const merged = mergeCards(round, card, "2026-09-30 130000");
assert.equal(merged.rings.length, round.rings.length + card.rings.length, "并卡后圈数应相加");
assert.ok(merged.rings.some((r) => r.statement.includes("并卡自")), "被并入的圈应标注来源 key");
assert.ok(merged.rings.every((r) => r.evidence.length >= 1), "并卡不得丢证据");
console.log("✔ ⑥ 序列化往返 + 并卡：圈数与证据都不丢");

// ── ⑦ 写侧落盘：卡落 indexes/（派生位），开新圈落归档圈 ────────────────────────────────
const files = new Map<string, string>();
const fs = {
  resolve: async (p: string) => p,
  writeText: async (p: string, t: string) => { files.set(p, t); },
  readText: async (p: string) => files.get(p) || "",
};
const base = { affaire: "ws|T7", at: "2026-09-30 140000", confirmed: true };
const r1 = await recordMaterials(fs, "D:/ws", [{ raw: "spec/u8.md", input: { ...base, atomRel: A1, decisions: ["按 U8 口径实现"] } }]);
assert.ok(r1[0].wrote, "首次登记应写卡");
const cardKeys = [...files.keys()].filter((k) => k.includes("/.shadow/indexes/materials/"));
assert.ok(cardKeys.length === 1 && cardKeys[0].endsWith(".md"), "卡必须落在 indexes/materials/ 下（派生位，不占 source）");
assert.ok(![...files.keys()].some((k) => k.includes("/.shadow/materials/")), "**不得**落在 .shadow/materials/（那是 source 位）");
const r2 = await recordMaterials(fs, "D:/ws", [{ raw: "spec/u8.md", input: { ...base, at: "2026-09-30 150000", atomRel: A2, decisions: ["换成 U8 新口径"] } }]);
assert.ok(r2[0].wrote, "新结论应开新圈");
const histKeys = [...files.keys()].filter((k) => k.includes(".history/"));
assert.equal(histKeys.length, 1, "开新圈应落**恰好一份**归档圈（只追加、永不改写）");
assert.ok(files.get(histKeys[0])!.includes("按 U8 口径实现"), "归档圈应是**上一圈**的快照");
const r3 = await recordMaterials(fs, "D:/ws", [{ raw: "spec/u8.md", input: { ...base, at: "2026-09-30 150000", atomRel: A2, decisions: ["换成 U8 新口径"] } }]);
assert.ok(!r3[0].wrote, "重复证据 + 重复结论 ⇒ 不写（律 1，且是**同一份**卡文件的判定）");
console.log("✔ ⑦ 写侧落盘：卡在 indexes/materials/（派生位）、归档圈只追加、律 1 生效");

// ── ⑧ 源指纹（§2.3 第四项）：版本变了但结论没变 ⇒ 只刷新卡，**不开新圈、不留归档圈** ─────────────
const ringsBefore = (files.get(cardKeys[0])!.match(/^### 圈 /gm) || []).length;
const histBefore = [...files.keys()].filter((k) => k.includes(".history/")).length;
const r4 = await recordMaterials(fs, "D:/ws",
  [{ raw: "spec/u8.md", input: { ...base, at: "2026-09-30 150000", atomRel: A2, decisions: ["换成 U8 新口径"] } }],
  { sourceVersionOf: async () => "sha256:abc123" });
assert.ok(r4[0].wrote && r4[0].reason.startsWith("version-refresh"), "版本变化应刷新卡（reason=version-refresh）");
assert.ok(files.get(cardKeys[0])!.includes("sha256:abc123"), "卡上应记下新版本（读到第几版）");
assert.equal((files.get(cardKeys[0])!.match(/^### 圈 /gm) || []).length, ringsBefore, "版本刷新**不得**开新圈");
assert.equal([...files.keys()].filter((k) => k.includes(".history/")).length, histBefore, "版本刷新**不得**产生归档圈");
console.log("✔ ⑧ 源指纹：版本变化只刷新卡，不开圈、不留归档（结论未变不算新结论）");
console.log("ALL PASS ✅");
