export declare const readRel: (fs: any, ws: string, rel: string) => Promise<any>;
export declare const timeFromName: (name: string) => string;
/** 记忆文件名的规范形态：`<date>--<HHMMSS>-<rest>`；`time` 非 6 位时退回 `<date>--<rest>`（读侧给 `""`）。 */
export declare const memoryFileName: (date: string, time: string, rest: string) => string;
export declare const listMemories: (fs: any, ws: string) => Promise<any[]>;
