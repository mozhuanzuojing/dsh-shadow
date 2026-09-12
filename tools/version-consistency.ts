// dsh-shadow —— tools/version-consistency.ts：**三方版本一致性门**（v1.15.66）。
//
// 为什么需要它 —— 这条检查**曾经存在过，但是一次性的**：
//   `CHANGELOG.md` 的 v1.15.22 条目第 10 行写着「三方版本一致 | `package.json` / `README` 当前版本行 /
//   `CHANGELOG` 首条 | ✅ 均 `1.15.22`」—— 那是**人工核验过一次**，不是一道门。
//   后果：到 v1.15.66 时，`package.json` 已是 `1.15.66`、`CHANGELOG` 首条是 `v1.15.66`，
//   而 `README` 的「当前版本」行**停在 `v1.15.40`**，落后 **26 个版本**，全程**没有任何东西报错**。
//   ⇒ 这正是本仓反复出现的同一族缺陷：**判据写在文档里靠人记得执行 = 没有判据**（ADR-0062 同族）。
//
// 判据（三条必须**逐字**相等，取最长的那串数字）：
//   ① `package.json` 的 `version`
//   ② `README.md` 的第一处「**当前版本：`vX.Y.Z`**」
//   ③ `CHANGELOG.md` 的第一条 `## [vX.Y.Z]` 标题
//
// 为什么只查 README 的这一行而不查 README 全篇的版本号：
//   README 底部的版本历史表**本来就应该**包含全部历史版本（那是归档层），
//   拿「全篇最大版本号」当判据会在归档与当前态之间来回误报（本仓 v1.15.65 刚吃过
//   「只按文档分层不够、必须按行区间分层」的教训）。**当前版本行**是 README 里
//   **唯一**声明「现在是什么版本」的字段 ⇒ 只查它。
//
// 退出码：0 = 三方一致；1 = 不一致（打印每处实际值 + 怎么修）；2 = 结构缺失（找不到那一行/那一条）。
//
// 用法：node tools/version-consistency.ts [仓库根]
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";

const read = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** 统一成 `X.Y.Z`（去掉 `v` 前缀）。 */
const norm = (s: string) => s.replace(/^v/, "").trim();

const pkg = JSON.parse(read("package.json")).version as string;

// README：**第一处**「当前版本：`vX.Y.Z`」。用宽松匹配（允许 Markdown 强调符）以免文档排版微调就报「结构缺失」。
const readmeText = read("README.md");
const readmeMatch = readmeText.match(/当前版本\s*[:：]\s*\**\s*`?v?(\d+\.\d+\.\d+)`?/);
// CHANGELOG：**第一条** `## [vX.Y.Z]` 标题。
const changelogText = read("CHANGELOG.md");
const changelogMatch = changelogText.match(/^##\s*\[v?(\d+\.\d+\.\d+)\]/m);

if (!readmeMatch || !changelogMatch) {
  console.error("❌ 结构缺失：找不到「当前版本」行或 `CHANGELOG` 首条版本标题。");
  if (!readmeMatch) console.error("   · `README.md` 里没有 `当前版本：`vX.Y.Z`` 形态的行 —— 该字段是 README 唯一声明「现在是什么版本」的地方，必须有。");
  if (!changelogMatch) console.error("   · `CHANGELOG.md` 里没有 `## [vX.Y.Z]` 形态的标题行。");
  process.exit(2);
}

const three = [
  { where: "package.json", value: norm(pkg) },
  { where: "README.md「当前版本」行", value: norm(readmeMatch[1]) },
  { where: "CHANGELOG.md 首条标题", value: norm(changelogMatch[1]) },
];

const uniq = [...new Set(three.map((t) => t.value))];
if (uniq.length === 1) {
  console.log(`✔ 三方版本一致：**${uniq[0]}**`);
  for (const t of three) console.log(`  · ${t.where} = ${t.value}`);
  process.exit(0);
}

console.error("❌ **三方版本不一致** —— 这三个字段是同一件事的三种说法，任一落后就是文档在说谎：");
for (const t of three) console.error(`  · ${t.where} = ${t.value}`);
console.error("");
console.error("怎么修（发版时**三处一起改**）：");
console.error("  1. `package.json` 的 `version`");
console.error("  2. `README.md` 的「当前版本」行（在版本历史表**表头之前**那一行）");
console.error("  3. `CHANGELOG.md` 新增的 `## [vX.Y.Z]` 条目（放最上面）");
console.error("");
console.error("⚠ 历史背景：这条检查在 v1.15.22 被**人工核验过一次**（`CHANGELOG.md` 当时的第 10 项），");
console.error("  但**没有做成门** ⇒ README 那一行静默落后了 26 个版本而无人报错。");
console.error("  这正是「判据靠人记得执行 = 没有判据」那一族（ADR-0062）。");
process.exit(1);
