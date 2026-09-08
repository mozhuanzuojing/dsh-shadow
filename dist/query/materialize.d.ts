export interface MaterializedView {
    memories: any[];
    parsed: any[];
    meta: any;
    config: any;
}
/** 唯一一次「物化」：读全部记忆 → 剔除遗忘/收口 → parseMemory。 */
export declare const materializeAtoms: (fs: any, ws: string, config: any) => Promise<MaterializedView>;
