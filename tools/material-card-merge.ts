// dsh-shadow —— tools/material-card-merge.ts：**并卡**（人工收口动作）。
//
// 为什么是一个工具而不是产品面的一块 API（`adr/0110` §2.0 的代价那段）：
//   `normalizeMaterialKey` 是唯一实现，但**历史留下的旧 key 仍可能裂成两张卡**；并卡需要人判断
//   「这两张确实是同一份材料」⇒ 它**天然没有自动触发点**。产品面挂一个零调用点的接口只会被接线门
//   记成「导出但无调用点」（同 `adr/0106` 补记二对 `writeRoleCard` 的处置）；做成工具则**真的可用**。
//
// 用法：node tools/material-card-merge.ts <工作区根> <保留的 key 或原始引用> <被并入的 key 或原始引用>
//   例：node tools/material-card-merge.ts D:\project\dsh1 "spec/u8.md" "spec\\u8.md"
// 退出码：0 = 成功（含「被并入的卡不存在 ⇒ 什么都没做」）；2 = 参数不足。
//
// ⚠ 只动 `indexes/materials/`（**派生层**）：旧卡整份挪进 `indexes/materials/_merged/`，**证据不删**。
import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from "node:fs";
import { dirname, join } from "node:path";
import { mergeCards, normalizeMaterialKey, parseCard, renderCard, materialFileName } from "../dist/core/materials/card.js";
import { SHADOW_ROOT, INDEXES_DIR } from "../dist/core/paths.js";

const [ws, toRaw, fromRaw] = process.argv.slice(2);
if (!ws || !toRaw || !fromRaw) {
  console.error("用法：node tools/material-card-merge.ts <工作区根> <保留的 key 或原始引用> <被并入的 key 或原始引用>");
  process.exit(2);
}
const at = new Date().toISOString().slice(0, 16).replace("T", " ");
const toKey = normalizeMaterialKey(toRaw);
const fromKey = normalizeMaterialKey(fromRaw);
const dir = join(ws, SHADOW_ROOT, INDEXES_DIR, "materials");
const fileOf = (key: string): string => join(dir, materialFileName(key));
const read = (key: string): string => (existsSync(fileOf(key)) ? readFileSync(fileOf(key), "utf8") : "");

const toText = read(toKey);
const fromText = read(fromKey);
if (!fromText) {
  console.log(`被并入的卡不存在：${fromKey}（${fileOf(fromKey)}）⇒ 什么都没做`);
  process.exit(0);
}
const to = toText ? parseCard(toText, toKey) : parseCard(renderCard({ key: toKey, source: toRaw, version: "", affaires: [], rings: [] }), toKey);
const from = parseCard(fromText, fromKey);
const next = mergeCards(to, from, at);

mkdirSync(dir, { recursive: true });
if (to.rings.length) {
  const hdir = join(dir, `${materialFileName(toKey).replace(/\.md$/, "")}.history`);
  mkdirSync(hdir, { recursive: true });
  writeFileSync(join(hdir, `${to.rings[to.rings.length - 1].ring}.md`), renderCard(to), "utf8");
}
writeFileSync(fileOf(toKey), renderCard(next), "utf8");
const mergedDir = join(dir, "_merged");
mkdirSync(mergedDir, { recursive: true });
renameSync(fileOf(fromKey), join(mergedDir, materialFileName(fromKey)));
console.log(`✔ 并卡：${fromKey}（${from.rings.length} 圈）→ ${toKey}（现 ${next.rings.length} 圈）`);
console.log(`  旧卡已挪：${join(mergedDir, materialFileName(fromKey))}（证据未删）`);
if (!toText) console.log("  ⚠ 目标卡原先不存在：已用被并入的圈新建");
