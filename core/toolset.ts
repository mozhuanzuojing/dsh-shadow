// dsh-shadow —— core/toolset.ts：可选外部 CLI 的「能力台账 + 缺件处置」。ADR-0049 的落地件。
//
// 定位：**只做检测与提示，绝不代装**。理由取自本仓自身的边界条文（不是偏好）：
//   - README 安全边界表：「有后果的动作要用户确认」；
//   - references.md 引 OpenAI《Computer use》同条：「破坏性变更…要用户确认」；
//   - ADR-0029.1 inv 178 **Authority ≠ Ownership**；
//   - ADR-0030 inv 182 **Delegation Scope 不可扩大** +「被授权执行 ≠ 被解释授权 ≠ 被扩大授权」
//     「scope 只能由外部权威以显式协议变更，**不可在执行中隐式扩大**」。
//   插件自行 spawn 安装器 = 自己给自己扩权。故插件只给**确切命令**，由 agent 经宿主
//   approval 栈执行 —— 与本仓「resource 卡片插件只读不写」是同一取向。
//
// 与 ADR-0049 的关系：那条纪律要求「缺件必须可见」；本模块把「可见」推进到「**可执行**」——
//   只说 unavailable 而不说怎么办，等于把用户丢在半路（v1.15.7 之前的实际体验）。

/** 缺件处置：一条可复制执行的命令 + 可选的坑说明。 */
export interface CapabilityRemedy {
  cmd: string;
  note?: string;
}

/**
 * 安装配方（声明式）。**为什么不能只存一条命令字符串**：
 *   - `npm-global` 在 Windows 上 npm 只是 `npm.cmd`，而 Node 的 execFile 既不能起 `.cmd`（ENOENT）
 *     也不能显式起 `.cmd`（EINVAL，CVE-2024-27980 缓解）→ 必须改走 `node <npm-cli.js>`；
 *   - `argv` 用于本身就是可执行文件的工具（如 uv.exe）。
 * 故存**结构**、由 `core/toolset-exec.ts` 在运行时按平台解析成真实 argv。
 */
export type InstallRecipe =
  | { kind: "npm-global"; pkg: string }
  | { kind: "argv"; argv: string[] };

/** 一项可选能力（由某个外部 CLI 提供）。 */
export interface Capability {
  id: string;
  label: string;
  /** 它提供什么增强（缺了就没有的东西）。 */
  provides: string;
  /** 缺件时**退到什么确定性路径**（ADR-0049：只降级，不抛错）。 */
  degradesTo: string;
  /** 按 `process.platform` 给处置；`default` 兜底。 */
  remedy: Record<string, CapabilityRemedy>;
  /** 安装配方（供显式调用的「一键装」使用）。 */
  install: InstallRecipe;
  /** 探测 argv（显示用；执行侧另有按平台的解析，见 toolset-exec）。 */
  probe: string[];
  /** 文档锚（README 章节名）。 */
  doc: string;
}

/** 台账。新增可选外部 CLI 时在此登记 —— 未登记的 provider 不会得到提示（**不编造命令**）。 */
export const CAPABILITIES: Capability[] = [
  {
    id: "zg",
    label: "zg（@zvec/zvec-grep）",
    provides: "证据验证（verifyEvidence）与 Index Engine 的 zg 候选",
    degradesTo: "证据验证退回 fs（只判路径存在性）、候选退回全量扫描",
    remedy: {
      default: {
        cmd: "npm install -g @zvec/zvec-grep",
        note: "需 Node ≥ 22；插件只用 --rg 路由，不必放开被拦下的原生依赖 install 脚本",
      },
    },
    install: { kind: "npm-global", pkg: "@zvec/zvec-grep" },
    probe: ["zg", "--version"],
    doc: "README「可选外部 CLI（zg / Semble）」",
  },
  {
    id: "semble",
    label: "Semble",
    provides: "Index Engine 的语义候选（provider=semble）",
    degradesTo: "候选退回 fs 全量扫描",
    remedy: {
      default: {
        cmd: "uv tool install semble",
        note: "需 uv；首次检索会下载一次嵌入模型，之后离线可用",
      },
    },
    install: { kind: "argv", argv: ["uv", "tool", "install", "semble"] },
    probe: ["semble", "--version"],
    doc: "README「可选外部 CLI（zg / Semble）」",
  },
];

export const capabilityOf = (id: unknown): Capability | undefined =>
  CAPABILITIES.find((c) => c.id === String(id || ""));

/** 取该平台（或 default）的处置；能力未登记 → undefined。 */
export const remedyFor = (id: unknown, platform: string = process.platform): CapabilityRemedy | undefined => {
  const c = capabilityOf(id);
  if (!c) return undefined;
  return c.remedy[platform] || c.remedy.default;
};

/**
 * 缺件一行提示（给读侧输出用）。**能力未登记 → undefined**：不认识的东西不编造命令。
 * 形状：`> 缺件处置：<命令>（<坑>）· <它提供什么> · 退到 <确定性路径> · 见 <文档锚>`
 */
export const unavailableHint = (id: unknown, reason?: unknown, platform: string = process.platform): string | undefined => {
  const c = capabilityOf(id);
  if (!c) return undefined;
  const r = remedyFor(id, platform);
  if (!r) return undefined;
  const why = String(reason || "").trim();
  const seg = [`> 缺件处置：${r.cmd}`];
  if (r.note) seg.push(`（${r.note}）`);
  seg.push(`· 提供：${c.provides}`);
  seg.push(`· 现退到：${c.degradesTo}`);
  if (why && why !== "unavailable") seg.push(`· 原因：${why}`);
  seg.push(`· 见 ${c.doc}`);
  return seg.join(" ");
};
