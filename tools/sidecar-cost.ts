// dsh-shadow —— tools/sidecar-cost.ts：**目录级 L0/L1 sidecar 的真机代价标定**（`T9` ②/③ 的读数来源）。
//
// 为什么需要它：`T9` 的完成判据 ② 是「真机报告 sidecar 数与写入耗时」、③ 是「明确是否回填」——
// 两条都要**数字**，而 `adr/0075` 此前只有「写入次数有界」这类**推理**（见该 ADR 的「未验证」一节）。
//
// 判据与路径都**复用产品面**：本工具驱动 `createShadowCollector(...).ensureIndex(ws)` ——
// 即真实索引重建路径里的 `writeAbstracts`（`core/writer/materialize.ts`），**不自己再算一遍派生**
//（另算一遍的话，量到的就不是产品行为）。
//
// ⚠ **绝不写用户语料**：读走真实语料；写**全部重定向**到系统临时目录（overlay：读先看沙箱、再落回语料）。
//    每个口径各用一个**全新沙箱**（否则上一轮的 `_meta.json` 会被下一轮读到，两轮互相污染）。
//    跑完做两条机器自检：① 有没有任何一次写落在沙箱之外；② 语料文件数有没有变。任一不成立 ⇒ exit 1。
//
// 用法：node tools/sidecar-cost.ts [工作区根]      （根缺省取 SHADOW_EVAL_ROOT）
// 退出码：0 = 出读数；1 = 自检失败（没写到 sidecar / 写越界 / 语料变了）；2 = 缺件（根不存在或语料为空）。
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve as abs } from "node:path";
import { createShadowCollector } from "../dist/core/writer/index.js";
import { parseSidecar } from "../dist/core/view/abstract.js";
import { isMemoryFileName } from "../dist/persistence/files.js";

const ROOT = (process.argv[2] || process.env.SHADOW_EVAL_ROOT || "").trim();
const die = (msg: string, code: number): never => { console.error(msg); process.exit(code); };
if (!ROOT || !existsSync(ROOT)) die("❌ 缺件：工作区根不存在（给参数或设 SHADOW_EVAL_ROOT）—— 缺件不静默（ADR-0049）。", 2);
const SHADOW = join(ROOT, ".shadow");
const ATOMS = join(SHADOW, "atoms");
if (!existsSync(ATOMS) || !statSync(ATOMS).isDirectory()) die("❌ 缺件：" + ATOMS + " 不是目录（这个根下没有投影空间的 atoms/）。", 2);

const countFiles = (dir: string): number => {
  let n = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) n += e.isDirectory() ? countFiles(join(dir, e.name)) : 1;
  return n;
};

const atomNames = readdirSync(ATOMS).filter((n) => isMemoryFileName(n));
if (!atomNames.length) die("❌ 缺件：atoms/ 下 0 条记忆文件 —— 空语料出不了读数（也不许把「空」当「完成了」）。", 2);
const allDates = [...new Set(atomNames.map((n) => n.slice(0, 10)))].sort();
const filesBefore = countFiles(SHADOW);

type W = { real: string; bytes: number; ms: number; text: string; outside: boolean };
const med = (xs: number[]): number => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };
const SIDECAR_RE = /[\\/]indexes[\\/]abstracts[\\/]\d{4}-\d{2}-\d{2}[\\/]_abstract\.md$/;
/** `_index.md` 里「目录摘要（L0 · 派生物）」段引用的行（`- <date>（N 条）<L0>`）。 */
const INDEX_REF_RE = /^- \d{4}-\d{2}-\d{2}（\d+ 条）/gm;

/** 一个口径 = 一个全新沙箱 + 一个全新 collector（两轮之间不共享任何状态）。 */
const run = async (label: string, config: any) => {
  const sandbox = mkdtempSync(join(tmpdir(), "dsh-sidecar-cost-"));
  const writes: W[] = [];
  const sandOf = (p: string): string => {
    const rel = relative(ROOT, abs(p));
    return rel.startsWith("..") ? join(sandbox, "_outside", rel.replace(/[\\/:]/g, "_")) : join(sandbox, rel);
  };
  const token = (p: string) => ({ real: abs(p), sand: sandOf(p) });
  /** 与 `dsh-fs-local.listDirectory` 同形（`shadowSourcesFingerprint` 要 `target`/`type`/`size`）。 */
  const adapter = {
    async resolve(p: string, opts?: any) { return token(abs(opts && opts.cwd ? opts.cwd : ROOT, p)); },
    async readText(t: any) {
      for (const p of [t.sand, t.real]) { try { return readFileSync(p, "utf8"); } catch { /* 落回下一个 */ } }
      throw new Error("readText: 读不到 " + t.real);
    },
    async listDir(t: any) {
      const seen = new Map<string, "file" | "directory">();
      for (const d of [t.real, t.sand]) {
        try {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const type = e.isDirectory() ? "directory" : "file";
            if (seen.get(e.name) !== "directory") seen.set(e.name, type);
          }
        } catch { /* 目录不存在 ⇒ 只取另一边 */ }
      }
      return [...seen].map(([name, type]) => {
        const child = token(join(t.real, name));
        const entry: any = { name, type, target: child };
        if (type === "file") { try { entry.size = statSync(child.real).size; } catch { /* 只在沙箱里 ⇒ 无 real 尺寸 */ } }
        return entry;
      });
    },
    async writeText(t: any, text: string) {
      const t0 = performance.now();
      mkdirSync(dirname(t.sand), { recursive: true });
      writeFileSync(t.sand, text);
      const ms = performance.now() - t0;
      const outside = !t.sand.startsWith(sandbox);
      writes.push({ real: t.real, bytes: Buffer.byteLength(text, "utf8"), ms, text, outside });
    },
  };

  const collector = createShadowCollector({
    context: { get: (k: string) => (k === "fs" ? adapter : undefined) },
    config,
    getAgentById: (id: string | undefined) => ({ id }),
  });
  const t0 = performance.now();
  await collector.ensureIndex(ROOT, undefined);
  const totalMs = performance.now() - t0;

  const sides = writes.filter((w) => SIDECAR_RE.test(w.real));
  const index = writes.find((w) => /[\\/]indexes[\\/]_index\.md$/.test(w.real));
  const byKind = new Map<string, number>();
  for (const w of writes) {
    const rel = relative(SHADOW, w.real).replace(/\\/g, "/");
    const kind = SIDECAR_RE.test(w.real) ? "indexes/abstracts/**（sidecar）" : (rel.includes("/") ? rel.split("/")[0] + "/…（其余）" : rel);
    byKind.set(kind, (byKind.get(kind) || 0) + 1);
  }

  console.log("\n▶ " + label);
  console.log("  写入次数        : " + writes.length + "（其中 sidecar " + sides.length + " 份）");
  for (const [k, v] of [...byKind].sort((a, b) => b[1] - a[1])) console.log("    · " + k + " × " + v);
  if (sides.length) {
    console.log("  sidecar 字节    : min " + Math.min(...sides.map((s) => s.bytes)) + " / median " + med(sides.map((s) => s.bytes)) + " / max " + Math.max(...sides.map((s) => s.bytes)) + "（合计 " + sides.reduce((a, s) => a + s.bytes, 0) + " B）");
    console.log("  sidecar 写耗时  : 合计 " + sides.reduce((a, s) => a + s.ms, 0).toFixed(1) + " ms（每份 median " + med(sides.map((s) => s.ms)).toFixed(2) + " ms）");
  }
  console.log("  重建总耗时      : " + totalMs.toFixed(0) + " ms（含读源 + 派生 + 全部写）");
  const refs = index ? (index.text.match(INDEX_REF_RE) || []).length : 0;
  console.log("  索引引用        : `_index.md` 的「目录摘要」段引用 " + refs + " 行 ⇒ **写了 " + sides.length + " 份、被引用 " + refs + " 份**（`showInIndex` 默认 3 ⇒ 超出部分写了没人读）");
  // 每条 sidecar 的**内容面**读数（T9 说「L0 抽取质量未评」—— 这里给出可复算的那半边）：
  // 自报 covered（= 该桶**活跃**记忆条数）vs L1 里实际列出的入口条数 vs 是否被 `L1_MAX` 截断。
  for (const s of sides) {
    const parsed = parseSidecar(s.text);
    const date = (s.real.match(/(\d{4}-\d{2}-\d{2})[\\/]_abstract\.md$/) || [])[1];
    const listed = parsed ? (parsed.l1.match(/^- \[\d{6}\] /gm) || []).length : 0;
    const capped = parsed ? parsed.l1.endsWith("…") : false;
    console.log("    · " + date + "：covered 自报 " + (parsed ? parsed.coverage.covered : "?") + " · L1 列出 " + listed + " 条 · L1 " + (capped ? "**被 L1_MAX 截断**" : "未截断") + " · L0 " + (parsed ? parsed.l0.length : 0) + " 字");
  }
  rmSync(sandbox, { recursive: true, force: true });
  return { sides, writes, outside: writes.filter((w) => w.outside).map((w) => w.real) };
};

console.log("▶ sidecar 代价标定 · 语料根：" + ROOT);
console.log("  读数时刻        : " + new Date().toISOString() + "（语料是**活的**：另一会话可能在写，两次跑之间 atoms 数会变）");
console.log("  记忆文件        : " + atomNames.length + "（`isMemoryFileName` 口径：`.md` 且不以 `_` 开头）");
console.log("  日期桶（全部文件）: " + allDates.length + " 个（" + allDates[0] + " … " + allDates[allDates.length - 1] + "）");
console.log("  .shadow 文件数  : " + filesBefore + "（跑完复核同值）");

const full = await run("口径 A：forget 关（= 一次「全库回填」的代价）", { abstracts: {}, forget: { enabled: false }, compact: {}, retention: { enabled: false }, episodes: {} });
const dflt = await run("口径 B：forget 默认开（staleDays 默认 14）", { abstracts: {}, forget: {}, compact: {}, retention: { enabled: false }, episodes: {} });

const filesAfter = countFiles(SHADOW);
const problems: string[] = [];
if (!full.sides.length) problems.push("口径 A 没写到任何 sidecar ⇒ 这条路径没跑起来，读数不可用");
if (!dflt.sides.length) problems.push("口径 B 没写到任何 sidecar ⇒ 读数不可用");
if (full.outside.length || dflt.outside.length) problems.push("有写落在沙箱之外：" + [...full.outside, ...dflt.outside].slice(0, 3).join(" · "));
if (filesAfter !== filesBefore) problems.push("语料文件数变了：" + filesBefore + " → " + filesAfter);
console.log("\n" + (problems.length ? "❌ 自检失败：" + problems.join("；") : "✔ 自检：写越界 0 次 · 语料文件数未变（" + filesBefore + " → " + filesAfter + "）· sidecar 路径形态全部匹配"));
process.exit(problems.length ? 1 : 0);
