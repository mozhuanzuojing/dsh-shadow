// dsh-shadow —— core/toolset-exec.ts：台账的**可执行部分**（探测 / 解析安装 argv / 审批门 / 安装）。
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
//
// 探测的两条诚实纪律：
//   - **探测失败只说「未检出」，不说「未装」**：探测方式可能不适用（该工具没有 `--version`）、
//     PATH 也可能是**宿主进程启动时的快照**（宿主起来之后装的工具要重启才可见）。
//   - reference 档默认**不探测**（40+ 个外部进程没必要每次都跑）；要探测用 `survey:"all"`。
import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  capabilityOf,
  providerCapabilities,
  referenceCapabilities,
  CATEGORY_ORDER,
  type Capability,
} from "./toolset.js";
import { resolveZgInvocation, resetZgInvocationCache } from "../evidence/zg.js";

/** provider 探测超时（首次可能触发索引/模型加载）。 */
const PROBE_TIMEOUT_PROVIDER = 15000;
/** reference 探测超时：只是 `--version`，短超时即可；失败不影响结论口径（说「未检出」）。 */
const PROBE_TIMEOUT_REFERENCE = 3000;
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
 * 探测一项。
 * zg 走包内 CLI 入口解析（与 provider 同一套逻辑，避免「装了但起不来」的假阴性）；
 * 其余走 PATH 上的可执行文件。
 */
export const probeCapability = async (id: string, timeoutMs?: number): Promise<{ available: boolean; detail: string }> => {
  const c = capabilityOf(id);
  if (!c) return { available: false, detail: `未登记的条目：${id}` };
  const t = timeoutMs ?? (c.kind === "provider" ? PROBE_TIMEOUT_PROVIDER : PROBE_TIMEOUT_REFERENCE);
  if (id === "zg") {
    resetZgInvocationCache();                       // 每次探测重解析（安装后 PATH 可能已变）
    const inv = resolveZgInvocation();
    const r = await run(inv.cmd, [...inv.prefix, "--version"], t);
    return r.ok
      ? { available: true, detail: r.out.trim().split("\n")[0] || "ok" }
      : { available: false, detail: `未检出（${r.code}）` };
  }
  const [cmd, ...args] = c.probe;
  const r = await run(cmd, args, t);
  return r.ok
    ? { available: true, detail: r.out.trim().split("\n")[0] || "ok" }
    : { available: false, detail: `未检出（${r.code}）` };
};

/**
 * 把安装配方解析成真实 argv。
 * **npm-global 的 Windows 陷阱**：npm 只是 `npm.cmd`，execFile 既不能起 `npm`（ENOENT）
 * 也不能起 `npm.cmd`（EINVAL）→ 改走 `node <npm-cli.js>`（与 evidence/zg.ts 解 zg 同一手法）。
 */
export const resolveInstall = (id: string): { cmd: string; args: string[]; display: string } | { error: string } => {
  const c = capabilityOf(id);
  if (!c) return { error: `未登记的条目：${id}（台账见 core/toolset.ts）` };
  const r = c.install;
  if (!r) return { error: `条目 ${id} 未登记可靠安装方式（宁缺勿编）—— 见 ${c.doc}` };
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
 * 显式安装一项。**唯一的成功路径**：探测缺件 → 审批得 `allowed-once` → 执行 → 重探通过。
 * 任一环节不满足都返回对应状态，**绝不在未验证的情况下宣称已装好**。
 */
export const installCapability = async (id: string, opts: InstallOptions = {}): Promise<InstallOutcome> => {
  const c: Capability | undefined = capabilityOf(id);
  if (!c) return { id, status: "unknown-capability", detail: `未登记的条目：${id}。可用条目见 mode:"toolset" 台账。` };

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
      reason: `安装外部 CLI —— ${c.label}：${display}（dsh-shadow 工具集台账；${c.kind === "provider" ? "提供：" + c.provides : "通用开发工具"}）`,
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
  // PATH 是宿主进程快照：新装的工具在**本进程内**可能仍探测不到 —— 必须说清，不能报「安装失败」也不能报「成功」。
  return {
    id,
    status: "failed",
    display,
    detail: `安装器退出码 ${r.code ?? "?"}，**重探仍未检出**（${after.detail}）。注意：宿主进程的 PATH 是启动时快照，**新装的工具通常要重启宿主才能被本进程看到**。${tail(r.err || r.out) ? "\n输出尾部：\n" + tail(r.err || r.out) : ""}`,
  };
};

export interface SurveyRow {
  capability: Capability;
  /** true=检出；false=未检出；**null=本次未探测**（区别于「未装」）。 */
  available: boolean | null;
  detail: string;
}

export interface SurveyOptions {
  /** "providers"（默认，只探测 2 个）｜"all"（并行探测全部）。 */
  survey?: "providers" | "all";
  /** 只列某一分类。 */
  category?: string;
}

/**
 * 台账巡检。默认：provider **实时探测**，reference **只列不探**（省 40+ 次外部进程）。
 * `survey:"all"` → 全部并行探测（短超时）。
 */
export const surveyCapabilities = async (opts: SurveyOptions = {}): Promise<SurveyRow[]> => {
  const all = opts.survey === "all";
  const scope = opts.category
    ? [...providerCapabilities(), ...referenceCapabilities()].filter((c) => c.category === opts.category)
    : [...providerCapabilities(), ...referenceCapabilities()];
  const rows: SurveyRow[] = await Promise.all(scope.map(async (c) => {
    const shouldProbe = c.kind === "provider" || all;
    if (!shouldProbe) return { capability: c, available: null, detail: "未探测" };
    const p = await probeCapability(c.id);
    return { capability: c, available: p.available, detail: p.detail };
  }));
  return rows;
};

const badge = (row: SurveyRow): string => (row.available === true ? "✅" : row.available === false ? "⬜" : "·");

/** 渲染巡检结果（按分类分组）。 */
export const renderSurvey = (rows: SurveyRow[], opts: SurveyOptions = {}, platform: string = process.platform): string => {
  const lines = ["# 工具集台账", ""];
  const groups = new Map<string, SurveyRow[]>();
  for (const r of rows) {
    const k = r.capability.category;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  const order = [...CATEGORY_ORDER, ...[...groups.keys()].filter((k) => !CATEGORY_ORDER.includes(k))];
  const missingProviders: string[] = [];
  for (const cat of order) {
    const g = groups.get(cat);
    if (!g || !g.length) continue;
    lines.push(`## ${cat}`, "");
    for (const row of g) {
      const c = row.capability;
      const state = row.available === true ? `可用（${row.detail}）` : row.available === false ? "未检出" : "（未探测）";
      lines.push(`- ${badge(row)} ${c.label} —— ${state}`);
      lines.push(`    \`${c.id}\`${c.note ? ` · ${c.note}` : ""}`);
      if (c.kind === "provider") {
        lines.push(`    提供：${c.provides}｜缺件时：${c.degradesTo}`);
        if (row.available !== true) missingProviders.push(c.id);
      }
    }
    lines.push("");
  }
  const notProbed = rows.filter((r) => r.available === null).length;
  if (opts.survey !== "all" && notProbed) {
    lines.push(`> 通用工具共 ${notProbed} 项**未探测**（默认只探插件内接线的 ${providerCapabilities().length} 项）。要探测全部：\`read_shadow({ mode:"toolset", survey:"all" })\`。`);
  }
  if (missingProviders.length) {
    lines.push(`> 插件内接线缺件：可用 \`read_shadow({ mode:"toolset", install:"<id>" })\` 安装（会先向你申请审批）；id ∈ ${missingProviders.join(" / ")}。`);
  }
  lines.push(`> 装法（Windows 口径）：\`read_shadow({ mode:"toolset", install:"<id>" })\`，或见 docs/toolchain-windows.md。`);
  lines.push("> 注意：**探测失败 ≠ 未安装** —— 可能是该工具没有探测用的版本旗标，或宿主进程的 PATH 是启动时快照（宿主起来之后装的要重启才可见）。");
  return lines.join("\n");
};

/** 渲染一次安装结果。 */
export const renderInstall = (o: InstallOutcome): string => {
  const badgeMap: Record<InstallStatus, string> = {
    "already-available": "✅ 已可用",
    installed: "✅ 已安装",
    failed: "❌ 失败",
    rejected: "⛔ 用户拒绝",
    cancelled: "⛔ 已取消",
    "no-approval": "⚠ 无审批通道",
    "approval-unavailable": "⚠ 审批未授予",
    "unknown-capability": "❌ 未登记",
  };
  return [`# 工具集台账 · 安装 ${o.id}`, "", `- 结果：${badgeMap[o.status]}`, `- 命令：${o.display || "（未解析）"}`, `- 说明：${o.detail}`].join("\n");
};
