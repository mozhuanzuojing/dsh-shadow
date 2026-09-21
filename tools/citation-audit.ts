/**
 * dsh-shadow —— tools/citation-audit.ts：`文件:行号` 越界门的 CLI（判据在 `citation-audit.lib.ts`）。
 *
 * 用法：
 *   node tools/citation-audit.ts [根目录]        # 默认 `.`
 *   node tools/citation-audit.ts . --verbose     # 连「未判定」也逐条列出（默认只打个数）
 *
 * 它同时是 `audit:docs` 的检查 ⑥ —— 独立跑是为了在**改完文档**之后不必等整条 `verify`。
 */
import { checkCitations } from "./citation-audit.lib.ts";

const args = process.argv.slice(2);
const root = args.find((a) => !a.startsWith("--")) ?? ".";
const verbose = args.includes("--verbose");

const r = checkCitations(root, { verbose });
for (const l of r.lines) console.log(l);
process.exit(r.code);
