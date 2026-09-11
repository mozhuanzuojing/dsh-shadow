// dsh-shadow —— core/intent.ts：Intent（目标导向观察意图，v0.20）。人观察世界不是随机的：
// 不是"我要查什么"，而是"我要改变什么"。goal/question/desiredOutcome/constraints 四要素。
import type { Intent } from "./types.js";

/** 布尔旗标 → 默认 goal（ADR-0050：verify→verifyEvidence；废止 args.recall）。 */
const FLAG_GOAL: Record<string, string> = {
  judgment: "形成判断",
  project: "投影当前任务",
  experience: "回顾经历",
  observer: "观测窗口",
  verifyEvidence: "验证证据",
  identity: "确认主体",
  context: "观察上下文",
};
/** mode 串 → 默认 goal（布尔未命中时；避免 recovery/identity-advance 错挂「召回相关记忆」）。 */
const MODE_GOAL: Record<string, string> = {
  recovery: "恢复任务记忆包",
  "identity-advance": "推进身份时间线",
  verification: "运行验证",
  episode: "展开连续任务",
  decision: "展开决策血缘",
  task: "展开任务生命周期",
  context: "恢复上下文引用",
  reflection: "反思规律",
  temporal: "时间坐标重放",
  offline: "离线压缩",
};
/** 布尔旗标优先级。 */
const FLAG_ORDER = ["identity", "context", "observer", "project", "experience", "judgment", "verifyEvidence"];
const DEFAULT_GOAL = "召回相关记忆";

export const intentOf = (args: any, topic: string): Intent => {
  const explicit = args?.intent;
  const question = String(explicit?.question || explicit?.query || args?.topic || topic || "").trim();
  const goal = String(explicit?.goal || args?.goal || "").trim();
  const activeFlag = FLAG_ORDER.find((m) => args?.[m]);
  const modeStr = String(args?.mode || "").trim();
  const modeGoal =
    (activeFlag && FLAG_GOAL[activeFlag]) ||
    (modeStr && MODE_GOAL[modeStr]) ||
    DEFAULT_GOAL;
  const desiredOutcome = explicit?.desiredOutcome ? String(explicit.desiredOutcome) : (goal ? `推进 ${goal}` : undefined);
  const constraints = Array.isArray(explicit?.constraints)
    ? explicit.constraints.map(String)
    : Array.isArray(args?.constraints) ? args.constraints.map(String) : [];
  return {
    goal: goal || modeGoal,
    question,
    desiredOutcome: desiredOutcome || undefined,
    constraints: constraints.length ? constraints : undefined,
  };
};

// ⚠ **接线状态（v1.15.33 / T4 分诊结论：保留，未接线）**：本函数全仓**零引用**（仅定义行本身）。
//   正在使用的是 `intentOf`（`observer/core.ts:20`），而它的渲染在 `observer/core.ts:31` **内联**为
//   `` `intent ${o.intent.goal}` `` —— 即这里有**一个渲染器与一处内联渲染并存**。
//   **为什么保留而不删**：`[Intent]` 这个多行带 `question`/`desired_outcome`/`constraints` 的形态
//   是 `Intent` 类型的**完整**表达，内联那句只取了 `goal`。删掉它会让「完整形态」失去唯一落点，
//   将来要给用户看完整 Intent 时只能重写。**但它是零引用，不要误以为已被渲染路径使用。**
//   ⇒ 若要消除这处「两处表达」，应让 `observer/core.ts` 改用它，而不是删它（属 `BACKLOG.md` T1 待决）。
export const renderIntent = (i: Intent) => {
  const lines = ["[Intent]"];
  lines.push(`goal ${i.goal}`);
  if (i.question) lines.push(`question ${i.question}`);
  if (i.desiredOutcome) lines.push(`desired_outcome ${i.desiredOutcome}`);
  if (i.constraints?.length) lines.push(`constraints ${i.constraints.join("、")}`);
  return lines.join("\n");
};
