import type { ParsedMemory } from "./episode.js";
export interface TaskDecision {
    text: string;
    source: string;
    reason: string;
    at: string;
    rel: string;
}
export type TaskStatus = "active" | "completed" | "abandoned";
export interface TaskView {
    id: string;
    title: string;
    objective: string;
    trigger: string;
    constraints: string[];
    status: TaskStatus;
    statusNote: string;
    startedAt: string;
    endedAt: string;
    decisions: TaskDecision[];
    outcomes: string[];
    evidence: string[];
    memoryRefs: string[];
}
export declare const deriveTasks: (parsed: ParsedMemory[]) => TaskView[];
export declare const renderTasks: (tasks: TaskView[], topic?: string) => string;
