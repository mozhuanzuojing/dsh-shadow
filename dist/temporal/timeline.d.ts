export interface IdentityVersionEntry {
    version: string;
    at: string;
}
export declare const resolveIdentityAt: (versions: IdentityVersionEntry[], timestamp: string) => IdentityVersionEntry | null;
export declare const resolvedVersionOf: (versions: IdentityVersionEntry[], timestamp: string) => string;
