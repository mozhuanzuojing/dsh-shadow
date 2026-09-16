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
/**
 * 「**读侧的目标不存在**」的唯一判据（判据收一处；v1.15.94）。
 *
 * 为什么必须有它：本仓有多处 `catch` 要回答「是**真的还没有**，还是**读不出来**」——
 * 而这两个答案的后果**相反**：前者可以当空件继续（「第一次运行」），后者必须按 ADR-0049
 * 报「不可用」并留痕。此前这段判据在本仓**各写一份**（`evidence/filesystem.ts` 的 `fsExists`、
 * `validation/history.ts` 的 `readTimelineDetailed`、`federation/reality.ts` 的 `referenceEvidence`），
 * 三份正则**互不相同**（`FS_NOT_FOUND` 只在其中一份、`no such file` 只在两份）
 * ⇒ 同一种「文件不存在」在三条链路上得到**不同的**分类。
 *
 * **只许用在「读 / 列目录 / 取状态」这一步的结果上**（下面 ① 是硬防线，不是注释礼貌）：
 * 宿主的错误码**不足以**区分这两件事 —— `dsh-fs-local/lib/index.js` 对「目标不存在」抛
 * `FS_NOT_FOUND`（`statRegularFile`：`cannot ${verb} "${displayPath}": not found`），
 * 但**写失败也用同一个码**：
 *   · `:461` `write failed (…) and temp cleanup failed (…), "FS_NOT_FOUND"`
 *   · `:554` `write failed (…) and temp close failed (…), "FS_NOT_FOUND"`
 * ⇒ 只看错误码会把**写失败**读成「文件不存在」，进而让「先读后写」的调用方
 * 以为「读到空、继续写」——**写失败被静默吞掉**，比它原来要修的那个缺陷更糟（ADR-0049 红线）。
 * ① 因此先排除写侧形状，② 再认宿主的读侧形状（`: not found`），③ 最后认
 * Node 的 `ENOENT` 与测试桩直接抛的 `FS_NOT_FOUND` / `no such file` 文本。
 * EACCES / 后端异常 / 其它 I/O 错误一律 `false` ⇒ 调用方走「不可读」分支（ADR-0049 的「缺件不静默」侧）。
 * **①b（v1.15.95）**：宿主对**空路径**也用 `FS_NOT_FOUND` ⇒ 「输入校验失败」也在排除之列
 * （同上一条的反例探针表 1「空字符串路径」行：不排除就会被判成「确认不存在」）。
 * ⚠ **本判据的 `^` 锚点是它唯一的软处**：写侧两条排除都要求消息**以**该形状开头，
 * 若将来某层给 fs 错误统一加前缀（如 `[shadow] write failed (…)`），排除会失效、
 * 而 ③ 仍会因内层 `ENOENT` 命中 ⇒ 写失败被读成「不存在」。实测当前**没有**这样的包装层
 * （探针表 1「写失败**被前缀包裹**」行 = `true`，而真实宿主经 `ctx.fs` 直出，无前缀）。
 */
/**
 * `FsDirEntry` 是不是目录（**判据收一处**；T17-B）。
 *
 * 为什么要有它：`shadowSourcesFingerprint`（投影缓存指纹）与 `candidate-sqlite`（派生索引的目录粗信号）
 * 都要按它筛 `.shadow/` 下的日期目录；各写一遍 `e.type === "directory"` 就是同一条判据在两个生产模块
 * 被表达两次（`tools/audit-drift.ts` 的 B 段抓的就是这个）。纯谓词、无副作用。
 */
export declare const isDirEntry: (e: any) => boolean;
export declare const isNotFound: (e: unknown) => boolean;
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
