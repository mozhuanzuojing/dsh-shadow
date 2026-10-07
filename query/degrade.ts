// dsh-shadow —— query/degrade.ts：**写侧/读侧降级 → 读者可见的一段**（唯一一份措辞）。
//
// ## 为什么单独抽出来（判据收一处）
//
// ADR-0049 规则 2 只有一句话：「降级必须可见，且有 reader 能看见的信号」；ADR-0085 补上
// 「**`console.log` 不算**」。本仓为此在 `core/writer/index.ts` 收了口（能力降级台账 → `flushWarn` 横幅），
// 但那只覆盖**读侧**（横幅由读路径带回）。**写模式**的输出里说「已配置 / 已记录」时，需要一个
// 同族的、**就在同一段文本里**的信号 —— 否则读者在同一段输出里看到成功、却要等下一次读才知道失败
//（P0：`query/contverify.ts` 的四个写模式就是这么冒充成功的）。
//
// 这里只放**措辞与形状**：谁是「什么」（`what`）、为什么（真实 `reason`）、后果是什么（`effect`）。
// 后果由调用方决定 —— 不同能力的后果本来就不同（索引少一行 / 身份序号重号 / 下次读是空）。
import type { PersistOutcome } from "../persistence/outcomes.js";

/** 写侧降级：`ok:true` ⇒ 空串（健康路径**输出逐字节不变**）。 */
export const unwrittenWarn = (what: string, o: PersistOutcome, effect: string): string =>
  o.ok ? "" : `\n> ⚠ **${what}** 未落盘（${o.reason}）。${effect}`;

/** 读侧降级：`reason` 为空 ⇒ 空串（「真的还没有」是正常空值，不该报）。 */
export const readCauseWarn = (what: string, reason: string | undefined, effect: string): string =>
  reason ? `\n> ⚠ **${what}** 读不出来（${reason}）。${effect}` : "";
