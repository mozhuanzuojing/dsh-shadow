/**
 * dsh-shadow —— 线级遗忘/保留（ADR-0026 长期运行收口）。
 *
 * 冷线（最后点早于 N 天）整条移入 .shadow/.trash/lines-forgotten-<ts>；读路径只读 .shadow/lines，
 * 移走后不再加载 → bound 读规模。默认 dry-run；--apply 才移动（不裸删、可回退）。
 *
 *   node tools/forget-lines.ts --ws=D:/project/dsh1 --older-than-days=14          # dry-run
 *   node tools/forget-lines.ts --ws=D:/project/dsh1 --older-than-days=14 --apply
 */
import { resolve, join } from "node:path";
import { realFs } from "../dist/store/fs.js";
import { forgetColdLines } from "../dist/engine/lines.js";

const argOf = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const WS = resolve(argOf("ws") ?? join(process.cwd(), ".."));
const days = Number(argOf("older-than-days") ?? "14");
const apply = process.argv.includes("--apply");

const main = async (): Promise<void> => {
  if (!Number.isFinite(days) || days < 0) {
    console.log("[forget-lines] --older-than-days 必须是非负数");
    process.exitCode = 2;
    return;
  }
  const r = await forgetColdLines(realFs, WS, days, { apply });
  console.log(`[forget-lines] ws=${WS} · older-than=${days}d · cutoff=${r.cutoff}`);
  console.log(`[forget-lines] 冷线 ${r.candidates.length} 条：${r.candidates.slice(0, 8).join("、")}${r.candidates.length > 8 ? "…" : ""}`);
  if (!apply) {
    console.log(`[forget-lines] ✅ dry-run（未移动）。加 --apply 才会把冷线移入 .shadow/.trash。`);
    return;
  }
  console.log(`[forget-lines] ✅ 已移入 trash ${r.moved}/${r.candidates.length} 条冷线。回退：把 .trash/lines-forgotten-*/*.md 移回 .shadow/lines。`);
};

main().catch((e) => {
  console.error(`[forget-lines] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
