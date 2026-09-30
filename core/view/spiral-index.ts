// dsh-shadow —— core/view/spiral-index.ts：把「成长面」接进**无参索引**（ADR-0110 §3）。
//
// 为什么需要它：`read_shadow` **无参**读的就是 `indexes/_index.md`（`query/index-budget.ts`），而那份版面
// 原先**只由 atoms 派生** ⇒ 上一波做出来的**纪要**（`indexes/affaires/`）与**材料卡**（`indexes/materials/`）
// 在盘上、人能读，但 **agent 用工具取不到**（写出来了、没接入）。本模块补上这段：无参入口**先展开厚处**。
//
// 边界（写清楚，防后来者顺手扩大）：
//   · 只读 `indexes/affaires/` 与 `indexes/materials/` 两个派生目录的**当前圈**文件（`*.history/` 是归档，不进索引）；
//   · **不改召回面**：`recall_shadow(topic)` 的候选集与排序**一行不动**（这是刻意选择 —— 未 `confirmed` 的候选圈
//     不该掺进召回；要纳入是另一个决策）；
//   · 纯派生视图：读不出就当没有（缺目录 = 还没长出纪要，**不是错误**）。
import { readRel } from "../../persistence/files.js";
import { indexesRel } from "../paths.js";

const ringCountOf = (t: string): number => (String(t || "").match(/^### 圈 /gm) || []).length;
const lastRingOf = (t: string): string =>
  (String(t || "").match(/^### 圈 \d+ · [^·]*/gm) || []).pop()?.replace(/^### 圈 /, "圈 ") ?? "";
const fieldOf = (t: string, name: string): string =>
  (String(t || "").match(new RegExp(`^>\\s*${name}：(.+)$`, "m")) || [])[1]?.trim() ?? "";

interface Item { file: string; title: string; rings: number; last: string; note: string }

/** 扫一个派生目录的**当前圈**文件（`listDir` 不递归 ⇒ `*.history/` 天然不进）。 */
const collect = async (fs: any, ws: string, sub: string, noteOf: (text: string) => string): Promise<Item[]> => {
  const out: Item[] = [];
  let names: string[] = [];
  try {
    const root = await fs.resolve(`${ws}/${indexesRel(sub)}`, { cwd: ws });
    const entries = await fs.listDir(root);
    names = (entries || []).map((e: any) => e?.name).filter((n: string) => typeof n === "string" && n.endsWith(".md"));
  } catch {
    return out; // 目录不存在 = 还没长出东西，不是错误
  }
  for (const file of names) {
    const text = await readRel(fs, ws, indexesRel(`${sub}/${file}`));
    if (!text) continue;
    const title = (text.match(/^#\s*[^：]*：(.*)$/m) || [])[1]?.trim() || fieldOf(text, "key") || file.replace(/\.md$/, "");
    out.push({ file: `${sub}/${file}`, title, rings: ringCountOf(text), last: lastRingOf(text), note: noteOf(text) });
  }
  // 「厚处先」：圈数多的在前；同圈数按最后一次圈的描述排（字符串比较足够稳定）
  return out.sort((a, b) => b.rings - a.rings || b.last.localeCompare(a.last));
};

/**
 * 生成「纪要 + 材料卡」两段（拼在 `_index.md` 里）。**读不出就返回空串**（缺目录/空目录都算「还没长出来」）。
 * 排在**原子列表之前**读，是为了让「先看厚处、再下钻原子」这条读法自然成立。
 */
export const spiralSections = async (fs: any, ws: string, opts: { maxMinutes?: number; maxCards?: number } = {}): Promise<string> => {
  if (!fs || !ws) return "";
  const maxM = Math.max(0, opts.maxMinutes ?? 5);
  const maxC = Math.max(0, opts.maxCards ?? 5);
  const minutes = await collect(fs, ws, "affaires", (t) => fieldOf(t, "key"));
  const cards = await collect(fs, ws, "materials", (t) => fieldOf(t, "重要在哪"));
  const parts: string[] = [];
  if (maxM && minutes.length) {
    parts.push("", "## 纪要（成长面 · 逐圈加厚）—— 先看厚处");
    for (const m of minutes.slice(0, maxM)) {
      parts.push(`- **${m.title}** · ${m.rings} 圈${m.last ? ` · 最后 ${m.last.replace(/^圈 /, "圈 ")}` : ""} · \`${m.file}\``);
    }
    parts.push("（纪要是**派生视图**，原文仍是 `atoms/`；要下钻用 `read_shadow({topic})`）");
  }
  if (maxC && cards.length) {
    parts.push("", "## 材料卡（主轴 · 它对哪些事重要）");
    for (const c of cards.slice(0, maxC)) {
      parts.push(`- **${c.title}** · ${c.rings} 圈${c.note ? ` · 重要在哪：${c.note}` : ""} · \`${c.file}\``);
    }
    parts.push("（材料卡只登记**被引用过的事实**；未 `confirmed` 的圈不进「重要在哪」）");
  }
  return parts.length ? `${parts.join("\n")}\n` : "";
};
