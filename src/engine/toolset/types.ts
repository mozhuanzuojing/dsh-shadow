/**
 * v2 engine/toolset — 台账类型与分类取值域。
 *
 * 分类顺序**同时**是渲染顺序与分类取值域的唯一事实源（沿用 v1 ADR-0055 的 A20）：
 * 取值域是类型（从私有元组派生），打错一个字的分类在编译期就红，而不是静默掉出渲染顺序。
 * 公开面保持 `readonly string[]`：渲染时要给「未登记进顺序表」的分类兜底（将来扩分类不掉队）。
 */

import type { SignalStore } from "../signals.js";

const CATEGORY_TUPLE = [
  "插件内接线",
  "GNU 工具链",
  "搜索与查找",
  "文本与数据",
  "目录与浏览",
  "Shell 与终端",
  "Git 与版本控制",
  "磁盘与系统",
  "网络与下载",
  "版本与包管理",
  "构建与任务",
  "归档",
  "逆向与二进制分析",
  // v1 扩源（ADR-0058）新增：按「一个编码 agent 实际会做的活」分类，而非按工具来源分。
  "容器与编排",
  "安全与供应链",
  "文档与转换",
  "媒体处理",
] as const;

export const CATEGORY_ORDER: readonly string[] = CATEGORY_TUPLE;

export type Category = (typeof CATEGORY_TUPLE)[number];

/** provider = 插件内接线；reference = 通用 CLI 目录（插件不接线）。两级必须分清。 */
export type ToolKind = "provider" | "reference";

/** 缺件处置：一条可复制执行的命令 + 可选的坑说明。 */
export interface CapabilityRemedy {
  cmd: string;
  note?: string;
}

/**
 * 安装配方（声明式）。**为什么不能只存一条命令字符串**：
 *   - npm-global 在 Windows 上 npm 只是 `npm.cmd`，Node 的 execFile 既不能起 `.cmd`（ENOENT）
 *     也不能显式起 `.cmd`（EINVAL，CVE-2024-27980 缓解）→ 必须改走 `node <npm-cli.js>`；
 *   - argv 用于本身就是可执行文件的工具（uv.exe / winget.exe 可直接起）。
 * 故存结构、由 install.ts 在运行时解析成真实 argv。
 */
export type InstallRecipe =
  | { kind: "npm-global"; pkg: string }
  | { kind: "argv"; argv: string[] };

/** 一项台账条目。 */
export interface Capability {
  id: string;
  label: string;
  kind: ToolKind;
  category: Category;
  /** 它提供什么。 */
  provides: string;
  /** 缺件时退到什么确定性路径；reference 填「不影响插件行为」。 */
  degradesTo: string;
  /** 按平台给处置；default 兜底（非 Windows 平台走它）。 */
  remedy: Record<string, CapabilityRemedy>;
  /** 安装配方；没有可靠装法就不给（宁缺勿编）。 */
  install?: InstallRecipe;
  /** 对应的 winget 包 ID（结构化保留，供渲染与文档比对，避免台账与文档漂移）。 */
  winget?: string;
  /** 探测 argv；探测失败只说「未检出」，不等于未安装。 */
  probe: string[];
  /** 备注（版本快照、坑、边界）。 */
  note?: string;
  /** 文档锚。 */
  doc: string;
  /**
   * provider 是否已在 v2 接线。v2 当前没有外部 CLI 接线（索引固定 sqlite、证据验证走 fs），
   * 故 zg / semble 是**预留**：装了也不改变当前插件行为。字段显式为 false，
   * 渲染时会写出来 —— 台账不得声称一条不存在的接线。
   */
  wired?: boolean;
  /** 台账**声称**的版本号（来源统一见 catalog 的 LEDGER_SNAPSHOT；不声称版本时缺省）。 */
  version?: string;
}

/** 一次外部命令执行结果（不抛：错误归一成 ok:false）。 */
export interface ExecResult {
  ok: boolean;
  code: number | string;
  out: string;
  err: string;
}

/** 探测/安装统一 runner（可注入：测试用假 runner，不真装、不碰机器状态）。 */
export type Runner = (cmd: string, args: string[], timeoutMs: number) => Promise<ExecResult>;

/** 宿主审批服务的窄接口；只有 allowed-once 是授予（由 install.ts 归一）。 */
export interface ApprovalRequest {
  agent?: unknown;
  toolName: string;
  reason: string;
}

export interface ApprovalPort {
  request(req: ApprovalRequest): Promise<unknown> | unknown;
}

/** 工具集 engine 的依赖。全部可注入，便于测试与宿主适配。 */
export interface ToolsetDeps {
  runner?: Runner;
  /** 懒取审批通道：只在「确实要装」时才调用；缺失/抛错都按 fail closed 处理。 */
  getApproval?: () => ApprovalPort | undefined;
  /** 发起这次调用的 agent（审批凭据；从工具 execute 的 exec.agent 取）。 */
  agent?: unknown;
  /** 可见降级信号（surface 用；engine 不直接写）。 */
  signals?: SignalStore;
  /** 处置命令的平台口径；缺省 process.platform。 */
  platform?: string;
}

export interface ProbeResult {
  available: boolean;
  detail: string;
}

export interface SurveyRow {
  capability: Capability;
  /** true=检出；false=未检出；**null=本次未探测**（必须与「未装」可区分）。 */
  available: boolean | null;
  detail: string;
}

export interface PrecheckRow {
  need: string;
  hit: boolean;
  /** 命中的代表条目（多命中时取第一条）；未命中不给。 */
  capability?: Capability;
  hits: Capability[];
  available: boolean | null;
  detail: string;
}

export type InstallStatus =
  | "already-available"
  | "installed"
  /** 安装器已执行但**重探未检出**：可能是 PATH 启动快照，不能断言成功，也不该断言安装失败。 */
  | "unverified"
  | "failed"
  | "rejected"
  | "cancelled"
  | "no-approval"
  | "approval-unavailable"
  | "unknown-capability"
  | "no-recipe";

export interface InstallOutcome {
  id: string;
  status: InstallStatus;
  display?: string;
  detail: string;
}

export interface ResolvedInstall {
  cmd: string;
  args: string[];
  display: string;
}

/** 归一化后的工具集请求（surface 不解析业务参数，只把 args 交给 engine）。 */
export interface ToolsetRequest {
  install?: string;
  need?: string[];
  survey: "providers" | "all";
  category?: string;
}
