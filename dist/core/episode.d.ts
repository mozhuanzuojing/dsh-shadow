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
    kind: AtomKind;
    lineage: AtomLineage;
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
/**
 * 「会话元数据」的**唯一判准**（ADR-0066 定稿）。此前本仓有**三份口径互不相同**的实现，
 * 现收敛为：本函数是**唯一判据源** —— `deriveAtomKind` 用按字段的它，
 * `isMetadataMemoryText` 是它在**文本表面**的等价表达（给不 parseMemory 的读路径用）。
 *
 * 定义：**只在没有可执行内容时才成立** —— 入口是写侧兜底字面量 `"shadow"`
 * （`core/writer-materialize.ts:175`：`primaryComp?.(id || "") || "shadow"`，语义是「**没识别出组件**」），
 * **有用户要点、但既无材料也无决策**（用户说了话，系统没产出可执行的东西）。
 *
 * 为什么是这一条 —— 真语料 **7089 条**实测（`adr/0066`；探针 `_research/d5-signal-experiment.ts`）：
 *
 * | 判准 | 判 metadata | 其中其实有工作痕迹* | 精度 | 挡住投影 |
 * |---|---|---|---|---|
 * | 旧：`!materials && (entry==="shadow" \|\| userMessages.length)` | 4744 | **4279** | **9.8%** | **66.9%** |
 * | 本条 | **93** | **0** | **100.0%** | **1.3%** |
 *
 * \* 工作痕迹 = 有动作行或思维行（真的干活了）。用户话**不算**痕迹 ——
 *   会话元数据的语义恰是「有用户要点、但没有实际工作」。（第一版探针把用户话也算成痕迹，
 *   导致判准自相矛盾、精度恒为 0；已自曝并修正指标。）
 *
 * 后果对比：旧判准让 `deriveShadowNodes` 只产出 2345/7089 个节点（主题召回可见 100%、
 * `shadow_query` 只见 33.1% ⇒ **两条读路径相差 66.9%**）；本条产出 6458（**91.1%**），分歧消失。
 */
export declare const isSessionMetadataAtom: (p: {
    entry: string;
    materials: string[];
    decisions: string[];
    userMessages: string[];
}) => boolean;
export declare const deriveAtomKind: (p: {
    entry: string;
    materials: string[];
    decisions: string[];
    goal: string;
    userMessages: string[];
}) => AtomKind;
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
