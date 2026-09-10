/** 缺件处置：一条可复制执行的命令 + 可选的坑说明。 */
export interface CapabilityRemedy {
    cmd: string;
    note?: string;
}
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
