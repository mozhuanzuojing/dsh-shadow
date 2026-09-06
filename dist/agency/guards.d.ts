export declare function isExternalObjectiveSource(src: string): boolean;
export declare function objectiveIsExternal(objRef: string): boolean;
export declare function reasonIsConstraintOnly(reason: string): boolean;
export declare function hasNoUpgradeApi(): boolean;
export declare function eventProvenanceOk(e: {
    actionCandidate: string;
    authorityRef: string;
    objectiveRef: string;
}): boolean;
export declare function authorityIsNotIdentity(authorityRef: string, identityRef: string): boolean;
