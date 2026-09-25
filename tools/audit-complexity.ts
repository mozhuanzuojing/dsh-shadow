// dsh-shadow —— tools/audit-complexity.ts：**复杂度预算门** CLI（`T13` 后半，`v1.21.29`）。
//
// 判据全在 `tools/audit-complexity.lib.ts`（纯函数）；本文件只做**遍历 + 落盘 + 退出码**。
// 设计口径与边界（含「为什么不用 AST」「为什么不扫 test/ 与 tools/」）见 `adr/0109`。
//
// 用法：node tools/audit-complexity.ts [仓库根] [--ratchet|--update-ratchet]
// 退出码：0 = 通过（或已重录基线）；1 = 违规（超上限 / 热点上涨）；2 = 结构缺失（根不对 / 语料骤降 / 无基线）
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { hardCapVerdict, hotspotVerdict, scanHealthVerdict, type FileMetric } from "./audit-complexity.lib.ts";
import { stableStringify } from "./retrieval-eval.lib.ts";

const here = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(here, "audit-complexity.baseline.json");

/** **协议常量**（与判据一起冻结在基线文件里；改它＝改数据并被 diff 审阅）。 */
const HARD_CAP = 800;
const HOTSPOT_THRESHOLD = 300;

/** 不扫的目录：`test/` 与 `tools/` 是**明确排除**（见 `adr/0109` §范围），其余是构建产物/仓外证据。 */
const SKIP_DIRS = new Set([".git", "node_modules", "dist", "test", "tools", "_research", ".docs", ".shadow"]);

const args = process.argv.slice(2);
const ROOT = resolve(args.find((a) => !a.startsWith("--")) ?? ".");
if (!existsSync(ROOT)) {
  console.error(`❌ 结构缺失：根目录不存在 —— ${ROOT}`);
  process.exit(2);
}

const files: FileMetric[] = [];
(function walk(dir: string, prefix: string) {
  let es; try { es = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of es) {
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(join(dir, e.name), prefix + e.name + "/");
    } else if (e.name.endsWith(".ts") && !e.name.startsWith("_")) {
      try {
        const text = readFileSync(join(dir, e.name), "utf8");
        files.push({ rel: prefix + e.name, lines: text.length === 0 ? 0 : text.replace(/\n$/, "").split("\n").length });
      } catch { /* 读不到 ⇒ 不进语料（计数会体现） */ }
    }
  }
})(ROOT, "");
files.sort((a, b) => a.rel.localeCompare(b.rel));

if (files.length === 0) {
  console.error(`❌ 结构缺失：${ROOT} 下没扫到任何产品面 \`.ts\` —— 拒绝产出「0 违规」的读数（缺件不静默，ADR-0049）。`);
  process.exit(2);
}

const baseline = existsSync(BASELINE_PATH) ? JSON.parse(readFileSync(BASELINE_PATH, "utf8")) : undefined;
const hot = hotspotVerdict(files, baseline?.hotspots, HOTSPOT_THRESHOLD);
const over = hardCapVerdict(files, HARD_CAP);
const health = scanHealthVerdict(files.length, baseline?.scanned_files);
const maxLines = files.reduce((m, f) => Math.max(m, f.lines), 0);

console.log("复杂度预算门（T13 后半）：只判**产品面**（`index.ts` + 源码目录；**不扫** `test/` 与 `tools/`，见 `adr/0109`）");
console.log(`  · 口径：硬上限 **${HARD_CAP} 行**；热点阈值 **${HOTSPOT_THRESHOLD} 行**（热点只能降）`);
console.log(`  · 扫到 ${files.length} 个文件（最长 ${maxLines} 行：${files.reduce((a, b) => (b.lines > a.lines ? b : a)).rel}）`);
console.log(`  · 语料健康：${health.note}`);

if (args.includes("--update-ratchet")) {
  if (!health.ok) {
    console.log(`  ⇒ 拒绝 \`--update-ratchet\`：${health.note}`);
    process.exit(2);
  }
  const hotspots: Record<string, number> = {};
  for (const f of files) if (f.lines >= HOTSPOT_THRESHOLD) hotspots[f.rel] = f.lines;
  writeFileSync(BASELINE_PATH, stableStringify({ hard_cap: HARD_CAP, hotspot_threshold: HOTSPOT_THRESHOLD, scanned_files: files.length, hotspots }), "utf8");
  console.log(`  已写入预算基线：${BASELINE_PATH}`);
  console.log(`    scanned_files = ${files.length} · hotspots = ${Object.keys(hotspots).length}`);
  for (const [rel, lines] of Object.entries(hotspots).sort((a, b) => b[1] - a[1])) console.log(`    ${String(lines).padStart(4)}  ${rel}`);
  process.exit(0);
}

const violations: string[] = [];
if (baseline === undefined) {
  violations.push(`基线缺失：${BASELINE_PATH}（用 \`--update-ratchet\` 录制并提交；**缺件不得静默通过**）`);
} else {
  if (baseline.hard_cap !== HARD_CAP || baseline.hotspot_threshold !== HOTSPOT_THRESHOLD) {
    violations.push(`基线的常量（hard_cap=${baseline.hard_cap} / hotspot_threshold=${baseline.hotspot_threshold}）与本工具（${HARD_CAP} / ${HOTSPOT_THRESHOLD}）不一致 ⇒ 判据变了但基线未重录`);
  }
  if (!health.ok) violations.push(health.note);
  for (const f of over.over) violations.push(`超硬上限：${f.rel} = ${f.lines} 行（> ${HARD_CAP}）`);
  for (const f of hot.risen) violations.push(`热点上涨：${f.rel} ${baseline.hotspots?.[f.rel]} → ${f.lines} 行（热点只能降）`);
}

// 两处「不算违规」的**必须打印**（否则等于静默放过，ADR-0049）：
for (const f of hot.fresh) console.log(`  · 新热点（首次入账）：${f.rel} = ${f.lines} 行 ⇒ 建议 \`--update-ratchet\` 把它记进基线`);
for (const rel of hot.gone) console.log(`  · 已退出热点（降到阈值下/已删）：${rel} ⇒ 建议 \`--update-ratchet\` 收紧基线`);

if (violations.length) {
  console.log(`复杂度预算：失败（${violations.length} 处）`);
  for (const v of violations) console.log(`  ✗ ${v}`);
  process.exit(1);
}
console.log(`复杂度预算：通过 ✅（硬上限 ${HARD_CAP} 行 · 热点 ${Object.keys(baseline?.hotspots ?? {}).length} 个均未上涨 · 无新增热点）`);
process.exit(0);
