// dsh-shadow —— core/writer-core.ts：写侧采集内核的共享状态 seam（candidate 2 主体拆分）。
// createShadowCollector 内闭包的状态（pending/comps/goalByAgent/cwdBySession + L2 索引缓存）与配置派生值
// 抽成一个可注入的 WriterCore，供 capture（事件→pending）与 materialize（pending→文件+索引+meta+摘要）两 seam 共享。
// 拆分的动机：materialize（fs 重、领域逻辑最密）此前硬编码在 collector 闭包内、不可单测；换成显式 core 后可独立验证。
import type { ShadowConfig } from "../types.js";
import { numOr } from "../util.js";

/**
 * 一条**能力降级**留痕（T8-A / ADR-0049）。
 *
 * `effect` 不是可选的：ADR-0049 要的是「**可见**」，而可见的前提是说清**丢了什么** ——
 * 一句「llmRecall failed」对读者没有用，因为他还得自己推断这会导致什么。
 */
export interface DegradeNote {
  at: number;
  /** 能力标识（同时是台账的键，同类覆盖）。 */
  capability: string;
  /** 为什么降级（缺件 / 失败原因）。 */
  reason: string;
  /** 对使用者的**后果**（他读到的东西少了什么 / 可能错在哪）。 */
  effect: string;
}

/**
 * 记一条降级留痕。**这是写台账的唯一入口**（判据收一处）。
 *
 * 为什么参数是 `(core, capability, reason, effect)` 而不是一个对象：调用点大多在
 * `catch`/早退分支里，短签名让「提前 return 之前顺手留痕」这件事足够便宜 ——
 * ADR-0049 失效的真实原因从来不是「不知道要留痕」，而是**留痕比 return 麻烦**。
 */
export const noteDegrade = (core: WriterCore, capability: string, reason: string, effect: string): void => {
  core.degrade.set(capability, { at: Date.now(), capability, reason, effect });
};

/**
 * **派生索引的写侧精确信号**（T17-B D6 门③）：记下「这个 rel 的内容变了」。
 *
 * 为什么必须有它（`fs-cost-findings.md` Q5 实测）：目录级令牌对**已存在文件的原地改内容**必然漏报
 * （长度变与不变都漏），而 `core/writer-materialize.ts` 的 `patchSummary` **就是**原地改写同一个文件
 * ⇒ 纯粗信号会把这次变更**永远漏掉**（静默陈旧，没有任何信号）。写侧是本进程内唯一知道这件事的地方。
 *
 * 键是 `ws|rel`：同一份记忆在不同工作区是两件事；**随实例销毁**（不做模块级单例，同 `degrade` 台账的纪律）。
 */
export const markDerivedDirty = (core: WriterCore, ws: string, rel: string): void => {
  if (!ws || !rel) return;
  core.derivedDirty.add(`${ws}|${rel}`);
};

/** 取某工作区下**已知变更**的 rel 列表（读侧用；顺序按插入序，调用方不应依赖顺序）。 */
export const dirtyRelsFor = (core: WriterCore, ws: string): string[] => {
  const prefix = `${ws}|`;
  const out: string[] = [];
  for (const k of core.derivedDirty) if (k.startsWith(prefix)) out.push(k.slice(prefix.length));
  return out;
};

/** 审计材料折叠缓冲的上界（`adr/0097` D4）：只保最近这些条，防长工具链把一条记忆的材料表撑爆。 */
const AUDIT_MATERIAL_CAP = 40;

/** 记下**已降级进审计流**的那批读过的文件（供下一条记忆折叠）。 */
export const rememberAuditMaterials = (core: WriterCore, agentId: string | undefined, mats: string[]): void => {
  if (!mats.length) return;
  const key = agentId || "";
  const merged = [...(core.auditMaterials.get(key) || []), ...mats];
  core.auditMaterials.set(key, merged.slice(Math.max(0, merged.length - AUDIT_MATERIAL_CAP)));
};

/** 取出并清空（**即取即清**：同一条材料不该被折叠进两条记忆）。 */
export const takeAuditMaterials = (core: WriterCore, agentId: string | undefined): string[] => {
  const key = agentId || "";
  const out = core.auditMaterials.get(key) || [];
  core.auditMaterials.delete(key);
  return out;
};

/**
 * 消费一批 dirty（**只有成功并入索引之后才允许调**，见 `WriterCore.derivedDirty` 的注释）。
 * 按 `ws|rel` **精确删**：不能整表清空 —— 那会连带丢掉别的 rel 尚未并入的变更。
 */
export const clearDerivedDirty = (core: WriterCore, ws: string, rels: Iterable<string>): void => {
  for (const rel of rels) core.derivedDirty.delete(`${ws}|${rel}`);
};

export interface WriterCore {
  context: any;
  config: ShadowConfig;
  getAgentById: (id: string | undefined) => any;
  // 采集状态
  pending: Map<string, any[]>;
  comps: Map<string, string[]>;
  goalByAgent: Map<string, string>;
  cwdBySession: Map<string, string>;
  // 落盘可靠性 + L2 增量索引缓存
  lastFlushError: { at: number; err: string } | undefined;
  /** 索引重建失败（读侧据此提示「你读到的索引可能是旧的」）。与 lastFlushError 分开：这是**读路径**的失败。 */
  lastIndexError: { at: number; err: string } | undefined;
  /** 元数据（`_meta.json`）登记失败：记忆文件已写入但 meta 没有它 ⇒ hits/生命周期/遗忘判据都看不到。 */
  lastMetaError: { at: number; err: string } | undefined;
  indexCache: Map<string, Map<string, any>>;
  indexCacheWarm: Set<string>;
  indexDirty: Set<string>;
  /**
   * `_index.md` 构建时**所见源的指纹**（ADR-0069）。
   *
   * 为什么必须有它：`indexDirty` 是**进程内**的 Set，只能反映**本进程**的写入。
   * 而记忆文件是 source of truth，**别的会话 / 子代理写入的记忆本进程的 dirty 永远看不到**
   * ⇒ 一旦缓存预热，`_index.md` 就再也不更新（实测：`_index.md` 停在 09:34:01，
   * 之后 623 条新记忆对索引不可见，而主题召回走 `listMemories` 读盘看得见 —— 两条读路径可见性分歧 8.54%）。
   * ⇒ 新鲜度必须问**源**，不能只问进程。
   */
  indexFingerprint: Map<string, string>;
  /**
   * **派生索引的写侧精确信号**（T17-B D6 门③）：键 `ws|rel`，值是「这个 rel 的内容变了」。
   *
   * 为什么标脏而不是直接改索引：本进程只负责**说清哪个文件变了**；把变更并入索引是读侧 provider 的事
   * （索引是派生件，写侧不许直接写它 —— `adr/0095` Decision 3「模型不得直接写 SQL」同源）。
   * **随实例销毁**（不做模块级单例：多会话/多实例会互相污染，同 `degrade` 台账的纪律）。
   * 消费语义：**只有成功 upsert 之后才删**（`clearDerivedDirty`）—— 回退路径必须原样保留，
   * 否则 `patchSummary` 的原地改写会永久丢失（粗信号看不见它）。
   */
  derivedDirty: Set<string>;
  /**
   * **审计批的材料折叠缓冲**（v1.19.0 / `adr/0097` D4）。
   *
   * 纯动作批降级进审计流之后，它读过的文件（`改/读 <path>`）不能从**记忆层**消失 ——
   * 审计流是系统派生记录层，读侧不消费它 ⇒ 那些路径攒在这里，并入**下一条记忆**的「背景/材料」，即取即清。
   *
   * · 键是 agentId（同一 agent 的连续动作批属于同一条线索）；
   * · **有界**（`AUDIT_MATERIAL_CAP`）：长工具链不该把一条记忆的材料表撑爆；
   * · 随实例销毁（不做模块级单例，同 `degrade` / `derivedDirty` 的纪律）。
   */
  auditMaterials: Map<string, string[]>;
  // 配置派生
  MAX_PENDING: number;
  /**
   * **能力降级台账**（T8-A / ADR-0049，v1.15.65）：某能力退到后备路径时留一条痕，
   * 由 `core/writer.ts` 的 `getFlushWarn()` 渲染成**可见信号**。
   *
   * 为什么要有它：ADR-0049 要求「缺件/失败必须有**至少一条**可见信号（`unavailable` 状态 /
   * flush warn / debug trace）—— `console.log` **不算**」。而本仓此前有多处降级
   * **连 log 都没有**：最彻底的一例是 `streamText` 的 `label: ""` 让它的 catch 分支静默，
   * 于是「LLM 召回没生效」与「本来就没配」在输出里**完全不可区分**。
   *
   * 设计取舍（三条，都是为了不制造新噪音）：
   *   · **按能力覆盖**（`Map` 的键是能力名）—— 同类只留**最新**一条；否则每回合追加会把横幅刷爆，
   *     而「一直坏着」和「刚刚坏」对读者是同一件事，刷屏只会让信号变成噪音（ADR-0049 的反面）。
   *   · 放在 `WriterCore` 而不是模块级单例 —— 它必须随插件实例销毁，否则多会话互相污染。
   *   · **只在降级时写**，`getFlushWarn()` 也只在有记录时才渲染 ⇒ 健康路径的输出**逐字节不变**。
   *     这一点由 `test/t8-silent-degradation.test.ts` 的正/负对照锁住。
   */
  degrade: Map<string, DegradeNote>;
  forgetCfg: Record<string, any>;
  compactCfg: Record<string, any>;
  summaryCfg: Record<string, any>;
  recallCfg: Record<string, any>;
  retentionCfg: Record<string, any>;
  episodeCfg: Record<string, any>;
  writeConsent: boolean;
  episodeGap: number;
  episodeShow: number;
  /** 目录级 L0/L1 sidecar（ADR-0065 / D6，v1.15.35）：默认**开**（派生物，见下）。 */
  abstractCfg: Record<string, any>;
}

export function createWriterCore(opts: { context: any; config: ShadowConfig; getAgentById: (id: string | undefined) => any }): WriterCore {
  const { context, config, getAgentById } = opts;
  const episodeCfg = config.episodes ?? {};
  return {
    context,
    config,
    getAgentById,
    pending: new Map(),
    comps: new Map(),
    goalByAgent: new Map(),
    cwdBySession: new Map(),
    lastFlushError: undefined,
  lastIndexError: undefined,
  lastMetaError: undefined,
    indexCache: new Map(),
    indexCacheWarm: new Set(),
    indexDirty: new Set(),
    indexFingerprint: new Map(),
    derivedDirty: new Set(),
    auditMaterials: new Map(),
    degrade: new Map(),
    MAX_PENDING: 60,
    forgetCfg: config.forget ?? {},
    compactCfg: config.compact ?? {},
    summaryCfg: config.summary ?? {},
    recallCfg: config.recall ?? {},
    retentionCfg: config.retention ?? {},
    episodeCfg,
    writeConsent: config.writeConsent === true,
    // T8-B（v1.15.64）：`|| 60` / `|| 8` 会把**显式 0** 与「未传」混为一谈 ⇒ 改用 `numOr`。
    // `showInIndex: 0` 的含义是「_index.md 不列 Episodes 段」，此前被吞成 8 ⇒
    // `writer-materialize.ts:212` 的 `episodeShow > 0` 恒真 = **死分支**（那个开关不存在）。
    episodeGap: numOr(episodeCfg.gapMinutes, 60),
    episodeShow: numOr(episodeCfg.showInIndex, 8),
    abstractCfg: config.abstracts ?? {},
  };
}

// 路由推导：显式 provider/model，否则取 agentDefaultModel.currentSelection()。与 writer.ts 原实现逐字一致。
export function routeFor(core: WriterCore, cfg: any = core.summaryCfg): { provider: string; model: string } | undefined {
  const explicit = cfg.provider && cfg.model ? { provider: cfg.provider as string, model: cfg.model as string } : undefined;
  if (explicit) return explicit;
  try {
    const sel = core.context.get("agentDefaultModel")?.currentSelection();
    return sel?.provider && sel?.model ? { provider: sel.provider, model: sel.model } : undefined;
  } catch {
    return undefined;
  }
}
