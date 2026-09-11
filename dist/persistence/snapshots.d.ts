/**
 * 读 `<shadowRoot>/<dirRel>/<YYYY-MM-DD>/<fileName>` 里**最新**的一份。
 *
 * @param dirRel 相对 `.shadow/` 的目录（如 `temporal` / `world`）
 * @param fileName 快照文件名（默认 `graph.json`）
 * @returns 解析出的对象；**没有任何快照 / 全部解析失败 → null**（不抛、不编造）
 */
export declare const readLatestSnapshot: <T = any>(fs: any, ws: string, dirRel: string, fileName?: string) => Promise<T | null>;
