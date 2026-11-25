/**
 * v3 ops — 发布形态门：`npm pack` 出的 tarball 装进隔离目录后**真实 import**。
 *
 * 为什么需要它：仓库内的验证全部从工作树跑（`dist/` 是 tarball 的根目录形态），
 * 而这正是 dsh-remote-wsl 踩过的坑——tarball 装进 `node_modules/` 后路径、`files`
 * 白名单、入口缺失才会暴露。这个门只答两件事：解包后入口能加载、随包资源能定位。
 *
 * 只读仓库；临时目录在系统 temp 下，跑完删除。
 */

import { execFileSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const problems: string[] = [];
const fail = (message: string): void => {
  problems.push(message);
};

const pkg = JSON.parse(readFileSync("package.json", "utf8")) as { name?: string; version?: string };
const name = pkg.name ?? "";
const version = pkg.version ?? "";

const npmRun = (args: string[]): string => {
  // Windows 上 npm 是 .cmd，不能直接 execFile；避免 shell:true 的拼接告警。
  if (process.platform === "win32") {
    return execFileSync("cmd.exe", ["/c", "npm", ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  }
  return execFileSync("npm", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
};

const work = mkdtempSync(join(tmpdir(), "dsh-shadow-pack-"));
try {
  const raw = npmRun(["pack", "--pack-destination", work, "--json"]);
  const packed = JSON.parse(raw) as Array<{ filename: string }>;
  const tarball = join(work, packed[0]?.filename ?? "");
  if (!existsSync(tarball)) {
    fail(`npm pack 未产出 tarball（${raw.slice(0, 200)}）`);
  } else {
    const unpack = join(work, "unpack");
    mkdirSync(unpack, { recursive: true });
    execFileSync("tar", ["-xzf", tarball, "-C", unpack], { stdio: ["ignore", "pipe", "pipe"] });

    const app = join(work, "app");
    const installed = join(app, "node_modules", name);
    mkdirSync(join(app, "node_modules"), { recursive: true });
    cpSync(join(unpack, "package"), installed, { recursive: true });

    // 安装形态检查：入口能加载、随包资源能定位。依赖故意不装——
    // 重依赖（onnxruntime / tree-sitter）都是动态 import，加载期不该需要它们。
    const smoke = `
import { existsSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
const report = [];
const mod = await import(${JSON.stringify(name)});
const req = createRequire(import.meta.url);
const root = req.resolve(${JSON.stringify(name + "/package.json")}).replace(/package\\.json$/, "");
report.push(["exports:" + Object.keys(mod).sort().join(","), typeof mod.apply === "function"]);
report.push(["name:" + String(mod.name), typeof mod.name === "string"]);
report.push(["skill", existsSync(root + "skills/dsh-shadow-routing/SKILL.md")]);
report.push(["patch", readFileSync(root + "cordis.patch.yml", "utf8").includes("id: " + ${JSON.stringify(name)})]);
for (const locale of ["zh", "en"]) {
  const p = root + "locale/" + locale + ".json";
  const meta = existsSync(p) ? JSON.parse(readFileSync(p, "utf8")).meta : {};
  report.push(["locale:" + locale, typeof meta.title === "string" && typeof meta.description === "string"]);
}
report.push(["icon", /^<svg[\\s>]/.test(readFileSync(root + "icon.svg", "utf8")) && statSync(root + "icon.svg").size < 256 * 1024]);
for (const [label, ok] of report) console.log((ok ? "ok   " : "FAIL ") + label);
if (report.some(([, ok]) => !ok)) process.exit(1);
`;
    writeFileSync(join(app, "smoke.mjs"), smoke, "utf8");

    let out = "";
    try {
      out = execFileSync(process.execPath, ["smoke.mjs"], {
        cwd: app,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"],
      });
    } catch (error) {
      const e = error as { stdout?: string; stderr?: string };
      fail(`安装形态加载失败：\n${(e.stdout ?? "") + (e.stderr ?? "")}`.trim());
    }
    const lines = out.split(/\r?\n/).filter((line) => line.startsWith("ok ") || line.startsWith("FAIL "));
    for (const line of lines) console.log(`[pack] ${line}`);
    if (lines.some((line) => line.startsWith("FAIL "))) fail("安装形态自检未通过（见上方 FAIL 行）");
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

if (problems.length > 0) {
  console.error(`[pack] 拒绝发版（${problems.length} 项）：`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`[pack] ok · ${name}@${version} 安装形态可加载（入口 + skill + patch + locale + icon）`);
