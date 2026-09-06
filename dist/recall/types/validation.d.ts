export interface RecallValidation {
    recalledRef: string;
    sourceRef: string;
    mapsExistingLineage: boolean;
    createsNewClaim: boolean;
    epistemicStatusUnchanged: boolean;
}
