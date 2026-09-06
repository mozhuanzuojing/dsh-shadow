export interface ForgottenRecord {
    id: string;
    originalRef: string;
    forgottenAt: string;
    reason: string;
    lastAccessibleAt: string;
    validationRefs?: string[];
}
