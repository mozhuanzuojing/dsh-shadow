/** 事务快照：内容 + 写侧守卫 + 目标。 */
export interface MetaSnapshot {
    meta: any;
    target: any;
    /** 写守卫用的版本令牌；`undefined` = 后端不支持 `stat`（此时退化为无条件写）。 */
    version: any;
}
/**
 * 读 `_meta.json` 的**带版本快照**。
 *
 * 顺序是 **先 `stat` 取版本、再 `readText`** —— 这个顺序是安全的那一个：
 * 若两次调用之间有人写入，我们手上的版本就比内容旧，随后的带守卫写会**失败并重试**（不会覆盖）。
 * 反过来（先读内容再取版本）会拿到「比内容新的版本」，守卫通过而**覆盖掉别人的写入**，正是要避免的。
 */
export declare const readMetaVersioned: (fs: any, ws: string) => Promise<MetaSnapshot>;
/** 读 `_meta.json`（纯读侧用；需要「读-改-写」时请用 `mutateMeta`）。 */
export declare const readMeta: (fs: any, ws: string) => Promise<any>;
/** 带守卫的一次写。返回 `true` = 落盘成功；`false` = 版本冲突（调用方应重读重试）。 */
export declare const writeMetaGuarded: (fs: any, ws: string, meta: any, version: any) => Promise<boolean>;
/** 无条件写（保留给「明确要覆盖」的场景；正常改 meta 用 `mutateMeta`）。 */
export declare const writeMeta: (fs: any, ws: string, meta: any) => Promise<void>;
/**
 * **事务式**修改 `_meta.json`：读 → 在快照上改 → 带守卫写；`FS_STALE_VERSION` 时重读重试。
 *
 * `mutate` 返回 `false` 表示「无需写入」（例如没有任何变化），事务直接结束。
 * 重试上限 3 次：拿不到独占就放弃这一次的更新（宁可少记一次命中，也不覆盖别人的写入）。
 */
export declare const mutateMeta: (fs: any, ws: string, mutate: (meta: any) => boolean | void, attempts?: number) => Promise<boolean>;
