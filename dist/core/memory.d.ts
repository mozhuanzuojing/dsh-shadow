export declare const buildClueHeader: (entry: string, arr: any[], srcId?: string, extra?: {
    project?: string;
    agent?: string;
    goal?: string;
}) => string;
export declare const registerMeta: (fs: any, ws: string, rel: string, actorId: string | undefined, retentionEnabled: boolean) => Promise<void>;
