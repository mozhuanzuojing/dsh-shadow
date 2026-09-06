export type AdaptationTarget = "method" | "strategy" | "execution_pattern";
export interface AdaptationChange {
    id: string;
    target: AdaptationTarget;
    before: string;
    after: string;
    basedOn: string[];
    sourceExperience: string;
    validationRequired: true;
}
