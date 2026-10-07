// dsh-shadow —— core/admission/intent.ts：Intent（目标导向观察意图，v0.20）。人观察世界不是随机的：
// 不是"我要查什么"，而是"我要改变什么"。goal/question/desiredOutcome/constraints 四要素。
import type { Intent } from "../types.js";

/**
 * 布尔旗标 → 默认 goal（ADR-0050：verify→verifyEvidence；废止 args.recall）。
 *
 * **A10：这张表是「旗标名 → goal」的唯一一份，且必须覆盖 `index.ts` 工具 schema 里的全部 boolean 参数。**
 * 原先只有 7 个键，而 schema 里有 **19** 个 boolean 参数 ⇒ `{soul:true}` / `{taste:true}` / `{claim:true}` /
 * `{kg:true}` 等 12 个不在表里，`intentOf` 于是**静默**回落 `DEFAULT_GOAL`「召回相关记忆」——
 * 一次灵魂投影会被记成「召回相关记忆」，而 Intent 是有落盘副作用的（会写进 `ObserverContext`）。
 * **门**：`test/intent-flags.test.ts` 断言「`index.ts` 的 boolean 参数集合 ⊆ 本表键集」——
 * 新增旗标只改 schema 而忘改这里 ⇒ 当场红，而不是静默取默认（本仓「能推出来的东西要配门」）。
 */
export const FLAG_GOAL: Record<string, string> = {
  judgment: "形成判断",
  project: "投影当前任务",
  experience: "回顾经历",
  observer: "观测窗口",
  verifyEvidence: "验证证据",
  identity: "确认主体",
  context: "观察上下文",
  // ↓ 补上的 12 个（A10；顺序即 `PRIORITY` 里「原有在前」的书写顺序）
  soul: "读取灵魂投影",
  taste: "读取品味偏好",
  kg: "追踪工程知识图谱",
  claim: "核验断言证据",
  debug: "调试召回管线",
  raw: "查看记忆原文",
  perceptionOnly: "只看感知层",
  identityContext: "取身份版本",
  hasValidation: "判断视角稳定性",
  changeObserved: "登记适配变化",
  revocation: "登记委派撤销",
  planningCannotCreateObjective: "确认观察边界政策",
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
/**
 * 布尔旗标的**优先级次序**（同时置多个时谁定 goal）。
 *
 * **A28：这只是一张排序表，不再是第二份键清单。** 原先是手写的 7 元素数组，与 `FLAG_GOAL` 的键
 * **手工保持一致** —— 往表里加第 8 个旗标而忘改这里，该旗标就**永远取不到 goal**（`activeFlag` 恒
 * `undefined`）：静默，且没有任何测试覆盖这个交叉约束。现在 `FLAG_ORDER` 由本表 + `FLAG_GOAL` 的键派生。
 *
 * · 原有 7 个的**相对顺序保持不变**（改顺序 = 改「混用多个旗标时谁定 goal」的既有语义）；
 * · 后补的 12 个一律排在原有 7 个**之后**：它们此前不在表里 ⇒ 与原有旗标混用时 goal 恒由原有旗标决定
 *   （排后面使「混用时 goal 变化」的面收敛为 0），而「只置新旗标」从今往后不再静默落回默认。
 */
const PRIORITY = [
  "identity", "context", "observer", "project", "experience", "judgment", "verifyEvidence",
  "soul", "taste", "kg", "claim", "debug", "raw",
  "perceptionOnly", "identityContext", "hasValidation",
  "changeObserved", "revocation", "planningCannotCreateObjective",
];
/**
 * 布尔旗标的实际判定顺序（**由 `PRIORITY` 与 `FLAG_GOAL` 的键派生**，A28）。
 * 派生使「表里有、顺序表里没有 ⇒ 静默丢映射」这条路径**不存在**：未在 `PRIORITY` 点名的键
 * 一律**追加在末尾**（仍然可判），而不是被丢掉。`test/intent-flags.test.ts` 另断言两表键集相等。
 */
export const FLAG_ORDER: readonly string[] = [
  ...PRIORITY.filter((k) => k in FLAG_GOAL),
  ...Object.keys(FLAG_GOAL).filter((k) => !PRIORITY.includes(k)),
];
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
//   正在使用的是 `intentOf`（`subject/observer/core.ts:20`），而它的渲染在 `subject/observer/core.ts:31` **内联**为
//   `` `intent ${o.intent.goal}` `` —— 即这里有**一个渲染器与一处内联渲染并存**。
//   **为什么保留而不删**：`[Intent]` 这个多行带 `question`/`desired_outcome`/`constraints` 的形态
//   是 `Intent` 类型的**完整**表达，内联那句只取了 `goal`。删掉它会让「完整形态」失去唯一落点，
//   将来要给用户看完整 Intent 时只能重写。**但它是零引用，不要误以为已被渲染路径使用。**
//   ⇒ 若要消除这处「两处表达」，应让 `subject/observer/core.ts` 改用它，而不是删它（属 `BACKLOG.md` T1 待决）。
export const renderIntent = (i: Intent) => {
  const lines = ["[Intent]"];
  lines.push(`goal ${i.goal}`);
  if (i.question) lines.push(`question ${i.question}`);
  if (i.desiredOutcome) lines.push(`desired_outcome ${i.desiredOutcome}`);
  if (i.constraints?.length) lines.push(`constraints ${i.constraints.join("、")}`);
  return lines.join("\n");
};
