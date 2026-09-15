export declare const approxNote: (approx?: string[], label?: string) => string;
export declare const NO_MATCH_STEPS = "> \u4E0B\u4E00\u6B65\uFF1A\u2460 \u6362\u66F4\u77ED/\u540C\u4E49\u7684\u8BCD\u518D\u67E5\uFF08\u53EA\u7559\u7EC4\u4EF6\u540D\u3001\u6587\u4EF6\u540D\u7247\u6BB5\uFF09\uFF1B\u2461 `read_shadow()` \u65E0\u53C2\u770B `.shadow/_index.md` \u7684\u4E3B\u9898\u7D22\u5F15\u4E0E\u8FD1\u671F\u8BB0\u5FC6\uFF1B\u2462 \u8DE8\u300C\u51B3\u7B56/\u4EE3\u7801/\u6587\u6863\u300D\u627E\u4E0A\u4E0B\u6587\u7528 `shadow_query`\uFF1B\u2463 \u6309\u4EFB\u52A1\u6062\u590D\u7528 `recall_shadow`\u3002";
export declare const noMatchText: (topic: string, warn: string, opts?: {
    approx?: string[];
    reason?: string;
    steps?: string;
    approxLabel?: string;
}) => string;
export declare const truncationNote: (o: {
    matched: number;
    returned: number;
    limit: number;
    maxChars: number;
    droppedByLimit: number;
    droppedByBudget: number;
    droppedByCooldown: number;
    dropped: {
        entry: string;
        score: number;
    }[];
}) => string;
/**
 * `_index.md` 的小节切分（`## ` 起头；其前的正文归 `(前言)`）。**确定性**、无正则回溯。
 * 用途：无参 `read_shadow()` 的预算信封要能**按段名**披露「丢了哪几段」（`tool-output-v1` 的 hard 半边）。
 */
export declare const splitIndexSections: (text: string) => {
    title: string;
    body: string;
}[];
/**
 * **无参 `read_shadow()` 的预算信封**（v1.15.85）：索引是入口路径，此前**整篇原样返回** ——
 * 真 `.shadow` 实测 `_index.md` **2199 KB / 24628 行**（8310 条记忆）；而带 `topic` 的路径一直有预算 + 披露。
 *
 * 判据（与 `truncationNote` 同族）：
 *   ① **结构感知** —— 按 `## ` 小节整段装进预算，**不腰斩**；
 *   ② **按名字披露** —— 丢掉的段名逐个列出（截断必须自报，不得静默丢内容）；
 *   ③ **放得下就零多余文字** —— 整篇 ≤ 预算 ⇒ 原样返回，不添一句；
 *   ④ **给可执行的下一步**（穿透 / 提高预算 / 直接读文件）。
 * 连第一节都放不下时按字符硬截断，并在披露里写明「已按字符硬截断」（不假装那是完整段）。
 */
export declare const renderIndexBudgeted: (idx: string, maxChars: number) => string;
export declare const renderByTier: (s: any, budgetChars: number, forceL0?: boolean, tokens?: string[]) => string;
