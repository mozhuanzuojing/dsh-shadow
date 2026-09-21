#!/usr/bin/env node
// dsh-shadow —— tools/materials-freshness.ts：**材料新鲜度**（`vendor/_src` 里的 git 材料有没有落后）。
//
// 由来（用户 2026-09-20 指令）：「**材料里面的 git 每次访问先检查最新，并更新到最新**」。
//
// ## 为什么不是一个无脑的 `git pull`
//
// 这条规则在本仓有两个**真实冲突**，不处理就会制造本仓最讨厌的病（引用腐烂）：
//
//   1. **冻结快照**：`langextract--snapshot-v1.6.0` 这类目录**按设计**停在一个旧版本；
//      「更新到最新」= **它不再是那个快照**。⇒ 默认**不更新**，要更新得显式 `--include-frozen`。
//   2. **已记录的引用**：`references.md` / `adr/*` 里有 `文件:行号` 形式的引用，
//      它们**只对某一版成立**。材料一动，那些引用就**烂了** —— 而「行号是最易腐烂的引用形态」
//      是本仓 `AGENTS.md` 明文写下的头号纪律。⇒ 更新前先报**「这个材料被哪些文档提到」**（爆炸半径），
//      更新后必须**回头核对**那些文档。
//
// 因此本工具的形状是：**检查是默认动作（便宜、只读、可离线降级）；更新是显式的、可审计的（报旧→新）**。
//
// ## 为什么不进 `verify`
//
// 它**要联网**（`git ls-remote`）。本仓的门**刻意不联网** —— 同族先例：`audit:docs` 检查⑤ 的
// tag 核对「**门里不联网**」，宁可只读 ref 文件。把要联网的东西塞进 `verify`，
// 会让「离线时全绿」变成「离线时假红/假绿」。⇒ 它是**约定 + 工具**，不是门。
//
// 用法：
//   node tools/materials-freshness.ts                    # 只检查（含爆炸半径）
//   node tools/materials-freshness.ts --update           # **只把 HEAD 移到最新**（`reset --mixed`）——
//                                                        #   ⚠ **工作树不动 ⇒ 读文件读到的还是旧内容**
//   node tools/materials-freshness.ts --update --hard    # **连工作树一起更新**（`reset --hard`）——
//                                                        #   ⚠ **覆盖 vendored 拷贝**，且未跟踪文件不会被清
//   node tools/materials-freshness.ts --update --include-frozen   # 连冻结快照也动（危险，必须显式）
import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.SHADOW_MATERIALS_ROOT ?? "D:\\project\\dsh1\\vendor\\_src";

const argv = process.argv.slice(2);
const DO_UPDATE = argv.includes("--update");
const INCLUDE_FROZEN = argv.includes("--include-frozen");
/** `--hard`：`reset --hard` ⇒ **工作树也被更新**（会覆盖 vendored 拷贝）。 */
const HARD = argv.includes("--hard");

/** 冻结快照的目录名标记。**比较只在这里**（免得同一个字面量散在多处 —— 棘轮抓过两次）。 */
const SNAPSHOT_MARK = "--snapshot-";
const isFrozenSnapshot = (name: string): boolean => name.includes(SNAPSHOT_MARK);

/** 跑 git 取 stdout；失败返回 undefined（由调用方**显式**判缺件，不静默当成「没问题」）。 */
const git = (dir: string, args: string[]): string | undefined => {
  try {
    const r = spawnSync("git", ["-C", dir, ...args], { encoding: "utf8" });
    if (r.status !== 0 || typeof r.stdout !== "string") return undefined;
    return r.stdout.trim();
  } catch {
    return undefined;
  }
};

/**
 * 仓库里的文档（根下 + `adr/`），用于算「爆炸半径」。
 *
 * **爆炸半径 = 会因材料更新而腐烂的引用**，不是「提到过这个名字的文档」。
 * 初版按「名字出现在文档里」算，结果 `MATERIALS.md` / `CHANGELOG.md` **必然**提到每个材料
 * ⇒ 24 行全是「被引用」，信号被噪音淹掉。现在收窄为：
 *   · 排除**台账与归档**（`MATERIALS.md` / `CHANGELOG.md`）—— 它们列全名是**职责**，不会腐烂；
 *   · 只算**同一行里既有材料名、又有 `文件:行号` 形态**的那些 —— 那才是**会烂的**引用
 *     （本仓 `AGENTS.md` 头号纪律：「行号是最易腐烂的引用形态」）。
 */
const LEDGER_DOCS = new Set(["MATERIALS.md", "CHANGELOG.md"]);
/** `文件:行号` 形态（够用即可；判据是「这一行同时提到材料名」）。 */
const CITATION_RE = /[\w./\\-]+:\d+/;
const docs = (): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = [];
  const push = (dir: string, file: string) => {
    const p = join(dir, file);
    try {
      out.push({ path: file, text: readFileSync(p, "utf8") });
    } catch {
      /* 读不到就跳过 */
    }
  };
  try {
    for (const f of readdirSync(REPO).filter((f) => f.endsWith(".md"))) push(REPO, f);
  } catch {
    /* 根读不到 */
  }
  const adrDir = join(REPO, "adr");
  try {
    for (const f of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) push(adrDir, `adr/${f}`);
  } catch {
    /* adr/ 读不到 */
  }
  return out;
};

const ALL_DOCS = docs();
const citedIn = (name: string): string[] =>
  ALL_DOCS.filter((d) => !LEDGER_DOCS.has(d.path))
    .filter((d) => d.text.split("\n").some((l) => l.includes(name) && CITATION_RE.test(l)))
    .map((d) => d.path);

const dirs: string[] = (() => {
  try {
    return readdirSync(ROOT)
      .filter((n) => {
        try {
          return statSync(join(ROOT, n)).isDirectory();
        } catch {
          return false;
        }
      })
      .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()));
  } catch {
    return [];
  }
})();

if (dirs.length === 0) {
  console.error(`✗ 枚举根不存在或为空：${ROOT}`);
  console.error("  ⇒ 拒绝输出「0 个落后」这种**看起来没问题**的空结论（ADR-0049：缺件不静默）。");
  process.exit(2);
}

type Row = {
  name: string;
  dir: string;
  url: string;
  local: string;
  remote: string;
  branch: string;
  frozen: boolean;
  cited: string[];
  verdict: string;
};

const rows: Row[] = [];
const noGit: string[] = [];
const unknown: string[] = [];

for (const name of dirs) {
  const dir = join(ROOT, name);
  const frozen = isFrozenSnapshot(name);
  const cited = citedIn(name);
  if (git(dir, ["rev-parse", "--git-dir"]) === undefined) {
    noGit.push(name);
    continue;
  }
  const url = git(dir, ["config", "--get", "remote.origin.url"]) ?? "";
  const local = git(dir, ["rev-parse", "--short", "HEAD"]) ?? "<无 HEAD>";
  if (!url) {
    unknown.push(`${name}（无 remote.origin.url）`);
    rows.push({ name, dir, url: "—", local, remote: "?", branch: "?", frozen, cited, verdict: "**无法判**（无远端）" });
    continue;
  }
  // 远端默认分支 + 该分支当前 sha（一次 ls-remote，**不 fetch** ⇒ 便宜且不动本地）。
  const sym = git(dir, ["ls-remote", "--symref", url, "HEAD"]) ?? "";
  const refLine = sym.split("\n").find((l) => l.startsWith("ref:"));
  // ⚠ `--symref` 的 `ref:` 行**也以 `\tHEAD` 结尾** ⇒ 不能按 `endsWith("\tHEAD")` 取
  //   （初版就是这么写的，结果把 `ref:` 当成了 sha）。**必须按 40 位十六进制 sha 行取**。
  const headLine = sym.split("\n").find((l) => /^[0-9a-f]{40}\tHEAD$/.test(l)) ?? "";
  const branch = refLine ? refLine.replace("ref: refs/heads/", "").replace(/\s+HEAD/, "").trim() : "?";
  const remoteSha = headLine ? headLine.split(/\s+/)[0].slice(0, 7) : "";
  if (!remoteSha) {
    unknown.push(`${name}（ls-remote 取不到 ⇒ 可能离线）`);
    rows.push({ name, dir, url, local, remote: "?", branch, frozen, cited, verdict: "**无法判**（取不到远端，**不当作最新**）" });
    continue;
  }
  const upToDate = remoteSha === local;
  const verdict = upToDate
    ? "**最新**"
    : frozen
      ? `**落后** \`${local}\` → \`${remoteSha}\`（**冻结快照：默认不动**）`
      : `**落后** \`${local}\` → \`${remoteSha}\``;
  rows.push({ name, dir, url, local, remote: remoteSha, branch, frozen, cited, verdict });
}

console.log("dsh-shadow 材料新鲜度（tools/materials-freshness.ts —— 检查只读；更新要显式 --update）");
console.log(`枚举根：${ROOT}`);
console.log("口径：本地 HEAD vs **远端默认分支**的当前 sha（`git ls-remote --symref`，**不 fetch**）。");
console.log(`模式：${DO_UPDATE ? `**--update${HARD ? " --hard（会覆盖工作树）" : "（只移 HEAD，**工作树不动**）"}**` : "只检查（只读）"}${INCLUDE_FROZEN ? " · --include-frozen" : ""}`);
console.log("");
console.log("| 目录 | 本地 | 远端最新 | 分支 | 冻结? | 判定 | 被引用于 |");
console.log("|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| \`${r.name}\` | \`${r.local}\` | \`${r.remote}\` | ${r.branch} | ${r.frozen ? "**是**" : "否"} | ${r.verdict} | ${r.cited.length ? r.cited.join(" · ") : "—"} |`,
  );
}

const stale = rows.filter((r) => r.verdict.startsWith("**落后**"));
const eligible = stale.filter((r) => !r.frozen);
const frozenStale = stale.filter((r) => r.frozen);

console.log("");
console.log(
  `小计：**${rows.length - stale.length}** 最新 · **${stale.length}** 落后（其中**冻结快照 ${frozenStale.length}**）· 无 \`.git\` **${noGit.length}**`,
);
if (noGit.length) console.log(`  ⚠ 无 .git（版本不可核）：${noGit.join(" · ")}`);
if (unknown.length) {
  console.log(`  ⚠ 无法判 ${unknown.length} 个（**不当作最新**，ADR-0049）：${unknown.join(" · ")}`);
}

// **爆炸半径**：落后的那些被哪些文档提到 —— 更新前先看清楚会动到什么。
const staleWithCitations = stale.filter((r) => r.cited.length > 0);
if (staleWithCitations.length) {
  console.log("");
  console.log("⚠ **爆炸半径**（这些落后的材料在文档里**有 `文件:行号` 引用** ⇒ 更新后必须回头核对）：");
  for (const r of staleWithCitations) console.log(`  · \`${r.name}\` → ${r.cited.join(" · ")}`);
}

if (!DO_UPDATE) {
  if (stale.length) {
    console.log("");
    console.log("⇒ 要更新，先想清楚**要哪一种**：");
    console.log("   · `--update`        —— 只把 HEAD 移到最新（`reset --mixed`）：**工作树不动** ⇒");
    console.log("     **读文件读到的仍是旧内容**，只是台账能说「上游现在是什么」；");
    console.log("   · `--update --hard` —— **连工作树一起更新**（`reset --hard`）：真读到最新，");
    console.log("     代价是**覆盖 vendored 拷贝**（本机的裁剪/改动会被丢掉；未跟踪文件不会被清）。");
    console.log("   冻结快照要一起动，必须再加 `--include-frozen`（**它会不再是那个快照** —— 先想清楚）。");
  } else {
    console.log("");
    console.log("✔ 没有落后的（**检查时刻**如此）。");
  }
  process.exit(0);
}

// ── 更新 ──
console.log("");
console.log(`=== 更新（fetch --depth 1 + reset --${HARD ? "hard ⚠ 会覆盖工作树" : "mixed（工作树不动）"}）===`);
const targets = INCLUDE_FROZEN ? stale : eligible;
if (targets.length === 0) console.log("  （没有可更新的：落后的都是冻结快照，需 --include-frozen）");
for (const r of targets) {
  const before = git(r.dir, ["rev-parse", "--short", "HEAD"]);
  // **先报会被覆盖的规模**（`--hard` 之前必须看得见代价；`--mixed` 也报，便于对照）。
  const dirty = (git(r.dir, ["status", "--porcelain", "--untracked-files=normal"]) ?? "").split("\n").filter(Boolean);
  const fetched = git(r.dir, ["fetch", "--depth", "1", "origin", r.branch]);
  if (fetched === undefined) {
    // fetch 失败也要**可见**（offline / 分支没了），绝不静默跳过。
    console.log(`  ✗ ${r.name}：fetch 失败（**保持原状**，不静默当作已更新）`);
    continue;
  }
  git(r.dir, ["reset", HARD ? "--hard" : "--mixed", "FETCH_HEAD"]);
  const after = git(r.dir, ["rev-parse", "--short", "HEAD"]);
  console.log(
    `  ✔ ${r.name}：\`${before}\` → \`${after}\`（分支 ${r.branch}）` +
      (dirty.length ? `  · 工作树原有差异 ${dirty.length} 处${HARD ? "（**已被上游覆盖**）" : "（**保留**）"}` : "") +
      (r.cited.length ? `  ⚠ 被 ${r.cited.join(" · ")} 引用 —— **回头核对**` : ""),
  );
}
console.log("");
console.log("⇒ 更新后**必须**：① 重跑 `node tools/materials-ledger.ts`（「工作树 vs HEAD」那一列会变）；");
console.log("   ② 核对上面带 ⚠ 的那些文档里的 `文件:行号` 引用。");
