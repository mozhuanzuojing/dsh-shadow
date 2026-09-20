// dsh-shadow —— decision/engine.ts：**后端表与解析**（ADR-0096 §7）。
//
// 这一层存在的全部意义：**上层不知道后端是谁**。
// 换后端 = 这张表里换一项，调用方一个字不改（ADR-0096 §7 的那张图）。
//
// T1 的边界（ADR-0096 §7 + §10）：**无网络、无 LLM、无 jev**。
// 将来接 jev 或 LLM，也只是往 `ENGINES` 里加一项 —— 它**必须**是「实现」而不是「依赖」：
// jev 的决策本身是一个硬编码的远程服务（`jev_ultrafast/model.py:119` 的 `api.typesafe.ai`），
// 把它当依赖塞进来，就是本 ADR 明确拒绝的那件事。
import type { DecisionEngine, EngineName, EngineUnavailable } from "./types.js";
import { heuristicEngine } from "./heuristic.js";

/** T1 的后端表：**只有** heuristic。 */
export const ENGINES: readonly DecisionEngine[] = [heuristicEngine];

/**
 * 名字 → 引擎。未知一律**显式** `unavailable`（ADR-0049：**未知枚举不得落回默认**）。
 *
 * 为什么不做「找不到就用默认引擎」：那会让「拼错引擎名」与「没配引擎」看起来一样，
 * 都是**静默地跑在另一个后端上** —— 本仓已有一次同族教训（`evidenceProvider` 拼错曾静默退回 `fs`，v1.12.8 修）。
 */
export const resolveEngine = (name: EngineName): DecisionEngine | EngineUnavailable => {
  const hit = ENGINES.find((e) => e.name === name);
  return hit ?? { status: "unavailable", reason: `engine_unknown:${name}` };
};

/** 可用的引擎名（**排序后**，便于确定性输出与测试）。 */
export const engineNames = (): readonly string[] => ENGINES.map((e) => e.name).sort();
