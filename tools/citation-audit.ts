/**
 * dsh-shadow —— tools/citation-audit.ts：`文件:行号` 越界门的 CLI（判据在 `citation-audit.lib.ts`）。
 *
 * 用法：
 *   node tools/citation-audit.ts [根目录]              # 默认 `.`
 *   node tools/citation-audit.ts . --verbose           # 连「未判定」也逐条列出（默认只打个数）
 *   node tools/citation-audit.ts . --include-archive   # 外加**归档层度量**（只报不判，不改退出码）
 *
 * `--include-archive` 量 `CHANGELOG.md` + **全部** ADR（含冻结），回答「归档层现在有多少**越界**」——
 * 这是本仓此前**没有工具能回答**的问题（门按设计把归档层排除在外）。
 * 归档层行号是「**当时**」语义 ⇒ **只报不判**（不据此报红）；判据与那个门**共用同一份 `judge`**。
 *
 * 它同时是 `audit:docs` 的检查 ⑥ —— 独立跑是为了在**改完文档**之后不必等整条 `verify`。
 */
import { checkArchiveCitations, checkCitations } from "./citation-audit.lib.ts";

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--")) ?? ".";
const verbose = args.includes("--verbose");
const includeArchive = args.includes("--include-archive");

const r = checkCitations(root, { verbose });
for (const l of r.lines) console.log(l);

// 归档层**只报不判**：它的读数不参与退出码。唯一例外是「缺件不静默」——
// 当前态门通过、而归档层文档一个都没有 ⇒ 报结构缺失(2)，不当成「通过」。
let archiveCode = 0;
if (includeArchive) {
  console.log("");
  const a = checkArchiveCitations(root, { verbose });
  for (const l of a.lines) console.log(l);
  archiveCode = a.code === 2 ? 2 : 0;
}

process.exit(r.code !== 0 ? r.code : archiveCode);
