export interface Scope {
    workspace?: string;
    allowed?: string[];
    denied?: string[];
}
export declare const inScope: (locator: string, scope: Scope) => boolean;
/** 过滤允许范围内的候选（locator）。 */
export declare const authorizeScope: <T extends {
    locator?: string;
}>(refs: T[], scope: Scope) => T[];
