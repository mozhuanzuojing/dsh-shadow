// dsh-shadow v2 — 工具集台账的「可执行部分」：安装 argv 解析 + **审批门** + 重探。
//
// 安全核心：**拿不到 allowed-once 就绝不能执行安装**。下面把每种非授予结果都钉一遍，
// 并注入假 runner 断言「安装器一次都没被执行」——测试不改变机器、不依赖本机装了什么。
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { installCapability, resolveInstall } from "../../dist/engine/toolset/install.js";
import { renderInstall } from "../../dist/engine/toolset/render.js";
import type { ExecResult, Runner } from "../../dist/engine/toolset/types.js";

interface PhaseOptions {
  /** 安装前探测是否可用。 */
  before: boolean;
  /** 安装后探测是否可用。 */
  after: boolean;
  /** 安装器是否退出 0（默认 true）。 */
  installerOk?: boolean;
}

/** 假 runner：探测在 before 阶段恒失败，安装命令成功后切到 after 阶段。 */
const phasedRunner = (opts: PhaseOptions) => {
  const calls: string[] = [];
  let phase: "before" | "after" = "before";
  const runner: Runner = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    if (cmd === "uv" && args[0] === "tool") {
      phase = "after";
      const ok = opts.installerOk !== false;
      return { ok, code: ok ? 0 : 1, out: "installed", err: ok ? "" : "installer blew up" };
    }
    const available = phase === "after" ? opts.after : opts.before;
    const r: ExecResult = available
      ? { ok: true, code: 0, out: "semble 0.9.9", err: "" }
      : { ok: false, code: "ENOENT", out: "", err: "" };
    return r;
  };
  return { calls, runner };
};

/** 恒失败的假 runner（探测未检出）。 */
const failureRunner = () => {
  const calls: string[] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return { ok: false, code: "ENOENT", out: "", err: "" };
  };
  return { calls, runner };
};

const stubApproval = (value: unknown, onRequest?: (req: unknown) => void) => ({
  request: async (req: any) => {
    onRequest?.(req);
    if (value instanceof Error) throw value;
    return value;
  },
});

// ─────────────────────────────────────────────
// ① resolveInstall：声明式配方 → 真实 argv（含 Windows npm 陷阱）；未登记/无装法不编造
// ─────────────────────────────────────────────
const sm = resolveInstall("semble");
assert.ok(sm.ok, "semble 应能解析安装 argv");
assert.equal(sm.value.cmd, "uv", "semble 用 uv（真 .exe，可直接起）");
assert.deepEqual(sm.value.args, ["tool", "install", "semble"], "semble 安装参数");
assert.equal(sm.value.display, "uv tool install semble", "展示命令须人类可复制");

const zg = resolveInstall("zg");
assert.ok(zg.ok, "zg 应能解析安装 argv");
assert.equal(zg.value.display, "npm install -g @zvec/zvec-grep", "展示命令须人类可复制");
const npmCliBesideNode = join(dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
if (existsSync(npmCliBesideNode)) {
  assert.equal(zg.value.cmd, process.execPath, "旁路有 npm-cli 时必须用 node 起（不是裸 npm / npm.cmd）");
  assert.ok(/npm-cli\.js$/.test(String(zg.value.args[0])), `zg 安装的第一个参数应是 npm-cli.js：${zg.value.args[0]}`);
  assert.deepEqual(zg.value.args.slice(1), ["install", "-g", "@zvec/zvec-grep"], "zg 安装参数");
} else {
  assert.equal(zg.value.cmd, "npm", "旁路无 npm-cli 时回退裸 npm（与契约一致）");
  assert.deepEqual(zg.value.args, ["install", "-g", "@zvec/zvec-grep"], "zg 安装参数（裸 npm）");
}

const unknownResolve = resolveInstall("nope");
assert.ok(!unknownResolve.ok, "未登记 → 返回 error（不编造 argv）");
assert.equal(unknownResolve.error.code, "INVALID_INPUT", `未登记应报 INVALID_INPUT（实际 ${unknownResolve.error.code}）`);
const noRecipe = resolveInstall("tmux");
assert.ok(!noRecipe.ok, "无可靠装法 → 返回 error");
assert.equal(noRecipe.error.code, "UNAVAILABLE", `无可靠装法应报 UNAVAILABLE（实际 ${noRecipe.error.code}）`);
assert.ok(noRecipe.error.message.includes("未登记可靠安装方式"), noRecipe.error.message);
console.log("✔ ① resolveInstall：npm-global 走 node+npm-cli.js（Windows 陷阱）/ argv 直传 / 未登记与无装法不编造");

// ─────────────────────────────────────────────
// ② 未登记条目：探测/安装解析/安装均不猜（且不探测、不取审批）
// ─────────────────────────────────────────────
{
  const { calls, runner } = failureRunner();
  let approvalAsked = 0;
  const r = await installCapability("nope", {
    runner,
    getApproval: () => {
      approvalAsked++;
      return stubApproval("allowed-once");
    },
    agent: { id: "T" },
  });
  assert.equal(r.status, "unknown-capability", "未登记 → unknown-capability");
  assert.equal(r.display, undefined, "未登记不得给出安装命令");
  assert.equal(calls.length, 0, "未登记条目不应探测");
  assert.equal(approvalAsked, 0, "未登记条目不应取审批通道");
}
console.log("✔ ② 未登记能力：探测/审批/安装命令全部不编造");

// ─────────────────────────────────────────────
// ③ 已可用 → 幂等短路：不申请审批、不做任何改动
// ─────────────────────────────────────────────
{
  const { calls, runner } = phasedRunner({ before: true, after: true });
  let approvalAsked = 0;
  const r = await installCapability("semble", {
    runner,
    getApproval: () => {
      approvalAsked++;
      return stubApproval("allowed-once");
    },
    agent: { id: "T" },
  });
  assert.equal(r.status, "already-available", "已可用 → already-available");
  assert.ok(r.detail.includes("未做任何改动"), r.detail);
  assert.equal(approvalAsked, 0, "已可用时不得申请审批（幂等且不打扰用户）");
  assert.deepEqual(calls, ["semble --version"], "已可用时只探测一次，不执行安装器");
}
console.log("✔ ③ 已可用短路：already-available，未申请审批、未执行安装");

// ─────────────────────────────────────────────
// ④ 审批门（安全核心）：每种非授予结果都**不安装**，且给出可复制命令
// ─────────────────────────────────────────────
{
  const expectStatus: [string, unknown, string][] = [
    ["rejected", "rejected", "rejected"],
    ["cancelled", "cancelled", "cancelled"],
    ["unavailable", "unavailable", "approval-unavailable"],
    ["非词表返回值", "yes-please", "approval-unavailable"],
  ];
  for (const [label, value, status] of expectStatus) {
    const { calls, runner } = failureRunner();
    const r = await installCapability("semble", { runner, getApproval: () => stubApproval(value), agent: { id: "T" } });
    assert.equal(r.status, status, `${label} → ${status}（实际 ${r.status}）`);
    assert.ok(r.detail.includes("未安装"), `${label} 必须明说未安装：${r.detail}`);
    assert.equal(r.display, "uv tool install semble", "拒绝路径也要给可复制命令");
    assert.deepEqual(calls, ["semble --version"], "非授予结果绝不能执行安装器");
  }

  {
    const { calls, runner } = failureRunner();
    const r = await installCapability("semble", { runner, agent: { id: "T" } });
    assert.equal(r.status, "no-approval", "无 getApproval → no-approval");
    assert.ok(r.detail.includes("未安装") && r.detail.includes("uv tool install semble"), r.detail);
    assert.deepEqual(calls, ["semble --version"], "无审批通道不得执行安装器");
  }
  {
    const { calls, runner } = failureRunner();
    const r = await installCapability("semble", { runner, getApproval: () => stubApproval("allowed-once") });
    assert.equal(r.status, "no-approval", "只有 approval 没有 agent → no-approval（agent 是审批凭据）");
    assert.deepEqual(calls, ["semble --version"], "缺 agent 不得执行安装器");
  }
  {
    const { calls, runner } = failureRunner();
    const r = await installCapability("semble", { runner, getApproval: () => undefined, agent: { id: "T" } });
    assert.equal(r.status, "no-approval", "getApproval 返回 undefined → no-approval（fail closed）");
    assert.deepEqual(calls, ["semble --version"], "无审批服务不得执行安装器");
  }
  {
    const { calls, runner } = failureRunner();
    const r = await installCapability("semble", { runner, getApproval: () => stubApproval(new Error("no open turn")), agent: { id: "T" } });
    assert.equal(r.status, "approval-unavailable", "审批抛错 → approval-unavailable（不装）");
    assert.ok(r.detail.includes("未安装") && r.detail.includes("no open turn"), r.detail);
    assert.deepEqual(calls, ["semble --version"], "审批抛错不得执行安装器");
  }
  {
    const { calls, runner } = failureRunner();
    const r = await installCapability("semble", {
      runner,
      getApproval: () => {
        throw new Error("approval service not ready");
      },
      agent: { id: "T" },
    });
    assert.equal(r.status, "approval-unavailable", "取审批通道抛错 → approval-unavailable");
    assert.ok(r.detail.includes("未安装") && r.detail.includes("approval service not ready"), r.detail);
    assert.deepEqual(calls, ["semble --version"], "审批通道异常不得执行安装器");
  }
  {
    const { calls, runner } = failureRunner();
    const r = await installCapability("tmux", { runner, getApproval: () => stubApproval("allowed-once"), agent: { id: "T" } });
    assert.equal(r.status, "no-recipe", "无可靠装法 → no-recipe（未尝试，不是安装失败）");
    assert.ok(r.detail.includes("未登记可靠安装方式"), r.detail);
    assert.equal(r.display, undefined, "无可靠装法不得编造命令");
    assert.deepEqual(calls, ["tmux -V"], "只探测一次，不执行安装器");
  }
}
console.log("✔ ④ 审批门：无通道 / 缺 agent / rejected / cancelled / unavailable / 异常返回值 / 审批抛错 / 无装法 —— 全部不安装");

// ─────────────────────────────────────────────
// ⑤ allowed-once → 执行安装 → **重新探测**再报（唯一成功路径）
// ─────────────────────────────────────────────
{
  const { calls, runner } = phasedRunner({ before: false, after: true });
  let seen: any;
  const r = await installCapability("semble", {
    runner,
    getApproval: () => stubApproval("allowed-once", (req) => { seen = req; }),
    agent: { id: "agent-1" },
  });
  assert.equal(r.status, "installed", `重探通过 → installed（实际 ${r.status}：${r.detail}）`);
  assert.ok(r.detail.includes("重探通过"), r.detail);
  assert.deepEqual(calls, ["semble --version", "uv tool install semble", "semble --version"], "执行顺序：探测 → 安装 → 重探");
  assert.equal(seen.toolName, "shadow_toolset", `审批请求须带工具名（实际 ${seen.toolName}）`);
  assert.deepEqual(seen.agent, { id: "agent-1" }, "审批凭据必须是发起 agent");
  assert.ok(String(seen.reason).includes("uv tool install semble"), "审批理由须含可复制命令");
}
{
  const { runner } = phasedRunner({ before: false, after: true, installerOk: false });
  const r = await installCapability("semble", { runner, getApproval: () => stubApproval("allowed-once"), agent: { id: "T" } });
  assert.equal(r.status, "installed", "重探通过就是已安装（退出码非 0 需披露而不是改写结论）");
  assert.ok(r.detail.includes("退出码 1"), `须披露安装器退出码：${r.detail}`);
}
{
  const { calls, runner } = phasedRunner({ before: false, after: false });
  const r = await installCapability("semble", { runner, getApproval: () => stubApproval("allowed-once"), agent: { id: "T" } });
  assert.equal(r.status, "unverified", "重探未检出 → unverified（不报成功，也不断言安装失败）");
  assert.ok(r.detail.includes("重探仍未检出"), r.detail);
  assert.ok(r.detail.includes("重启宿主"), "必须说清 PATH 是启动时快照、要重启宿主");
  assert.ok(!r.detail.includes("已安装并"), "未验证不得出现「已安装并」措辞");
  assert.deepEqual(calls, ["semble --version", "uv tool install semble", "semble --version"], "失败路径也应重探一次");
}
{
  let probeCount = 0;
  const runner: Runner = async (cmd) => {
    if (cmd === "uv") throw new Error("spawn EPERM");
    probeCount++;
    return { ok: false, code: "ENOENT", out: "", err: "" };
  };
  const r = await installCapability("semble", { runner, getApproval: () => stubApproval("allowed-once"), agent: { id: "T" } });
  assert.equal(r.status, "failed", "安装器抛错 → failed");
  assert.ok(r.detail.includes("安装器执行失败") && r.detail.includes("未声称已安装"), r.detail);
  assert.equal(probeCount, 1, "安装器抛错后不做无意义重探（安装并未发生）");
}
console.log("✔ ⑤ allowed-once 后执行并重探：成功 / 退出码非 0 / 重探失败 / 安装器抛错 四种路径都如实报");

// ─────────────────────────────────────────────
// ⑥ 安装结果渲染：状态词、命令、说明（拒绝路径必带「未安装」）
// ─────────────────────────────────────────────
const rejectedOut = renderInstall({ id: "semble", status: "rejected", display: "uv tool install semble", detail: "用户拒绝，**未安装**" });
assert.ok(rejectedOut.includes("用户拒绝"), rejectedOut);
assert.ok(rejectedOut.includes("uv tool install semble"), "渲染须保留可复制命令");
assert.ok(rejectedOut.includes("未安装"), "渲染须保留未安装结论");
const noApprovalOut = renderInstall({ id: "semble", status: "no-approval", display: "uv tool install semble", detail: "无审批通道，**未安装**。" });
assert.ok(noApprovalOut.includes("无审批通道"));
assert.ok(noApprovalOut.includes("uv tool install semble"));
const noRecipeOut = renderInstall({ id: "tmux", status: "no-recipe", detail: "条目 tmux 未登记可靠安装方式（宁缺勿编）" });
assert.ok(noRecipeOut.includes("无可靠装法"), noRecipeOut);
assert.ok(noRecipeOut.includes("（未解析）"), "无命令时渲染必须显式标明，不伪造命令");
console.log("✔ ⑥ 安装结果渲染：状态 / 命令 / 说明三行；拒绝路径保留「未安装」与可复制命令");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · allowed-once → **真机执行** winget/npm/uv 安装 → 重探：本测试用假 runner 验证状态机，不真装；");
console.log("    真机安装属人工验收（会让测试改动机器）。");
console.log("  · 审批服务的真实宿主接线（Cordis approval）由 test/e2e/toolset.test.ts 走 ctx.get 验证拒绝/无通道路径。");
console.log("ALL PASS ✅");
