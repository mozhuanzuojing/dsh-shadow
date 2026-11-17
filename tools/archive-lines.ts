/**
 * dsh-shadow —— 线级归档（冷但仍可读）。
 *
 * 把冷线从 hot `.shadow/lines` 移到 `.shadow/archive/lines`（loadLines 仍会读 archive → 冷线仍可查）。
 * 与 forget-lines 不同：归档不离开读路径，只是把热目录缩小；真要移出读用 forget-lines。
 *
 *   node tools/archive-lines.ts --ws=D:/project/dsh1 --older-than-days=14          # dry-run
 *   node tools/archive-lines.ts --ws=D:/project/dsh1 --older-than-days=14 --apply
 */
import { resolve, join } from "node:path";
import { realFs } from "../dist/store/fs.js";
import { archiveColdLines } from "../dist/engine/lines.js";

const argOf = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const WS = resolve(argOf("ws") ?? join(process.cwd(), ".."));
const days = Number(argOf("older-than-days") ?? "14");
const apply = process.argv.includes("--apply");

const main = async (): Promise<void> => {
  if (!Number.isFinite(days) || days < 0) {
    console.log("[archive-lines] --older-than-days 必须是非负数");
    process.exitCode = 2;
    return;
  }
  const r = await archiveColdLines(realFs, WS, days, { apply });
  console.log(`[archive-lines] ws=${WS} · older-than=${days}d · cutoff=${r.cutoff}`);
  console.log(`[archive-lines] 冷线 ${r.candidates.length} 条：${r.candidates.slice(0, 8).join("、")}${r.candidates.length > 8 ? "…" : ""}`);
  if (!apply) {
    console.log(`[archive-lines] ✅ dry-run（未移动）。加 --apply 才会移入 .shadow/archive/lines（仍可读）。`);
    return;
  }
  console.log(`[archive-lines] ✅ 已归档 ${r.moved}/${r.candidates.length} 条冷线到 .shadow/archive/lines（仍可读）。`);
};

main().catch((e) => {
  console.error(`[archive-lines] 失败：${e instanceof Error ? e.message : String(e)}`);
  process.exitCode = 1;
});
