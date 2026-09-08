export type ChangeKind = "created" | "changed" | "deleted";
export interface ChangeSetSnapshot {
    touchedFiles: string[];
    rescanDirectories: string[];
    deletedPrefixes: string[];
    forceFullReconcile: boolean;
}
export declare class ChangeSet {
    private readonly touched;
    private readonly dirs;
    private readonly deleted;
    private forceFullReconcile;
    private readonly root?;
    private readonly maxChangedPaths;
    constructor(opts?: {
        root?: string;
        maxChangedPaths?: number;
    });
    /** 是否已被某目录/dir 覆盖（重复增补去重）。 */
    private pathCoveredBy;
    private covered;
    private addInternal;
    add(path: string, kind: ChangeKind, isDirectory?: boolean): void;
    get size(): number;
    snapshot(): ChangeSetSnapshot;
    /** 判断某 rel 是否属变更（touched / 目录下 / deleted 前缀下）。 */
    affects(rel: string): boolean;
}
