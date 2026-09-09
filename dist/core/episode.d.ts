import type { AtomKind, AtomLineage, CreatedBy, AtomEvidenceRef } from "./lineage.js";
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
    decisionEvents: DecisionEvent[];
    userMessages: string[];
    materials: string[];
    actions: string[];
    thinkLines: string[];
    body: string;
    kind?: AtomKind;
    lineage?: AtomLineage;
}
/** 一次决策事件：发生了一个决定。reason 与 decision 分离——有 Decision ≠ 一定有 Reason（不补写）。 */
export interface DecisionEvent {
    statement: string;
    source: string;
    reason: string;
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
export declare const materialsToEvidence: (materials: string[]) => AtomEvidenceRef[];
export declare const deriveCreatedBy: (p: {
    decisionEvents: DecisionEvent[];
    userMessages: string[];
    materials: string[];
}) => CreatedBy;
export declare const deriveAtomKind: (p: {
    entry: string;
    materials: string[];
    decisions: string[];
    goal: string;
    userMessages: string[];
}) => AtomKind;
export declare const isCognitiveAtom: (p: {
    kind?: AtomKind;
}) => boolean;
export declare const isMetadataMemoryText: (text: unknown) => boolean;
export declare const deriveLineage: (p: {
    source?: string;
    createdBy: CreatedBy;
    materials: string[];
    createdAt: string;
}) => AtomLineage;
export declare const parseMemory: (text: string, rel: string, name: string) => ParsedMemory;
export interface DeriveEpisodesOpts {
    gapMinutes?: number;
}
export declare const deriveEpisodes: (parsed: ParsedMemory[], opts?: DeriveEpisodesOpts) => Episode[];
export interface DecisionLineageEntry {
    text: string;
    statement: string;
    reason: string;
    source: string;
    rel: string;
    at: string;
}
export interface DecisionLineage {
    byEntry: Record<string, DecisionLineageEntry[]>;
    count: number;
}
export declare const deriveDecisions: (parsed: ParsedMemory[], opts?: {
    topic?: string;
    entry?: string;
}) => {
    byEntry: Record<string, DecisionLineageEntry[]>;
    count: number;
};
/** _index.md 里的「任务回溯（Episodes）」段（保守：不引号包裹入口名，避免与主题索引撞名）。 */
export declare const episodesIndexText: (eps: Episode[], limit?: number) => string;
/** read mode:"episode" 的渲染。 */
export declare const renderEpisodes: (eps: Episode[], topic?: string) => string;
/** read mode:"decision" 的渲染。 */
export declare const renderDecisions: (dl: DecisionLineage) => string;
