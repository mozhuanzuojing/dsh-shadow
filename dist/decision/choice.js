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
export const choose = (input, engine) => {
    if (!engine)
        return { status: "unavailable", reason: "engine_missing" };
    let produced;
    try {
        produced = engine.decide(input);
    }
    catch (e) {
        // 引擎抛错也是**可见的**不可用，不是崩溃、更不是静默吞掉。
        return { status: "unavailable", reason: `engine_threw:${e?.message ?? String(e)}` };
    }
    // 引擎**自己**说不可用（例如规则没命中）⇒ 原样透出，**不覆盖成别的理由**。
    if (isUnavailable(produced))
        return produced;
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
export const orderByReported = (declaration) => {
    const dist = declaration?.reportedDistribution;
    if (!dist)
        return null;
    return [...declaration.candidates].sort((a, b) => (dist[b] ?? 0) - (dist[a] ?? 0));
};
