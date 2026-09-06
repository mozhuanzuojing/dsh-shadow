import type { DelegatedPermission } from "../types/permission.js";
export declare const actionWithinScope: (allowedScope: string[], action: string) => boolean;
export declare const assertScopeWithin: (allowedScope: string[], action: string) => {
    ok: boolean;
    reason: string;
};
export declare const permissionNotOwnership: (p: Partial<DelegatedPermission> | {
    permission?: string;
    scope?: string;
    constraint?: string[];
}) => boolean;
export declare const assertPermissionNotOwnership: (p: any) => {
    ok: boolean;
    reason: string;
};
