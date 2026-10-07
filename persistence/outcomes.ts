// dsh-shadow —— persistence/outcomes.ts：**三态结果**与**降级留痕回调**的形状（唯一一份）。
//
// ## 为什么必须收一处（ADR-0049 / ADR-0085）
//
// 本仓对「失败」只有一条纪律：**缺件/失败不静默、降级必须可见、绝不冒充成功**。落地时它需要两个形状：
//   · **写侧** `{ ok:false, reason }` —— 调用方拿不到 `reason` 就没法把**真实原因**写进横幅，
//     只能猜（`query/reads.ts` 曾写死「`.shadow/query-log/` 不可写」，而真实原因常常是另一步）；
//   · **读侧** `{ ok, value, reason }` —— 「还没有」（正常空值）与「读不出来」（事故）必须能分开。
//
// 此前这两个形状在**每个模块各写一份匿名结构**（或干脆没有：写侧返回 `Promise<void>` + `catch { console.log }`）。
// 后果就是 T8 记录的那一族缺陷：`trajectory/ stance/ selfhood/ reflection/` 里约 22 处写侧
// 「只 `console.log`、契约无返回值 —— 而 `console.log` **不算** ADR-0049 认可的可见信号」（ADR-0085）：
// 读者看到的是成功文案，而磁盘上什么都没有。
//
// ⇒ 形状收在这里（**零依赖、只有类型**）：任一层都能引它而不制造依赖边，也不会让 `audit:layers`
// 的纯模块判据或方向禁令受影响。
//
// ## 边界（别扩张）
//
// 这里**只**放形状，不放渲染。**怎么让读者看见**（横幅 / 正文段落 / `noteDegrade`）由各层的既有通道决定
//（写侧 `core.lastFlushError` + `WriterCore.degrade`，读侧 `ShadowQueryDeps.noteDegrade`）——
// 形状统一是为了让「调用方**可能**看见」，不是为了把措辞也统一（不同能力的后果本来就不同）。
export interface PersistOutcome {
  /** 是否**真的**落盘。`false` ⇒ `reason` 必须给出**真实**原因（异常信息或「无 fs/无工作区」）。 */
  ok: boolean;
  /** 仅在真失败时有：为什么没写成（照 `core/util.ts#errText` 取真实异常文本，不臆造）。 */
  reason?: string;
}

/** 读侧结果：`ok:false` = **读不出来**（事故，要留痕）；`ok:true, value:null` = **真的还没有**（正常空值）。 */
export interface ReadOutcome<T> {
  ok: boolean;
  value: T | null;
  reason?: string;
}

/**
 * 「降级必须可见」的回调形状（`ShadowQueryDeps.noteDegrade` / `MaterializeOpts.note` / `core/writer` 的
 * `noteDegrade(core, …)` **三者同形**）。
 *
 * 为什么把它也收进来：这是 ADR-0049「有 reader 能看见的信号」的**唯一通道**，而它的签名此前在三处
 * **逐字重复**。签名漂移（例如少一个参数）不会报错 —— 可选调用 `?.()` + 结构类型会把拼错静默成
 * 「没有降级」，正是 B21 那条「丢类型 = 丢信号」的同型风险。
 */
export type DegradeNote = (capability: string, reason: string, effect: string) => void;
