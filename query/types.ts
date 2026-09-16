// dsh-shadow —— query/types.ts：read_shadow 查询的依赖注入契约（Phase 5）。
import type { GatewayEvidenceRef, EvidenceResult, RecallCandidate, ShadowConfig } from "../core/types.js";

export interface ShadowQueryDeps {
  fs: any;
  config: ShadowConfig;
  cwdBySession: ReadonlyMap<string, string>;
  /** 动态取落盘失败提示（lastFlushError → flushWarn）。 */
  getFlushWarn: () => string;
  /**
   * **记一条能力降级留痕**（T8-A / ADR-0049，v1.15.65）。写进 `WriterCore.degrade`，
   * 由 `getFlushWarn()` 渲染成读者可见的横幅。
   *
   * 为什么读侧需要它：读侧也有**会静默降级**的能力 —— `queryLog` 写失败（**默认开启**的观测层）、
   * `recall.cooldownTurns` 台账坏件/不可读/写失败。这些路径手里没有 `WriterCore`，
   * 只能经这里留痕。旧代码在它们上面要么 `catch {}`、要么只 `console.log` ——
   * 两者都**不算** ADR-0049 认可的可见信号。
   *
   * 可选：本仓有意让读模块能在**没有写侧**时独立构造（测试 / 工具），
   * 缺它时降级照旧发生，只是不上横幅（调用点用 `?.`）。
   */
  noteDegrade?: (capability: string, reason: string, effect: string) => void;
  /** 证据验证（经 config.evidenceProvider 路由到 fs/zg/自定义 provider）。 */
  verifyEvidence: (ref: GatewayEvidenceRef, ctx: any) => Promise<EvidenceResult>;
  /** 召回扩词（闭包：recallCfg + llm + routeFor）。 */
  expandTerms: (topic: string) => Promise<string[]>;
  /** recall_shadow 的 LLM 回导航（v1.6）：给候选任务，LLM 选最相关编号；失败返回 []（回退确定性）。 */
  recallSelect?: (query: string, candidates: RecallCandidate[]) => Promise<number[]>;
  /** Knowledge Engine 的 LLM 树上导航（v1.10.0，PageIndex `chat=` 步）：给候选章节，LLM 选编号；失败 []（回退确定性检索）。 */
  knowledgeNavigate?: (query: string, candidates: { id: string; title: string; content: string }[]) => Promise<number[]>;
  /** 懒构建索引：read_shadow 无参读索引前调用（flush 只置 dirty，不重建）。
   *  `session` 用于解析**该会话自己的**沙箱策略（ADR-0074）：读侧也会写盘，缺它会被沙箱围栏拒绝。 */
  ensureIndex: (ws: string, session?: any) => Promise<void>;
  /**
   * 宿主审批服务（懒取，可能 undefined）。**只给 `mode:"toolset"` 的显式安装用**：
   * 「一键装」是有后果的动作，必须拿到 `allowed-once` 才执行（ADR-0029.1 inv 178 / ADR-0030 inv 182）。
   * 缺该服务 → 安装一律 fail closed，只输出命令，不代装。
   */
  get approval(): any;
  /**
   * **本会话可写吗**（T17-B D13 守卫②）：取会话策略的 mode，只有「只读档」才判不可写；
   * 策略取不到（无 session / 宿主没提供 `sandboxPolicy`）⇒ 按可写处理（此时 `scopedFs` 本就是恒等变换）。
   *
   * 为什么读侧需要它：派生索引要走 `fs.processPath` + `node:fs` 落盘（那是**绕过策略围栏**的唯一一处写），
   * 所以必须由**策略本身**来决定要不要写 —— 只读会话一律不写、直接回退 `fs`。
   *
   * **可选**（与同文件的 `noteDegrade?` 同一取向）：本仓有意让读模块能在**没有写侧**时独立构造
   * （测试 / 工具）；消费方按 `!== false` 判。唯一的生产提供方是 `index.ts` 的 `makeQueryDeps`。
   */
  derivedIndexWritable?: boolean;
  /** 写侧已知变更的 rel（键 `ws|rel`，D6 门③）；按 ws 取。缺它时无 dirty 信号（只靠粗信号）。 */
  derivedIndexDirty?: (ws: string) => Iterable<string>;
  /**
   * 上面那批 rel **成功并入索引之后**才调用（按 ws；回退路径**绝不许**调 —— 否则原地改写会永久丢失）。
   * 与 `derivedIndexDirty` 成对：一个取、一个消费（键 `ws|rel` 精确删）。
   */
  derivedIndexClearDirty?: (ws: string, rels: Iterable<string>) => void;
}
