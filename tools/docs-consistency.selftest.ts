// dsh-shadow —— tools/docs-consistency.selftest.ts：**派生字段门**的标定（v1.15.66）。
//
// 纪律（ADR-0062 / v1.15.60）：**CLI 的行为要 spawn 子进程验** —— 否则「退出码写错」这类缺陷
// 在测试里永远看不见，而 `npm run verify` 正是靠**退出码**串起来的。
//
// 十组，全是**正/负对照**：把门改成「永远 0」则全部负对照红；改成「永远 1」则正对照红。
//   ①三方一致⇒0  ②README 落后⇒1  ③缺「当前版本」行⇒2  ④缺 CHANGELOG 首条⇒2
//   ⑤归档层隔离（README 历史表里的旧版本号不得参与判据）⇒0
//   ⑥**诱饵在上**：正文里出现的「当前版本：」不得抢走匹配 ⇒ 仍以**行首粗体**那一行为准 ⇒0
//   ⑦链路：README 闸门块漏一步⇒1  ⑧链路：AGENTS 段漏一步⇒1  ⑨链路：闸门块锚点消失⇒2  ⑩链路：齐备⇒0
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
}

const FULL_VERIFY = "npm run a:x && npm run b:y && npx tsc --noEmit";

/** 造一份语料并 spawn 真 CLI。 */
const run = (f: Fixture) => {
  const dir = mkdtempSync(join(tmpdir(), "dsh-doc-"));
  try {
    const verify = f.verify ?? FULL_VERIFY;
    writeFileSync(join(dir, "package.json"), JSON.stringify({ name: "x", version: f.pkg ?? "1.2.3", scripts: { verify } }));

    const decoy = f.decoyAbove ? `> 说明：本仓的「当前版本：\`v0.0.1\`」是举例，不是真的。\n\n` : "";
    const verLine = f.readmeVersion === undefined ? "" : `**当前版本：\`v${f.readmeVersion}\`** —— 最新几版摘要：\n`;
    let readme = `# x\n\n${decoy}${verLine}\n| 版本 | 主题 |\n|---|---|\n| v0.0.1 | 旧行（归档层，**不该**参与判据） |\n`;
    if (f.readmeGateBlock !== null) {
      const block = f.readmeGateBlock ?? verify.split(" && ").map((s) => (s.startsWith("npm run ") ? `+ ${s}` : `+ npx ${s}`)).join("\n");
      readme = `# x\n\n### 改代码后先过闸门：\`npm run verify\`\n\n\`\`\`text\nnpm run verify\n=${block}\n\`\`\`\n\n${decoy}${verLine}`;
    }
    writeFileSync(join(dir, "README.md"), readme);

    const head = f.changelogVersion === undefined ? "" : `## [v${f.changelogVersion}] 标题\n\n正文\n`;
    const older = f.changelogVersion === undefined ? "" : `## [v0.0.1] 更旧的一条\n`;
    writeFileSync(join(dir, "CHANGELOG.md"), `# Changelog\n\n${head}${older}`);

    const chain = f.agentsChain ?? verify.split(" && ").map((s) => s.replace(/^npm run /, "").replace(/^npx npx /, "")).join(" \u2192 ");
    writeFileSync(join(dir, "AGENTS.md"), `# dsh-shadow\n\n## 本仓库常用的构建与验证\n\n- 验证：\`npm run verify\` \u2014\u2014 \u4e32\u884c\u8dd1 ${chain}\u3002\n\n## \u5176\u4ed6\n\n\u6b63\u6587\u3002\n`);

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
    try { out = execFileSync(process.execPath, [CLI, dir], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }); }
    catch (e: any) { code = e.status ?? -1; out = `${e.stdout || ""}${e.stderr || ""}`; }
  } finally { rmSync(dir, { recursive: true, force: true }); }
  assert.equal(code, 1, `**假绿对照**：步骤名出现在闸门块**之外**必须仍然红（旧判据会放行）；实际 ${code}：${out}`);
  console.log("✔ ⑪ 假绿对照：步骤名出现在闸门块**之外** ⇒ 仍然红（判据已限定到该列它的那一块）");
}

console.log("ALL PASS ✅");
