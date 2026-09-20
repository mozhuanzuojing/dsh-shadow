// dsh-shadow —— decision/choice.ts：**唯一的原语** `choose` + 一个**视图** `orderByReported`（ADR-0096 §3）。
//
// 为什么只有一个原语：提案里的五个原语，实测只有 `choice` 在 jev 里有依据（`model.py:81,91-106`）；
// `boolean` / `rank` / `threshold` 在那边**不存在**（`model.py` 里 `boolean|yes_no|threshold|rank` **0 命中**）。
// 本层因此**不照抄五个**：
//   · `boolean` → 只是 `choice` 的**二元退化**（候选集两元），不另造题型；
//   · `score`   → 不是原语，只是声明里的 `reportedDistribution` 字段（引擎**自报**）；
//   · `rank`    → 降为**视图** `orderByReported`（读，不是决策）；
//   · `threshold` → **不提供**（理由见 `choose` 的注释）。
import type { DecisionEngine, DecisionInput, DecisionResult, EngineDeclaration } from "./types.js";
import { declarationViolations, isUnavailable } from "./guard.js";

/**
 * **唯一的原语**：给定候选集 + 引擎 → 一份**合法声明**，或**显式不可用**。没有第三种结果。
 *
 * 它**刻意不做**三件事（这是 §3 删掉 `threshold` 的理由）：
 *   1. **不打分** —— 本层不产生任何数字（数字只可能来自引擎自报）；
 *   2. **不设阈值** —— 按阈值把引擎输出切成「执行 / 不执行」，决策就变成了 **shadow 的策略**，
 *      而不是引擎的声明；那正是 ADR-0037 禁的「**采集变判断**」；
 *   3. **不把排序当偏好** —— 见 `orderByReported`。
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

/**
 * **视图**，不是原语：按引擎**自报**的分布降序读出来。
 *
 * 三种返回，调用方必须分得开：
 *   · `readonly string[]` —— 排好序的候选；
 *   · `null` —— **该引擎不产出分布**（`reportedDistribution === null`，如纯规则引擎）；
 *     `null` **不等于**「候选为空」；
 *   · `null` —— 该声明本身没带分布（`undefined`）。两种情况都不猜。
 *
 * **不得**被任何偏好 / 选择路径消费：它只回答「**引擎自己**是怎么排的」，
 * 不回答「shadow 觉得哪个更好」。
 */
export const orderByReported = (declaration: EngineDeclaration): readonly string[] | null => {
  const dist = declaration?.reportedDistribution;
  if (!dist) return null;
  return [...declaration.candidates].sort((a, b) => (dist[b] ?? 0) - (dist[a] ?? 0));
};
