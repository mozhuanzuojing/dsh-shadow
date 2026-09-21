/**
 * dsh-shadow —— tools/granularity-reclaim.ts：**历史纯动作记忆文件的回收**（v1.19.1 / `adr/0097` §5.3）。
 *
 * ## 它做什么（用户 2026-09-21 明示「回收」后才允许跑）
 *
 * 把**起点之前**那些「纯动作回声」记忆文件（8,919 个，实测）搬进审计流
 * `.shadow/audit/<date>.jsonl`（一行一条 JSON），然后删掉原文件、并从 `_meta.json` 里剪掉它们的条目。
 *
 * ## 为什么它**不是**「改写归档」而是**换载体**
 *
 * 归档纪律（`adr/0049`）禁止的是**改写**（把当时写的东西改成别的内容）。本工具**只搬不写**：
 *   · 每条动作记录**逐字**进审计流（`renderBodyLine(记录) === 原始行` 是**断言**，不是期望）；
 *   · 原始文件**全量备份**（含头部：背景/材料、概况、项目、Agent、来源会话）到
 *     `<backup>/reclaimed-pure-action-memories.jsonl`，一条一行（`rel` + `sha256` + `bytes` + `content`）；
 *   · 记录里带 `from: "<原始 rel>"` + `reclaimed: true` ⇒ **谁都能追回它从哪来**。
 * ⇒ 文件数下降（1.4 万 → 5.4 千），**内容一条不丢、且可逆**（从备份一行一条还原）。
 *
 * ## 用法
 *
 * ```powershell
 * node tools/granularity-reclaim.ts                 # dry-run：只报要动什么、有多少条、按日期分布
 * node tools/granularity-reclaim.ts --apply         # 真做（先备份，再追加审计流，再剪 meta，最后删文件）
 * node tools/granularity-reclaim.ts --root <ws> --backup <dir>
 * ```
 *
 * ## 安全边界
 *
 * - **幂等**：已进审计流的 `from` 会被跳过；跑完之后没有目标文件 ⇒ 再跑是空操作。
 * - **要求没有活着的 dsh-shadow 在写这个工作区**（否则它可能同时写 `_meta.json`）——本机实测未挂载。
 * - **不碰**：`_index.md`（派生件；目录令牌变了，下一次读会自动重建）、合并件（`ep-`）、
 *   `query-log/`、`resources/`、任何非「纯动作」记忆文件。
 * - 任何一条断言不成立就**中止**（不做部分回收）：宁可什么都不做，也不做半截。
 */
import { createHash } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveEvalRoot } from "./eval-root.lib.ts";
import {
  DATE_DIR_RE,
  GRANULARITY_FROM,
  isMemoryName,
  pureActionVerdict,
  reclaimedRecordsOf,
  renderBodyLine,
  relOf,
} from "./granularity.lib.ts";

const args = process.argv.slice(2);
const APPLY = args.includes("--apply");
const argVal = (name: string): string | undefined => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};

const here = import.meta.dirname ?? ".";
const ROOT = resolve(argVal("--root") || resolveEvalRoot(here));
const SHADOW = join(ROOT, ".shadow");
const BACKUP_DIR = resolve(
  // ⚠ 默认必须落在**仓库外**的 `vendor/.docs/fix/<日期>/`（本仓约定：当时取证放那儿）。
  // v1.19.1 实测踩过：写成 `join(here, "..", ".docs")` 会落到**仓库内**的 `.docs/` ——
  // 而 `.docs` **不在** `.gitignore` 里（实测 `git status` 直接报 `?? .docs/`）⇒ 5.5 MB 备份差点被提交进仓库。
  argVal("--backup") || join(here, "..", "..", ".docs", "fix", "2026-09-21"),
);
const META = join(SHADOW, "_meta.json");

interface Plan {
  date: string;
  file: string;
  rel: string;
  text: string;
  records: ReturnType<typeof reclaimedRecordsOf>;
}

const usage = () => {
  console.log("用法：node tools/granularity-reclaim.ts [--apply] [--root <ws>] [--backup <dir>]");
  console.log(`  · 起点 ${GRANULARITY_FROM}（含）之前的「纯动作回声」记忆文件 → \`.shadow/audit/<date>.jsonl\``);
  console.log("  · 不传 --apply 只做 dry-run（不写任何东西）");
};

if (!existsSync(SHADOW)) {
  console.error(`✗ 找不到 ${SHADOW} —— 用 --root <工作区> 或 SHADOW_EVAL_ROOT 指定`);
  process.exit(2);
}

// ── 1. 收集目标（只认起点之前、且判据说「纯动作」的）──
const dateDirs = readdirSync(SHADOW, { withFileTypes: true })
  .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
  .map((e) => e.name)
  .sort();

const plans: Plan[] = [];
let skippedAfterCutover = 0;
let skippedUnknown = 0;
for (const date of dateDirs) {
  const dir = join(SHADOW, date);
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isFile() || !isMemoryName(e.name)) continue;
    const p = join(dir, e.name);
    let text = "";
    try {
      text = readFileSync(p, "utf8");
    } catch {
      skippedUnknown++;
      continue;
    }
    const verdict = pureActionVerdict(text);
    if (verdict === null) {
      skippedUnknown++;
      continue;
    }
    if (!verdict) continue;
    if (date >= GRANULARITY_FROM) {
      // 起点之后的纯动作记忆文件是**违规**（门会红）——不该被静默回收，先让人看见。
      skippedAfterCutover++;
      continue;
    }
    const rel = relOf(date, e.name);
    const records = reclaimedRecordsOf(text, rel);
    const originalLines = text
      .split("\n")
      .map((l) => l.trimEnd())
      .filter((l) => /^- \[[^\]]*\] \[[^\]]*\] /.test(l));
    if (records.length !== originalLines.length) {
      console.error(`✗ 中止：${rel} 的正文行数与解析出的记录数不等（${originalLines.length} vs ${records.length}）——不从半解析的状态继续`);
      process.exit(1);
    }
    for (let i = 0; i < records.length; i++) {
      if (renderBodyLine(records[i]) !== originalLines[i]) {
        console.error(`✗ 中止：${rel} 第 ${i + 1} 条无法逐字还原：\n  原：${originalLines[i]}\n  还原：${renderBodyLine(records[i])}`);
        process.exit(1);
      }
    }
    plans.push({ date, file: p, rel, text, records });
  }
}

const totalRecords = plans.reduce((n, p) => n + p.records.length, 0);
const totalBytes = plans.reduce((n, p) => n + Buffer.byteLength(p.text, "utf8"), 0);

console.log(`工作区：${ROOT}`);
console.log(`回收集合：**${plans.length} 个文件 / ${(totalBytes / 1024).toFixed(1)} KB / ${totalRecords} 条动作记录**（起点 ${GRANULARITY_FROM} 之前、来源只有「动作」）`);
if (skippedUnknown) console.log(`  · 跳过（无来源行，未判定）：${skippedUnknown} 个`);
if (skippedAfterCutover) console.log(`  ⚠ 跳过（**起点之后**的纯动作记忆文件 —— 那是违规，先修生产侧再回收）：${skippedAfterCutover} 个`);
for (const [date, ps] of [...plans.reduce((m, p) => m.set(p.date, [...(m.get(p.date) || []), p]), new Map<string, Plan[]>())].sort()) {
  console.log(`  · ${date}: ${ps.length} 文件 / ${ps.reduce((n, p) => n + p.records.length, 0)} 条`);
}

if (!plans.length) {
  console.log("没有要回收的文件（幂等：已跑过，或本工作区本来就没有纯动作记忆文件）");
  process.exit(0);
}
if (!APPLY) {
  console.log("\n（dry-run：什么都没写。加 --apply 才真做）");
  process.exit(0);
}

// ── 2. 幂等守卫：已进审计流的 `from` 跳过 ──
const existingFrom = new Set<string>();
for (const date of new Set(plans.map((p) => p.date))) {
  const audit = join(SHADOW, "audit", `${date}.jsonl`);
  if (!existsSync(audit)) continue;
  for (const line of readFileSync(audit, "utf8").split("\n")) {
    const m = /"from":"([^"]*)"/.exec(line);
    if (m) existingFrom.add(m[1]);
  }
}
const todo = plans.filter((p) => !existingFrom.has(p.rel));
if (existingFrom.size) console.log(`幂等：审计流里已有 ${existingFrom.size} 条来源标记，本次跳过对应的文件`);
console.log(`本次实际回收：${todo.length} 文件 / ${todo.reduce((n, p) => n + p.records.length, 0)} 条`);

// ── 3. 备份（在删任何东西之前）──
mkdirSync(BACKUP_DIR, { recursive: true });
const backupPath = join(BACKUP_DIR, "reclaimed-pure-action-memories.jsonl");
const backupLines: string[] = [];
for (const p of todo) {
  backupLines.push(
    JSON.stringify({
      rel: p.rel,
      sha256: createHash("sha256").update(p.text, "utf8").digest("hex"),
      bytes: Buffer.byteLength(p.text, "utf8"),
      records: p.records.length,
      content: p.text,
    }),
  );
}
const prevBackup = existsSync(backupPath) ? readFileSync(backupPath, "utf8") : "";
const prevRels = new Set(
  prevBackup
    .split("\n")
    .map((l) => /"rel":"([^"]*)"/.exec(l)?.[1])
    .filter((x): x is string => !!x),
);
const newBackupLines = backupLines.filter((l) => {
  const rel = /"rel":"([^"]*)"/.exec(l)?.[1] || "";
  return !prevRels.has(rel); // 幂等：不重复追加同一条
});
writeFileSync(backupPath, prevBackup + (prevBackup && !prevBackup.endsWith("\n") ? "\n" : "") + newBackupLines.join("\n") + (newBackupLines.length ? "\n" : ""), "utf8");
console.log(`✔ 备份：${backupPath}（本次 +${newBackupLines.length} 条，累计 ${prevRels.size + newBackupLines.length} 条）`);

// ── 4. 追加审计流（按日期、按文件名字典序 = 时间序）──
// 用 node 原生 `appendFileSync`（O_APPEND）：本工具是**单进程一次性迁移**，
// 不必走插件那条「读回→拼接→写回」的路（那是给无 append 原语的宿主 fs 门面用的）。
let appended = 0;
const auditOutcome = new Map<string, number>();
const auditDir = join(SHADOW, "audit");
mkdirSync(auditDir, { recursive: true });
for (const p of todo) {
  const auditFile = join(auditDir, `${p.date}.jsonl`);
  const body = p.records.map((r) => JSON.stringify(r)).join("\n") + "\n";
  try {
    appendFileSync(auditFile, body, "utf8");
  } catch (e: any) {
    console.error(`✗ 中止（未删任何文件）：审计流追加失败（${auditFile}）：${e?.message}`);
    process.exit(1);
  }
  appended += p.records.length;
  auditOutcome.set(p.date, (auditOutcome.get(p.date) || 0) + p.records.length);
}
console.log(`✔ 审计流：追加 ${appended} 条到 ${auditOutcome.size} 个日期文件`);

// ── 5. 剪 `_meta.json`（删文件之前先剪，避免中途失败留下「文件没了但 meta 还在」）──
let metaRemoved = 0;
if (existsSync(META)) {
  const raw = readFileSync(META, "utf8");
  const pretty = raw.includes("\n");
  const meta = JSON.parse(raw);
  for (const p of todo) {
    if (Object.prototype.hasOwnProperty.call(meta, p.rel)) {
      delete meta[p.rel];
      metaRemoved++;
    }
  }
  writeFileSync(META, pretty ? JSON.stringify(meta, null, 2) : JSON.stringify(meta), "utf8");
  console.log(`✔ _meta.json：剪掉 ${metaRemoved} 条（剩余 ${Object.keys(meta).length} 条）`);
} else {
  console.log("· 没有 _meta.json（未开启 retention）⇒ 跳过");
}

// ── 6. 删原文件 ──
let deleted = 0;
for (const p of todo) {
  try {
    rmSync(p.file, { force: true });
    deleted++;
  } catch (e: any) {
    console.error(`✗ 删除失败（已回收 ${deleted} 个，其余保持原样）：${p.rel}：${e?.message}`);
    process.exit(1);
  }
}
console.log(`✔ 删除原文件：${deleted} 个`);

// ── 7. 后置条件（可数不变量；任一不成立即红）──
const after = readdirSync(SHADOW, { withFileTypes: true })
  .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
  .map((e) => e.name)
  .sort();
let remainingMemories = 0;
let remainingPure = 0;
for (const date of after) {
  for (const e of readdirSync(join(SHADOW, date), { withFileTypes: true })) {
    if (!e.isFile() || !isMemoryName(e.name)) continue;
    remainingMemories++;
    const v = pureActionVerdict(readFileSync(join(SHADOW, date, e.name), "utf8"));
    if (v === true) remainingPure++;
  }
}
console.log("");
console.log("后置条件：");
console.log(`  · 剩余记忆文件：${remainingMemories}（回收前 14,342 ⇒ 期望 5,423）`);
console.log(`  · 剩余**纯动作**记忆文件：${remainingPure}（期望 0；起点之后若有新采集，这里会 > 0，属正常）`);
const ok = remainingPure === 0;
console.log(ok ? "  ✔ 通过" : "  ✗ **不通过**");
process.exit(ok ? 0 : 1);
