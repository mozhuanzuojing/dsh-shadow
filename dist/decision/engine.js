import { heuristicEngine } from "./heuristic.js";
/** T1 的后端表：**只有** heuristic。 */
export const ENGINES = [heuristicEngine];
/**
 * 名字 → 引擎。未知一律**显式** `unavailable`（ADR-0049：**未知枚举不得落回默认**）。
 *
 * 为什么不做「找不到就用默认引擎」：那会让「拼错引擎名」与「没配引擎」看起来一样，
 * 都是**静默地跑在另一个后端上** —— 本仓已有一次同族教训（`evidenceProvider` 拼错曾静默退回 `fs`，v1.12.8 修）。
 */
export const resolveEngine = (name) => {
    const hit = ENGINES.find((e) => e.name === name);
    return hit ?? { status: "unavailable", reason: `engine_unknown:${name}` };
};
/** 可用的引擎名（**排序后**，便于确定性输出与测试）。 */
export const engineNames = () => ENGINES.map((e) => e.name).sort();
