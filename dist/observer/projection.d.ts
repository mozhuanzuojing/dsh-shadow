export declare const projectContext: (fs: any, ws: string, memories: any[], task: string, soul: any, verifyEvidence: any, lens?: {
    preferred?: string[];
    avoided?: string[];
}) => Promise<{
    rel: any[];
    experiences: any[];
    principles: any;
    taste: any;
    unc: string[];
    excl: string[];
    visible: any[];
    hidden: string[];
}>;
export declare const renderProjection: (p: any, task: string, project: string, ctx?: any) => string;
