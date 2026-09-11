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
/**
 * **本进程可见性约束（C4）** —— 为什么「先装再派」在一个会话内收益为零。
 *
 * `installCapability` 装完仍可能探测不到：**宿主进程的 PATH 是启动时快照**，
 * 新装的工具通常要**重启宿主**才能被本进程看到。而委派的 teammate 是**同进程内的子 Agent**。
 * ⇒ 装完那一回合，Lead 与所有 teammate **都用不上**。
 *
 * 该事实原先只在**安装失败之后**才说（见 `installCapability` 的 failed 分支）；
 * 预检期就该说——否则调用方会按「装上就能用」做计划。
 */
export declare const PROCESS_LOCAL_VISIBILITY = "\u5BBF\u4E3B\u8FDB\u7A0B\u7684 PATH \u662F\u542F\u52A8\u65F6\u5FEB\u7167\uFF1A**\u672C\u8FDB\u7A0B\u5185\u65B0\u88C5\u7684\u5DE5\u5177\u901A\u5E38\u8981\u91CD\u542F\u5BBF\u4E3B\u624D\u53EF\u89C1**\uFF08\u540C\u8FDB\u7A0B\u5185\u7684\u5B50 Agent \u540C\u6837\u770B\u4E0D\u89C1\uFF09\u3002\u6545\u9884\u68C0\u540E**\u4E0D\u8981**\u6309\u300C\u5148\u88C5\u518D\u6D3E\u300D\u505A\u8BA1\u5212\u2014\u2014\u5904\u7F6E\u662F**\u964D\u7EA7**\u6216**\u544A\u77E5\u7528\u6237\u9700\u91CD\u542F**\u3002";
/** 预检一行：一个能力需求 → 台账命中 → 本机状态。 */
export interface PrecheckRow {
    /** 调用方提的能力需求原文。 */
    need: string;
    /** 台账里是否有这个东西。**未命中不编造**（与 `unavailableHint` 同纪律）。 */
    hit: boolean;
    /** 命中的条目（多命中时取第一条做代表；`hits` 给全量）。 */
    capability?: Capability;
    hits: Capability[];
    /** true=检出；false=未检出；null=未探测（未命中时不探测）。 */
    available: boolean | null;
    detail: string;
}
/**
 * 按能力需求预检。**只读**（只探测，绝不安装）。
 * 未命中的需求不探测、不编造命令——只如实说「台账未登记」。
 */
export declare const precheckCapabilities: (needs: string[], timeoutMs?: number) => Promise<PrecheckRow[]>;
/**
 * 渲染预检结果。**必须**带上三条边界（不是闸门 / 装完进程内不可见 / 缺件只能上报不能自装）——
 * 少任何一条，读侧输出就会被误读成「许可」或「禁令」。
 */
export declare const renderPrecheck: (rows: PrecheckRow[], platform?: string) => string;
