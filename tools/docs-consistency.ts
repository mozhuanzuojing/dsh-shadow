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
// 要么别手写，要么配一道门。** 本文件就是那道门（两条检查）。
//
// 用法：node tools/docs-consistency.ts [仓库根]
// 退出码：0 = 两条都过；1 = 不一致；2 = 结构缺失（找不到该有的锚点）。
import { readFileSync } from "node:fs";
import { join } from "node:path";

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
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");
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
  const read = (rel: string) => readFileSync(join(root, rel), "utf8");

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
  for (const d of docs) {
    const text = read(d.rel);
    const block = gateBlock(d.rel, text);
    // **两种失败要分开**（`docs-consistency.selftest.ts` ⑨ 组逼出来的）：
    //   · **锚点消失** = **结构缺失（2）** —— 该列它的那一块不见了，读者拿不到任何清单；
    //   · **锚点在、但漏了某一步** = **不一致（1）** —— 结构好，内容旧。
    // 混成同一个退出码会让「有人把标题改名了」看起来像「漏了一步」，修法完全不同。
    if (block === null) { noAnchor.push(`${d.label} —— **找不到这一块**（锚点被改名/删掉了？）`); continue; }
    for (const step of required) if (!block.includes(step)) missing.push(`${d.label} 未点名 \`${step}\``);
  }

  if (noAnchor.length) {
    return {
      ok: false, code: 2,
      lines: ["❌ ② **结构缺失**：找不到「必须列全 verify 步骤」的那一块。", ...noAnchor.map((m) => `     · ${m}`)],
    };
  }

  const header = `✔ ② \`verify\` 的 ${required.length} 步都被**该列它的那一块**点名：${required.join(" · ")}`;
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

// ── CLI ─────────────────────────────────────────────────────────────────────
const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, "/").split("/").pop()!);
if (isMain || process.argv[1]?.endsWith("docs-consistency.ts")) {
  const ROOT = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : ".";
  const results = [checkVersionConsistency(ROOT), checkVerifyChainDocumented(ROOT)];
  for (const r of results) for (const l of r.lines) console.log(l);
  const failed = results.find((r) => !r.ok);
  if (!failed) {
    console.log("");
    console.log("规则（本文件的由来）：**任何能由其他数据推出来的字段 —— 版本号 / 计数 / 链路清单 ——");
    console.log("要么别手写，要么配一道门。**");
  }
  process.exit(failed ? failed.code : 0);
}
