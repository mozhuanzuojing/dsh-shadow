import type { DecisionEngine, DecisionInput, DecisionResult } from "./types.js";
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
export declare const choose: (input: DecisionInput, engine: DecisionEngine | undefined) => DecisionResult;
