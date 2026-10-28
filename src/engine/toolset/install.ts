/**
 * v2 engine/toolset — 安装解析 + 审批门 + 安装执行 + 重探（台账里唯一有外部副作用的部分）。
 *
 * 权限模型（本文件存在的全部理由）：
 *   「一键装」是**有后果的动作**，必须由外部权威**显式授权**，不能在执行中隐式获得
 *   （docs/v2/ARCHITECTURE.md §4：install = 外部副作用；docs/v2/PARITY.md §6.10：写模式必须显式声明）。
 *   宿主提供机制：`ctx.get("approval").request({agent, toolName, reason})`
 *   → `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`，**只有 allowed-once 是授予**。
 *   故本模块：
 *     ① 默认只探测（只读）；
 *     ② 安装必须**显式调用**（`shadow_toolset({install:"<id>"})`）；
 *     ③ 一律先要审批，拿不到 allowed-once 就不装（**fail closed**），并给出可复制命令；
 *     ④ 装完**重新探测**再报结果——绝不凭退出码宣称成功。
 */

import fs from "node:fs";
import path from "node:path";
import { capabilityOf, remedyFor } from "./catalog.js";
import { execRunner, probeCapability } from "./probe.js";
import { err, ok, type Outcome } from "../../contract/outcome.js";
import type {
  ApprovalPort, Capability, ExecResult, InstallOutcome, InstallStatus, ProbeResult, ResolvedInstall, Runner,
} from "./types.js";

/** 安装器超时（npm/uv/winget 都可能慢；超时也会被当作失败并重探）。 */
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

const messageOf = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 输出尾部（最多 6 行 / 600 字符）：给失败留证据，不把上万行日志灌进工具输出。 */
const tail = (s: string): string =>
  String(s ?? "").trim().split("\n").slice(-6).join("\n").slice(0, 600);

/**
 * 把安装配方解析成真实 argv。
 * **npm-global 的 Windows 陷阱**：npm 只是 `npm.cmd`，execFile 既不能起 `npm`（ENOENT）
 * 也不能起 `npm.cmd`（EINVAL）→ 改走 `node <npm-cli.js>`。
 * 未登记条目 → INVALID_INPUT；无可靠装法 → UNAVAILABLE（**不编造 argv**）。
 */
export const resolveInstall = (id: unknown): Outcome<ResolvedInstall> => {
  const c = capabilityOf(id);
  if (!c) return err("INVALID_INPUT", `未登记的条目：${String(id ?? "")}（可用条目见 shadow_toolset 台账）`);
  const recipe = c.install;
  if (!recipe) return err("UNAVAILABLE", `条目 ${c.id} 未登记可靠安装方式（宁缺勿编）—— 见 ${c.doc}`);
  if (recipe.kind === "argv") {
    const cmd = recipe.argv[0];
    if (!cmd) return err("CORRUPT", `条目 ${c.id} 的安装配方为空（台账数据错误）`);
    return ok({ cmd, args: recipe.argv.slice(1), display: recipe.argv.join(" ") });
  }
  const display = `npm install -g ${recipe.pkg}`;
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  try {
    if (fs.existsSync(npmCli)) return ok({ cmd: process.execPath, args: [npmCli, "install", "-g", recipe.pkg], display });
  } catch {
    // 探测 npm-cli.js 是否存在失败：回退裸 npm（Unix 可用；Windows 会 ENOENT 并被如实报出）。
  }
  return ok({ cmd: "npm", args: ["install", "-g", recipe.pkg], display });
};

export interface InstallOptions {
  /** 注入 runner（测试用假 runner：不真装、不改机器）。 */
  runner?: Runner;
  /**
   * **懒取**审批通道：只在「确实要装」时才调用（未知条目/条目已可用/无装法都不会取）。
   * 缺失、抛错、或返回的对象没有 request → 一律 fail closed。
   */
  getApproval?: () => ApprovalPort | undefined;
  /** 发起这次调用的 agent（审批凭据；从工具 execute 的 exec.agent 取）。 */
  agent?: unknown;
  /** 安装器超时（默认 10 分钟）。 */
  timeoutMs?: number;
  /** 探测超时（默认按 kind）。 */
  probeTimeoutMs?: number;
}

/**
 * 显式安装一项。**唯一的成功路径**：探测缺件 → 审批得 `allowed-once` → 执行 → **重探通过**。
 * 任一环节不满足都返回对应状态；**绝不在未验证的情况下宣称已装好**。
 * 拒绝路径一律明说「未安装」并给出可复制命令（用户可以自己执行）。
 */
export const installCapability = async (id: unknown, opts: InstallOptions = {}): Promise<InstallOutcome> => {
  const capabilityId = String(id ?? "").trim();
  const c: Capability | undefined = capabilityOf(capabilityId);
  if (!c) {
    return {
      id: capabilityId,
      status: "unknown-capability",
      detail: `未登记的条目：${capabilityId}。可用条目见 shadow_toolset 台账。`,
    };
  }

  // ① 先探测：已可用就什么都不做（幂等，且不浪费一次审批）。
  const before: ProbeResult = await probeCapability(c.id, { runner: opts.runner, timeoutMs: opts.probeTimeoutMs });
  if (before.available) {
    return { id: c.id, status: "already-available", detail: `已可用（${before.detail}），未做任何改动` };
  }

  // ② 解析安装 argv；无可靠装法如实报，不编造命令。
  const resolved = resolveInstall(c.id);
  if (!resolved.ok) {
    const status: InstallStatus = resolved.error.code === "UNAVAILABLE" ? "no-recipe" : "failed";
    const remedy = remedyFor(c.id);
    const hint = remedy?.cmd && remedy.cmd !== "（未登记可靠安装方式）" ? `（台账处置：${remedy.cmd}）` : "";
    return { id: c.id, status, detail: `${resolved.error.message}${hint}` };
  }
  const { cmd, args, display } = resolved.value;

  // ③ 审批门：没有通道/没有 agent/拿不到 allowed-once → 一律不装（fail closed）。
  let approval: ApprovalPort | undefined;
  try {
    approval = opts.getApproval?.();
  } catch (e) {
    return {
      id: c.id,
      status: "approval-unavailable",
      display,
      detail: `审批通道获取失败（${messageOf(e)}），**未安装**。请自行执行：${display}`,
    };
  }
  if (!approval || typeof approval.request !== "function" || !opts.agent) {
    return { id: c.id, status: "no-approval", display, detail: `无审批通道，**未安装**。请自行执行：${display}` };
  }
  let granted: unknown;
  try {
    granted = await approval.request({
      agent: opts.agent,
      toolName: "shadow_toolset",
      reason: `安装外部 CLI —— ${c.label}：${display}（dsh-shadow 工具集台账；${c.kind === "provider" ? `插件内接线：${c.provides}` : "通用开发工具"}）`,
    });
  } catch (e) {
    return {
      id: c.id,
      status: "approval-unavailable",
      display,
      detail: `审批无法完成（${messageOf(e)}），**未安装**。请自行执行：${display}`,
    };
  }
  if (granted === "rejected") return { id: c.id, status: "rejected", display, detail: "用户拒绝，**未安装**" };
  if (granted === "cancelled") return { id: c.id, status: "cancelled", display, detail: "已取消，**未安装**" };
  if (granted !== "allowed-once") {
    // 'unavailable' 或任何非授予值 → 一律不装（审批服务本身也把异常返回值归一为 unavailable）。
    return {
      id: c.id,
      status: "approval-unavailable",
      display,
      detail: `审批未授予（${String(granted)}），**未安装**。请自行执行：${display}`,
    };
  }

  // ④ 执行安装（runner 可注入；抛错也归一成失败，不冒充成功）。
  let run: ExecResult;
  try {
    run = await (opts.runner ?? execRunner)(cmd, args, opts.timeoutMs ?? INSTALL_TIMEOUT_MS);
  } catch (e) {
    return {
      id: c.id,
      status: "failed",
      display,
      detail: `安装器执行失败（${messageOf(e)}），**未声称已安装**。请检查后重试或自行执行：${display}`,
    };
  }

  // ⑤ **重探**再报结果：退出码 ≠ 可用。
  const after = await probeCapability(c.id, { runner: opts.runner, timeoutMs: opts.probeTimeoutMs });
  if (after.available) {
    return {
      id: c.id,
      status: "installed",
      display,
      detail: `已安装并**重探通过**（${after.detail}）${run.ok ? "" : `；注意安装器退出码 ${run.code}`}`,
    };
  }
  // PATH 是宿主进程快照：新装的工具在**本进程内**可能仍探测不到 —— 必须说清，不能报「安装失败」也不能报「成功」。
  const output = tail(run.err || run.out);
  return {
    id: c.id,
    // 不报 failed：安装器可能真的装上了，只是**本进程 PATH 快照**还看不到（预期限制）。
    status: "unverified",
    display,
    detail:
      `安装器退出码 ${run.code}，**重探仍未检出**（${after.detail}）。注意：宿主进程的 PATH 是启动时快照，` +
      `**新装的工具通常要重启宿主才能被本进程看到**。${output ? `\n输出尾部：\n${output}` : ""}`,
  };
};
