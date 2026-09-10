import type { AtomEvidenceRef } from "./lineage.js";
/**
 * 剔掉 NO_PROXY / no_proxy 里**带方括号**的条目。
 * 根因（v1.15.6 实测）：`[::1]` 这一条会让 httpx 构造 Client 时走 URLPattern，
 *   把端口解析成 `':1]'` → `httpx.InvalidURL: Invalid port: ':1]'`；**模型已缓存也照崩**（exit 1）。
 * 通用处理「方括号」这一形状，而不是硬编码某一台机器的值——坏的是形状，不是 ::1 本身。
 */
export declare const stripBracketedNoProxy: (value: unknown) => string;
/** 起 semble CLI。返回 { unavailable } / { stdout }，不抛异常（与 runZg 同形）。 */
export declare const runSemble: (args: string[], timeoutMs?: number) => Promise<any>;
/** 把候选路径绝对化（相对 → 基于 workspace）。
 *  必须做：Semble 返回的是**相对 repo 的路径**（如 `core\resource.ts`），而 Index Engine 下游会过
 *  `authorizeScope({ workspace })`（绝对前缀匹配）——不绝对化就会被**整批滤掉**（v1.15.6 实测）。
 *  绝对化同时让候选可直接回喂 Evidence Gateway（那边按 fs 路径查）。 */
export declare const absolutizeLocator: (locator: unknown, ws: unknown) => string;
/** 解析 `semble search` 的 JSON stdout → AtomEvidenceRef[]（file + 行号范围）。
 *  locator 一律**绝对化**（见 absolutizeLocator）。纯函数。 */
export declare const parseSembleRefs: (stdout: string, ws?: string, limit?: number) => AtomEvidenceRef[];
/**
 * 候选生成：`semble search <query> <ws> --content code`。
 * **content 固定 code**（ADR-0054 §2）：嵌入模型是代码专用（potion-code-16M-v2），
 * 用它检索 `.shadow/` 中文散文属越出训练分布；S2（记忆语料）是后续独立决策。
 * 返回的 score **不向外暴露**——它不可跨查询比较（ADR-0054 实测），只用于 Semble 内部排序。
 */
export declare const sembleCandidates: (query: string, ctx: any, timeoutMs?: number) => Promise<{
    unavailable?: boolean;
    reason?: string;
    refs: AtomEvidenceRef[];
}>;
