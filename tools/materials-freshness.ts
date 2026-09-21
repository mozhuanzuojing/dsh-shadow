#!/usr/bin/env node
// dsh-shadow —— tools/materials-freshness.ts：**材料新鲜度**（`vendor/_src` 里的 git 材料有没有落后）。
//
// 由来（用户 2026-09-20 指令）：「**材料里面的 git 每次访问先检查最新，并更新到最新**」。
// 本条规则的完整口径见 `AGENTS.md` 的同名小节（含两条更新路径的区别与三条硬边界）。
//
// ## 为什么不是一个无脑的 `git pull`
//
// 两个真实冲突，不处理就会制造本仓最讨厌的病（引用腐烂）：
//   1. **冻结快照**：`langextract--snapshot-v1.6.0` 这类目录**按设计**停在一个旧版本；
//      「更新到最新」= **它不再是那个快照**。⇒ 默认**不更新**，要更新得显式 `--include-frozen`。
//   2. **已记录的引用**：`references.md` / `adr/*` 里有 `文件:行号` 引用，它们**只对某一版成立**。
//      材料一动，那些引用就**烂了** ⇒ 更新前先报**「爆炸半径」**，更新后必须回头核对。
//
// ## 为什么不进 `verify`
//
// 它**要联网**。本仓的门**刻意不联网**（同族：`audit:docs` 检查⑤ 的 tag 核对用读 ref 文件实现）。
// 把要联网的东西塞进 `verify` ⇒ 离线的「全绿」会变成假红/假绿。⇒ 它是**约定 + 工具**，不是门。
//
// ## 性能（v1.18.3 重写：从**串行**改成**并发 + 计时**）
//
// 初版所有 git 调用都串行（`spawnSync`）：检查要依次问 24 个远端，更新要依次 fetch 5 个仓
// （`openclaw` 一个就 ~700MB）⇒「每次访问前先查」这条规则**自己**就成了负担。
// 现在：检查默认 **12 并发**、更新默认 **3 并发**，并**逐条与总计打印耗时**
// —— 慢要看得见，才谈得上改（本仓一贯口径：读数必须可解释）。
//
// 用法：
//   node tools/materials-freshness.ts                    # 只检查（含爆炸半径）
//   node tools/materials-freshness.ts --update           # **只把 HEAD 移到最新**（`reset --mixed`）——
//                                                        #   ⚠ **工作树不动 ⇒ 读文件读到的还是旧内容**
//   node tools/materials-freshness.ts --update --hard    # **连工作树一起更新**（`reset --hard`）——
//                                                        #   ⚠ **覆盖 vendored 拷贝**，且未跟踪文件不会被清
//   node tools/materials-freshness.ts --update --include-frozen   # 连冻结快照也动（危险，必须显式）
//   node tools/materials-freshness.ts --jobs 16          # 并发度（检查默认 12 / 更新默认 3）
import { execFile } from "node:child_process";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const ROOT = process.env.SHADOW_MATERIALS_ROOT ?? "D:\\project\\dsh1\\vendor\\_src";

const argv = process.argv.slice(2);
const DO_UPDATE = argv.includes("--update");
const INCLUDE_FROZEN = argv.includes("--include-frozen");
/** `--hard`：`reset --hard` ⇒ **工作树也被更新**（会覆盖 vendored 拷贝）。 */
const HARD = argv.includes("--hard");
const JOBS_ARG = (() => {
  const i = argv.indexOf("--jobs");
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : undefined;
})();
/** 检查是**大量小请求**（ls-remote）⇒ 并发可以高；更新是**大下载** ⇒ 并发低些以免互相挤带宽。 */
const JOBS = JOBS_ARG ?? (DO_UPDATE ? 3 : 12);

/**
 * `--only a,b`：**只查这几个**。
 *
 * 规则的常见场景是「**我接下来要访问某一个材料**」—— 那种时候为 24 个仓付网费没有道理。
 * 实测（2026-09-20）：24 个仓实查要 **~25s**，单个只要 **~1s** ⇒ 这一条比调并发有用得多。
 */
const ONLY = (() => {
  const i = argv.indexOf("--only");
  return i >= 0 && argv[i + 1] ? argv[i + 1].split(",").map((s) => s.trim()).filter(Boolean) : [];
})();

/**
 * 缓存 TTL（秒），默认 **600**。
 *
 * **为什么必须有它**：规则要求「**每次访问前**先查最新」。但实查一次要 ~25s（且对端会限流并发连接
 * —— 实测 12 并发并没有比串行快）⇒ 没有缓存，这条规则自己就会变成负担，最后一定被绕过。
 * 缓存只存「远端默认分支的 sha」，**不改变判定语义**：TTL 内直接用，过期就重查；
 * `--max-age 0` 强制实查。缓存文件放在**临时目录**（不污染工作区、不进版本控制）。
 */
const MAX_AGE = (() => {
  const i = argv.indexOf("--max-age");
  const v = i >= 0 ? Number(argv[i + 1]) : NaN;
  return Number.isFinite(v) && v >= 0 ? v : 600;
})();
const CACHE_PATH = join(tmpdir(), "dsh-materials-freshness.json");
type CacheEntry = { remote: string; branch: string; at: number };
const readCache = (): Record<string, CacheEntry> => {
  try {
    const parsed = JSON.parse(readFileSync(CACHE_PATH, "utf8")) as Record<string, CacheEntry>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    // 没有 / 坏了 ⇒ 当作**没有缓存**（于是重查），**不当作最新**（ADR-0049：缺件不静默）。
    return {};
  }
};

/** 冻结快照的目录名标记。**比较只在这里**（同一个字面量散在多处会被棘轮抓）。 */
const SNAPSHOT_MARK = "--snapshot-";
const isFrozenSnapshot = (name: string): boolean => name.includes(SNAPSHOT_MARK);

/**
 * GitHub 要走**代理**（用户 2026-09-20 提醒：「github 相关下载要用代理哦」）。
 *
 * 实测（本机 2026-09-20，`ls-remote` 往返）：
 *   继承环境变量 **972ms** · 显式 `-c http.proxy=…` **958ms** · **直连 1114ms**
 * ⇒ 小请求差别很小，**首次大 clone/fetch 才见真章**（`openclaw` 那种 ~700MB 的仓）。
 *
 * **为什么不靠继承**：`execFile` 的子进程默认会继承环境变量，所以它「碰巧能用」——
 * 但那是**隐式**的：换个不继承环境的宿主、或 `NO_PROXY` 被改，就会**静默退回直连**（慢，且没人知道为什么）。
 * ⇒ 这里**显式**取、显式传，并在输出里**打印用的是哪个代理**（没有代理也要**说出来**，不静默直连）。
 * 优先级：`SHADOW_GITHUB_PROXY` > `HTTPS_PROXY` > `https_proxy` > `HTTP_PROXY` > `http_proxy`。
 */
const PROXY = (() => {
  const explicit = process.env.SHADOW_GITHUB_PROXY;
  if (explicit) return explicit;
  for (const k of ["HTTPS_PROXY", "https_proxy", "HTTP_PROXY", "http_proxy"]) {
    const v = process.env[k];
    if (v) return v;
  }
  return "";
})();

/** 跑 git 取 stdout；失败返回 undefined（由调用方**显式**判缺件，不静默当成「没问题」）。 */
const git = (dir: string, args: string[]): Promise<string | undefined> =>
  new Promise((resolve) => {
    // 代理**显式**传给 git（见 PROXY 的注释：不靠子进程隐式继承环境）。
    const pre = PROXY ? ["-c", `http.proxy=${PROXY}`, "-c", `https.proxy=${PROXY}`] : [];
    execFile("git", [...pre, "-C", dir, ...args], { encoding: "utf8" }, (err, stdout) => {
      resolve(err ? undefined : String(stdout).trim());
    });
  });

/** **有界并发**映射：保持输入顺序，限制同时在跑的任务数。 */
const pool = async <T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> => {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= items.length) return;
      out[i] = await fn(items[i], i);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, worker));
  return out;
};

const ms = (t: number): string => (t >= 1000 ? `${(t / 1000).toFixed(1)}s` : `${t}ms`);

/**
 * 仓库里的文档（根下 + `adr/`），用于算「爆炸半径」。
 *
 * **爆炸半径 = 会因材料更新而腐烂的引用**，不是「提到过这个名字的文档」。
 * 初版按「名字出现在文档里」算，结果 `MATERIALS.md` / `CHANGELOG.md` **必然**提到每个材料
 * ⇒ 24 行全是「被引用」，信号被噪音淹掉。现在：排除**台账与归档**，且只算
 * **同一行同时含材料名与 `文件:行号`** 的那些 —— 那才是**会烂的**引用。
 */
const LEDGER_DOCS = new Set(["MATERIALS.md", "CHANGELOG.md"]);
/** `文件:行号` 形态（够用即可；判据是「这一行同时提到材料名」）。 */
const CITATION_RE = /[\w./\\-]+:\d+/;

const docs = (): { path: string; text: string }[] => {
  const out: { path: string; text: string }[] = [];
  const push = (dir: string, file: string, label: string) => {
    try {
      out.push({ path: label, text: readFileSync(join(dir, file), "utf8") });
    } catch {
      /* 读不到就跳过 */
    }
  };
  try {
    for (const f of readdirSync(REPO).filter((f) => f.endsWith(".md"))) push(REPO, f, f);
  } catch {
    /* 根读不到 */
  }
  const adrDir = join(REPO, "adr");
  try {
    for (const f of readdirSync(adrDir).filter((f) => f.endsWith(".md"))) push(adrDir, f, `adr/${f}`);
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
  let names: string[] = [];
  try {
    names = readdirSync(ROOT)
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
  return ONLY.length ? names.filter((n) => ONLY.includes(n)) : names;
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
  elapsed: number;
  cachedFor: number;
};

const t0 = Date.now();
const cache = readCache();
const refreshed: Record<string, CacheEntry> = {};
const cacheAgeOf = (e: CacheEntry): number => Math.round((Date.now() - e.at) / 1000);
const checked = await pool(dirs, JOBS, async (name): Promise<Row | { noGit: string }> => {
  const started = Date.now();
  const dir = join(ROOT, name);
  const frozen = isFrozenSnapshot(name);
  const cited = citedIn(name);
  const base = { name, dir, url: "", local: "", remote: "?", branch: "?", frozen, cited, cachedFor: 0 };
  if ((await git(dir, ["rev-parse", "--git-dir"])) === undefined) return { noGit: name };
  const url = (await git(dir, ["config", "--get", "remote.origin.url"])) ?? "";
  const local = (await git(dir, ["rev-parse", "--short", "HEAD"])) ?? "<无 HEAD>";
  const elapsed = () => Date.now() - started;
  if (!url) {
    return { ...base, local, verdict: "**无法判**（无远端）", elapsed: elapsed() };
  }
  // **缓存命中就不上网**（TTL 见 MAX_AGE）；否则实查一次 ls-remote（**不 fetch** ⇒ 不动本地）。
  const hit = cache[name];
  const useCache = !!hit && cacheAgeOf(hit) <= MAX_AGE;
  let branch = "?";
  let remoteSha = "";
  let cachedFor = 0;
  if (useCache) {
    branch = hit.branch;
    remoteSha = hit.remote;
    cachedFor = cacheAgeOf(hit);
  } else {
    const sym = (await git(dir, ["ls-remote", "--symref", url, "HEAD"])) ?? "";
    const refLine = sym.split("\n").find((l) => l.startsWith("ref:"));
    // ⚠ `--symref` 的 `ref:` 行**也以 `\tHEAD` 结尾** ⇒ 不能按 `endsWith("\tHEAD")` 取
    //   （初版就是这么写的，结果把 `ref:` 当成了 sha ⇒ 24/24 全报落后）。**必须按 40 位十六进制 sha 行取**。
    const headLine = sym.split("\n").find((l) => /^[0-9a-f]{40}\tHEAD$/.test(l)) ?? "";
    branch = refLine ? refLine.replace("ref: refs/heads/", "").replace(/\s+HEAD/, "").trim() : "?";
    remoteSha = headLine ? headLine.split(/\s+/)[0].slice(0, 7) : "";
    if (remoteSha) refreshed[name] = { remote: remoteSha, branch, at: Date.now() };
  }
  if (!remoteSha) {
    return { ...base, url, local, branch, verdict: "**无法判**（取不到远端，**不当作最新**）", elapsed: elapsed() };
  }
  const verdict =
    remoteSha === local
      ? "**最新**"
      : frozen
        ? `**落后** \`${local}\` → \`${remoteSha}\`（**冻结快照：默认不动**）`
        : `**落后** \`${local}\` → \`${remoteSha}\``;
  return { ...base, url, local, remote: remoteSha, branch, verdict, elapsed: elapsed(), cachedFor };
});

// 把**这次实查到的**写回缓存（命中缓存的那些原样保留）。写不进去**要说出来**，不静默。
try {
  writeFileSync(CACHE_PATH, JSON.stringify({ ...cache, ...refreshed }, null, 2));
} catch {
  console.log(`⚠ 缓存写入失败：${CACHE_PATH} ⇒ 下次仍会实查（不影响本次结论）`);
}

const rows = checked.filter((r): r is Row => !("noGit" in r));
const noGit = checked.filter((r): r is { noGit: string } => "noGit" in r).map((r) => r.noGit);
const checkMs = Date.now() - t0;

console.log("dsh-shadow 材料新鲜度（tools/materials-freshness.ts —— 检查只读；更新要显式 --update）");
console.log(`枚举根：${ROOT}`);
console.log("口径：本地 HEAD vs **远端默认分支**的当前 sha（`git ls-remote --symref`，**不 fetch**）。");
console.log(`模式：${DO_UPDATE ? `**--update${HARD ? " --hard（会覆盖工作树）" : "（只移 HEAD，**工作树不动**）"}**` : "只检查（只读）"}${INCLUDE_FROZEN ? " · --include-frozen" : ""} · 并发 ${JOBS}`);
console.log(`范围：${ONLY.length ? `**仅 ${ONLY.join(" · ")}**` : `全部（${dirs.length} 个）`} · 缓存 TTL **${MAX_AGE}s**（命中就不上网）· 缓存文件 \`${CACHE_PATH}\``);
console.log(
  PROXY
    ? `代理：**${PROXY}**（显式传给 git；设 \`SHADOW_GITHUB_PROXY\` 可覆盖）`
    : "代理：**（未设）⇒ 直连** —— GitHub 大下载会慢；设 `SHADOW_GITHUB_PROXY` 或 `HTTPS_PROXY`（本机常用 `http://127.0.0.1:9910`）",
);
console.log("");
console.log("| 目录 | 本地 | 远端最新 | 分支 | 冻结? | 判定 | 被引用于 | 耗时 |");
console.log("|---|---|---|---|---|---|---|---|");
for (const r of rows) {
  console.log(
    `| \`${r.name}\` | \`${r.local}\` | \`${r.remote}\` | ${r.branch} | ${r.frozen ? "**是**" : "否"} | ${r.verdict} | ${r.cited.length ? r.cited.join(" · ") : "—"} | ${ms(r.elapsed)}${r.cachedFor ? `（缓存 ${r.cachedFor}s）` : ""} |`,
  );
}

const stale = rows.filter((r) => r.verdict.startsWith("**落后**"));
const eligible = stale.filter((r) => !r.frozen);
const frozenStale = stale.filter((r) => r.frozen);

console.log("");
console.log(`小计：**${rows.length - stale.length}** 最新 · **${stale.length}** 落后（其中**冻结快照 ${frozenStale.length}**）· 无 \`.git\` **${noGit.length}**` +
    `　·　检查耗时 **${ms(checkMs)}**（${rows.length} 个仓 / 并发 ${JOBS} / 实查 ${Object.keys(refreshed).length} · 命中缓存 ${rows.length - Object.keys(refreshed).length}）`,
);
console.log(`提示：只看你要用的那个 `+ "`--only <目录名>`" + `（~1s）；强制重查 `+ "`--max-age 0`" + `。`);
if (noGit.length) console.log(`  ⚠ 无 .git（版本不可核）：${noGit.join(" · ")}`);

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

// ── 更新（**并发**：大下载，默认 3；每条报旧→新与耗时）──
console.log("");
console.log(`=== 更新（fetch --depth 1 + reset --${HARD ? "hard ⚠ 会覆盖工作树" : "mixed（工作树不动）"}；并发 ${JOBS}）===`);
const targets = INCLUDE_FROZEN ? stale : eligible;
if (targets.length === 0) console.log("  （没有可更新的：落后的都是冻结快照，需 --include-frozen）");
const t1 = Date.now();
await pool(targets, JOBS, async (r) => {
  const started = Date.now();
  const before = await git(r.dir, ["rev-parse", "--short", "HEAD"]);
  // **先报会被覆盖的规模**（`--hard` 之前必须看得见代价；`--mixed` 也报，便于对照）。
  const dirty = ((await git(r.dir, ["status", "--porcelain", "--untracked-files=normal"])) ?? "")
    .split("\n")
    .filter(Boolean);
  const fetched = await git(r.dir, ["fetch", "--depth", "1", "origin", r.branch]);
  if (fetched === undefined) {
    // fetch 失败也要**可见**（offline / 分支没了），绝不静默跳过。
    console.log(`  ✗ ${r.name}：fetch 失败（**保持原状**，不静默当作已更新）`);
    return;
  }
  await git(r.dir, ["reset", HARD ? "--hard" : "--mixed", "FETCH_HEAD"]);
  const after = await git(r.dir, ["rev-parse", "--short", "HEAD"]);
  console.log(
    `  ✔ ${r.name}：\`${before}\` → \`${after}\`（${r.branch} · ${ms(Date.now() - started)}）` +
      (dirty.length ? `  · 工作树原有差异 ${dirty.length} 处${HARD ? "（**已被上游覆盖**）" : "（**保留**）"}` : "") +
      (r.cited.length ? `  ⚠ 被 ${r.cited.join(" · ")} 引用 —— **回头核对**` : ""),
  );
});
console.log("");
console.log(`更新耗时 **${ms(Date.now() - t1)}**（并发 ${JOBS}；大仓是**下载**主导，并发太高只会互相挤带宽）。`);
console.log("⇒ 更新后**必须**：① 重跑 `node tools/materials-ledger.ts`（「工作树 vs HEAD」那一列会变）；");
console.log("   ② 核对上面带 ⚠ 的那些文档里的 `文件:行号` 引用。");
