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
export type InstallRecipe = {
    kind: "npm-global";
    pkg: string;
} | {
    kind: "argv";
    argv: string[];
};
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
export declare const CAPABILITIES: Capability[];
export declare const capabilityOf: (id: unknown) => Capability | undefined;
/** 取该平台（或 default）的处置；能力未登记 → undefined。 */
export declare const remedyFor: (id: unknown, platform?: string) => CapabilityRemedy | undefined;
/**
 * 缺件一行提示（给读侧输出用）。**能力未登记 → undefined**：不认识的东西不编造命令。
 * 形状：`> 缺件处置：<命令>（<坑>）· <它提供什么> · 退到 <确定性路径> · 见 <文档锚>`
 */
export declare const unavailableHint: (id: unknown, reason?: unknown, platform?: string) => string | undefined;
