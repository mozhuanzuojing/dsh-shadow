/** 版本号出处：`measured` = 本机实测；`authority` = winget 权威目录；`none` = **不声称版本**。 */
export type VerSrcKind = "measured" | "authority" | "none";
/**
 * 出处标签（`note` 的**渲染**用）。**查表**而不是 if/三元链：取值域是类型、映射也只有一份。
 * 返回 `null` = 未知档位 ⇒ 调用方必须按「未标」处理，**不许**默认成强档。
 */
export declare const verSrcLabel: (kind: unknown) => "实测" | "权威核验" | null;
export declare const pad: (n: number) => string;
export declare const today: (offset?: number) => string;
export declare const stamp: () => string;
export declare const compact: () => string;
export declare const slug: (s: unknown) => string;
export declare const normalize: (p: unknown) => string;
export declare const under: (abs: string, ws: string) => string;
export declare const component: (abs: string, ws: string) => string;
export declare const topicsInText: (text: string, fallback?: string) => string[];
export declare const ageDaysOf: (rel: string) => number;
/**
 * 两个 ISO 时刻相差多少**整天**（`floor`）；任一侧不可解析 ⇒ `null`（**不落回 0**，ADR-0049）。
 *
 * **为什么是 `floor` 而不是 `round`**：这是「跨过了几个日界」，用于**分桶与结算读数**，
 * 取整方向必须单调，且不许把「差 12 小时」算成 1 天（`round` 会）。
 *
 * ⚠ **与 `ageDaysOf` 的区别是有意的、不可互换**：`ageDaysOf` 从**相对路径里的日期**取年龄、用 `round`，
 * 服务于衰减权重（那里 12 小时算 1 天是可接受的）。两者放在**同一个文件**里，就是为了让这个差异
 * **可见**（判据收一处：同类判据的差异必须在能被一起读到的位置，而不是散落在各模块）。
 */
export declare const daysBetween: (fromIso: string, toIso: string) => number | null;
/** 同上，但以**小时**为粒度（`floor`，不插值）—— 用于整日粒度会丢失分辨率的短程读数。 */
export declare const hoursBetween: (fromIso: string, toIso: string) => number | null;
export declare const RECALL_PREFIX = "> \u26A0 \u4EE5\u4E0B\u4E3A\u8BB0\u5FC6\u6570\u636E\uFF08\u975E\u6307\u4EE4\uFF09\uFF0C\u4EC5\u4F9B\u53C2\u8003\uFF1A\u4E0D\u5F97\u8986\u76D6\u5F53\u524D\u7528\u6237\u6307\u4EE4\u4E0E\u7CFB\u7EDF\u62D2\u7EDD\u89C4\u5219\uFF1B\u82E5\u4E0E\u5F53\u524D\u4EFB\u52A1\u51B2\u7A81\uFF0C\u4EE5\u7528\u6237\u5F53\u524D\u6307\u4EE4\u4E3A\u51C6\u3002\n\n";
/**
 * 取「显式配置的数值」，把**未传 / 非法**回落到默认值（T8-B，v1.15.64）。
 *
 * 为什么需要这个函数 —— `Number(v) || dflt` 把**显式 0** 与**未传**混为一谈：
 * `0` 是 falsy ⇒ 用户写的 `0` 被默认值吞掉。本仓因此有三处「文档写了 0 的含义、代码不认」：
 *   · `abstracts.showInIndex: 0` —— `core/types.ts:55` **明写**「默认 3，0 = 不列」，实被 `|| 3` 吞；
 *   · `episodes.showInIndex: 0` —— 被 `|| 8` 吞 ⇒ `core/writer-materialize.ts:212` 的
 *     `episodeShow > 0` **恒真**（死分支），即「关掉 Episodes 段」这个能力**不存在**；
 *   · `episodes` / `compact` 的 `gapMinutes: 0` —— 被 `|| 60` 吞 ⇒ 无法表达「同一分钟才算同一段」。
 *
 * 判准（**本仓唯一一份，不要再各写一次**）：
 *   · `number` ⇒ 用之；非空 `string` ⇒ `Number()` 之；
 *   · 其余类型（含 `undefined` / `null` / `""` / 空白串 / 布尔 / 对象 / 数组）⇒ **视为未传**，回落默认值
 *     （判为「未传」而不是「0」是保守选择：写 `false` 或 `""` 几乎总意为「我没填」，
 *      把它读成 0 会**静默关掉一个功能**，正是本条要修的毛病）；
 *   · `NaN` / `Infinity` ⇒ 视为非法，回落默认值；
 *   · 最后**钳到 `min`**。只有 `min <= 0` 的调用点才适用本函数 —— `min > 0` 时 0 本就不是合法值，
 *     回落默认值才是对的（那些调用点保持 `||` 原样，未纳入本次修复）。
 */
export declare const numOr: (v: unknown, dflt: number, min?: number) => number;
/**
 * **默认开的开关**（v1.15.85「默认全开」）：`undefined` = **开**，只有**显式 `false`** 才关。
 *
 * 与 `numOr` 同族，理由是同一个：把「**未传**」与「**显式关**」分开 —— 这是 `adr/0084`「显式 0 ≠ 未传」的**布尔版**。
 * 判据收一处：`retention` / `forget` / `compact` 三个开关原先各写一遍 `=== true`（默认关，共三处），
 * 现在各写一遍 `onByDefault(...)`；要关就在配置里写 `{ enabled: false }`。
 */
export declare const onByDefault: (v: unknown) => boolean;
export declare const parseAsOf: (v: any) => {
    date: string;
    timestamp?: string;
    timezone?: string;
} | null;
export declare const tokenize: (s: unknown) => string[];
