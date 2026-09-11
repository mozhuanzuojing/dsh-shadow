// dsh-shadow —— 能力台账的可执行部分：安装 argv 解析（Windows npm 陷阱）+ **审批门**（v1.15.8）
// 安全核心：**拿不到 `allowed-once` 就绝不能执行安装**。下面把每种非授予结果都钉一遍。
import assert from "node:assert/strict";
import { dirname, join } from "node:path";
import { probeCapability, resolveInstall, installCapability } from "../dist/core/toolset-exec.js";

// ─────────────────────────────────────────────
// ① resolveInstall：把声明式配方解析成真实 argv
//    关键回归：npm-global 在 Windows 上必须走 `node <npm-cli.js>` —— npm 只是 `npm.cmd`，
//    execFile 起不了它（ENOENT），显式起 `npm.cmd` 又被 Node 拒（EINVAL）。
// ─────────────────────────────────────────────
const zg = resolveInstall("zg");
assert.ok(!("error" in zg), "zg 应能解析出安装 argv");
assert.equal(zg.cmd, process.execPath, "zg 安装必须用 node 起（不是裸 npm / npm.cmd）");
assert.ok(/npm-cli\.js$/.test(String(zg.args[0])), `zg 安装的第一个参数应是 npm-cli.js：${zg.args[0]}`);
assert.deepEqual(zg.args.slice(1), ["install", "-g", "@zvec/zvec-grep"], "zg 安装参数");
assert.equal(zg.display, "npm install -g @zvec/zvec-grep", "展示命令仍是人类可复制的形式");

const sm = resolveInstall("semble");
assert.ok(!("error" in sm), "semble 应能解析出安装 argv");
assert.equal(sm.cmd, "uv", "semble 用 uv（真 .exe，可直接起）");
assert.deepEqual(sm.args, ["tool", "install", "semble"], "semble 安装参数");
assert.equal(sm.display, "uv tool install semble", "展示命令");

const unknown = resolveInstall("gzz");
assert.ok("error" in unknown, "未登记能力 → 返回 error（不编造 argv）");
console.log("✔ ① resolveInstall：npm-global 走 node+npm-cli.js（Windows 陷阱）/ argv 直传 / 未登记报 error");

// ─────────────────────────────────────────────
// ② 未登记能力：探测与安装都不得猜
// ─────────────────────────────────────────────
assert.equal((await probeCapability("gzz")).available, false, "未登记能力探测 → 不可用");
const u = await installCapability("gzz");
assert.equal(u.status, "unknown-capability", "未登记能力 → unknown-capability");
console.log("✔ ② 未登记能力：探测/安装均不编造");

// ─────────────────────────────────────────────
// ③ 已可用 → 幂等短路：**不申请审批、不做任何改动**
//    （本机 semble 已装，正好用来验这条真实路径）
// ─────────────────────────────────────────────
const smProbe = await probeCapability("semble");
if (smProbe.available) {
  let asked = 0;
  const r = await installCapability("semble", { approval: { request: async () => { asked++; return "allowed-once"; } }, agent: { id: "T" } });
  assert.equal(r.status, "already-available", "已可用 → already-available");
  assert.equal(asked, 0, "已可用时**不得**申请审批（幂等且不打扰用户）");
  console.log(`✔ ③ 已可用短路：already-available，未申请审批（探测值：${smProbe.detail}）`);
} else {
  console.log("⚠ ③ 跳过：本机 semble 未装，无法验证「已可用短路」");
}

// ─────────────────────────────────────────────
// ④ 审批门（安全核心）：把 zg 探测**人为打偏**（DSH_SHADOW_ZG_CLI 指向不存在的位置），
//    使「缺件」成立，从而真正走到审批门；随后对每种非授予结果断言：**一律不安装**。
//    注意：没有任何一种结果里出现 `allowed-once`，所以安装器永远不会被执行 —— 测试不改变机器。
// ─────────────────────────────────────────────
const savedCli = process.env.DSH_SHADOW_ZG_CLI;
process.env.DSH_SHADOW_ZG_CLI = join(dirname(process.execPath), "__dsh-nonexistent-cli__.ts");

const zgMissing = await probeCapability("zg");
assert.equal(zgMissing.available, false, "打偏后 zg 应探测为不可用（这样才走得到审批门）");

// ④a 无审批通道 → fail closed
const noCh = await installCapability("zg", {});
assert.equal(noCh.status, "no-approval", "无 approval 服务 → no-approval");
assert.ok(noCh.detail.includes("未安装"), `必须明说未安装：${noCh.detail}`);
assert.ok(noCh.detail.includes("npm install -g @zvec/zvec-grep"), "无审批时给出可自行执行的命令");
assert.equal((await installCapability("zg", { approval: { request: async () => "allowed-once" } })).status, "no-approval", "只有 approval 没有 agent → 仍 no-approval（agent 是审批凭据）");

// ④b 每种非授予结果 → 对应状态，且都明说「未安装」
const stub = (v: string) => ({ approval: { request: async () => v }, agent: { id: "T" } });
const rejected = await installCapability("zg", stub("rejected"));
assert.equal(rejected.status, "rejected", "rejected → rejected");
assert.ok(rejected.detail.includes("未安装"), "拒绝必须明说未安装");
const cancelled = await installCapability("zg", stub("cancelled"));
assert.equal(cancelled.status, "cancelled", "cancelled → cancelled");
const unavailable = await installCapability("zg", stub("unavailable"));
assert.equal(unavailable.status, "approval-unavailable", "unavailable → approval-unavailable（fail closed）");
const rogue = await installCapability("zg", stub("yes-please"));   // 非词表返回值
assert.equal(rogue.status, "approval-unavailable", "非词表返回值 → 归一为未授予（不装）");
console.log("✔ ④ 审批门：无通道 / 缺 agent / rejected / cancelled / unavailable / 异常返回值 —— 全部不安装");

// ④c 审批抛错 → 也不装
const throwing = await installCapability("zg", { approval: { request: async () => { throw new Error("no open turn"); } }, agent: { id: "T" } });
assert.equal(throwing.status, "approval-unavailable", "审批抛错 → approval-unavailable（不装）");
assert.ok(throwing.detail.includes("未安装"), `抛错也须明说未安装：${throwing.detail}`);
console.log("✔ ⑤ 审批抛错（如无开启的 turn）→ 不安装、原因可见");

// 复原
if (savedCli === undefined) delete process.env.DSH_SHADOW_ZG_CLI; else process.env.DSH_SHADOW_ZG_CLI = savedCli;

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `allowed-once` → 真正执行安装器 → 重探 → 报结果 这条**执行**路径。");
console.log("    原因：执行它会在本机真的跑 npm/uv 安装、改动机器。其机械部分（argv 解析）已由 ① 覆盖，");
console.log("    其安全门（必须 allowed-once）已由 ④⑤ 覆盖；端到端执行属真机验收，不放在单测里。");
console.log("ALL PASS ✅");
