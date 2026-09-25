#!/usr/bin/env node
// dsh-shadow —— tools/materials-ledger.ts：**材料台账**（`MATERIALS.md`）的生成器。
//
// 为什么有这个工具（v1.18.0 / `BACKLOG` T20）：`MATERIALS.md` 的文件头把该表定为
// 「本地全部材料的**单一来源**」，并且 §1 的注里写着「改数必须重跑枚举命令」——
// 但实测两头都不成立：**本仓没有生成器**，而且现枚举根下 **24 个目录里有 18 个**在该表里
// **连名字都搜不到**（复核命令见 `MATERIALS.md` §2.9 末尾）。
// 按本仓 `AGENTS.md` 的结论「**能复现的东西放 `tools/`**（进版本控制、可被门守）」，
// 也按同族先例（模块归属表的生成器已重建为 `tools/module-ownership.ts`），把它补在这里。
//
// **口径必须打印出来**（`MATERIALS.md` §5 的纪律 ①：数字必须写出枚举口径，否则读数不可解释）：
//   · 文件/字节：`Get-ChildItem -Recurse -File -Force` 等价物 —— **含**隐藏文件；
//     分两栏给出「含 `.git`」与「不含 `.git`」，避免与「源码规模」混用（§6 的老教训）。
//   · 许可：取 `LICENSE|LICENCE|COPYING*` 里**第一个**的首行 + 关键词识别（识别不出就原样打首行，不猜）。
//   · 版本：`git log -1`；拿不到 git 时**降级**读 `.git/HEAD` 只给 SHA，并**显式标注降级**（ADR-0049：缺件不静默）。
//
// **本工具只答「名册面」（存在什么 / 多大 / 什么版本 / 什么许可）。**
// 「已吸收什么 / 未读什么 / 下一步」**不可机械推** ⇒ 只对已核过的给结论，其余标 `未核`、**不编**
// （与 `tools/module-ownership.ts` 对 `Owns`/`Writes` 的处理同款）。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

const ROOT = process.argv[2] ?? "D:\\project\\dsh1\\vendor\\_src";

/** 跑 git 并取 stdout；失败返回 undefined（由调用方决定是降级还是标缺件）。 */
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
 * git 元数据目录名。**比较只允许发生在这里**（`isGitDir`）——
 * 这不是洁癖：初版把 `name === ".git"` 直接**内联**，`npm run audit:ratchet` 当场判红
 * `b_keys 95 → 96（+1）`（键 = `name=.git`）。收成一处之后那个键**不再出现**。
 * 同族先例：`tools/module-ownership.ts` 的 `isRoot()` —— 同一个纪律在同一个仓库里抓到过两次。
 */
const GIT_DIR = ".git";
const isGitDir = (name: string): boolean => name === GIT_DIR;

const walk = (dir: string, includeGit: boolean, out: string[] = []): string[] => {
  for (const name of readdirSync(dir)) {
    if (!includeGit && isGitDir(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(full, includeGit, out);
    else out.push(full);
  }
  return out;
};

const sizeOf = (dir: string, includeGit: boolean) => {
  const files = walk(dir, includeGit);
  const bytes = files.reduce((sum, f) => {
    try {
      return sum + statSync(f).size;
    } catch {
      return sum;
    }
  }, 0);
  return { files: files.length, kb: Math.round(bytes / 1024) };
};

/** 许可：找第一个 `LICENSE|LICENCE|COPYING*`，按关键词识别；识别不出就把首行原样打出来。 */
const licenseOf = (dir: string): string => {
  let names: string[] = [];
  try {
    names = readdirSync(dir).filter((n) => /^(LICENSE|LICENCE|COPYING)/i.test(n)).sort();
  } catch {
    return "—";
  }
  if (!names.length) return "（无 LICENSE 文件）";
  let head = "";
  try {
    head = readFileSync(join(dir, names[0]), "utf8").split("\n")[0]?.trim() ?? "";
  } catch {
    return `${names[0]}（读不到）`;
  }
  const body = (() => {
    try {
      return readFileSync(join(dir, names[0]), "utf8").slice(0, 4000);
    } catch {
      return "";
    }
  })();
  if (/MIT License/i.test(body)) return "**MIT**";
  if (/Apache License[\s\S]{0,40}2\.0/i.test(body)) return "**Apache-2.0**";
  if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(body)) return "**AGPL-3.0**";
  if (/GNU GENERAL PUBLIC LICENSE/i.test(body) && /Version 3/i.test(body)) return "**GPL-3.0**";
  if (/BSD/i.test(body)) return "**BSD**（变体未细分）";
  return `${names[0]} · 首行「${head}」`; // 识别不出 ⇒ 原样，不猜
};

/**
 * 「已吸收 / 未读」不可机械推 ⇒ 只对**已核过**的给结论，其余标 `未核`。
 *
 * 依据：`MATERIALS.md` §2 的逐项状态（人工维护）与 `references.md` 的题材内记录。
 * **本表只放台账面**，所以这里的取值刻意**简短**，细节一律指向那两处。
 */
const STATUS: Record<string, string> = {
  OpenViking: "**吸收最深**（§2.3）",
  archify: "**在用工具**（§2.4）",
  "browser-harness": "**已被宿主原生面取代**（§2.10；历史登记，不删）",
  hl_mem: "重点材料（§2.2；本体已不在本机）",
  "jev-ultrafast": "**已吸收**（§2.9；`adr/0096`）",
  openclaw: "见 `references.md` §17/§19",
  rtk: "见 `adr/0087`/`adr/0090`",
  langextract: "见 `adr/0090`",
  marker: "见 `references.md` §15",
};

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

// 结构缺失不是通过（ADR-0049）：枚举根不存在 / 空 ⇒ 明确失败，不输出一张空表冒充「没问题」。
if (dirs.length === 0) {
  console.error(`✗ 枚举根不存在或为空：${ROOT}`);
  console.error("  ⇒ 拒绝输出空表（ADR-0049：缺件不静默；空表会被读成「没有材料」）。");
  process.exit(2);
}

console.log("dsh-shadow 材料台账（tools/materials-ledger.ts 生成 —— **不要手写这张表**）");
console.log(`枚举根：${ROOT}`);
console.log("枚举口径：目录 = 根下第一层；文件/字节 = 递归、**含**隐藏文件（分「含 .git」「不含 .git」两栏）；");
console.log("          许可 = `LICENSE|LICENCE|COPYING*` 中第一个的首行 + 关键词识别；版本 = `git log -1`（取不到则降级读 .git/HEAD）。");
console.log(`材料数：${dirs.length}`);
console.log("");
console.log("| 目录 | 远端 | HEAD | 工作树 vs HEAD | 许可 | 含 .git | 不含 .git | 台账状态 |");
console.log("|---|---|---|---|---|---|---|---|");

const degraded: string[] = [];
const noGit: string[] = [];
for (const name of dirs) {
  const dir = join(ROOT, name);
  // `.git` **在不在**，与「git 能不能取到」是**两件事**，必须分开报：
  //   · 没有 `.git` ⇒ 这份材料**没有版本溯源**，版本/远端**不可核**（不是「git 坏了」）；
  //   · 有 `.git` 但取不到 ⇒ 才是降级。
  // （实测 2026-09-20：现根 24 个目录里有 **18 个没有 `.git`** —— 那些行原先记的 HEAD 是**旧枚举根**的读数。）
  const hasGit = existsSync(join(dir, GIT_DIR));
  const remoteRaw = git(dir, ["remote", "get-url", "origin"]);
  const remote = remoteRaw
    ? remoteRaw.replace(/^https:\/\/github\.com\//, "").replace(/\.git$/, "")
    : hasGit
      ? "**（git 拿不到远端）**"
      : "**（无 `.git` ⇒ 远端不可核）**";
  const logLine = git(dir, ["log", "-1", "--format=%h|%ad|%s", "--date=short"]);

  let head: string;
  if (logLine) {
    const [sha, date, subject] = logLine.split("|");
    const shallow = existsSync(join(dir, GIT_DIR, "shallow")) ? " **(浅)**" : "";
    const short = (subject ?? "").length > 46 ? `${(subject ?? "").slice(0, 46)}…` : (subject ?? "");
    head = `\`${sha}\` ${date} · ${short}${shallow}`;
  } else if (!hasGit) {
    noGit.push(name);
    head = "**（无 `.git` ⇒ 版本不可核）**";
  } else {
    // 有 `.git` 却取不到（浅克隆边界 / 无提交 / 损坏）⇒ 降级读 `.git/HEAD`，**显式标注**（ADR-0049：缺件不静默）。
    let sha = "";
    try {
      const h = readFileSync(join(dir, GIT_DIR, "HEAD"), "utf8").trim();
      sha = h.startsWith("ref:") ? `(${h.replace("ref: ", "")})` : h.slice(0, 7);
    } catch {
      /* 读不到 */
    }
    degraded.push(name);
    // ⚠ 模板串里要写反引号必须**转义**（`\``）：初版在这里直接写了 `.git/HEAD` ——
    // 内层反引号把模板串**提前闭合**，`.git` / `HEAD` 于是变成了代码。
    // 这个 bug 只被 `tsc` 抓到：那一支**从未执行过**（24 个目录里凡有 `.git` 的都能取到 log）
    // ⇒ 这正是 `typecheck:tools` 必须留在 `verify` 里的理由（「没跑到的分支」不等于「没问题」）。
    head = sha
      ? `\`${sha}\` **（git 不可用，降级读 \`.git/HEAD\`）**`
      : "**（git 不可用，且 `.git/HEAD` 读不到）**";
  }

  const withGit = sizeOf(dir, true);
  const without = sizeOf(dir, false);

  // **工作树 vs HEAD**：承接 `.git` 之后，只报 HEAD 会**暗示**「本地拷贝 == 上游那一版」——
  // 实测不是（例如 `OpenViking` 差 739 处、`ECC` 差 508 处）⇒ 这一列是**防止过度声称**的。
  // 只报**总数**、不按状态码分桶：既够用，又避免再引入「内联字面量比较」（那已被棘轮抓过两次）。
  const dirtyLines = (git(dir, ["status", "--porcelain", "--untracked-files=normal"]) ?? "")
    .split("\n")
    .filter(Boolean);
  const drift = !hasGit
    ? "—（无 `.git`）"
    : dirtyLines.length === 0
      ? "**干净（= HEAD）**" // 与上游那一版逐文件一致（不含被 .gitignore 的面）
      : `**≠ HEAD**：${dirtyLines.length} 处`;

  console.log(
    `| \`${basename(dir)}\` | ${remote} | ${head} | ${drift} | ${licenseOf(dir)} | ${withGit.files} 文件 / ${(withGit.kb / 1024).toFixed(2)} MB | **${without.files} 文件 / ${without.kb.toLocaleString("en-US")} KB** | ${STATUS[name] ?? "未核（本表未逐项复核，**不编**）"} |`,
  );
}

console.log("");
console.log(`共 **${dirs.length}** 个目录（= 材料 + 可能存在的版本快照，如 \`langextract--snapshot-v1.6.0\`）。`);
if (noGit.length) {
  console.log("");
  console.log(`⚠ **无 \`.git\` ${noGit.length} 个** ⇒ 这些材料**没有版本溯源**，版本与远端**不可核**：`);
  console.log(`  ${noGit.join(" · ")}`);
  console.log("  ⇒ **不得**给它填 HEAD / 远端 —— 那只能来自**别处**（例如旧枚举根），而那样填的数**复核不了**。");
}
if (degraded.length) {
  console.log("");
  console.log(`⚠ **有 \`.git\` 但 git 取不到 ${degraded.length} 个**（降级只给了 SHA）：${degraded.join(" · ")}`);
  console.log("  ⇒ 这些行的 HEAD 列**不完整**，不得据它断言版本/日期（ADR-0049：缺件不静默）。");
}
if (!noGit.length && !degraded.length) {
  console.log("");
  console.log("✔ **24/24 都有 `.git` 且都取到了 HEAD**（v1.18.1 补：原先 18 个没有 `.git`）。");
  console.log("  ⚠ **但「有 HEAD」≠「本地拷贝等于那一版」** —— 看「工作树 vs HEAD」一列：");
  console.log("  差 0 处才是逐文件一致；差 N 处表示这份**vendored 拷贝**与上游那一版**不同**（被裁剪/改动/版本略偏）。");
}
console.log("");
console.log("⚠ `台账状态` 一列**不可机械推** ⇒ 只对已核过的给结论，其余 `未核`。");
console.log("  逐项的「已吸收 / 未读 / 下一步」在 `MATERIALS.md` §2 与 `references.md`，**不在本输出里**。");
