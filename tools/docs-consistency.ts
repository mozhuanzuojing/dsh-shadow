// dsh-shadow —— tools/docs-consistency.ts：**当前态文档的派生字段一致性门**（v1.15.66）。
//
// 为什么需要它 —— 两条**实测**出来的缺陷，都是「文档里的派生字段悄悄腐烂」：
//
//   ① **三方版本一致**：`CHANGELOG.md` 的 v1.15.22 条目里写着「三方版本一致 ✅ 均 `1.15.22`」——
//      那是**发版仪式的一步**。实测（`git log -G'\\*\\*当前版本' -- README.md`）：该行自 `44bcc8b`（v1.7.0）
//      起**随每次发版更新**，一直维护到 `0be762e`（v1.15.40），之后**仪式静默断掉** ——
//      `v1.15.41`–`v1.15.65` 共 **25 个版本**没有更新它，全程**没有任何自动检查报错**。
//
//   ② **`verify` 链路的描述**：`README.md` 的「改代码后先过闸门」块与 `AGENTS.md` 的链路行
//      都没跟上 —— 它们漏了 `typecheck:tests`（v1.15.62 加的）与本工具所在的 `audit:docs`；
//      块里还写着一个手抄的检查数（「43 个行为测试 + 5 个工具自检 = 48 项」，实际已 56）。
//
// 两条缺陷同型 ⇒ **同一条一般化规则**：**任何能由其他数据推出来的字段（版本号、计数、链路清单），
// 要么别手写，要么配一道门。** 本文件就是那道门 —— ⚠ **本行不写条数**：v1.15.75 之前这里写着「两条检查」，
// 而同仓库的 `AGENTS.md` 写着「查三条」，**实际已有 4 条** ⇒ 同一件事三处三个数、且没有门守它。
// 条数以 `AGENTS.md` 的检查表行数（= 本文件导出的 `check*` 个数）为准。
//
// 用法：node tools/docs-consistency.ts [仓库根]
// 退出码：0 = 全部通过；1 = 不一致；2 = 结构缺失（找不到该有的锚点）。
import { readFileSync, readdirSync, statSync } from "node:fs";
import type { Dirent } from "node:fs";
import { join, resolve } from "node:path";
import { checkCitations } from "./citation-audit.lib.ts";

// ── 公共：读文件并**归一化行尾** ─────────────────────────────────────────────
/**
 * 本仓的工作副本是 **CRLF**（每次 `git` 操作都会打印
 * `warning: LF will be replaced by CRLF`）。**这不是细节** —— v1.15.68 的检查③
 * 就在这里栽过一次：分隔行是 `|----|\r`，而 `^\|[\s:|-]+\|$` 的 `$`（无 `m` 标志）
 * 只匹配「串尾或串尾的 `\n` 之前」，**不匹配 `\r` 之前** ⇒ 分隔行被当成数据行，
 * 于是「声明 18 行 / 实际 19 行」的**假警报**。
 * 当时我的第一反应是去改 README 的数字 —— 幸好先手工数了一遍（真值就是 18），
 * 才没把**对的文档改错**。⇒ 规则：**解析前先归一化行尾**；报「不一致」之前先怀疑测量。
 */
const readText = (root: string, rel: string): string => readFileSync(join(root, rel), "utf8").replace(/\r\n?/g, "\n");
const readLines = (root: string, rel: string): string[] => readText(root, rel).split("\n");

// ── 检查 1：三方版本一致 ─────────────────────────────────────────────────────
/**
 * 判据（三条必须**逐字**相等）：
 *   ① `package.json` 的 `version`
 *   ② `README.md` **行首**的「当前版本」行
 *   ③ `CHANGELOG.md` 的第一条 `## [vX.Y.Z]` 标题
 *
 * **行首锚定是刻意的**（v1.15.66 收紧，并配了诱饵测试）：旧版用「全篇第一处 `当前版本：`」，
 * 那么正文里任何一处提到「当前版本：」的举例/说明都会**抢走**匹配 ⇒ 门会去校验一句散文。
 * 现在只有行首那种粗体标题形态才算数。
 *
 * **为什么只查 README 这一行、不查全篇最大版本号**：README 底部的版本历史表**本来就该**含全部历史版本
 * （那是归档层）。拿「全篇最大」当判据会在归档与当前态之间来回误报 —— 与本仓 v1.15.65
 * 「过期行号只按文档分层不够、必须精确到行区间」是同一个坑。
 */
export const checkVersionConsistency = (root: string): { ok: boolean; code: number; lines: string[] } => {
  const read = (rel: string) => readText(root, rel);
  const norm = (s: string) => s.replace(/^v/, "").trim();

  let pkgVersion: string;
  try {
    pkgVersion = JSON.parse(read("package.json")).version;
  } catch (e: any) {
    return { ok: false, code: 2, lines: [`❌ 读不到 \`package.json\` 的 version：${e?.message || e}`] };
  }

  const readmeMatch = read("README.md").match(/^\*\*当前版本\s*[:：]\s*\**\s*`?v?(\d+\.\d+\.\d+)`?/m);
  const changelogMatch = read("CHANGELOG.md").match(/^##\s*\[v?(\d+\.\d+\.\d+)\]/m);

  if (!readmeMatch || !changelogMatch) {
    const lines = ["❌ **结构缺失**：找不到该有的锚点。"];
    if (!readmeMatch) lines.push("   · `README.md` 里没有**行首**的 `**当前版本：`vX.Y.Z`` 行 —— 它是 README 唯一声明「现在是什么版本」的地方，必须有（且必须是行首粗体形态）。");
    if (!changelogMatch) lines.push("   · `CHANGELOG.md` 里没有 `## [vX.Y.Z]` 形态的标题行。");
    return { ok: false, code: 2, lines };
  }

  const three = [
    { where: "package.json", value: norm(pkgVersion) },
    { where: "README.md「当前版本」行", value: norm(readmeMatch[1]) },
    { where: "CHANGELOG.md 首条标题", value: norm(changelogMatch[1]) },
  ];
  const uniq = [...new Set(three.map((t) => t.value))];
  if (uniq.length === 1) {
    return { ok: true, code: 0, lines: [`✔ ① 三方版本一致：**${uniq[0]}**`, ...three.map((t) => `     · ${t.where} = ${t.value}`)] };
  }
  return {
    ok: false, code: 1,
    lines: [
      "❌ ① **三方版本不一致** —— 这三个字段是同一件事的三种说法，任一落后就是文档在说谎：",
      ...three.map((t) => `     · ${t.where} = ${t.value}`),
      "",
      "  怎么修（发版时**三处一起改**）：`package.json` 的 `version` · `README.md` 的「当前版本」行 ·",
      "  `CHANGELOG.md` 新增的 `## [vX.Y.Z]` 条目（放最上面）。",
      "",
      "  ⚠ 历史：这条一致性曾是**发版仪式的一步**，从 v1.7.0 一直做到 v1.15.40；之后仪式静默断掉，",
      "  v1.15.41–v1.15.65 共 25 个版本没人发现（**习惯会静默失效，门不会**）。",
    ],
  };
};

// ── 检查 2：`verify` 链路的每一步都被文档点名 ────────────────────────────────
/**
 * 判据：`package.json` 的 `scripts.verify` 里出现的**每个** `npm run <name>`，以及非 npm 的那一步
 * （`npx tsc --noEmit`），必须逐字出现在 **`README.md` 的「改代码后先过闸门」代码块** 与
 * **`AGENTS.md` 的「构建与验证」段**里。
 *
 * ⚠ **为什么要**限定到那两块**（这是第一版的真缺陷，实测发现）**：
 * 第一版判据是「该名字在这份文档里**出现过**」—— 太松。实测：README 通篇 570+ 行，
 * `typecheck:tests` 恰好出现在**版本历史表**的一行里（v1.15.62 的记录），于是
 * **闸门块明明没列它、检查照样过** = **假绿**。⇒ 判据必须落在**该列它的那一块**上。
 * 两块的边界都是稳定锚点（README 用 `### 改代码后先过闸门` + 第一个 ```text 块；
 * AGENTS 用 `## 本仓库常用的构建与验证` 到下一个 `## `），故不需要 Markdown 解析器。
 *
 * ⚠ **仍然只是必要条件，不是充分条件**：它答的是「**有没有点名**」，答不了
 * 「点名的顺序/描述对不对」——那种要靠人读。**不得据它宣称文档正确**。
 *
 * **刻意不查「检查条数」**：那个数字由 `tools/run-tests.ts` 自己打印，属于**运行期读数**；
 * 文档里手抄它必然腐烂（实测 README 抄的是 **48**、当时已是 53+、现在 56）。⇒ 按本仓规则
 * **别手写**：文档只说「全部确定性检查，数量以 `npm run verify` 输出为准」。
 */
export const checkVerifyChainDocumented = (root: string): { ok: boolean; code: number; lines: string[] } => {
  const read = (rel: string) => readText(root, rel);

  /** 从 `text` 里取出「必须列全 verify 步骤」的那一块；取不到则返回 null（⇒ 结构缺失）。 */
  const gateBlock = (rel: string, text: string): string | null => {
    if (rel === "README.md") {
      const h = text.indexOf("### 改代码后先过闸门");
      if (h < 0) return null;
      const fence = text.indexOf("```text", h);
      if (fence < 0) return null;
      const end = text.indexOf("```", fence + 7);
      return end < 0 ? null : text.slice(fence, end);
    }
    // AGENTS.md：从段标题到下一个二级标题
    const h = text.indexOf("## 本仓库常用的构建与验证");
    if (h < 0) return null;
    const next = text.indexOf("\n## ", h + 1);
    return text.slice(h, next < 0 ? text.length : next);
  };

  let verify: string | undefined;
  try {
    verify = JSON.parse(read("package.json")).scripts?.verify;
  } catch { /* 下面统一报结构缺失 */ }
  if (!verify) return { ok: false, code: 2, lines: ["❌ ② `package.json` 里找不到 `scripts.verify`。"] };

  const npmSteps = [...verify.matchAll(/npm run ([A-Za-z0-9:_-]+)/g)].map((m) => m[1]);
  // 非 `npm run` 形态的步骤（目前只有插件面类型门）。写成字面量，新增时要一起加。
  const literalSteps = ["tsc --noEmit"];
  const required = [...new Set([...npmSteps, ...literalSteps])];

  const docs = [
    { rel: "README.md", label: "README.md 的「改代码后先过闸门」代码块" },
    { rel: "AGENTS.md", label: "AGENTS.md 的「构建与验证」段" },
  ];
  const missing: string[] = [];
  const noAnchor: string[] = [];
  /** 反向：文档里点名了、但 `verify` 里**没有**这一步。 */
  const ghost: string[] = [];
  for (const d of docs) {
    const text = read(d.rel);
    const block = gateBlock(d.rel, text);
    // **两种失败要分开**（`docs-consistency.selftest.ts` ⑨ 组逼出来的）：
    //   · **锚点消失** = **结构缺失（2）** —— 该列它的那一块不见了，读者拿不到任何清单；
    //   · **锚点在、但漏了某一步** = **不一致（1）** —— 结构好，内容旧。
    // 混成同一个退出码会让「有人把标题改名了」看起来像「漏了一步」，修法完全不同。
    if (block === null) { noAnchor.push(`${d.label} —— **找不到这一块**（锚点被改名/删掉了？）`); continue; }
    for (const step of required) if (!block.includes(step)) missing.push(`${d.label} 未点名 \`${step}\``);
    // ── **反向检查**（v1.15.68 补）：文档点名了、而 `package.json` 的 `verify` 里没有 ──
    //
    // 为什么必须有：正向检查（`verify` → 文档）**挡不住「门被从 `verify` 里摘掉」** ——
    // 摘掉之后 `required` 少一项，正向检查反而更宽松、照样全绿，而文档里那一行**变成死指针**
    // （历史实例：`CHANGELOG` 的 v1.15.22 条目把「三方版本一致」当成仪式的一步记着，
    //  而仪式停掉之后没有任何东西发现 —— 同一个盲区的另一种表现）。
    // 只看这个块里的名字，且只在它确实是「本仓脚本」时才报（`npm run` 之后的那一段）。
    for (const m of block.matchAll(/^[+=]\s*npm run ([A-Za-z0-9:_-]+)/gm)) {
      const name = m[1];
      if (!npmSteps.includes(name) && !ghost.includes(`${d.label} 点名了 \`${name}\`，但 \`verify\` 里没有它`)) {
        ghost.push(`${d.label} 点名了 \`${name}\`，但 \`verify\` 里没有它`);
      }
    }
  }

  if (noAnchor.length) {
    return {
      ok: false, code: 2,
      lines: ["❌ ② **结构缺失**：找不到「必须列全 verify 步骤」的那一块。", ...noAnchor.map((m) => `     · ${m}`)],
    };
  }

  if (ghost.length) {
    return {
      ok: false, code: 1,
      lines: [
        "❌ ② **文档点名了 `verify` 里没有的步骤**（门被摘掉 / 名字改了，而文档没跟上）：",
        ...ghost.map((m) => `     · ${m}`),
        "",
        `  当前 \`verify\` 的全部步骤：${required.join(" · ")}`,
      ],
    };
  }

  const header = `✔ ② \`verify\` 的 ${required.length} 步都被**该列它的那一块**点名，且两块的每个 \`npm run\` 都在 \`verify\` 里（双向）：${required.join(" · ")}`;
  if (!missing.length) return { ok: true, code: 0, lines: [header] };
  return {
    ok: false, code: 1,
    lines: [
      "❌ ② **`verify` 里有步骤没被文档点名**（或那一块消失了）—— 门加了、文档没跟上（实测发生过两次）：",
      ...missing.map((m) => `     · ${m}`),
      "",
      "  怎么修：写进 `README.md` 的「改代码后先过闸门」块 + `AGENTS.md` 的链路行。",
      `  当前 \`verify\` 的全部步骤：${required.join(" · ")}`,
    ],
  };
};

// ── 检查 3：README 默认开关表**声明的行数** = 实际数据行数 ────────────────────
/**
 * 判据：`README.md` 的表注 ⓪ 声明「⇒ **现 N 行**」，而那张表（表头 `| 能力 | 默认 |` 起、
 * 到 `**表注` 止）**实际的数据行数**必须等于 N。
 *
 * 这是「**计数字段**」这一类的最小可机械化样本（v1.15.68 补）：
 * v1.15.67 只给**链路清单**配了门，而**计数**只立了规则、没有落地 ——
 * 实测本仓至少还有两处手写计数在腐烂（`README` 的「现 18 行」、`BACKLOG` 头部的「现存 20 条」）。
 * 本仓无法给「任意计数」写通用门，但**这一处**有稳定的结构（表 + 声明的行数）⇒ 可以机械化。
 * ⇒ 它的价值不只是「守住这一个数」，更是**给出模式**：**能被数出来的东西，就去数它，别抄它。**
 *
 * 注意：**只认表注 ⓪ 那一句**（`现 N 行`），不认别处的「N 行」（README 里还有「原表 16 行」这类历史叙述，
 * 那属于**归档叙述**，不该跟着变）。用「⇒ **现 N 行**」这个具体形态锚定。
 */
export const checkDeclaredTableRows = (root: string): { ok: boolean; code: number; lines: string[] } => {
  const text = readText(root, "README.md");
  const lines = readLines(root, "README.md");

  const declared = text.match(/⇒\s*\*\*现\s*(\d+)\s*行\*\*/);
  if (!declared) {
    return { ok: false, code: 2, lines: ["❌ ③ **结构缺失**：`README.md` 里找不到「⇒ **现 N 行**」这句声明。"] };
  }
  const want = Number(declared[1]);

  const headerIdx = lines.findIndex((l) => l.startsWith("| 能力 | 默认 |"));
  if (headerIdx < 0) return { ok: false, code: 2, lines: ["❌ ③ **结构缺失**：找不到「默认开关」表的表头 `| 能力 | 默认 |`。"] };
  const noteIdx = lines.findIndex((l, i) => i > headerIdx && l.startsWith("**表注"));
  if (noteIdx < 0) return { ok: false, code: 2, lines: ["❌ ③ **结构缺失**：找不到该表的结束锚点 `**表注`。"] };

  // 数据行 = 表头之后、表注之前的 `|` 行，减去分隔行（`|---`）
  const rows = lines
    .slice(headerIdx + 1, noteIdx)
    .filter((l) => l.startsWith("|") && !/^\|[\s:|-]+\|$/.test(l));

  if (rows.length === want) {
    return { ok: true, code: 0, lines: [`✔ ③ README 默认开关表：声明 **${want} 行** = 实际 **${rows.length} 行**`] };
  }
  return {
    ok: false, code: 1,
    lines: [
      `❌ ③ **README 默认开关表的行数不一致**：声明 **${want} 行**，实际 **${rows.length} 行**。`,
      "  怎么修：加/删行之后**同时**改表注 ⓪ 的「现 N 行」；或**删掉那个数字**（本仓规则：能数出来的别抄）。",
    ],
  };
};

// ── 检查 4：README「当前版本」那一行**不得与 CHANGELOG 同名条目逐字重复** ─────
/**
 * 判据（v1.15.75 补，**因为同一个缺陷出现了三次**；**v1.15.92 换锚点**）：
 * `README.md` 的**当前版本行**（行首 `**当前版本：`），与 `CHANGELOG.md` 的同名条目之间，
 * **不得有 ≥ 40 字的连续逐字重复** —— 那一行应该是**摘要 + 指向**，不是第二份条目。
 *
 * ⚠ **锚点为什么从「版本历史表那一行」换成「当前版本行」**（v1.15.92 / `adr/0094`）：
 *   用户 2026-09-15 决定**删除 README 的版本历史表**（历史归 `CHANGELOG` —— 本仓「同一件事只写一处」）。
 *   表一删，旧锚点就**永久消失**：这条检查只会报「结构缺失」，不再回答任何问题。
 *   ⇒ 换到**每次发版都会更新**的当前版本行上：**用途一字未改**（挡住「把 CHANGELOG 条目整段抄进 README」），
 *   锚点换成不会消失的那一个。**这不是「改门掩盖失败」** —— 判据本身没动，且负对照 ⑮ 仍会响。
 *   （副作用：该分支通常已被检查① 覆盖 —— ① 也要求这一行存在；这里保留它作**兜底**，并在标定 ⑰ 里如实标注。）
 *
 * 由来（三次同病，每一次我都「当成个例修掉了事」）：
 *   v1.15.66 §5 整表复制 `adr/0085` §8.6 → v1.15.72 的 README 版本行整段复制 CHANGELOG
 *   → v1.15.74 的 README 版本行**又**整段复制（881 字，而 v1.15.73 那行 **1222 字**）。
 *   `AGENTS.md` 的文档归属表早写了「同一条事实出现在多层时，**每层只回答它自己那个问题**」，
 *   但**它只是散文** ⇒ 三次都没拦住。⇒ 按本仓自己的先例（检查 ②③ 都诞生于「同一处手工纪律反复失效」）：
 *   **反复失效的手工纪律要变成门**，而不是第四次靠自觉。
 *
 * 为什么**只查当前版本那一行**：历史行属于**归档叙述**（v1.15.71 起按「归档不改写」保留原样），
 * 拿新门去要求重写历史行，等于用一道门去改写归档 ⇒ 本检查**不碰历史**，只在**新的那一行被写出来时**拦住。
 *
 * 阈值 40：版本号、条目标题这类**必然重合**的短片段要放行（它们本就该一致），
 * 而一整句论证远超 40 字。**只有连续重合**才算 —— 换个说法复述不算（那正是「只回答自己那个问题」）。
 */
export const checkReadmeRowNotDuplicate = (root: string): { ok: boolean; code: number; lines: string[] } => {
  const readme = readLines(root, "README.md");
  const changelog = readText(root, "CHANGELOG.md");

  // ⚠ **不要在这里用含引号的正则字面量**（如 `/"version"\s*:\s*"([^"]+)"/`）：
  //   `audit-wiring.lib.ts` 的 `stripComments`/`maskStrings` 是**单趟状态机**，
  //   其**已知边界**就是「不处理正则字面量里的引号」——正则里的 `"` 会让它**错位**，
  //   把本文件**其后所有内容**当成字符串抹掉 ⇒ `audit:wiring` 会把这 4 个导出误报成「生产无调用点」。
  //   v1.15.75 实测：加完检查 ④ 后 a1 由 24 跳到 28，被 `audit:ratchet` 拦住（**工具互相干扰**那类缺陷）。
  //   ⇒ 这里直接 `JSON.parse`：既避开该边界，也比正则更对。
  let ver = "";
  try { ver = String(JSON.parse(readText(root, "package.json")).version ?? ""); } catch { /* 下面按缺失处理 */ }
  if (!ver) return { ok: false, code: 2, lines: ["❌ ④ **结构缺失**：`package.json` 里读不到 `version`。"] };

  const rowIdx = readme.findIndex((l) => l.startsWith("**当前版本："));
  if (rowIdx < 0) {
    return {
      ok: false, code: 2,
      lines: [`❌ ④ **结构缺失**：README 里找不到当前版本行（行首 \`**当前版本：\`）。`,
              "  怎么修：这一行是发版仪式的三处之一（见检查①），补上它 —— 本检查就是冲着「那一行」来的。"],
    };
  }

  const row = readme[rowIdx];
  // 在 CHANGELOG 里取同名条目（从 `## [vX.Y.Z]` 到下一条 `## [` 之间）。
  const start = changelog.indexOf(`## [v${ver}]`);
  if (start < 0) {
    return { ok: false, code: 2, lines: [`❌ ④ **结构缺失**：CHANGELOG 里找不到 \`## [v${ver}]\` 条目。`] };
  }
  const nextAt = changelog.indexOf("\n## [", start + 1);
  const entry = changelog.slice(start, nextAt > 0 ? nextAt : undefined);

  const WIN = 40;
  let worst = "";
  for (let i = 0; i + WIN <= row.length; i++) {
    const win = row.slice(i, i + WIN);
    if (entry.includes(win)) { worst = win; break; }
  }

  if (!worst) {
    return { ok: true, code: 0, lines: [`✔ ④ README 的当前版本行与 CHANGELOG 的 v${ver} 条目**无 ≥${WIN} 字逐字重复**（该行 ${row.length} 字）`] };
  }
  return {
    ok: false, code: 1,
    lines: [
      `❌ ④ **README 的当前版本行与 CHANGELOG 的 v${ver} 条目整段重复**：发现 ≥${WIN} 字的连续逐字片段 ——`,
      `  「${worst.slice(0, 60)}…」`,
      `  （该行 **${row.length} 字**。本缺陷已复发 5 次：v1.15.66 §5 / v1.15.72 / v1.15.74 / v1.15.90 / 本次。）`,
      "  怎么修：README 那一行**只留摘要 + 指向 `CHANGELOG`**；详细论证只写 `CHANGELOG` 与 `adr/` 下的 ADR。",
    ],
  };
};

// ── 检查 5：**已经过去的版本**必须都打过 tag ─────────────────────────────────
/**
 * 判据（v1.15.82 补，**因为「每发一版打一个 tag」这条仪式是用户提醒驱动的**）：
 * `CHANGELOG.md` 里所有 `## [vX.Y.Z]` 中，**已经过去的版本**（版本号 < `package.json.version`）
 * 若 ≥ 仪式起点，则**必须**存在同名 tag `vX.Y.Z`；缺一个就红。
 *
 * 由来：tag 这半边连续两次由**用户提醒**才发生（v1.15.77/78 是补打，v1.15.80 与 v1.15.81 都是
 * 用户先说「tag」）。而 `AGENTS.md` 自己写着「凡『每次发版都要做一次』的动作，**要么写进清单、
 * 要么配一道门**；靠记性 = 迟早停」—— 同一条纪律在 v1.15.66（三方版本一致，停了 25 个版本）
 * 与 v1.15.75（README 抄 CHANGELOG，第 4 次复发）上都是**先有门才停住**的 ⇒ 本轮把它配上。
 *
 * ⚠ **当前版本必须豁免，这不是偷懒而是结构决定的**：tag 要指向**该版本的发布提交**，
 * 而那笔提交只有在版本号改完之后才建得出来；本门跑在 `verify` 里 = **提交之前**
 * ⇒ 要求当前版本也必须有 tag 会让**每一次发版都在提交前误红**。
 * ⇒ 本门实际回答的是「**已经过去的版本有没有漏打 tag**」，代价是**迟一版**发现：
 * 漏打会在下一次发版时被抓住（而不是像 v1.15.4…v1.15.76 那样**攒到 73 个版本**）。
 *
 * **刻意不 spawn `git`**：一条只读的确定性判据不该依赖外部进程（本仓已有 `npm.cmd` 那类
 * 平台陷阱的教训），而且 fixtures 只要造一个假的 `.git/refs/tags/` 就能标定。
 * 两个来源都读：**松散 ref**（`git tag` 刚打的就是这种）与 `packed-refs`（`git gc` 之后的形态）。
 *
 * **不做的事**：不查远端有没有这个 tag（门里不联网），也不查 tag 指向哪个提交
 * （那要读对象库、要 spawn `git`）—— 「指向发布提交」仍靠发版时那句 `git rev-parse --short` 人工核对。
 */
const TAG_RITUAL_FROM = "1.15.77";

/** 版本号比较（只取 X.Y.Z 三段数字；缺段按 0）。仅用于本检查。 */
const cmpVer = (a: string, b: string): number => {
  const pa = a.split(".").map((n) => Number(n) || 0);
  const pb = b.split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};

/**
 * 读本工作副本**已有的 tag 名**；读不到 `.git` ⇒ `null`（调用方按**结构缺失**报，不是「通过」——
 * ADR-0049：缺件必须可见，**绝不把缺件说成已验证**）。
 */
export const readTags = (root: string): string[] | null => {
  let gitDir = join(root, ".git");
  try {
    const st = statSync(gitDir);
    if (st.isFile()) {
      // 工作树 / 子模块：`.git` 是个文件，内容形如 `gitdir: <path>`
      const m = readFileSync(gitDir, "utf8").match(/^gitdir:\s*(.+)$/m);
      if (!m) return null;
      gitDir = resolve(root, m[1].trim());
    } else if (!st.isDirectory()) return null;
  } catch { return null; }

  const tags = new Set<string>();
  const walk = (dir: string, prefix: string): void => {
    let entries: Dirent[];
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      // tag 名可以带 `/`（如 `release/v1`）⇒ 递归拼回相对路径
      if (e.isDirectory()) walk(join(dir, e.name), prefix + e.name + "/");
      else tags.add(prefix + e.name);
    }
  };
  walk(join(gitDir, "refs", "tags"), "");

  try {
    for (const line of readFileSync(join(gitDir, "packed-refs"), "utf8").split("\n")) {
      if (!line || line.startsWith("#") || line.startsWith("^")) continue;
      const ref = line.split(" ")[1];
      if (ref && ref.startsWith("refs/tags/")) tags.add(ref.slice("refs/tags/".length));
    }
  } catch { /* 没有 packed-refs 是正常形态（未 gc 过的仓） */ }

  return [...tags];
};

export const checkVersionTags = (root: string): { ok: boolean; code: number; lines: string[] } => {
  let ver = "";
  try { ver = String(JSON.parse(readText(root, "package.json")).version ?? ""); } catch { /* 下面按缺失处理 */ }
  if (!ver) return { ok: false, code: 2, lines: ["❌ ⑤ **结构缺失**：`package.json` 里读不到 `version`。"] };

  const versions = [...readText(root, "CHANGELOG.md").matchAll(/^##\s*\[v?(\d+\.\d+\.\d+)\]/gm)].map((m) => m[1]);
  if (!versions.length) {
    return { ok: false, code: 2, lines: ["❌ ⑤ **结构缺失**：`CHANGELOG.md` 里没有 `## [vX.Y.Z]` 形态的标题行。"] };
  }

  const tags = readTags(root);
  if (tags === null) {
    return {
      ok: false, code: 2,
      lines: [
        "❌ ⑤ **结构缺失**：读不到本工作副本的 tag 集（找不到 `.git`，或 `.git` 文件里没有 `gitdir:`）。",
        "  ⚠ 这**不是「通过」** —— 本门判的是「已经过去的版本有没有漏打 tag」，没有 tag 集就无从判定。",
        "  （ADR-0049：缺件必须可见，不得把缺件说成已验证。）",
      ],
    };
  }

  const past = [...new Set(versions)].filter((v) => cmpVer(v, TAG_RITUAL_FROM) >= 0 && cmpVer(v, ver) < 0);
  const have = new Set(tags);
  const missing = past.filter((v) => !have.has(`v${v}`));
  const scope = `仪式起点 v${TAG_RITUAL_FROM} · 当前 v${ver}（**豁免**）⇒ 逐版核对了 ${past.length} 个已过去的版本`;

  if (!missing.length) {
    return {
      ok: true, code: 0,
      lines: [`✔ ⑤ 已经过去的版本都打过 tag（${scope}；工作副本里共读到 ${have.size} 个 tag）`],
    };
  }
  return {
    ok: false, code: 1,
    lines: [
      `❌ ⑤ **有已经过去的版本漏打 tag**：${missing.map((v) => `\`v${v}\``).join(" · ")}`,
      `  （${scope}）`,
      "",
      "  怎么修：`git tag vX.Y.Z` → `git push origin main vX.Y.Z`（**精确指定**，不要 `--tags`）。",
      "  ⚠ 本门的能力边界：**当前版本被豁免**（它的 tag 必须在版本号那笔提交建好之后才打得出来，",
      "  而本门跑在提交之前）⇒ 漏打会在**下一次发版**时才被抓住（迟一版），但不会攒成一串。",
    ],
  };
};

// ── 检查 7：三处「验证基线」声明必须等于 `package.json` 的 `engines.dsh` ──────────
/**
 * 判据（v1.20.2 立）：**基线是能推出来的字段**（源 = `package.json` 的 `engines.dsh`），
 * 却被手写在当前态文档里；而此前**没有任何门**守它 —— 检查① 只比三方**版本号**，
 * `test/host-probe.test.ts` ⑥ 只比 `HOST_BASELINE` 与 `engines.dsh`。
 *
 * **由来（实测）**：`0706f4c` 把 `engines.dsh` 抬到 `0.1.7-alpha.2`，却**只改了代码**
 * （`index.ts` / `package.json` / `dist/index.js`），把 `README` 的基线表与「为什么」段、
 * `README` 当前版本行、`CONTEXT` 的「验证基线」术语全留在 `0.1.7-alpha.1` —— 而 `npm run verify`
 * **全绿**。本条就是冲着那次漏改来的。
 *
 * **三处**（一律按**行锚点**定位，不做全篇搜索 —— 否则正文里的举例/历史会抢走匹配，
 * 这正是检查① 在 v1.15.66 收紧过的那个坑）：
 *   ① `README.md` 的 `| 验证基线 |` 行 —— 必须含 `` `<基线>` `` 内联码
 *   ② `README.md` 的 `| 声明 |` 行 —— 必须含 `engines.dsh: ">=<基线>"`
 *   ③ `CONTEXT.md` 的 `| 验证基线…` 行 —— 必须含 `engines.dsh: ">=<基线>"`
 *
 * **能力边界（刻意窄 —— 加判据之前先读这段）**：
 *   · 只判这三处与源**是否相等**；**不判** `presets/README.md` 的「(current as of X)」这类
 *     **「上游当时状态」**叙述（那不是支持声明，与基线不是同一个问题）；
 *   · **不判**正文散文里对历史基线的追述（本仓口径：正文可以留历史，只锁**当前态取值**；
 *     `README` 里「为什么基线从 A 抬到 B」那段**本就该**含旧版本号）；
 *   · 缺结构（读不到 `engines.dsh`、`README` 没有基线表）报 **2**，**不报「通过」**（ADR-0049）。
 */
export const checkBaselineConsistency = (root: string): { ok: boolean; code: number; lines: string[] } => {
  const engineDsh = (() => {
    try {
      const v = JSON.parse(readText(root, "package.json"))?.engines?.dsh;
      return typeof v === "string" ? v : "";
    } catch { return ""; }
  })();
  // 与 `test/host-probe.test.ts` ⑥ 同一口径：去掉 `>=` 之类的前导非数字
  const src = engineDsh.replace(/^[^\d]*/, "").trim();
  if (!src) {
    return {
      ok: false, code: 2,
      lines: [
        "❌ ⑦ **结构缺失**：`package.json` 里读不到 `engines.dsh`。",
        "  ⚠ 这**不是「通过」** —— 源都读不到，就无从判三处文档对不对（ADR-0049：缺件必须可见）。",
      ],
    };
  }

  // 行锚点。注意 README 的 `| 验证基线 |` 是**精确单元格**（CONTEXT 那行带括号后缀，故两处正则不同）。
  const rowOf = (rel: string, re: RegExp): string | null => {
    for (const line of readLines(root, rel)) if (re.test(line)) return line;
    return null;
  };
  const readmeBaseline = rowOf("README.md", /^\|\s*验证基线\s*\|/);
  const readmeDecl = rowOf("README.md", /^\|\s*声明\s*\|/);
  const contextRow = rowOf("CONTEXT.md", /^\|\s*验证基线/);

  if (!readmeBaseline && !readmeDecl) {
    return {
      ok: false, code: 2,
      lines: [
        "❌ ⑦ **结构缺失**：`README.md` 里找不到 `| 验证基线 |` 或 `| 声明 |` 行（锚点没了）。",
        `  （源：\`package.json\` → \`engines.dsh: "${engineDsh}"\`）`,
        "  ⚠ 这**不是「通过」** —— 锚点消失，本门就不再回答任何问题（ADR-0049）。",
      ],
    };
  }

  // ⚠ **正则里绝不能出现裸引号**：`maskStrings` 不认正则字面量，会把 `"` 当成字符串开始 ⇒
  // 一路错配 ⇒ **把本文件从那一行起的其余部分全部空白化**（实测：连文件尾部的 CLI 都被抹掉，
  // `countCallSites` 于是数出 0 个调用点，`audit:ratchet` 报 a1 30 → 36）。故此处用 `\x22`。
  const declVersion = (line: string): string => (line.match(/engines\.dsh:\s*\x22>=([^\x22]+)\x22/)?.[1] ?? "").trim();
  const bad: string[] = [];
  if (readmeBaseline && !readmeBaseline.includes("`" + src + "`")) {
    bad.push("`README.md` 的 `| 验证基线 |` 行未含内联码 `" + src + "`");
  }
  if (readmeDecl) {
    const got = declVersion(readmeDecl);
    if (got !== src) bad.push("`README.md` 的 `| 声明 |` 行写的是 `" + (got || "（读不到 engines.dsh）") + "`");
  }
  if (contextRow) {
    const got = declVersion(contextRow);
    if (got !== src) bad.push("`CONTEXT.md` 的 `| 验证基线` 行写的是 `" + (got || "（读不到 engines.dsh）") + "`");
  }

  if (!bad.length) {
    return {
      ok: true, code: 0,
      lines: [`✔ ⑦ 三处「验证基线」声明都与 \`package.json\` 的 \`engines.dsh\` 一致（\`${src}\`；README 基线行/声明行 + CONTEXT 术语行）`],
    };
  }
  return {
    ok: false, code: 1,
    lines: [
      `❌ ⑦ **文档里的验证基线与 \`engines.dsh\` 不一致**（源 = \`${engineDsh}\` ⇒ \`${src}\`）：`,
      ...bad.map((b) => `  · ${b}`),
      "",
      "  怎么修：把上列各处的版本号改成与 `package.json` 的 `engines.dsh` 一致（抬基线时**三处一起改**）。",
      "  由来：`0706f4c` 抬了 `engines.dsh` 却只改代码，三处文档留在旧值，而当时**没有任何门**看得见。",
      "  ⚠ 边界：本门**不判**正文里对历史基线的追述（「为什么从 A 抬到 B」那段本就该含旧版本号）。",
    ],
  };
};

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (isMain || process.argv[1]?.endsWith("docs-consistency.ts")) {
  const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
  const results = [checkVersionConsistency(ROOT), checkVerifyChainDocumented(ROOT), checkDeclaredTableRows(ROOT), checkReadmeRowNotDuplicate(ROOT), checkVersionTags(ROOT), checkCitations(ROOT), checkBaselineConsistency(ROOT)];
  for (const r of results) for (const l of r.lines) console.log(l);
  const failed = results.find((r) => !r.ok);
  if (!failed) {
    console.log("");
    console.log("规则（本文件的由来）：**任何能由其他数据推出来的字段 —— 版本号 / 计数 / 链路清单 ——");
    console.log("要么别手写，要么配一道门。**");
  }
  process.exit(failed ? failed.code : 0);
}
