// dsh-shadow —— core/candidate-provider.ts：**候选来源**的新边界（T17-B / `adr/0095` D2，(c1) 落点）。
//
// 它只回答一个问题：**候选（记忆来源 + parseMemory 的逐字段结果）从哪来**。
// 它**不**回答「该不该用」「该给几个」「怎么排序」——那些是调用方（`query/materialize.ts` 的 `keep`）
// 与上层 ranking（`query/query.ts`）的事。
//
// 为什么新起一条边界、而不是给今天的 `IndexEngine` 加 provider（`adr/0095` §十、T17-A §3.4）：
//   · `IndexEngine.refs` 的域是「文件 + 行号」（`dist/core/candidate/index-engine.js:4`），表达不了「记忆原子候选」；
//   · 全仓唯一调用点只把 `refs` 打印成列表（`query/reads.ts` 的 `mode:"index"`）⇒ 候选预筛**没有召回消费者**。
//   ⇒ 给它加 sqlite provider 等于「召回一点没快」，所以一期换的是**物化载体**（T17-A 的 (c1)）。
//
// 判据收一处（`AGENTS.md`）：遗忘/收口的判据**只有一份实现**（`query/materialize.ts` 里算出的 `keep`），
// provider 只**接收**它、绝不复制它。索引里存**全部**枚举到的文件（D4），过滤留给读侧。
import { listMemories, readRel } from "../../persistence/files.js";
import { parseMemory } from "../view/episode.js";
import { createSqliteCandidateProvider } from "./sqlite.js";
import type { CandidateProvider, CandidateSet, MemorySource } from "../types.js";

// D2 的导出面**原样**（`MemorySource` / `CandidateSet` / `CandidateProvider` 仍是本模块的公开导出）。
// 类型的声明体住在 `core/types.ts`：那是「领域 DTO / 接口」的既有落点，也是唯一能同时被本模块与
// `candidate-sqlite.ts` 引用而**不产生文件级依赖环**的地方（`audit-layers` 把 `import type` 也算边）。
export type { CandidateProvider, CandidateSet, CandidateState, MemorySource } from "../types.js";

const okSet = (provider: "fs" | "sqlite", sources: MemorySource[], atoms: any[]): CandidateSet =>
  ({ provider, state: "ok", sources, atoms });

/**
 * `fs` provider = 今天的 `query/materialize.ts` 逐字等价路径：
 * `listMemories` → 调用方的 `keep` 过滤 → 逐个 `readRel` → `parseMemory`（单条解析失败跳过）。
 *
 * 两条不能动的细节：
 *   · **先过滤再读** —— 保住今天省掉的那些 I/O（被遗忘/收口的文件根本不该被读）；
 *   · **不读资源卡** —— 资源卡走 `.shadow/resources/*.md`，本层不接管（D2）；`listResourceCards`
 *     仍由 `query/reads.ts` 原样调用。
 */
export const fsCandidateProvider: CandidateProvider = {
  id: "fs",
  async provide(fs: any, ws: string, _cfg: any, keep: (rel: string) => boolean): Promise<CandidateSet> {
    const sources = (await listMemories(fs, ws)).filter((mm: MemorySource) => keep(mm.rel));
    const atoms: any[] = [];
    for (const mm of sources) {
      const text = await readRel(fs, ws, mm.rel);
      if (!text) continue;
      try { atoms.push(parseMemory(text, mm.rel, mm.name)); } catch { /* 单条解析失败跳过（与今天同） */ }
    }
    return okSet("fs", sources, atoms);
  },
};

/**
 * 未知 provider 名 ⇒ **退 `fs` 且不静默**（D2）：本次返回 `unavailable`（调用方随即回退 `fs` 全量），
 * `reason` 里带原名字。**绝不**静默当作 `fs`（那会让拼错的名字永远查不出来）。
 */
const unknownProvider = (name: string): CandidateProvider => ({
  id: "fs",
  async provide(): Promise<CandidateSet> {
    return {
      provider: "fs",
      state: "unavailable",
      unavailable: true,
      reason: `provider_unknown: ${name}`,
      sources: [],
      atoms: [],
    };
  },
});

/**
 * provider **登记表**（一处登记）：新增一个候选来源只需在这里加一行，不必再加一个分支；
 * 未登记的名字一律走 `unknownProvider`（**绝不静默**）。
 * 取值口径：`cfg.derivedIndex.provider`，缺省 `"fs"`（D8：改默认是 T17-C 的事）。
 */
const CANDIDATE_PROVIDERS: Record<string, () => CandidateProvider> = {
  fs: () => fsCandidateProvider,
  sqlite: () => createSqliteCandidateProvider(),
};

/**
 * 按 `cfg.derivedIndex.provider` 路由（默认 `"fs"`，D8：改默认是 T17-C 的事）。
 *
 * **无模块级可变状态**：每次调用返回的 provider 若持有状态（sqlite 的「待重建」标记），
 * 那状态挂在**该实例**上、随实例销毁 —— 与 `WriterCore.degrade` 台账同一条纪律
 * （模块级单例会污染多会话，见 `test/t8-silent-degradation.test.ts` 的实例隔离断言）。
 */
export const createCandidateProvider = (cfg: any): CandidateProvider => {
  const name = String(cfg?.derivedIndex?.provider || "fs");
  const make = CANDIDATE_PROVIDERS[name];
  return make ? make() : unknownProvider(name);
};
