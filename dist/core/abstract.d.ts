/** L0 上限（OpenViking 口径：256 字符）。 */
export declare const L0_MAX = 256;
/** L1 上限（OpenViking 口径：4000 字符）。 */
export declare const L1_MAX = 4000;
/** 目录级 sidecar 的文件名（`_` 前缀 = 派生物，见文件头边界 3）。 */
export declare const SIDECAR_NAME = "_abstract.md";
/** 一条记忆的**最小可派生面**（只取派生 L1 真正需要的字段）。 */
export interface MemoryFace {
    name: string;
    time: string;
    entry: string;
    topics: string[];
}
/** sidecar 的自报覆盖率（对应 OpenViking 的 `freshness`）。 */
export interface SidecarCoverage {
    /** 本目录下被纳入派生的记忆条数。 */
    covered: number;
    /** **未**纳入派生的记忆条数（= 待处理变更）。正常应为 0；非 0 说明 sidecar 落后于源头。 */
    pending: number;
}
/**
 * L1 overview：**从记忆面确定性派生**的目录级概览。
 *
 * 只写**可复核**的事实（条数 / 时间跨度 / 入口与主题清单），**不写判断、不调 LLM**：
 * 判断属读侧（ADR-0042/0043 的「LLM 不能制造关系」），而这里只是把已存在的事实换个粒度呈现。
 * 输入按 `name` 排序后再派生 ⇒ 与 `listDir` 的返回顺序无关（避免「同内容不同文本」）。
 */
export declare const deriveL1: (faces: MemoryFace[]) => string;
/**
 * L0 abstract：**从 L1 正文里抽**（不是从记忆文件里另抽一遍）。
 *
 * 这一条是 D6 的 ② 的全部要害：若 L0 也从记忆文件派生，就会出现
 * 「同一条记忆的两层说法不一致」—— 而两层各自看都「没错」，**没有判据能发现**。
 * 从 L1 抽 ⇒ 层间不一致在**构造上**不可能（L0 是 L1 的函数）。
 * 抽法**确定性**：取 L1 的 `## 概览` 之后的正文首段（OpenViking 的「H1 之后、首个 `##` 之前」同法），
 * 剥掉 markdown 记号，按空白折叠，截到 `L0_MAX`。
 */
export declare const deriveL0: (l1: string) => string;
/**
 * 渲染 sidecar 全文。
 *
 * **格式故意定成可逆向解析**：`parseSidecar` 要能拿回 `{ l0, l1, coverage }` 以便棘轮
 * 逐项对账（不靠模糊匹配）。`covered` / `pending` 写在**显式行**里，不用散文。
 */
export declare const renderSidecar: (date: string, l1: string, coverage: SidecarCoverage) => string;
/** 从 sidecar 全文取回三段（供棘轮对账）。缺段返回 `undefined`（不抛、不编造）。 */
export declare const parseSidecar: (text: string) => {
    l0: string;
    l1: string;
    coverage: SidecarCoverage;
} | undefined;
/**
 * **漂移判据**：把 sidecar 与「当前源」对账，返回不一致的原因清单（空 = 一致）。
 *
 * 这一条对应 D6 的 ③ 与 `toolset-catalog` 的**双向棘轮**同法：
 * 棘轮要能回答「这份摘要是**基于哪几个子项**得出的」，并在源头变了而 sidecar 没跟上时**变红**。
 * 本函数是**纯函数**（拿 `faces` 与 `sidecarText` 两个入参），故棘轮测试不需要真 fs。
 */
export declare const sidecarDrift: (faces: MemoryFace[], sidecarText: string) => string[];
/** sidecar 的仓库相对路径（`_` 前缀 ⇒ 不进 `listMemories`）。 */
export declare const sidecarRel: (date: string) => string;
