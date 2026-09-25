#!/usr/bin/env node
// dsh-shadow —— tools/release.ts：**发版仪式**（本仓唯一支持的发版路径；`verify` 的退出码就是闸门）。
//
// 用法：npm run release -- [--dry-run] [--message "feat(T6): v1.21.26 …"]
//
// 为什么要有它：`v1.21.26` 被 commit、打 tag、**推到远端**时，它的 `verify` 是 **exit 1**。
// 从那一刻起，「验证 → 提交 → 换 tag → 推送」被固化成**一条命令**，且**闸门在第一步**：
// 红了就退出，**一个 git 写操作都不发生**。
//
// 退出码：0 = 发版成功（或 `--dry-run` 走完计划）；1 = 门红 / 参数或前置条件不满足；2 = 结构缺失。
// ⚠ 本工具**没有**跳过 verify 的开关，也**不**改写历史（无 force / 无 --tags）。
import { closeSync, openSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkVersionConsistency } from "./docs-consistency.ts";
import { gateDecision, localTagsToDelete, parseReleaseArgs, planRelease, planViolations, remoteTagsToDelete, tailLines, versionTag } from "./release.lib.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

// ⚠ 用**函数声明**而不是 `const die = (...): never => {}`：只有前者能让 TS 在调用点之后
// 收窄判别联合（`parsed.ok`）。写成 const 箭头函数时 `tsc -p tsconfig.tools.json` 会在下面
// `parsed.error` / `parsed.value` 两处报 TS2339 —— 实测踩过一次（也正是那次红让 `npm run release`
// 的闸门被端到端验证：红 ⇒ 一个 git 写操作都没发生）。
function die(msg: string, code = 1): never {
  console.error(msg);
  process.exit(code);
}

/** 跑一条命令：默认继承 stdio（看得见）；`capture` 时收 stdout/stderr（用于读状态，不用于跑门）。 */
const run = (cmd: string, args: string[], capture = false) => {
  const r = spawnSync(cmd, args, { cwd: ROOT, encoding: "utf8", stdio: capture ? ["ignore", "pipe", "pipe"] : "inherit" });
  return { code: r.status ?? 1, out: String(r.stdout || "") + String(r.stderr || "") };
};
const git = (args: string[], capture = false) => run("git", args, capture);
const gitText = (args: string[]): string => git(args, true).out.replace(/\r\n?/g, "\n").trim();

const stamp = (): string => new Date().toISOString().replace(/[:.]/g, "-");
const seconds = (ms: number): string => (ms / 1000).toFixed(0);

const HELP = [
  "dsh-shadow 发版仪式（闸门 = npm run verify 的退出码）",
  "",
  "用法：npm run release -- [选项]",
  "",
  "选项：",
  "  --dry-run                 只打计划（跑任何东西之前停下来）：版本 / 分支 / 脏否 / 要删的 tag / 将执行的命令",
  "  -m, --message <信息>      发布提交的信息（默认 chore(release): v<version>）",
  "  -h, --help                这份说明",
  "",
  "顺序（绿了才走）：三方版本一致预检 → npm run verify（**闸门**）→ git add/commit → 删旧 tag（本地+远端）",
  "                 → 打新 tag → push 分支 → push 新 tag → 打印两个 sha 供核对",
  "",
  "刻意不做：**没有** --skip-verify（那正是 v1.21.26 事故的成因）；**不** force；**不** --tags（精确指定 ref）。",
].join("\n");

// ── 参数 ─────────────────────────────────────────────────────────────────────
const parsed = parseReleaseArgs(process.argv.slice(2));
if (!parsed.ok) die("❌ " + parsed.error + "\n\n" + HELP);
const opts = parsed.value;if (opts.help) { console.log(HELP); process.exit(0); }

// ── 前置条件（全是只读；不满足就别谈发版）────────────────────────────────────
if (git(["rev-parse", "--is-inside-work-tree"], true).code !== 0) die("❌ 这里不是 git 工作副本 —— 发版仪式需要 git。");
const branch = gitText(["rev-parse", "--abbrev-ref", "HEAD"]);
if (!branch || branch === "HEAD") die("❌ 当前是 detached HEAD —— 先切回分支再发版（否则推出去的 tag 无处可指）。");

const version = String(JSON.parse(readFileSync(join(ROOT, "package.json"), "utf8")).version ?? "");
if (!version) die("❌ 读不到 package.json 的 version。", 2);
const tag = versionTag(version);

// 三方版本一致：判据**与 `npm run audit:docs` 检查① 共用同一份实现**（`tools/docs-consistency.ts`）。
// 放在 verify 之前只是为了**快速失败**（省掉几分钟的全量门），不是第二份判据。
const trip = checkVersionConsistency(ROOT);
if (!trip.ok) {
  console.log(trip.lines.join("\n"));
  die("❌ 三处版本不一致 ⇒ 先把版本改齐（package.json / README「当前版本」行 / CHANGELOG 首条），再发版。", trip.code);
}

const dirty = gitText(["status", "--porcelain"]).length > 0;
const localTags = gitText(["tag", "-l"]).split("\n").map((s) => s.trim()).filter(Boolean);
const remoteTags = gitText(["ls-remote", "--tags", "origin"])
  .split("\n")
  .map((l) => (l.includes("refs/tags/") ? l.split("refs/tags/")[1].trim() : ""))
  .filter((t) => t && !t.endsWith("^{}"))
  .map((t) => t.replace(/\^\{\}$/, ""));

const message = opts.message || "chore(release): v" + version;
const plan = planRelease({ version, branch, dirty, localTags, remoteTags, message });
const violations = planViolations(plan);
if (violations.length) die("❌ 计划自检不通过（本工具自己的不变量被破坏）：\n  · " + violations.join("\n  · "));

console.log("▶ 发版预检");
console.log("   版本（package.json，三处一致）: " + version + "  ⇒ tag " + tag);
console.log("   分支                        : " + branch);
console.log("   工作区                      : " + (dirty ? "有改动（将 add -A 后提交）" : "干净（无内容可提交，tag 指向现有 HEAD）"));
console.log("   语料根 SHADOW_EVAL_ROOT     : " + (process.env.SHADOW_EVAL_ROOT || "（未设：由 verify 自己往上找，找不到就 exit 2 ⇒ 假绿）"));
console.log("   要删的旧 tag                : 本地 " + (localTagsToDelete(localTags, version).join(" ") || "（无）") + " / 远端 " + (remoteTagsToDelete(remoteTags, version).join(" ") || "（无）"));
console.log("   将执行的命令 " + plan.length + " 条：");
for (const s of plan) console.log("     · git " + s.args.join(" ") + "   —— " + s.why);

if (opts.dryRun) {
  console.log("\n✔ --dry-run：什么都没跑（verify 也没跑）。去掉 --dry-run 即按上面顺序执行，第一步就是闸门。");
  process.exit(0);
}

// ── 第一步：闸门 ─────────────────────────────────────────────────────────────
const logPath = join(tmpdir(), "dsh-shadow-release-" + stamp() + ".log");
console.log("\n▶ 闸门：npm run verify（完整输出落盘：" + logPath + "）");
const t0 = Date.now();
const fd = openSync(logPath, "w");
const verify = spawnSync("npm run verify", { cwd: ROOT, shell: true, env: process.env, stdio: ["ignore", fd, fd] });
closeSync(fd);
const exitCode = verify.status ?? 1;
const log = readFileSync(logPath, "utf8");
const gate = gateDecision(exitCode);

if (!gate.proceed) {
  console.log(tailLines(log, 25));
  console.error("\n❌ " + gate.reason);
  console.error("   完整输出：" + logPath);
  if (exitCode === 2) {
    console.error("   提示：exit 2 常见成因是**语料根**缺失（eval:retrieval:check 要一个带 .shadow 的工作区根）");
    console.error("         ⇒ 用 SHADOW_EVAL_ROOT=<工作区> 重跑（本机可用 D:\\project\\net1，见 AGENTS.md）。");
  }
  console.error("   **一个 git 写操作都没有发生** —— 这就是本工具存在的理由。");
  process.exit(exitCode);
}

console.log(tailLines(log, 4));
console.log("\n✔ " + gate.reason + "（耗时 " + seconds(Date.now() - t0) + "s）");

// ── 绿了才走仪式 ────────────────────────────────────────────────────────────
if (dirty) {
  console.log("\n▶ 本次将提交（git add -A 之后的暂存清单）：");
  console.log(gitText(["status", "--porcelain"]));
}
for (const step of plan) {
  if (step.args[0] === "commit") {
    const staged = gitText(["diff", "--cached", "--name-only"]);
    if (!staged) { console.log("\n▶ （跳过提交：暂存区为空 —— 本轮没有内容可提交，tag 指向现有 HEAD）"); continue; }
  }
  console.log("\n▶ git " + step.args.join(" ") + "\n   （" + step.why + "）");
  const r = run("git", step.args);
  if (r.code !== 0) {
    die("❌ 上一步失败（exit " + r.code + "）⇒ **停在此处，不再往下走**。已发生的步骤不回滚，请按上面的输出处置。", r.code);
  }
}

const head = gitText(["rev-parse", "--short", "HEAD"]);
const tagSha = gitText(["rev-parse", "--short", tag]);
console.log("\n✅ 发版完成：" + tag + "（" + version + "）");
console.log("   HEAD      = " + head);
console.log("   " + tag + " → " + tagSha);
if (head !== tagSha) {
  console.error("   ⚠ **tag 与 HEAD 不一致** —— AGENTS.md 要求两者相等（tag 必须指向发布提交），请人工核对后再宣称发版成功。");
  process.exit(1);
}
console.log("   核对：`git ls-remote --tags origin` 应只有 " + tag + "；分支 " + branch + " 已推送。");
