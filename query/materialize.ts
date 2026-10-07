// dsh-shadow —— query/materialize.ts：把「读记忆→过滤遗忘/收口→parseMemory」脚手架收敛成一次（唯一定义）。
// 历史摩擦：query.ts 里这段被复制粘贴 7–12 次（listMemories/readMeta/readRel/parseMemory/isForgettable/isCompacted ×N）。
// 本模块把它集中为一处（locality），供所有「读记忆的查询」复用，消除副本。
//
// **消费者**：ReadQuery 各 mode handler（`query/reads.ts`）**以及**默认主题召回
// （`query/query.ts` → `topic-recall` / topic 透镜）—— 活跃 Memory Atom 集只经本 seam。
//
// T17-B（`adr/0095` 一期，(c1) 落点）：本模块是**唯一**的物化收敛点，所以「候选从哪来」在这里换成
// `CandidateProvider`（`core/candidate/provider.ts`）：`fs` provider 与今天逐字等价，`sqlite` provider
// 从派生索引取候选。**派生 / 门 / 打分 / 渲染全不动** —— 换的只是「字段从哪来」（文件 → 索引列）。
//
// 两条纪律：
//   · **遗忘/收口的判据只有这一份实现**（下面的 `keep`），provider 只接收它、不复制它（判据收一处）；
//   · **降级必须可见**（ADR-0049）：provider 落到 `unavailable`/`corrupt`/`query-error` ⇒ 本次回退 `fs`
//     全量（结果不变）并经 `opts.note` 留一条横幅；健康路径**一次都不留痕**（输出逐字节不变）。
import { readMetaVersioned } from "../persistence/meta.js";
import type { DegradeNote } from "../persistence/outcomes.js";
import { isForgettable, isCompacted } from "../core/retention/forget.js";
import { createCandidateProvider, fsCandidateProvider } from "../core/candidate/provider.js";

export interface MaterializedView {
  memories: any[];          // 过滤后的记忆条目（{date,time,name,rel}）
  parsed: any[];            // parseMemory 结果（含 kind/lineage）
  meta: any;                // _meta.json（status/寿命）
  config: any;              // 原 config（供分支读 forget/context 等）
}

/**
 * 物化的可选接线（T17-B D7 / D13 / D6 门③）。全部可选 ⇒ 既有调用点行为不变。
 */
export interface MaterializeOpts {
  /** 记一条**能力降级**留痕（ADR-0049）：`(capability, reason, effect)`。缺它时降级照旧发生，只是不上横幅。 */
  note?: DegradeNote;
  /** 本会话是否可写（D13 守卫②）：`false`（read-only）⇒ 派生索引不落盘、直接回退 `fs`。缺省按可写。 */
  writable?: boolean;
  /** 写侧已知变更的 rel 集合（D6 门③）：provider 只对这些 rel 做单条 upsert。 */
  dirtyRels?: Iterable<string>;
  /**
   * 上面那批 rel **成功并入索引之后**才调用（回退路径**绝不许**调）。
   *
   * 为什么必须有这一半：`patchSummary` 是**原地改内容**（路径不变）⇒ 目录级粗信号**必然漏报**它
   * （`fs-cost-findings.md` Q5）。若在回退时就把 dirty 清掉，那次变更就**永久丢失**：下一次粗信号
   * 看不见、也没有任何信号 —— 索引永远陈旧。故：**只有成功 upsert 才消费**。
   */
  clearDirty?: (rels: Iterable<string>) => void;
}

const STATE_LABEL: Record<string, string> = {
  unavailable: "不可用",
  corrupt: "损坏（下次读会整体重建）",
  "query-error": "查询失败",
};

/** 唯一一次「物化」：确认 meta（权威 `_meta.json`）→ 算 keep → 由 provider 取候选。 */
export const materializeAtoms = async (fs: any, ws: string, config: any, opts?: MaterializeOpts): Promise<MaterializedView> => {
  // **`_meta.json` 必须仍然读文件**（D7）：它是权威，索引只做加速；`keep` 的输入必须是最新鲜的 meta。
  //
  // B13（v1.22.x）：这里原先用 `readMeta`，而它**把 `corrupt` 丢掉了** —— `_meta.json` 坏件/读失败时
  // 拿到的 `{}` 与「全新工作区」逐字相同，于是 pinned/archived/compacted 全部看起来不存在
  //（唯一痕迹是 `readMetaVersioned` 里一句不可见的 `console.log`）。读侧的判据早就建好了（`:78` 的
  // `corrupt`），只是**消费点漏接**。现在改用 `readMetaVersioned` 并把 `corrupt` 交给 `opts.note`：
  // 后果必须说清 —— 本次物化对被遗忘/已收口的条目**判据不生效**，所以返回集合可能比真实活跃集**偏大**。
  const snap = await readMetaVersioned(fs, ws);
  if (snap.corrupt) {
    opts?.note?.(
      "meta",
      "`_meta.json` **坏件或读不出来**（与「还没有元数据」是两件事）",
      "本次按**空元数据**读：forget/compact/pinned 判据全部不生效 ⇒ 可能返回已归档/已收口条目（集合偏大）；请人工修复 `_meta.json`",
    );
  }
  const meta = snap.meta;
  const forget = config?.forget ?? {};
  // 遗忘/收口判据的**唯一**实现（provider 不复制它）。
  const keep = (rel: string) => !isForgettable(rel, meta, forget) && !isCompacted(meta, rel);

  // dirty 先取**快照**：回退路径下原样保留（只有成功 upsert 才由 clearDirty 消费）。
  const dirty = opts?.dirtyRels ? [...opts.dirtyRels] : [];
  const provider = createCandidateProvider(config);

  let set = await provider.provide(fs, ws, config, keep, { writable: opts?.writable, dirtyRels: dirty });
  if (set.state !== "ok") {
    // 四态里除 `ok` 外三态都回退 fs（D5）；**合法 0 行是 `ok`**，绝不走这里。
    opts?.note?.(
      "derivedIndex",
      `派生索引${STATE_LABEL[set.state] || set.state}：${set.reason || "未给出原因"}`,
      "本该快（查索引）、本次回退 fs 全量扫描（慢）；**结果不变**（两路候选等价）",
    );
    set = await fsCandidateProvider.provide(fs, ws, config, keep);
  } else if (provider.id === "sqlite" && dirty.length && opts?.clearDirty) {
    // 消费掉这批 dirty（键由调用方精确删）；**注意顺序**：必须在 upsert 成功之后。
    opts.clearDirty(dirty);
  }

  return { memories: set.sources, parsed: set.atoms, meta, config };
};
