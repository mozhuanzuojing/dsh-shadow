/**
 * 读 `<shadowRoot>/<dirRel>/<YYYY-MM-DD>/<fileName>` 里**最新**的一份。
 *
 * @param dirRel 相对 `.shadow/` 的目录（如 `temporal` / `world`）
 * @param fileName 快照文件名（默认 `graph.json`）
 * @returns 解析出的对象；**没有任何快照 / 全部解析失败 → null**（不抛、不编造）
 *
 * ⚠ **回退语义（v1.15.58 起会留痕）**：某一天的最新快照解析失败时，本函数会**继续找更旧的**并返回它。
 * 这是**有意的**（不因一份坏文件就让整条读路径返回 null），但调用方**必须知道**自己拿到的是旧图：
 * 故回退发生时打印一条含「跳过了哪些 / 实际用了哪份」的日志。**静默回退**会让「读到旧投影」
 * 伪装成「投影就是当前状态」（ADR-0003：派生件不是 source）。
 */
export declare const readLatestSnapshot: <T = any>(fs: any, ws: string, dirRel: string, fileName?: string) => Promise<T | null>;
