import { type Capability } from "./toolset.js";
/**
 * 探测一项。
 * zg 走包内 CLI 入口解析（与 provider 同一套逻辑，避免「装了但起不来」的假阴性）；
 * 其余走 PATH 上的可执行文件。
 */
export declare const probeCapability: (id: string, timeoutMs?: number) => Promise<{
    available: boolean;
    detail: string;
}>;
/**
 * 把安装配方解析成真实 argv。
 * **npm-global 的 Windows 陷阱**：npm 只是 `npm.cmd`，execFile 既不能起 `npm`（ENOENT）
 * 也不能起 `npm.cmd`（EINVAL）→ 改走 `node <npm-cli.js>`（与 evidence/zg.ts 解 zg 同一手法）。
 */
export declare const resolveInstall: (id: string) => {
    cmd: string;
    args: string[];
    display: string;
} | {
    error: string;
};
export type InstallStatus = "already-available" | "installed" | "failed" | "rejected" | "cancelled" | "no-approval" | "approval-unavailable" | "unknown-capability";
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
export declare const installCapability: (id: string, opts?: InstallOptions) => Promise<InstallOutcome>;
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
export declare const surveyCapabilities: (opts?: SurveyOptions) => Promise<SurveyRow[]>;
/** 渲染巡检结果（按分类分组）。 */
export declare const renderSurvey: (rows: SurveyRow[], opts?: SurveyOptions, platform?: string) => string;
/** 渲染一次安装结果。 */
export declare const renderInstall: (o: InstallOutcome) => string;
