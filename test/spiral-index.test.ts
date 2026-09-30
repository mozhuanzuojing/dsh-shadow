// dsh-shadow —— 「成长面接进无参入口」回归（ADR-0110 §3）。
//
// 断言的事：`read_shadow` **无参**读的那份 `indexes/_index.md`，必须能**先展开厚处** ——
// 纪要（逐圈加厚）与材料卡（主轴）两段都要在，且**厚处在前**；同时**不动召回面**（本模块不碰 topic 召回）。
// 另有两条边界：缺目录 = 还没有纪要/卡（**不是错误**，不抛）；`*.history/` 归档圈**不进**索引。
import assert from "node:assert/strict";
import { spiralSections } from "../dist/core/view/spiral-index.js";

const files = new Map<string, string>();
const fs = {
  resolve: async (p: string) => p,
  readText: async (p: string) => files.get(p) || "",
  writeText: async (p: string, t: string) => { files.set(p, t); },
  // 只列本目录（不递归）—— 与真 fs 的 listDir 语义一致；子目录（*.history/）不该出现
  listDir: async (dir: string) => [...files.keys()]
    .filter((k) => k.startsWith(`${dir}/`))
    .map((k) => ({ name: k.slice(dir.length + 1) }))
    .filter((e) => !e.name.includes("/")),
};
const minute = (key: string, rings: number) =>
  `# 纪要：${key}\n\n> 类型：纪要（**派生 · 可重建**）\n> key：\`${key}\`\n> 圈数：${rings}\n\n## 圈\n\n` +
  Array.from({ length: rings }, (_, i) => `### 圈 ${i + 1} · 2026-09-30 1${i}:00 · 2 条原子\n\n> 完整线索\n- 决定 第${i + 1}版\n`).join("\n");
const card = (key: string, rings: number, affaires: string) =>
  `# 材料卡：${key}\n\n> key：\`${key}\`\n> 读到的版本：（未记）\n> 重要在哪：${affaires}\n> 圈数：${rings}\n\n## 结论圈\n\n` +
  Array.from({ length: rings }, (_, i) => `### 圈 ${i + 1} · 2026-09-30 1${i}:00 · ws|T7\n- 结论（confirmed）：结论${i + 1}\n- 证据：.shadow/atoms/a${i}.md\n`).join("\n");

// ① 两段都在，且**厚处在前**（圈数多的排前面）
files.set("D:/ws/.shadow/indexes/affaires/ws-T7-aaaa1111.md", minute("ws|T7", 1));
files.set("D:/ws/.shadow/indexes/affaires/ws-T8-bbbb2222.md", minute("ws|T8", 3));
files.set("D:/ws/.shadow/indexes/affaires/ws-T7-aaaa1111.history/1.md", minute("ws|T7", 1));   // 归档圈：不得进索引
files.set("D:/ws/.shadow/indexes/materials/spec-u8-md-cccc3333.md", card("spec/u8.md", 2, "ws|T7"));
const s = await spiralSections(fs, "D:/ws");
assert.ok(s.includes("## 纪要（成长面 · 逐圈加厚）"), "无参索引应有「纪要」段");
assert.ok(s.includes("## 材料卡（主轴 · 它对哪些事重要）"), "无参索引应有「材料卡」段");
const i8 = s.indexOf("ws|T8"), i7 = s.indexOf("ws|T7");
assert.ok(i8 >= 0 && i7 > i8, "厚处在前：3 圈的 ws|T8 应排在 1 圈的 ws|T7 之前");
assert.ok(s.includes("3 圈") && s.includes("2 圈"), "应显示圈数（厚处的量化）");
assert.ok(s.includes("重要在哪：ws|T7"), "材料卡段应带「它对哪些事重要」");
assert.ok(!s.includes(".history/"), "归档圈**不得**进索引（它是历史，不是厚处）");
assert.ok(s.includes("ws-T7-aaaa1111.md"), "应给出可下钻的派生文件指针");
console.log("✔ ① 无参索引先展开厚处：纪要段 + 材料卡段，厚处在前、归档圈不进");

// ② 上限生效（可配）
const small = await spiralSections(fs, "D:/ws", { maxMinutes: 1, maxCards: 1 });
assert.equal((small.match(/^- \*\*/gm) || []).length, 2, "maxMinutes=1 / maxCards=1 ⇒ 两段各 1 行");
console.log("✔ ② 段内条数受上限约束（默认各 5，可配）");

// ③ 缺目录 = 「还没长出来」，不是错误
const empty: any = { resolve: async (p: string) => p, listDir: async () => { throw new Error("FS_NOT_FOUND"); }, readText: async () => "" };
assert.equal(await spiralSections(empty, "D:/ws"), "", "目录不存在 ⇒ 返回空串（不抛、不报错）");
console.log("✔ ③ 缺目录 = 还没长出纪要/卡 ⇒ 空串（不是错误）");
console.log("ALL PASS ✅");
