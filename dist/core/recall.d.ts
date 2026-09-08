import type { TaskView } from "./task.js";
import type { ContextRef } from "./context.js";
export declare const activeContextOf: (t: TaskView) => {
    completed: string[];
    unfinished: string[];
    constraints: string[];
    last_decision: string;
    next_entry: string;
};
export declare const renderRecovery: (query: string, tasks: TaskView[], refs: ContextRef[]) => string;
