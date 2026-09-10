// dsh-shadow —— core/toolset-exec.ts：能力台账的**可执行部分**（探测 / 解析安装 argv / 审批门 / 安装）。
//
// 权限模型（本文件存在的全部理由）：
//   「一键装」是**有后果的动作**，按本仓安全边界（README「有后果的动作要用户确认」）与
//   ADR-0029.1 inv 178 / ADR-0030 inv 182，必须由**外部权威显式授权**，不能在执行中隐式获得。
//   宿主提供了正确的机制：`ctx.approval.request({agent, toolName, reason})` →
//   `'allowed-once' | 'rejected' | 'cancelled' | 'unavailable'`，**只有 `allowed-once` 是授予**。
//   故本模块：
//     ① 默认只**探测**（只读）；
//     ② 安装必须**显式调用**（`read_shadow({mode:"toolset", install:"<id>"})`），且
//     ③ 一律先要审批，拿不到 `allowed-once` 就不装（**fail closed**）；
//     ④ 装完**重新探测**再报结果——绝不凭退出码宣称成功（ADR-0049：绝不冒充成功）。
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { capabilityOf, type Capability } from "./toolset.js";
import { resolveZgInvocation, resetZgInvocationCache } from "../evidence/zg.js";

const PROBE_TIMEOUT_MS = 15000;
const INSTALL_TIMEOUT_MS = 10 * 60 * 1000;

/** 探测/安装统一的 runner：返回 stdout/stderr/exit，不抛。 */
const run = (cmd: string, args: string[], timeoutMs: number): Promise<{ ok: boolean; code?: number | string; out: string; err: string }> =>
  new Promise((resolve) => {
    execFile(cmd, args, { timeout: timeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (err: any, stdout: string, stderr: string) => {
      if (err) return resolve({ ok: false, code: err.code ?? err.signal ?? "error", out: String(stdout || ""), err: String(stderr || "") || String(err.message || "") });
      resolve({ ok: true, code: 0, out: String(stdout || ""), err: String(stderr || "") });
    });
  });

/**
 * 探测一项能力是否可用。
 * zg 走包内 CLI 入口解析（与 provider 同一套逻辑，避免「装了但起不来」的假阴性）；
 * 其余走 PATH 上的可执行文件。
 */
export const probeCapability = async (id: string, timeoutMs = PROBE_TIMEOUT_MS): Promise<{ available: boolean; detail: string }> => {
  const c = capabilityOf(id);
  if (!c) return { available: false, detail: `未登记的能力：${id}` };
  if (id === "zg") {
    resetZgInvocationCache();                       // 每次探测重解析（安装后 PATH 可能已变）
    const inv = resolveZgInvocation();
    const r = await run(inv.cmd, [...inv.prefix, "--version"], timeoutMs);
    return r.ok
      ? { available: true, detail: r.out.trim().split("\n")[0] || "ok" }
      : { available: false, detail: `探测失败（${r.code}）：${(r.err || r.out).trim().slice(0, 120) || "无输出"}` };
  }
  const [cmd, ...args] = c.probe;
  const r = await run(cmd, args, timeoutMs);
  return r.ok
    ? { available: true, detail: r.out.trim().split("\n")[0] || "ok" }
    : { available: false, detail: `探测失败（${r.code}）：${(r.err || r.out).trim().slice(0, 120) || "无输出"}` };
};

/**
 * 把安装配方解析成真实 argv。
 * **npm-global 的 Windows 陷阱**：npm 只是 `npm.cmd`，execFile 既不能起 `npm`（ENOENT）
 * 也不能起 `npm.cmd`（EINVAL）→ 改走 `node <npm-cli.js>`（与 evidence/zg.ts 解 zg 同一手法）。
 */
export const resolveInstall = (id: string): { cmd: string; args: string[]; display: string } | { error: string } => {
  const c = capabilityOf(id);
  if (!c) return { error: `未登记的能力：${id}（台账见 core/toolset.ts）` };
  const r = c.install;
  if (r.kind === "argv") {
    return { cmd: r.argv[0], args: r.argv.slice(1), display: r.argv.join(" ") };
  }
  const display = `npm install -g ${r.pkg}`;
  const npmCli = path.join(path.dirname(process.execPath), "node_modules", "npm", "bin", "npm-cli.js");
  try {
    if (fs.existsSync(npmCli)) return { cmd: process.execPath, args: [npmCli, "install", "-g", r.pkg], display };
  } catch { /* 探测 npm-cli.js 失败：回退裸 npm（Unix 可用；Windows 会 ENOENT 并被如实报出） */ }
  return { cmd: "npm", args: ["install", "-g", r.pkg], display };
};

export type InstallStatus =
  | "already-available"
  | "installed"
  | "failed"
  | "rejected"
  | "cancelled"
  | "no-approval"
  | "approval-unavailable"
  | "unknown-capability";

export interface InstallOutcome {
  id: string;
  status: InstallStatus;
  display?: string;
  detail: string;
}

export interface InstallOptions {
  /** 宿主 approval 服务（懒取；缺失 → fail closed，不装）。 */
  approval?: any;
  /** 发起这次调用的 agent（审批需要它作为权限凭据）。 */
  agent?: any;
  signal?: AbortSignal;
  timeoutMs?: number;
}

/**
 * 显式安装一项能力。**唯一的成功路径**：探测缺件 → 审批得 `allowed-once` → 执行 → 重探通过。
 * 任一环节不满足都返回对应状态，**绝不在未验证的情况下宣称已装好**。
 */
export const installCapability = async (id: string, opts: InstallOptions = {}): Promise<InstallOutcome> => {
  const c: Capability | undefined = capabilityOf(id);
  if (!c) return { id, status: "unknown-capability", detail: `未登记的能力：${id}。可用：见 mode:"toolset" 的台账。` };

  // ① 先探测：已可用就什么都不做（幂等，且不浪费一次审批）。
  const before = await probeCapability(id);
  if (before.available) return { id, status: "already-available", detail: `已可用（${before.detail}），未做任何改动` };

  const resolved = resolveInstall(id);
  if ("error" in resolved) return { id, status: "failed", detail: resolved.error };
  const { cmd, args, display } = resolved;

  // ② 审批门：没有 approval 服务或没有 agent → fail closed（与 approval 服务自身 'unavailable' 同口径）。
  if (!opts.approval || !opts.agent) {
    return { id, status: "no-approval", display, detail: `无审批通道，**未安装**。请自行执行：${display}` };
  }
  let outcome: string;
  try {
    outcome = await opts.approval.request({
      agent: opts.agent,
      toolName: "read_shadow",
      reason: `安装可选外部 CLI —— ${c.label}：${display}（dsh-shadow 能力台账；提供：${c.provides}）`,
      signal: opts.signal,
    });
  } catch (e: any) {
    return { id, status: "approval-unavailable", display, detail: `审批无法完成（${String(e?.message || e)}），**未安装**。请自行执行：${display}` };
  }
  if (outcome === "rejected") return { id, status: "rejected", display, detail: `用户拒绝，**未安装**` };
  if (outcome === "cancelled") return { id, status: "cancelled", display, detail: `已取消，**未安装**` };
  if (outcome !== "allowed-once") {
    // 'unavailable' 或任何非授予值 → 一律不装（approval 服务本身也把异常返回值归一为 unavailable）。
    return { id, status: "approval-unavailable", display, detail: `审批未授予（${outcome}），**未安装**。请自行执行：${display}` };
  }

  // ③ 执行安装。
  const r = await run(cmd, args, opts.timeoutMs ?? INSTALL_TIMEOUT_MS);
  const tail = (s: string) => String(s || "").trim().split("\n").slice(-6).join("\n").slice(0, 600);

  // ④ **重探**再报结果：退出码 ≠ 可用。zg 装完 PATH 已变，缓存必须清掉重解析。
  if (id === "zg") resetZgInvocationCache();
  const after = await probeCapability(id);
  if (after.available) {
    return { id, status: "installed", display, detail: `已安装并**重探通过**（${after.detail}）${r.ok ? "" : `；注意安装器退出码 ${r.code}`}` };
  }
  return {
    id,
    status: "failed",
    display,
    detail: `安装器退出码 ${r.code ?? "?"}，**重探仍未通过**（${after.detail}）。${tail(r.err || r.out) ? "\n输出尾部：\n" + tail(r.err || r.out) : ""}`,
  };
};

/** 台账巡检（**只读**）：逐项探测 + 给处置。 */
export const surveyCapabilities = async (): Promise<{ capability: Capability; available: boolean; detail: string }[]> => {
  const out: { capability: Capability; available: boolean; detail: string }[] = [];
  for (const c of (await import("./toolset.js")).CAPABILITIES) {
    const p = await probeCapability(c.id);
    out.push({ capability: c, available: p.available, detail: p.detail });
  }
  return out;
};

/** 渲染巡检结果（读侧输出）。 */
export const renderSurvey = (rows: { capability: Capability; available: boolean; detail: string }[]): string => {
  const lines = ["# 能力台账（可选外部 CLI）", ""];
  const missing: string[] = [];
  for (const { capability: c, available, detail } of rows) {
    lines.push(`- ${available ? "✅" : "⬜"} ${c.label} —— ${available ? `可用（${detail}）` : "未装"}`);
    lines.push(`    提供：${c.provides}｜缺件时：${c.degradesTo}`);
    if (!available) missing.push(c.id);
  }
  if (missing.length) {
    lines.push("", `> 缺件处置：可用 \`read_shadow({ mode: "toolset", install: "<id>" })\` 显式安装（会先向你申请审批）；id ∈ ${missing.join(" / ")}`);
  } else {
    lines.push("", "> 全部可用，无需处置。");
  }
  return lines.join("\n");
};

/** 渲染一次安装结果。 */
export const renderInstall = (o: InstallOutcome): string => {
  const head = `# 能力台账 · 安装 ${o.id}`;
  const badge: Record<InstallStatus, string> = {
    "already-available": "✅ 已可用",
    installed: "✅ 已安装",
    failed: "❌ 失败",
    rejected: "⛔ 用户拒绝",
    cancelled: "⛔ 已取消",
    "no-approval": "⚠ 无审批通道",
    "approval-unavailable": "⚠ 审批未授予",
    "unknown-capability": "❌ 未登记",
  };
  return [head, "", `- 结果：${badge[o.status]}`, `- 命令：${o.display || "（未解析）"}`, `- 说明：${o.detail}`].join("\n");
};
