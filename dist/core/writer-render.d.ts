/** 生成 .shadow/_index.md 的全文（目录说明 + 今日摘要 + 近期记忆 + 主题索引 + 意识轨迹）。 */
export declare function buildIndexText(ws: string, memories: any[], topicFiles: Record<string, string[]>, todayInfo: {
    count: number;
    topics: string[];
}): string;
/** 生成一个 Episode 收口 consolidated 文件的正文（合并原子决策/动作/用户消息 + 证据链）。 */
export declare function consolidateText(ep: any, atoms: any[]): string;
