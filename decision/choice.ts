// dsh-shadow —— decision/choice.ts：**唯一的原语** `choose`（ADR-0096 §3）。
//
// 为什么只有一个原语：提案里的五个原语，实测只有 `choice` 在 jev 里有依据（`model.py:81,91-106`）；
// `boolean` / `rank` / `threshold` 在那边**不存在**（`model.py` 里 `boolean|yes_no|threshold|rank` **0 命中**）。
// v1.17.0 按「**吸收形状、不吸收置信度**」的口径重新定过（ADR-0096 §12）：
//   · `boolean` → 只是 `choice` 的**二元退化**（候选集两元），不另造题型；
//   · `score`   → **不做** —— 它只能是引擎自报的数字，而数字归 `rawOutput`（provenance），
//                 **不进类型、不被 shadow 计算**；
//   · `rank`    → **不做**（v1.16.0 它曾是个「视图」`orderByReported`，按引擎自报分布排序）。
//                 分布字段**已从协议里删除** ⇒ 要排就得去**解析 `rawOutput`**，那正是
//                 「把引擎的置信度重新建模成 shadow 的排序」—— 所以**连视图也不给**；
//   · `threshold` → **不提供**（理由见 `choose` 的注释）。
import type { DecisionEngine, DecisionInput, DecisionResult, EngineDeclaration } from "./types.js";
import { declarationViolations, isUnavailable } from "./guard.js";

/**
 * **唯一的原语**：给定候选集 + 引擎 → 一份**合法声明**，或**显式不可用**。没有第三种结果。
 *
 * 它**刻意不做**三件事（这是 §3 删掉 `threshold` 的理由）：
 *   1. **不打分** —— 本层不产生任何数字（数字只可能出现在引擎的 `rawOutput` 里，归引擎）；
 *   2. **不设阈值** —— 按阈值把引擎输出切成「执行 / 不执行」，决策就变成了 **shadow 的策略**，
 *      而不是引擎的声明；那正是 ADR-0037 禁的「**采集变判断**」；
 *   3. **不排序** —— 连「按引擎自报排个序」的视图也不给（见文件头 `rank`）。
 *
 * 选谁由**引擎**决定；本函数只**校验并记录**（口径：jev 的 `validate_choice`，
 * `jev_ultrafast/model.py:30-45`）。校验不过一律**显式** invalid，**不静默纠正**（ADR-0049）。
 */
export const choose = (input: DecisionInput, engine: DecisionEngine | undefined): DecisionResult => {
  if (!engine) return { status: "unavailable", reason: "engine_missing" };

  let produced: EngineDeclaration | { status: "unavailable"; reason: string };
  try {
    produced = engine.decide(input);
  } catch (e) {
    // 引擎抛错也是**可见的**不可用，不是崩溃、更不是静默吞掉。
    return { status: "unavailable", reason: `engine_threw:${(e as Error)?.message ?? String(e)}` };
  }

  // 引擎**自己**说不可用（例如规则没命中）⇒ 原样透出，**不覆盖成别的理由**。
  if (isUnavailable(produced)) return produced;

  const violations = declarationViolations(produced);
  if (violations.length > 0) {
    return { status: "unavailable", reason: `invalid_declaration:${violations.join("；")}` };
  }
  return { status: "ok", declaration: produced };
};
