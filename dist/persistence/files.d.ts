export declare const readRel: (fs: any, ws: string, rel: string) => Promise<any>;
export declare const timeFromName: (name: string) => string;
/** 记忆文件名的规范形态：`<date>--<HHMMSS>-<rest>`；`time` 非 6 位时退回 `<date>--<rest>`（读侧给 `""`）。 */
export declare const memoryFileName: (date: string, time: string, rest: string) => string;
/**
 * **记忆文件判据（唯一一份实现）**：`.md`、非 `_index.md`、非 `_` 前缀。
 *
 * 为什么必须收成一处（T17-B）：派生索引（`core/candidate-sqlite.ts` 的 `enumDateDir`）**也**要按这个判据
 * 筛记忆文件。两处各写一遍就会出现「索引收了、召回没收」这类**语义漂移**（`tools/audit-drift.ts` 的 B 段
 * 正是抓「同一条判据在 ≥2 个生产模块被表达」）。完整理由与演变见 `listMemories` 循环里的注释（v1.15.35 / D6）。
 */
export declare const isMemoryFileName: (name: unknown) => boolean;
export declare const listMemories: (fs: any, ws: string) => Promise<any[]>;
