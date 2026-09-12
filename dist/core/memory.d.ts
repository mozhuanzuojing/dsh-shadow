export declare const buildClueHeader: (entry: string, arr: any[], srcId?: string, extra?: {
    project?: string;
    agent?: string;
    goal?: string;
}) => string;
/**
 * 登记 `_meta.json` 里的一条。**返回是否登记成功**（v1.15.56）。
 *
 * 旧版把失败吞成一行 `console.log` ⇒ 记忆文件与索引缓存**早已写入**，于是这条记忆在索引/召回里
 * 是「活跃」的，而 `_meta.json` 里没有它 ⇒ `hits` 永远不计、生命周期恒判 NEW、遗忘判据落回默认值。
 * 调用方（`flush`）据此留痕，读侧才能提示「元数据未登记」。
 */
export declare const registerMeta: (fs: any, ws: string, rel: string, actorId: string | undefined, retentionEnabled: boolean) => Promise<boolean>;
