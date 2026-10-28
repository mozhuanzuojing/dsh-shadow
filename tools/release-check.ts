/**
 * v2 ops — 发版门（ADR-0012）：版本一致性 + 构建产物 + pack 内容 + tag 指向。
 * 只读：不 build、不写文件、不推送。`npm run verify:release` 先跑 verify（含 build），再跑本检查。
 * 发版顺序：提交 → `git tag v2.0.0` → `npm run verify:release` → push（tag 必须指向发布提交）。
 */

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";

interface PackFile {
  path: string;
  size: number;
}

interface PackResult {
  filename: string;
  files: PackFile[];
  size: number;
  unpackedSize: number;
}

const problems: string[] = [];
const warnings: string[] = [];
const fail = (message: string): void => {
  problems.push(message);
};

const read = (path: string): string => readFileSync(path, "utf8");

const git = (args: string[]): string =>
  execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });

const pkg = JSON.parse(read("package.json")) as { version?: string; files?: string[] };
const version = pkg.version ?? "";

// 1) 版本形态 + 三处一致（package.json / README 状态行 / CHANGELOG 首条）
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  fail(`package.json version 必须是正式版 x.y.z，当前 ${JSON.stringify(version)}（预发布版本不可发版）`);
}

const readme = read("README.md");
if (!readme.includes(`v${version}`)) {
  fail(`README.md 状态行未标注 v${version}`);
}

const changelog = existsSync("CHANGELOG.md") ? read("CHANGELOG.md") : "";
if (!changelog) fail("缺 CHANGELOG.md（ADR-0012 要求每版覆盖 + 迁移说明）");
const firstVersion = changelog.match(/^##\s+\[?v?(\d+\.\d+\.\d+)\]?/m)?.[1];
if (changelog && !firstVersion) fail("CHANGELOG.md 缺少版本小节（应形如 ## [2.0.0] — 2026-10-28）");
if (firstVersion && firstVersion !== version) {
  fail(`CHANGELOG 首条版本 ${firstVersion} ≠ package.json ${version}`);
}

// 2) 构建产物与随包文件
const requiredAt = [
  "dist/index.js",
  "dist/index.d.ts",
  "dist/lab/vendor",
  "cordis.patch.yml",
  "README.md",
  "LICENSE",
  "CHANGELOG.md",
  "docs/v2/ARCHITECTURE.md",
  "docs/v2/CONVENTIONS.md",
  "docs/v2/MIGRATION.md",
  "docs/v2/LAB.md",
  "docs/v2/PARITY.md",
  "docs/v2/STATUS.md",
  "docs/adr/README.md",
];
for (const path of requiredAt) {
  if (!existsSync(path)) fail(`缺文件 ${path}（先 npm run build）`);
}

const patch = read("cordis.patch.yml");
if (!patch.includes("id: dsh-shadow")) fail("cordis.patch.yml 未 insert id: dsh-shadow");

let vendorFiles = 0;
if (existsSync("dist/lab/vendor")) {
  vendorFiles = (readdirSync("dist/lab/vendor", { recursive: true }) as string[]).filter(
    (name) => name.endsWith(".js") || name.endsWith(".d.ts"),
  ).length;
}
if (vendorFiles < 200) {
  fail(`dist/lab/vendor 仅 ${vendorFiles} 个 js/d.ts（应 ≥200；lab 移植闭包未完整构建）`);
}

// 3) npm pack 内容（与 package.json files 白名单对齐）
let pack: PackResult | undefined;
try {
  // Windows 上 npm 是 .cmd，不能直接 execFile；用 cmd.exe /c 调用，避免 shell:true 的拼接告警。
  const npmCommand = process.platform === "win32" ? "cmd.exe" : "npm";
  const npmArgs =
    process.platform === "win32" ? ["/c", "npm", "pack", "--dry-run", "--json"] : ["pack", "--dry-run", "--json"];
  const raw = execFileSync(npmCommand, npmArgs, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  pack = (JSON.parse(raw) as PackResult[])[0];
} catch (error) {
  fail(`npm pack --dry-run 失败：${String(error).slice(0, 200)}`);
}

if (pack) {
  const paths = new Set(pack.files.map((file) => file.path));
  const mustPack = [
    "package.json",
    "README.md",
    "LICENSE",
    "cordis.patch.yml",
    "CHANGELOG.md",
    "dist/index.js",
    "dist/index.d.ts",
  ];
  for (const path of mustPack) {
    if (!paths.has(path)) fail(`pack 缺 ${path}`);
  }

  const docsV2 = pack.files.filter((file) => file.path.startsWith("docs/v2/") && file.path.endsWith(".md")).length;
  if (docsV2 < 6) fail(`pack 内 docs/v2 仅 ${docsV2} 份（应 ≥6）`);
  const adr = pack.files.filter((file) => file.path.startsWith("docs/adr/")).length;
  if (adr < 13) fail(`pack 内 docs/adr 仅 ${adr} 个（应 ≥13）`);

  const forbidden = ["src/", "test/", "tools/", "fixtures/", "node_modules/", "_reports/"];
  for (const prefix of forbidden) {
    const hit = pack.files.find((file) => file.path.startsWith(prefix));
    if (hit) fail(`pack 混入 ${prefix}（${hit.path}）`);
  }

  const packedVendor = pack.files.filter((file) => file.path.startsWith("dist/lab/vendor/")).length;
  if (packedVendor < 200) fail(`pack 内 lab vendor 仅 ${packedVendor} 个（应 ≥200）`);
  if (pack.size > 5 * 1024 * 1024) fail(`tarball 过大：${(pack.size / 1024 / 1024).toFixed(2)} MB > 5 MB`);
  if (pack.size < 50 * 1024) fail(`tarball 过小：${pack.size} B（疑似构建产物缺失）`);

  if (problems.length === 0) {
    console.log(
      `[release] pack ok · ${pack.files.length} 文件 · ${(pack.size / 1024).toFixed(0)} KB（unpacked ${(pack.unpackedSize / 1024).toFixed(0)} KB）· lab vendor ${packedVendor}`,
    );
  }
}

// 4) git tag 指向发布提交 + 工作树干净（发版提交应已提交）
let head = "";
try {
  head = git(["rev-parse", "HEAD"]).trim();
} catch {
  fail("不在 git 工作树内");
}

const tagName = `v${version}`;
let tagCommit = "";
try {
  tagCommit = git(["rev-parse", "--verify", `${tagName}^{commit}`]).trim();
} catch {
  tagCommit = "";
}
if (!tagCommit) {
  fail(`缺 tag ${tagName}：先提交，再 git tag ${tagName}（轻量 tag，指向发布提交），然后重跑 npm run release`);
} else if (head && tagCommit !== head) {
  fail(`tag ${tagName} 指向 ${tagCommit.slice(0, 8)}，HEAD 是 ${head.slice(0, 8)}；tag 必须指向发布提交`);
}

try {
  const dirty = git(["status", "--porcelain"]).trim();
  if (dirty) fail(`工作树不干净，发布提交应已提交：\n${dirty}`);
} catch {
  /* 非 git 工作树已在上面记过 */
}

try {
  git(["rev-parse", "--verify", "legacy-v1^{commit}"]);
} catch {
  warnings.push("legacy-v1 tag 不存在（ADR-0012 要求永久保留）");
}

for (const warning of warnings) console.warn(`[release] 警告 · ${warning}`);

if (problems.length > 0) {
  console.error(`[release] 拒绝发版（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`[release] ok · version=${version} · tag ${tagName} → ${head.slice(0, 8)} · lab vendor ${vendorFiles} 文件`);
