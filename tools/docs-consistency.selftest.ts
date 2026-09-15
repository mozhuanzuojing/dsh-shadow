// dsh-shadow —— tools/docs-consistency.selftest.ts：**派生字段门**的标定（v1.15.66）。
//
// 纪律（ADR-0062 / v1.15.60）：**CLI 的行为要 spawn 子进程验** —— 否则「退出码写错」这类缺陷
// 在测试里永远看不见，而 `npm run verify` 正是靠**退出码**串起来的。
//
// 全是**正/负对照**：把门改成「永远 0」则全部负对照红；改成「永远 1」则正对照红。
//   ①三方一致⇒0  ②README 落后⇒1  ③缺「当前版本」行⇒2  ④缺 CHANGELOG 首条⇒2
//   ⑤归档层隔离（README 历史表里的旧版本号不得参与判据）⇒0
//   ⑥**诱饵在上**：正文里出现的「当前版本：」不得抢走匹配 ⇒ 仍以**行首粗体**那一行为准 ⇒0
//   ⑦链路：README 闸门块漏一步⇒1  ⑧链路：AGENTS 段漏一步⇒1  ⑨链路：闸门块锚点消失⇒2  ⑩链路：齐备⇒0
//   ⑪假绿对照（步骤名在闸门块**之外**仍须红）  ⑫反向（点名 verify 里没有的步骤⇒1）  ⑫b反向假阳性对照
//   ⑬a–c声明行数=实际行数（0 / 1 / 2）  ⑭CRLF 假警报锁  ⑮–⑰检查④（整段复制⇒1 / 短片段放行⇒0 / 缺当前版本行⇒2）
//   ⑱–㉓检查⑤（已过去的版本齐备⇒0 / 缺一个⇒1 / **仪式起点之前豁免**⇒0 / **当前版本豁免**⇒1 /
//            packed-refs 也能读到⇒0 / 读不到 `.git`⇒2）
// ⚠ **不写总组数**（本仓规则：能数出来的别抄；条数随每轮增长，抄了必然腐烂）。
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const CLI = join(here, "docs-consistency.ts");

interface Fixture {
  pkg?: string;
  readmeVersion?: string;          // undefined ⇒ 不写「当前版本」行
  changelogVersion?: string;       // undefined ⇒ 不写 `## [vX]` 标题
  decoyAbove?: boolean;            // 在真实那一行**之前**放一句提到「当前版本：」的散文
  verify?: string;                 // scripts.verify；undefined ⇒ 用默认全链路
  readmeGateBlock?: string | null; // README 的 ```text 块内容；null ⇒ 整块不写（测锚点消失）
  agentsChain?: string;            // AGENTS 段里的链路行
  tableRows?: number;              // 默认开关表的**实际**数据行数（默认 2）
  declaredRows?: number | null;    // 表注声明的行数；null ⇒ 不写声明（测结构缺失）
  crlf?: boolean;                  // 用 CRLF 写全部文件（本仓工作副本就是 CRLF）
  rowText?: string;                // README 版本历史表里**当前版本那一行**的正文（检查④）
  entryBody?: string;              // CHANGELOG 同名条目的正文（检查④）
  omitRow?: boolean;               // 不写当前版本那一行（测检查④的结构缺失）
  changelogOlder?: string[];       // CHANGELOG 里**更旧**的版本号（检查⑤）；默认 ["0.0.1"]
  tags?: string[];                 // 造出的 tag 名（检查⑤），写进 `.git/refs/tags/`
  packedTags?: boolean;            // 把 tags 写进 `.git/packed-refs` 而不是松散 ref（测第二个来源）
  noGit?: boolean;                 // 不造 `.git`（测检查⑤的结构缺失）
}

const FULL_VERIFY = "npm run a:x && npm run b:y && npx tsc --noEmit";

/** 造一份语料并 spawn 真 CLI。 */
const run = (f: Fixture) => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-doc-"));
  try {
    const verify = f.verify ?? FULL_VERIFY;
    const actualRows = f.tableRows ?? 2;
    const declared = f.declaredRows === undefined ? actualRows : f.declaredRows;

    // 默认开关表 + 表注 ⓪（检查③的对象）。**每个 fixture 都要有** ——
    // 否则检查③会以「结构缺失(2)」退出，把① ② 的断言全短路掉。
    const table =
      `### 默认开关\n\n| 能力 | 默认 |\n|---|---|\n` +
      Array.from({ length: actualRows }, (_, i) => `| cap${i + 1} | 开 |`).join("\n") +
      `\n\n` +
      (declared === null ? "" : `**表注** ⓪ **行数**：原表 1 行 ⇒ **现 ${declared} 行**。\n`);

    const decoy = f.decoyAbove ? `> 说明：本仓的「当前版本：\`v0.0.1\`」是举例，不是真的。\n\n` : "";
    const verLine = f.readmeVersion === undefined ? "" : `**当前版本：\`v${f.readmeVersion}\`** —— 最新几版摘要：\n`;
    // **检查④的前置**：版本历史表里要有**当前版本那一行**，否则 ④ 会以结构缺失(2)退出，
    // 把别的组的断言短路（第一版加 ④ 时就踩在这里 —— 见 ⑰）。
    const pkgVer = f.pkg ?? "1.2.3";
    const curRow = f.omitRow ? "" : `| v${pkgVer} | ${f.rowText ?? "摘要"} |\n`;
    let readme = `# x\n\n${table}\n${decoy}${verLine}\n| 版本 | 主题 |\n|---|---|\n${curRow}| v0.0.1 | 旧行（归档层，**不该**参与判据） |\n`;
    if (f.readmeGateBlock !== null) {
      const block = f.readmeGateBlock ?? verify.split(" && ").map((s) => (s.startsWith("npm run ") ? `+ ${s}` : `+ npx ${s}`)).join("\n");
      // ⚠ 这一支**也要带版本历史表**（检查④的前置），否则 ④ 报结构缺失(2) 会短路别的组。
      readme = `# x\n\n### 改代码后先过闸门：\`npm run verify\`\n\n\`\`\`text\nnpm run verify\n=${block}\n\`\`\`\n\n${table}\n${decoy}${verLine}\n| 版本 | 主题 |\n|---|---|\n${curRow}`;
    }

    const head = f.changelogVersion === undefined ? "" : `## [v${f.changelogVersion}] 标题\n\n${f.entryBody ?? "正文"}\n`;
    const older = f.changelogVersion === undefined ? "" : (f.changelogOlder ?? ["0.0.1"]).map((v) => `## [v${v}] 更旧的一条\n`).join("");
    const changelog = `# Changelog\n\n${head}${older}`;

    const chain = f.agentsChain ?? verify.split(" && ").map((s) => s.replace(/^npm run /, "").replace(/^npx npx /, "")).join(" \u2192 ");
    const agents = `# dsh-shadow\n\n## 本仓库常用的构建与验证\n\n- 验证：\`npm run verify\` \u2014\u2014 \u4e32\u884c\u8dd1 ${chain}\u3002\n\n## \u5176\u4ed6\n\n\u6b63\u6587\u3002\n`;

    // **CRLF 组**（⑭）：本仓工作副本是 CRLF，而 `$\u0000` 锚定的正则**不匹配 `\r` 之前** ——
    // v1.15.68 的检查③就是因此把分隔行当成数据行、报了「声明 18 / 实际 19」的**假警报**。
    const enc = (s: string) => (f.crlf ? s.replace(/\n/g, "\r\n") : s);
    writeFileSync(join(dir, "package.json"), enc(JSON.stringify({ name: "x", version: f.pkg ?? "1.2.3", scripts: { verify } })));
    writeFileSync(join(dir, "README.md"), enc(readme));
    writeFileSync(join(dir, "CHANGELOG.md"), enc(changelog));
    writeFileSync(join(dir, "AGENTS.md"), enc(agents));

    // **检查⑤的前置**：必须有一个可读的 tag 集（`.git`）—— 否则 ⑤ 以**结构缺失(2)** 退出，
    // 会把别的组的断言全短路。与上面「每个 fixture 都要有默认开关表」是同一条纪律
    // （v1.15.82 加检查⑤时记：**新加一条门，就要给所有 fixture 补它的前置**）。
    if (!f.noGit) {
      mkdirSync(join(dir, ".git", "refs", "tags"), { recursive: true });
      const names = f.tags ?? [];
      if (f.packedTags) {
        writeFileSync(join(dir, ".git", "packed-refs"),
          "# pack-refs with: peeled fully-peeled sorted \n" +
          names.map((t, i) => `${"0".repeat(39)}${i + 1} refs/tags/${t}`).join("\n") + "\n");
      } else {
        for (const t of names) writeFileSync(join(dir, ".git", "refs", "tags", t), "0".repeat(40) + "\n");
      }
    }

    let code = 0, out = "";
    try {
      out = execFileSync(process.execPath, [CLI, dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    } catch (e: any) {
      code = e.status ?? -1;
      out = `${e.stdout || ""}${e.stderr || ""}`;
    }
    return { code, out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
};

// ── 检查 1：三方版本 ──
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 0, `三方一致必须放行（0）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /三方版本一致/);
  console.log("✔ ① 正对照：三方一致 ⇒ 0");
}
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.0", changelogVersion: "1.2.3" });
  assert.equal(r.code, 1, `README 落后必须红（1）；实际 ${r.code}`);
  assert.match(r.out, /不一致/);
  assert.match(r.out, /README\.md.*1\.2\.0/s, `报文应指出是 README 落后：${r.out.slice(0, 200)}`);
  assert.match(r.out, /25 个版本/, "报文应带上历史（发版仪式静默失效 25 个版本）");
  console.log("✔ ② 负对照：README 落后 ⇒ 1（并打印三处实际值 + 历史）");
}
{
  const r = run({ pkg: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 2, `缺「当前版本」行应报结构缺失（2）而不是不一致（1）；实际 ${r.code}`);
  assert.match(r.out, /结构缺失/);
  console.log("✔ ③ 负对照：README 缺「当前版本」行 ⇒ 2");
}
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3" });
  assert.equal(r.code, 2, `缺 CHANGELOG 首条标题应报结构缺失（2）；实际 ${r.code}`);
  console.log("✔ ④ 负对照：CHANGELOG 缺首条版本标题 ⇒ 2");
}
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 0, `README 归档表里的旧版本号不得影响判据；实际 ${r.code}`);
  console.log("✔ ⑤ 归档层隔离：README 历史表里的 `v0.0.1` 不参与判据");
}
{
  // ⑥ 新增（收紧判据时补的）：正文里先出现「当前版本：v0.0.1」，真实那一行在下面。
  //    旧版判据（全篇第一处）会被诱饵抢走 ⇒ 拿 `0.0.1` 去比 ⇒ 误报不一致。
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", decoyAbove: true });
  assert.equal(r.code, 0, `**诱饵在上**：正文里的「当前版本：」不得抢走匹配（判据必须锚定**行首粗体**那一行）；实际 ${r.code}：${r.out}`);
  console.log("✔ ⑥ 诱饵在上：正文里的「当前版本：」不抢匹配（判据锚定行首粗体形态）");
}

// ── 检查 2：verify 链路被点名 ──
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3" });
  assert.equal(r.code, 0, `链路齐备必须放行（0）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /都被\*\*该列它的那一块\*\*点名/);
  console.log("✔ ⑩ 正对照：verify 链路齐备 ⇒ 0");
}
{
  // ⑦ README 闸门块漏一步
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", readmeGateBlock: "+ npm run a:x\n+ npx tsc --noEmit" });
  assert.equal(r.code, 1, `README 闸门块漏一步必须红（1）；实际 ${r.code}`);
  assert.match(r.out, /README\.md.*未点名.*b:y/s, `应指出 README 漏了 b:y：${r.out.slice(0, 300)}`);
  console.log("✔ ⑦ 负对照：README 闸门块漏一步 ⇒ 1（**并有报出是哪一个**）");
}
{
  // ⑧ AGENTS 段漏一步
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", agentsChain: "a:x → tsc --noEmit" });
  assert.equal(r.code, 1, `AGENTS 段漏一步必须红（1）；实际 ${r.code}`);
  assert.match(r.out, /AGENTS\.md.*未点名.*b:y/s, `应指出 AGENTS 漏了 b:y：${r.out.slice(0, 300)}`);
  console.log("✔ ⑧ 负对照：AGENTS 段漏一步 ⇒ 1");
}
{
  // ⑨ README 闸门块锚点消失 ⇒ 结构缺失（2），不是「一致」
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", readmeGateBlock: null });
  assert.equal(r.code, 2, `闸门块锚点消失应报结构缺失（2）；实际 ${r.code}`);
  assert.match(r.out, /找不到这一块/, `应说清是「找不到这一块」：${r.out.slice(0, 200)}`);
  console.log("✔ ⑨ 负对照：README 闸门块锚点消失 ⇒ 2（结构缺失 ≠ 不一致）");
}
{
  // ⑪ **假绿对照**（收紧判据的直接理由）：把一个步骤名**放到闸门块之外**（比如文档别处）
  //    必须**仍然红** —— 旧版判据「出现在文档任意位置即可」会在这里放行。
  //    注意：这份 fixture **也必须**满足检查 1（版本行 + CHANGELOG 首条），否则 CLI 会先在
  //    检查 1 上以 2 退出，本组就测不到检查 2 了（第一版就踩了这个：期望 1、实得 2）。
  const withStepElsewhere = `# x\n\n**当前版本：\`v1.2.3\`** \u2014\u2014 \u6458\u8981\uff1a\n\n### 改代码后先过闸门：\`npm run verify\`\n\n\`\`\`text\nnpm run verify\n= npm run a:x\n+ npx tsc --noEmit\n\`\`\`\n\n> 附注：历史上还用过 \`npm run b:y\`。\n`;
  const dir = mkdtempSync(join(tmpdir(), "dsh-doc-"));
  let code = 0, out = "";
  try {
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: "1.2.3", scripts: { verify: FULL_VERIFY } }));
    writeFileSync(join(dir, "README.md"), withStepElsewhere);
    writeFileSync(join(dir, "CHANGELOG.md"), `# Changelog\n\n## [v1.2.3] 标题\n`);
    writeFileSync(join(dir, "AGENTS.md"), `# dsh-shadow\n\n## 本仓库常用的构建与验证\n\n- ${FULL_VERIFY.split(" && ").map((s) => s.replace(/^npm run /, "")).join(" → ")}\n\n## 其他\n\n正文。\n`);
    mkdirSync(join(dir, ".git", "refs", "tags"), { recursive: true });   // 检查⑤的前置（同 `run()`）
    try { out = execFileSync(process.execPath, [CLI, dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e: any) { code = e.status ?? -1; out = `${e.stdout || ""}${e.stderr || ""}`; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(code, 1, `**假绿对照**：步骤名出现在闸门块**之外**必须仍然红（旧判据会放行）；实际 ${code}：${out}`);
  console.log("✔ ⑪ 假绿对照：步骤名出现在闸门块**之外** ⇒ 仍然红（判据已限定到该列它的那一块）");
}
{
  // ⑫ **反向**：README 的闸门块点名了一个 `verify` 里**没有**的步骤 ⇒ 必须红。
  //    为什么必须：正向检查（verify → 文档）挡不住「门被从 verify 里摘掉」——
  //    摘掉之后 required 少一项，正向检查反而更宽松、照样全绿，而文档里那一行成了**死指针**。
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", readmeGateBlock: "+ npm run a:x\n+ npm run b:y\n+ npm run c:ghost\n+ npx tsc --noEmit" });
  assert.equal(r.code, 1, `文档点名了 verify 里没有的步骤必须红（1）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /c:ghost/, `报文应指出是哪一个：${r.out.slice(0, 300)}`);
  assert.match(r.out, /文档点名了 `verify` 里没有的步骤/, "应说清是反向检查失败（不是漏写）");
  console.log("✔ ⑫ 负对照（反向）：闸门块点名了 `verify` 里没有的 `c:ghost` ⇒ 1");
}
{
  // ⑫b 反向的**假阳性对照**：块里出现 `npm run verify` 自身、以及内联的 `= npm run build && …`
  //     都**不得**被当成「多出来的闸门」（第一版正向/反向都曾被这两个误报）。
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", readmeGateBlock: "+ npm run a:x\n+ npm run b:y\n+ npm run test:all             = npm run build && node tools/run-tests.ts\n+ npx tsc --noEmit", verify: "npm run a:x && npm run b:y && npm run test:all && npx tsc --noEmit" });
  assert.equal(r.code, 0, `\`npm run build\`（内联提到）与块头 \`npm run verify\` 不得被当成闸门；实际 ${r.code}：${r.out}`);
  console.log("✔ ⑫b 假阳性对照：内联的 `= npm run build …` 与块头 `npm run verify` 都不算闸门");
}

// ── 检查 3：声明行数 = 实际行数 ──
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", tableRows: 2, declaredRows: 2 });
  assert.equal(r.code, 0, `声明 = 实际必须放行（0）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /声明 \*\*2 行\*\* = 实际 \*\*2 行\*\*/);
  console.log("✔ ⑬a 正对照：声明行数 = 实际行数 ⇒ 0");
}
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", tableRows: 3, declaredRows: 2 });
  assert.equal(r.code, 1, `声明 2 / 实际 3 必须红（1）；实际 ${r.code}`);
  assert.match(r.out, /声明 \*\*2 行\*\*，实际 \*\*3 行\*\*/, `报文应同时给出声明值与实际值：${r.out.slice(0, 300)}`);
  console.log("✔ ⑬b 负对照：声明 2 行 / 实际 3 行 ⇒ 1（并同时打印两个值）");
}
{
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", declaredRows: null });
  assert.equal(r.code, 2, `缺「现 N 行」声明应报结构缺失（2）；实际 ${r.code}`);
  assert.match(r.out, /找不到「⇒ \*\*现 N 行\*\*」/);
  console.log("✔ ⑬c 负对照：README 缺行数声明 ⇒ 2（结构缺失 ≠ 数字不一致）");
}
{
  // ⑭ **CRLF 组**（锁住 v1.15.68 修掉的**假警报**）：整份语料用 CRLF 写，
  //    声明与实际都是 2 ⇒ 必须**放行**。修前（分隔行 `|----|\r` 不匹配 `$`）这里会报「实际 3 行」。
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", tableRows: 2, declaredRows: 2, crlf: true });
  assert.equal(r.code, 0, `**CRLF 不得造成假警报**（本仓工作副本就是 CRLF）；实际 ${r.code}：${r.out}`);
  console.log("✔ ⑭ CRLF：整份语料 CRLF ⇒ 行数判定仍然正确（不再把分隔行当数据行）");
}

// ── 检查 4：README 当前版本那一行不得与 CHANGELOG 同名条目逐字重复 ──
{
  // ⑮ 负对照（本检查存在的理由）：**整段复制**。用一段 ≥40 字的中文，同时放进 README 行与 CHANGELOG 正文。
  const dup = "这是一整句从_CHANGELOG_条目里原样复制过来的论证文字，长度远超四十个字，用来触发检查四的逐字重复判据。";
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", rowText: dup, entryBody: dup });
  assert.equal(r.code, 1, `README 版本行整段复制 CHANGELOG ⇒ 必须红（1）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /整段重复/, `报文应说清是逐字重复：${r.out.slice(0, 300)}`);
  assert.match(r.out, /第 4 次出现/, "报文应带上复发次数（这是本缺陷的由来）");
  console.log("✔ ⑮ 负对照：README 版本行与 CHANGELOG 条目 ≥40 字逐字重复 ⇒ 1");
}
{
  // ⑯ 正对照 + **短片段放行**：版本号、标题这类**必然重合**的短串不得触发（阈值 40 的意义）。
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", rowText: "**摘要**：只回答自己那个问题，细节见 `CHANGELOG`。", entryBody: "**摘要**：只回答自己那个问题，细节见 `CHANGELOG`。" });
  assert.equal(r.code, 0, `短片段重合（<40 字）不得触发 ⇒ 0；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /无 ≥40 字逐字重复/);
  console.log("✔ ⑯ 正对照：只重合短片段（含同一条指向语）⇒ 0（阈值 40 生效）");
}
{
  // ⑰ 结构缺失：版本历史表里**没有当前版本那一行** ⇒ 2（不是「一致」）。
  //    本组同时是**加检查④时踩到的坑**的留档：fixture 的前置不齐会让 ④ 以 2 退出、短路别的组。
  const r = run({ pkg: "1.2.3", readmeVersion: "1.2.3", changelogVersion: "1.2.3", omitRow: true });
  assert.equal(r.code, 2, `缺「当前版本」那一行应报结构缺失（2）；实际 ${r.code}`);
  assert.match(r.out, /找不到当前版本那一行/);
  console.log("✔ ⑰ 负对照：README 版本历史表缺当前版本那一行 ⇒ 2（结构缺失 ≠ 重复）");
}

// ── 检查 5：已经过去的版本必须都打过 tag ──
{
  // ⑱ 正对照：仪式起点之后的**已过去**版本都有 tag ⇒ 0（当前版本被豁免）
  const r = run({
    pkg: "1.15.80", readmeVersion: "1.15.80", changelogVersion: "1.15.80",
    changelogOlder: ["1.15.79", "1.15.78", "1.15.77"],
    tags: ["v1.15.77", "v1.15.78", "v1.15.79"],
  });
  assert.equal(r.code, 0, `已过去的版本都打过 tag 必须放行（0）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /已经过去的版本都打过 tag/);
  assert.match(r.out, /逐版核对了 3 个/, `报文应打印核对范围：${r.out.slice(0, 300)}`);
  console.log("✔ ⑱ 正对照：仪式起点起、已过去的版本都打过 tag ⇒ 0");
}
{
  // ⑲ 负对照（本检查存在的理由）：缺一个过去的版本 ⇒ 1，且**要指出是哪一个**
  const r = run({
    pkg: "1.15.80", readmeVersion: "1.15.80", changelogVersion: "1.15.80",
    changelogOlder: ["1.15.79", "1.15.78", "1.15.77"],
    tags: ["v1.15.77", "v1.15.79"],
  });
  assert.equal(r.code, 1, `缺一个 tag 必须红（1）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /漏打 tag.*v1\.15\.78/s, `报文应点名缺的是哪一个：${r.out.slice(0, 400)}`);
  assert.match(r.out, /迟一版/, "报文应写清能力边界（当前版本豁免 ⇒ 迟一版才发现）");
  console.log("✔ ⑲ 负对照：过去的版本漏打 tag ⇒ 1（点名 v1.15.78，并打印能力边界）");
}
{
  // ⑳ **仪式起点之前豁免**：1.15.76 / 1.15.4 是「用户决定不补」的那一段 ⇒ 没有 tag 也放行。
  //    这一组同时锁住 `TAG_RITUAL_FROM` 真的在起作用（否则会把 73 个历史版本全报成漏打）。
  const r = run({
    pkg: "1.15.79", readmeVersion: "1.15.79", changelogVersion: "1.15.79",
    changelogOlder: ["1.15.78", "1.15.76", "1.15.4"],
    tags: ["v1.15.78"],
  });
  assert.equal(r.code, 0, `仪式起点之前的版本不得要求 tag；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /逐版核对了 1 个/, `只应核对 1.15.78 一个版本：${r.out.slice(0, 300)}`);
  console.log("✔ ⑳ 边界豁免：v1.15.76 / v1.15.4（仪式起点之前、用户定「不补」）不要求 tag ⇒ 0");
}
{
  // ㉑ **当前版本豁免**（结构决定的，不是偷懒）：它的 tag 只能在版本号那笔提交建好之后才打得出来。
  const r = run({
    pkg: "1.15.85", readmeVersion: "1.15.85", changelogVersion: "1.15.85",
    changelogOlder: ["1.15.84"],
    tags: [],
  });
  assert.equal(r.code, 1, `缺 1.15.84 的 tag 必须红（1）；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /漏打 tag\*\*：`v1\.15\.84`/, `只应报 1.15.84，不该报当前版本：${r.out.slice(0, 400)}`);
  assert.match(r.out, /当前 v1\.15\.85（\*\*豁免\*\*）/, "报文应显式写出当前版本被豁免");
  console.log("✔ ㉑ 当前版本豁免：只报 1.15.84，不报 1.15.85（否则每次发版都会在提交前误红）");
}
{
  // ㉒ tag 的**第二个来源**：`git gc` 之后 tag 进 `packed-refs`，此时松散 ref 目录是空的。
  const r = run({
    pkg: "1.15.80", readmeVersion: "1.15.80", changelogVersion: "1.15.80",
    changelogOlder: ["1.15.79"],
    tags: ["v1.15.79"], packedTags: true,
  });
  assert.equal(r.code, 0, `packed-refs 里的 tag 也算数；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /共读到 1 个 tag/, `应读到 packed-refs 里那一个：${r.out.slice(0, 300)}`);
  console.log("✔ ㉒ 第二个来源：tag 在 `packed-refs` 里（松散 ref 目录为空）也能读到 ⇒ 0");
}
{
  // ㉓ 结构缺失：不是 git 工作副本 ⇒ 2（**不是「通过」** —— ADR-0049 缺件不静默）
  const r = run({
    pkg: "1.15.80", readmeVersion: "1.15.80", changelogVersion: "1.15.80",
    changelogOlder: ["1.15.79"], noGit: true,
  });
  assert.equal(r.code, 2, `读不到 .git 应报结构缺失（2）而不是放行；实际 ${r.code}：${r.out}`);
  assert.match(r.out, /读不到本工作副本的 tag 集/, `报文应说清是缺件：${r.out.slice(0, 300)}`);
  assert.match(r.out, /不是「通过」/, "报文必须显式否认「缺件 = 通过」");
  console.log("✔ ㉓ 负对照：读不到 `.git` ⇒ 2（缺件不静默，不得当成「通过」）");
}

console.log("ALL PASS ✅");
