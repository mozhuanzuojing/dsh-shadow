export interface DelegationContext {
    delegationId: string;
    authoritySource: string;
    objectiveRef: string;
    allowedScope: string[];
    constraints: string[];
    expiration: string;
    revocation: boolean;
    createdAt: string;
}
