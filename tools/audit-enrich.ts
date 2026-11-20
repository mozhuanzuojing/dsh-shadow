/**
 * v3 ops — 存量「补采集」审计（只读）：量出历史 atom 的 reason/材料/信息缺口。
 *   node tools/audit-enrich.ts --ws <workspace>
 * 只报告，不改数据；用于决定是否/如何回填。
 */
import { realFs } from "../dist/store/fs.js";
import { loadAtomsFromLinesCached } from "../dist/engine/lines.js";

const args = process.argv.slice(2);
let ws = "";
for (let i = 0; i < args.length; i++) if (args[i] === "--ws") ws = args[++i] ?? ""; else if (!args[i]!.startsWith("--") && !ws) ws = args[i]!;
ws = ws || process.env.SHADOW_WS || "";
if (!ws) { console.error("用法: node tools/audit-enrich.ts --ws <workspace>"); process.exit(2); }

const r = await loadAtomsFromLinesCached(realFs, ws);
const atoms = r.atoms;
const withDec = atoms.filter((a) => (a.decisions?.length ?? 0) > 0 || (a.decisionEvents?.length ?? 0) > 0);
const withReason = withDec.filter((a) => (a.decisionEvents ?? []).some((e) => (e.reason ?? "").trim()));
const withMat = atoms.filter((a) => (a.materials?.length ?? 0) > 0);
const withInfo = atoms.filter((a) => (a.info?.length ?? 0) > 0);
const pct = (n: number, d: number): string => d ? `${((n / d) * 100).toFixed(1)}%` : "—";

console.log(`[audit-enrich] ws=${ws} · atoms=${atoms.length}`);
console.log(`- 有决策 atom: ${withDec.length} (${pct(withDec.length, atoms.length)})`);
console.log(`- 决策带 reason: ${withReason.length}/${withDec.length} (${pct(withReason.length, withDec.length)})`);
console.log(`- 有材料 atom: ${withMat.length} (${pct(withMat.length, atoms.length)}) · 有信息 atom: ${withInfo.length} (${pct(withInfo.length, atoms.length)})`);
const missReason = withDec.filter((a) => !(a.decisionEvents ?? []).some((e) => (e.reason ?? "").trim())).slice(0, 5).map((a) => a.rel);
const missMat = withDec.filter((a) => (a.materials?.length ?? 0) === 0).slice(0, 5).map((a) => a.rel);
console.log("- 待回填 reason（例）:", missReason.length ? missReason : "（无）");
console.log("- 待回填 materials（例）:", missMat.length ? missMat : "（无）");
console.log("> 只读审计；回填需另立工具并做备份/可回滚。");
