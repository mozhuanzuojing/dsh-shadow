import type { EvidenceMatch, EvidenceProvider, GatewayEvidenceRef, EvidenceResult } from "../core/types.js";
/**
 * 解析「怎么起 zg」：
 *   - `DSH_SHADOW_ZG_CLI` 显式覆盖（指向包内 cli/index.js）；
 *   - 扫 PATH 找包内 CLI 入口 → 用 `process.execPath` 起它（Windows 唯一可用路径，Unix 亦然）；
 *   - 都找不到 → 回退裸 `zg`（Unix 可执行符号链接；Windows 会 ENOENT → 报 unavailable）。
 * 结果缓存：PATH 在一次进程生命周期内不变。
 */
export declare const resolveZgInvocation: () => {
    cmd: string;
    prefix: string[];
};
/** 仅供测试：清掉 invocation 缓存（改过 DSH_SHADOW_ZG_CLI 后需要）。 */
export declare const resetZgInvocationCache: () => void;
export declare const runZg: (args: string[], ctx: any, timeoutMs?: number) => Promise<any>;
export declare const samePath: (a: unknown, b: unknown) => boolean;
/**
 * 解析 zg `--rg` 输出。**两行结构**：不带缩进的行 = 文件路径；缩进行 = 命中。
 * startLine 取**命中行号**（面包屑前的 `231:`），不是分块范围 —— 证据要的是精确位置。
 *
 * 只认**结构化命中**，不保留任何「文本里出现过就造一条」的兜底：
 *   - 旧版有「stdout 出现 ref.path → 造单条命中」，实测**会误报** —— zg 对不存在的路径会打印
 *     `missing: <path>`，stdout 里含该路径，于是「路径不存在」被判成 verified；
 *   - 旧版还有「stdout 出现 query → 造单条命中」，且因运算符优先级 bug 在已有命中时也会重复 push。
 *   两者都是**仅凭文本出现就制造证据**，违反 ADR-0043「无证据不返回」。
 */
export declare const parseZgMatches: (stdout: string, ref: GatewayEvidenceRef, limit?: number) => EvidenceMatch[];
export declare const zgVerify: (ref: GatewayEvidenceRef, ctx: any) => Promise<EvidenceResult>;
export declare const zgEvidenceProvider: EvidenceProvider;
