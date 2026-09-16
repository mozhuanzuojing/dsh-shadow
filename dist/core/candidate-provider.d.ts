import type { CandidateProvider } from "./types.js";
export type { CandidateProvider, CandidateSet, CandidateState, MemorySource } from "./types.js";
/**
 * `fs` provider = 今天的 `query/materialize.ts` 逐字等价路径：
 * `listMemories` → 调用方的 `keep` 过滤 → 逐个 `readRel` → `parseMemory`（单条解析失败跳过）。
 *
 * 两条不能动的细节：
 *   · **先过滤再读** —— 保住今天省掉的那些 I/O（被遗忘/收口的文件根本不该被读）；
 *   · **不读资源卡** —— 资源卡走 `.shadow/resources/*.md`，本层不接管（D2）；`listResourceCards`
 *     仍由 `query/reads.ts` 原样调用。
 */
export declare const fsCandidateProvider: CandidateProvider;
/**
 * 按 `cfg.derivedIndex.provider` 路由（默认 `"fs"`，D8：改默认是 T17-C 的事）。
 *
 * **无模块级可变状态**：每次调用返回的 provider 若持有状态（sqlite 的「待重建」标记），
 * 那状态挂在**该实例**上、随实例销毁 —— 与 `WriterCore.degrade` 台账同一条纪律
 * （模块级单例会污染多会话，见 `test/t8-silent-degradation.test.ts` 的实例隔离断言）。
 */
export declare const createCandidateProvider: (cfg: any) => CandidateProvider;
