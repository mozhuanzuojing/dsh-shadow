// dsh-shadow —— core/writer-core.ts：写侧采集内核的共享状态 seam（candidate 2 主体拆分）。
// createShadowCollector 内闭包的状态（pending/comps/goalByAgent/cwdBySession + L2 索引缓存）与配置派生值
// 抽成一个可注入的 WriterCore，供 capture（事件→pending）与 materialize（pending→文件+索引+meta+摘要）两 seam 共享。
// 拆分的动机：materialize（fs 重、领域逻辑最密）此前硬编码在 collector 闭包内、不可单测；换成显式 core 后可独立验证。
import type { ShadowConfig } from "./types.js";

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
  // 配置派生
  MAX_PENDING: number;
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
    indexCache: new Map(),
    indexCacheWarm: new Set(),
    indexDirty: new Set(),
    indexFingerprint: new Map(),
    MAX_PENDING: 60,
    forgetCfg: config.forget ?? {},
    compactCfg: config.compact ?? {},
    summaryCfg: config.summary ?? {},
    recallCfg: config.recall ?? {},
    retentionCfg: config.retention ?? {},
    episodeCfg,
    writeConsent: config.writeConsent === true,
    episodeGap: Math.max(0, Number(episodeCfg.gapMinutes) || 60),
    episodeShow: Math.max(0, Number(episodeCfg.showInIndex) || 8),
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
