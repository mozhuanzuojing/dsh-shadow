// dsh-shadow —— evidence/paths.ts：证据路径候选/路径判定。从 index.ts 迁出。纯函数。
export const evidencePathsOf = (text) => {
    const clue = (String(text).match(/^> 证据链：(.+)$/m) || [])[1] || "";
    if (clue) {
        const evM = clue.match(/证据\(([^)]*)\)/);
        if (evM)
            return evM[1].split(/[、,]/).map((s) => s.trim()).filter(Boolean);
    }
    const mats = (String(text).match(/^> 背景\/材料：(.+)$/m) || [])[1] || "";
    return mats.split(/[、,]/).map((s) => s.trim()).filter(Boolean);
};
export const isPathLike = (p) => p && !/^https?:|github\.com|arxiv/i.test(p) && (/[\\\/]/.test(p) || /\.[a-z0-9]{1,6}$/i.test(p) || /^[A-Za-z]:/.test(p));
/**
 * 该 locator 是否**是可检查的具体路径**（而非通配符 / 模板）。
 *
 * **为什么排除通配符**（v1.15.15）：`scripts/*.ps1` 这种 glob 不是一条「具体引用」，
 * 「通配符还在不在」**不是良构问题**——拿它去做存在性检查必然判缺失，制造假漂移。
 * 这与 ADR-0059 采用的**双条件**判据一致（CASCADE, FSE 2026）：只有在
 * ①引用是**具体**路径 且 ②它确实解析不到 时才报「引用失效」。
 *
 * 注意：`isPathLike`（旧函数）**故意不收窄** —— 它服务的是「这像不像一条路径引用」的粗筛
 * （`core/context.ts` / `observer/*` 用它挑候选）；收窄会改变那些调用方的候选集。
 * 需要「可检查」语义的地方用本函数。
 */
export const isConcreteLocator = (p) => {
    const s = String(p || "").trim();
    if (!s)
        return false;
    if (/\*/.test(s) || /\?/.test(s))
        return false; // glob / 模板
    if (/^origin\/|^[a-z-]+\/[a-z-]+$/.test(s) && !/\./.test(s))
        return false; // git 分支/ref
    return true;
};
/**
 * 该 locator 是否**已经是绝对路径**（含盘符 `D:/…`、`D:\…`，或根斜杠 `/…`）。
 *
 * **为什么必须集中判定**（v1.15.15 修一处真 bug）：拼接代码若无条件做 `${ws}/${rel}`，
 * 绝对 locator 会变成 `D:/project/dsh1/D:/project/wslc1/x.ps1` 这种**双前缀**，必然查不到——
 * 于是「磁盘上明明存在」的文件被判 `not_found/stale`。
 * 该形状在记忆证据里很常见（跨项目、跨目录的绝对引用）。
 *
 * 单一来源：`evidence/filesystem.ts`（存在性检查）与 `core/semble.ts`（候选绝对化）共用，
 * 避免两处各自写正则而漂移（本仓 ⑥「因果跌倒 / 注释断链」要防的正是这个）。
 */
export const isAbsoluteLocator = (p) => {
    const s = String(p || "").trim().replace(/\\/g, "/");
    return /^[A-Za-z]:\//.test(s) || s.startsWith("/");
};
