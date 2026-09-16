import type { CandidateProvider } from "./types.js";
/** 索引器 / 表结构的令牌（`adr/0095` §五「必须做」）。不匹配 = `corrupt`（D5）；升级这里即触发整体重建。 */
export declare const INDEX_SCHEMA_VERSION = "1";
/**
 * 索引行 → `parseMemory` 的返回形状（照 `t17a-lib.mts` 的 `atomFromRow`，**字段逐个 JSON.parse**）。
 * **不重写任何派生判据**：候选仍由生产 `deriveShadowNodes` 从这些字段产出。
 * 抛错 = 索引坏了（D5 的「反序列化失败」⇒ `corrupt`）。
 */
export declare const atomFromRow: (row: any) => any;
export interface SqliteProviderOpts {
    /**
     * 能力探测的**注入点**（多实例隔离：参数传入，不做模块级可变单例）。
     * 默认实现才 `await import(SQLITE_SPEC).catch(() => undefined)`；
     * 测试用 `load: async () => undefined` 造 `unavailable`（真 `node:sqlite` 在本机可用，造不出「模块缺失」）。
     */
    load?: () => Promise<any>;
}
/**
 * `sqlite` 候选 provider。
 *
 * **无实例状态、无模块状态**：跨调用唯一携带的信息全部落在**产物**上（索引文件的 schema 版本、
 * 粗信号、以及「坏索引被挪走」这个事实）⇒ 每次 `createCandidateProvider` 新建实例也不会丢语义。
 */
export declare const createSqliteCandidateProvider: (opts?: SqliteProviderOpts) => CandidateProvider;
