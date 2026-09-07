/** 一条记忆被解析后的字段（供 Episode/Decision 派生）。 */
export interface ParsedMemory {
    rel: string;
    date: string;
    time: string;
    entry: string;
    project: string;
    agent: string;
    goal: string;
    decisions: string[];
    materials: string[];
    actions: string[];
    thinkLines: string[];
    body: string;
}
/** Episode：一组属于同一次连续经历的记忆原子。 */
export interface Episode {
    id: string;
    startedAt: string;
    endedAt: string;
    project: string;
    agent: string;
    title: string;
    objective: string;
    memoryCount: number;
    memoryRefs: string[];
    entries: string[];
    decisions: {
        text: string;
        rel: string;
        at: string;
    }[];
    actions: {
        text: string;
        rel: string;
        at: string;
    }[];
    materials: string[];
}
export declare const parseMemory: (text: string, rel: string, name: string) => ParsedMemory;
export interface DeriveEpisodesOpts {
    gapMinutes?: number;
}
export declare const deriveEpisodes: (parsed: ParsedMemory[], opts?: DeriveEpisodesOpts) => Episode[];
export interface DecisionLineage {
    byEntry: Record<string, {
        text: string;
        rel: string;
        at: string;
    }[]>;
    count: number;
}
export declare const deriveDecisions: (parsed: ParsedMemory[], opts?: {
    topic?: string;
    entry?: string;
}) => {
    byEntry: Record<string, {
        text: string;
        rel: string;
        at: string;
    }[]>;
    count: number;
};
/** _index.md 里的「任务回溯（Episodes）」段（保守：不引号包裹入口名，避免与主题索引撞名）。 */
export declare const episodesIndexText: (eps: Episode[], limit?: number) => string;
/** read mode:"episode" 的渲染。 */
export declare const renderEpisodes: (eps: Episode[], topic?: string) => string;
/** read mode:"decision" 的渲染。 */
export declare const renderDecisions: (dl: DecisionLineage) => string;
