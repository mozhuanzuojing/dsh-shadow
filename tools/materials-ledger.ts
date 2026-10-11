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
// ## `walk` 为什么必须按 **realpath** 给目录去重（2026-10-11 修；由来：材料落盘那一轮把它跑成「卡 40 分钟」）
//
// **缺陷**：旧 `walk` 用 `statSync(full)` 判目录后**直接递归** —— 既不 realpath 去重、也不跳 reparse point。
// 而 `dsh-w/deepseek-harness` 下有**大量 reparse point**（实测 637 个 / 609 个不同 target、单层扇入 ≤3），
// 且 `vendor` 子树里**互相成环**（例：`vendor/group/node_modules/@deepseek-ai/cordis → vendor/cordis`）
// ⇒ 路径被指数化：同一命令实测卡在 `dsh-w` **40+ 分钟 / 1716 s CPU** 被 kill。
//
// **修法**：只加**目录级 realpath 去重**（每份真实目录只下降一次）。**为什么不止步于「祖先栈守卫」**
// （只切真环）—— 实测（`dsh-w/deepseek-harness/vendor`：真实 90 目录 / 346 文件）：
//   · 祖先栈守卫：635 目录访问 / 3,624 文件（**放大 10×**）· 3,635 ms；
//   · 目录级去重：**90 目录访问 / 346 文件**（= 真实内容）· **379 ms**。
// ⇒ 只切环仍会把同一批真实目录**重复计数**（菱形扇入），读数偏大；目录级去重同时切环与菱形，
//   并且**对没有链接的树读数完全不变**（没有真实目录会被访问第二次）。
//
// **能力边界（必须知道）**：
//   · 链接**仍会被跟随**（第一次到达时）⇒ 只在链接后面才可达的内容**算进**该材料；
//   · 同一真实目录经多条链接到达时**只计一次**（旧行为会重复计）⇒ link 密集的材料**读数会变小**；
//     无链接的材料读数不变（`MATERIALS.md` §5 记了这件事）。
//   · 大小写不敏感的平台（`win32` / `darwin`）按**折叠大小写**比较路径 —— 否则同一目录的两种写法
//     会被当成两个 ⇒ **又掉回环里**（`pathKey` 是这条判据的唯一一处）。
//   · 文件仍**按条目计**（硬链接的两个名字照旧各算一个）—— 去重只发生在**目录**这一层。
//
// **人工复现**（不需要管理员权限、不依赖本机特殊目录 —— `mklink /J` 建 junction 不需要管理员）：
//   ```powershell
//   $t = Join-Path $env:TEMP "ml-repro"; Remove-Item $t -Recurse -Force -EA 0
//   New-Item -ItemType Directory -Force "$t\mat\real\deep" | Out-Null
//   Set-Content "$t\mat\real\deep\leaf.txt" "x"
//   cmd /c mklink /J "$t\mat\real\deep\loop" "$t\mat\real"   # 真环：loop 指回 real
//   cmd /c mklink /J "$t\mat\mirror"         "$t\mat\real"   # 菱形：mirror 也指向 real
//   node tools/materials-ledger.ts $t                         # 修前不返回（环）；修后 1 文件 / 0 KB
//   ```
//   （同一条判据的自检在 `tools/materials-ledger.selftest.ts`，已自动进 `verify`。）
//
// **本工具只答「名册面」（存在什么 / 多大 / 什么版本 / 什么许可）。**
// 「已吸收什么 / 未读什么 / 下一步」**不可机械推** ⇒ 只对已核过的给结论，其余标 `未核`、**不编**
// （与 `tools/module-ownership.ts` 对 `Owns`/`Writes` 的处理同款）。
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import { exclusionLine, isMaterialDir, MATERIALS_ROOT_ENV, requireMaterialsRoot } from "./materials-root.lib.ts";

/**
 * 枚举根：位置参数 → 环境变量 → **缺件即拒**。
 * 「没有写死的默认根」这条判据与它的报文**都在 `tools/materials-root.lib.ts`**（两个工具共用一份，`adr/0111`）。
 */
const ROOT = requireMaterialsRoot(
  process.argv[2] ?? process.env[MATERIALS_ROOT_ENV],
  `用法 \`node tools/materials-ledger.ts <枚举根>\`（或设 ${MATERIALS_ROOT_ENV}）。`,
);

/** 跑 git 并取 stdout；失败返回 undefined（由调用方决定是降级还是标缺件）。 */
const git = (dir: string, args: string[]): string | undefined => {
  try {
    // `core.abbrev=8` **钉死缩写位数**：`%h` 的长度由 git 自适应（随仓变大而变长），
    // 于是同一份台账**每次重跑都无谓地产生 diff**——实测 2026-09-25：三个仓同时给出
    // 7 位（agent-skills）与 9 位（openclaw / OpenViking）三代长度，而这**不是**材料变了。
    // 钉住之后输出确定 ⇒ 重跑只在真有变化时才 diff（本表是生成物，diff 噪声=维护负担）。
    const r = spawnSync("git", ["-c", "core.abbrev=8", "-C", dir, ...args], { encoding: "utf8" });
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

/**
 * 「同一个真实目录」的**唯一判据**（`walk` 的去重键）。
 *
 * 大小写：`realpathSync` 在**大小写不敏感**的文件系统上对同一目录**可能给出不同大小写的字符串**
 * （链接对象里存的是创建时那份写法）⇒ 不折叠就会把同一目录当成两个 ⇒ **重新掉回环里**。
 * 折叠只对大小写不敏感的平台做：在大小写敏感的平台上折叠会把两个不同目录误判成一个（**少计**）。
 */
const CASE_INSENSITIVE_FS = new Set(["win32", "darwin"]);
const pathKey = (p: string): string => (CASE_INSENSITIVE_FS.has(process.platform) ? p.toLowerCase() : p);

/**
 * 递归收集文件路径（口径：**含**隐藏文件；`includeGit=false` 时跳过 `.git`）。
 *
 * ⚠ **每份真实目录只下降一次**（`visited` 按 realpath 去重）—— 缺陷、两种守卫的实测对照、
 * 能力边界与人工复现命令都在**文件头**。去重只发生在**目录**这一层：
 * 文件仍按条目计（硬链接的两个名字各算一个）；**没有链接的树读数与修前逐字节相同**。
 */
const walk = (dir: string, includeGit: boolean): string[] => {
  const out: string[] = [];
  const visited = new Set<string>();
  /** realpath 读不到 ⇒ 退回字面路径：宁可漏切一次环，也不让整张台账因一个坏链接崩掉。 */
  const realOf = (p: string): string => {
    try {
      return realpathSync(p);
    } catch {
      return p;
    }
  };
  visited.add(pathKey(realOf(dir)));
  const rec = (d: string): void => {
    for (const name of readdirSync(d)) {
      if (!includeGit && isGitDir(name)) continue;
      const full = join(d, name);
      let st;
      try {
        st = statSync(full);
      } catch {
        continue;
      }
      if (!st.isDirectory()) {
        out.push(full);
        continue;
      }
      const key = pathKey(realOf(full));
      if (visited.has(key)) continue; // ← 真环与菱形都在这一行被切断
      visited.add(key);
      rec(full);
    }
  };
  rec(dir);
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
  "DeepSeek-Bot--snapshot-v0.1.0": "**冻结快照**（状态面见 `MATERIALS.md` §2.11；判定 `adr/0112`）",
};

const dirs: string[] = (() => {
  try {
    return readdirSync(ROOT)
      .filter((n) => {
        if (!isMaterialDir(n)) return false; // 口径的第二半（排除）—— 与 `枚举、口径打印` 同一判据
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
/** 枚举时刻（本地时区）：清单口径**必须**带它 —— 否则换机后不可复核（`references.md` §14 立的判据）。 */
const nowLocal = (): string => new Date().toLocaleString("sv-SE", { timeZoneName: "short" });

console.log(`枚举根：${ROOT}`);
console.log(`枚举时刻：${nowLocal()}`);
console.log(exclusionLine());
console.log("枚举口径：目录 = 根下第一层（**已过排除表**）；文件/字节 = 递归、**含**隐藏文件（分「含 .git」「不含 .git」两栏）；");
console.log("          目录 = 递归时**按 realpath 去重**（同一真实目录只下降一次 ⇒ 切断 link 环/菱形放大；文件仍按条目计）；");
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
  // **计数必须实算**：这里原先是写死的「24/24」。实测（2026-10-07）实跑 4 个目录时它照样打印「24/24」
  // ⇒ 那正是本仓判据「能推出来的字段不要手写」（`AGENTS.md` / `adr/0085` §8.7）被违反在生成器自己身上。
  console.log(`✔ **${dirs.length}/${dirs.length} 都有 \`.git\` 且都取到了 HEAD**（v1.18.1 补：原先 18 个没有 \`.git\`）。`);
  console.log("  ⚠ **但「有 HEAD」≠「本地拷贝等于那一版」** —— 看「工作树 vs HEAD」一列：");
  console.log("  差 0 处才是逐文件一致；差 N 处表示这份**vendored 拷贝**与上游那一版**不同**（被裁剪/改动/版本略偏）。");
}
console.log("");
console.log("⚠ `台账状态` 一列**不可机械推** ⇒ 只对已核过的给结论，其余 `未核`。");
console.log("  逐项的「已吸收 / 未读 / 下一步」在 `MATERIALS.md` §2 与 `references.md`，**不在本输出里**。");
