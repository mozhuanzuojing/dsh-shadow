/** 缺件处置：一条可复制执行的命令 + 可选的坑说明。 */
export interface CapabilityRemedy {
    cmd: string;
    note?: string;
}
/**
 * 安装配方（声明式）。**为什么不能只存一条命令字符串**：
 *   - `npm-global` 在 Windows 上 npm 只是 `npm.cmd`，而 Node 的 execFile 既不能起 `.cmd`（ENOENT）
 *     也不能显式起 `.cmd`（EINVAL，CVE-2024-27980 缓解）→ 必须改走 `node <npm-cli.js>`；
 *   - `argv` 用于本身就是可执行文件的工具（uv.exe / winget.exe 皆实测可直接起）。
 * 故存**结构**、由 `core/toolset-exec.ts` 在运行时解析成真实 argv。
 */
export type InstallRecipe = {
    kind: "npm-global";
    pkg: string;
} | {
    kind: "argv";
    argv: string[];
};
/** provider = 插件内接线；reference = 通用 CLI 目录（插件不接线）。 */
export type ToolKind = "provider" | "reference";
/** 一项条目。 */
export interface Capability {
    id: string;
    label: string;
    kind: ToolKind;
    /** 分类（渲染顺序见 CATEGORY_ORDER）。 */
    category: string;
    /** 它提供什么。 */
    provides: string;
    /** provider 缺件时**退到什么确定性路径**（ADR-0049）；reference 填「不影响插件行为」。 */
    degradesTo: string;
    /** 按 `process.platform` 给处置；`default` 兜底（非 Windows 平台走它）。 */
    remedy: Record<string, CapabilityRemedy>;
    /** 安装配方；**没有可靠装法就不给**（宁缺勿编）。 */
    install?: InstallRecipe;
    /** 对应的 winget 包 ID（结构化保留：供 docs 棘轮比对，避免文档与台账漂移）。 */
    winget?: string;
    /** 探测 argv（版本旗标见条目；探测失败只说「未检出」，不等于未装）。 */
    probe: string[];
    /** 备注（版本快照、坑、边界）。 */
    note?: string;
    /** 文档锚。 */
    doc: string;
}
/** 全台账：provider + reference。 */
export declare const CAPABILITIES: Capability[];
/** 渲染用的分类顺序。 */
export declare const CATEGORY_ORDER: string[];
export declare const providerCapabilities: () => Capability[];
export declare const referenceCapabilities: () => Capability[];
export declare const capabilityOf: (id: unknown) => Capability | undefined;
/** 取该平台（或 default）的处置；条目未登记 → undefined。 */
export declare const remedyFor: (id: unknown, platform?: string) => CapabilityRemedy | undefined;
/**
 * 缺件一行提示（给读侧输出用）。**条目未登记 → undefined**：不认识的东西不编造命令。
 * 形状：`> 缺件处置：<命令>（<坑>）· 提供什么 · 退到哪 · 原因 · 见文档`
 */
export declare const unavailableHint: (id: unknown, reason?: unknown, platform?: string) => string | undefined;
