/**
 * dsh-shadow —— tools/granularity-audit.ts：**记录粒度门**（v1.19.0 / `adr/0097` D7）。
 *
 * ## 判据（**只有一条**）
 *
 * **一条记忆文件不得是「纯动作回声」** —— 即 `> 证据链：来源(动作)` 里**只有**「动作」。
 * 它等价于生产侧的 `isAuditBatch`（`core/retention/capture-granularity.ts`）：只有 action 的批该进审计流，
 * 不该落成记忆文件。两条判据同源，门只是**在语料上复核生产侧有没有做到**。
 *
 * ## 边界（用门之前先读；ADR-0049：缺件不静默）
 *
 * - **起点 `2026-09-21`（含）之前豁免**：历史那 8,919 个纯动作文件**不改写**（`adr/0049` 的分层纪律）
 *   ⇒ 本门回答的是「**起点之后**有没有新的纯动作记忆文件」，**不是**「全仓都不是」。
 *   这一点会**打印在报文里**，且豁免数会计数。
 * - **读不到 `> 证据链：来源(...)` 行 ⇒ 未判定**：不判、只计数并打印（判据不猜）。
 * - **形状读数只打印、不判**：每条目录条目数 / 平均文件大小会打出来供人看，
 *   但本门**不**据此报红 —— 一条可机械化的判据比三条会误报的判据好（同 `tools/citation-audit.lib.ts` 的教训）。
 * - **不 import `dist/`**：本门跑在 `npm run build` **之前**（`verify` 的顺序）⇒ 依赖编译产物会让门自己先坏。
 *   记忆文件名的判据因此在本文件内联一份，**与 `persistence/files.ts:39-41` 同一口径**
 *   （`.md` 且非 `_` 前缀）；边界由 `granularity-audit.selftest.ts` 的对照锁住。
 * - **不联网**（与 `verify` 里其它门同族）。
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { resolveEvalRoot } from "./eval-root.lib.ts";
import { GRANULARITY_FROM, ACTION_ONLY, DATE_DIR_RE, isMemoryName, pureActionVerdict } from "./granularity.lib.ts";

export interface GranularityResult {
  ok: boolean;
  code: number;
  lines: string[];
}

export const checkGranularity = (root: string, opts: { from?: string } = {}): GranularityResult => {
  const from = opts.from || GRANULARITY_FROM;
  const shadow = join(resolve(root), ".shadow");
  if (!existsSync(shadow)) {
    return {
      ok: false,
      code: 2,
      lines: [
        `❌ 粒度门 **结构缺失**：找不到 \`${shadow}\`。`,
        "  ⚠ 这**不是「通过」**（ADR-0049）——本门判的是「起点之后有没有新的纯动作记忆文件」，",
        "    语料根指错了就无从判定。用 `SHADOW_EVAL_ROOT=<工作区>` 显式指定。",
      ],
    };
  }

  const dateDirs = readdirSync(shadow, { withFileTypes: true })
    .filter((e) => e.isDirectory() && DATE_DIR_RE.test(e.name))
    .map((e) => e.name)
    .sort();
  if (!dateDirs.length) {
    return {
      ok: false,
      code: 2,
      lines: [`❌ 粒度门 **结构缺失**：\`${shadow}\` 下没有 \`YYYY-MM-DD\` 形态的日期目录。**这不是「通过」**。`],
    };
  }

  let judged = 0;
  let exempt = 0;
  let unknown = 0;
  const violations: string[] = [];
  const perDir: [string, number][] = [];
  let totalBytes = 0;
  let totalFiles = 0;

  for (const d of dateDirs) {
    const dir = join(shadow, d);
    const files = readdirSync(dir, { withFileTypes: true }).filter((e) => e.isFile() && isMemoryName(e.name));
    perDir.push([d, files.length]);
    for (const f of files) {
      const p = join(dir, f.name);
      try {
        totalBytes += statSync(p).size;
        totalFiles++;
      } catch {
        /* 计数是读数，读不到就不计（下面的正文读失败会记入未判定） */
      }
      if (d < from) {
        exempt++;
        continue;
      }
      let text = "";
      try {
        text = readFileSync(p, "utf8");
      } catch {
        unknown++;
        continue;
      }
      const verdict = pureActionVerdict(text);
      if (verdict === null) {
        unknown++;
        continue;
      }
      judged++;
      if (verdict) {
        violations.push(`  ✗ ${d}/${f.name} —— 来源(${ACTION_ONLY}) 只有动作 ⇒ 它是**审计流**，不该落成记忆文件（adr/0097 D1）`);
      }
    }
  }

  const biggest = perDir.reduce((a, b) => (b[1] > a[1] ? b : a), ["—", 0] as [string, number]);
  const avgKB = totalFiles ? (totalBytes / totalFiles / 1024).toFixed(2) : "—";
  const scope =
    `起点 ${from}（含）· 日期目录 ${dateDirs.length} 个 · 判定 ${judged} 条 · ` +
    `**豁免（起点之前的归档）** ${exempt} 条 · 未判定（读不到/无来源行） ${unknown} 条`;
  const readings = [
    `  · 形状读数（**只打印、不判**）：单目录最多 ${biggest[1]} 条（${biggest[0]}）· 平均文件 ${avgKB} KB`,
  ];

  if (violations.length) {
    return {
      ok: false,
      code: 1,
      lines: [
        "❌ 粒度门：**起点之后仍有「纯动作回声」被落成记忆文件**",
        `  （${scope}）`,
        "",
        ...violations.slice(0, 20),
        ...(violations.length > 20 ? [`  …（共 ${violations.length} 条，只列前 20）`] : []),
        "",
        ...readings,
        "",
        "  怎么修：`capture.echo` 默认就是 `\"audit\"` ⇒ 出现本违规说明落盘走了旧路径；",
        "  查 `core/writer/materialize.ts` 的 flush 分流（`isAuditBatch`）与 `core/types.ts` 的 `capture.echo`。",
        `  ⚠ 起点（${from}）**之前**的文件是**归档**，**不要**为了让门变绿去改它们（改写归档 = 伪造历史）。`,
      ],
    };
  }

  return {
    ok: true,
    code: 0,
    lines: [
      `✔ 粒度门：起点之后没有「纯动作回声」落成记忆文件（${scope}）`,
      ...readings,
      `  ⚠ 能力边界：**起点之前的历史已按 \`adr/0097\` §5.3 回收**（v1.19.1 用 \`tools/granularity-reclaim.ts\` 的 \`--apply\`，
       原始内容全量备份在 \`vendor/.docs/fix/2026-09-21/reclaimed-pure-action-memories.jsonl\`）——本门只看**起点之后**；`,
      "    未判定的条目不等于「已验证」。",
    ],
  };
};

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (isMain || process.argv[1]?.endsWith("granularity-audit.ts")) {
  const arg = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "";
  const root = arg || resolveEvalRoot(join(import.meta.dirname ?? ".", ""));
  const r = checkGranularity(root);
  for (const l of r.lines) console.log(l);
  process.exit(r.code);
}
