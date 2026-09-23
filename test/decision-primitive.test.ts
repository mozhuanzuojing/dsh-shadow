#!/usr/bin/env node
// dsh-shadow —— test/decision-primitive.test.ts：**Decision 原语**的闸（ADR-0096 / T1；v1.17.0 按「吸收」重定）。
//
// 这道闸守四件事：
//   ① **声明必须自洽** —— 候选非空、selected ∈ candidates、rawOutput 非空、engine 非空（**四条**判据各有反例）；
//   ② **不猜** —— 规则没命中 / 偏好解析不到唯一候选 / 未知引擎名 / 引擎抛错，一律**显式 `unavailable`**，绝不落回默认；
//   ③ **端到端** —— 产出的 `AtomLineage` 要能过**真实**的 `core/lineage-validator.ts` 投影门（并带反证）；
//   ④ **结构上装不下置信度** —— 见下。
//
// ⑦ 是**静态**判据，也是本层最重要的一条：协议里**没有、也不会有**承载「置信度 / 概率 / 分数」的位置
//   —— `EngineDeclaration` 的字段集**恰好**是 `{engine, candidates, selected, rawOutput}`。
//   这不是「我们保证不用」，而是**类型里没有那个槽**，所以**任何后端都引入不了**（与后端无关）
//   ⇒ `adr/0037` 的「❌ Confidence」**结构性成立**，`BACKLOG` 的 T19 因此结案。
//   ⚠ 该块带**标定**：往检测器喂一个合成样本，证明它真能看见非法字段（否则这条判据是恒真的假绿）。
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  declarationViolations,
  declarationIsClean,
  assertDeclarationValid,
  renderDeclaration,
  isUnavailable,
} from "../dist/decision/guard.js";
import { choose } from "../dist/decision/choice.js";
import { resolveEngine, engineNames, ENGINES } from "../dist/decision/engine.js";
import { heuristicEngine, HEURISTIC_ENGINE_NAME } from "../dist/decision/heuristic.js";
import { producedToLineage, producedDecisionIsTraceable } from "../dist/decision/lineage.js";
import { validateAtomProjection } from "../dist/core/lineage/validator.js";

/** 一份**合法**声明的样板；各反例只改动其中一处。 */
const D = (over: Record<string, unknown> = {}) => ({
  engine: "test-engine",
  candidates: ["a", "b", "c"],
  selected: "a",
  rawOutput: '{"rule":"demo","selected":"a"}',
  ...over,
});

const input = (over: Record<string, unknown> = {}) => ({
  question: "下一步做什么？",
  context: {},
  candidates: ["read_shadow", "run_test", "delegate"],
  ...over,
});

// ① 正向：样板声明合法；渲染**只读**（不改写、不归一化）
{
  assert.equal(declarationIsClean(D()), true);
  assert.deepEqual(declarationViolations(D()), []);
  const r = assertDeclarationValid(D());
  assert.equal(r.ok, true);
  assert.equal(r.reason, undefined, "合法时不得硬塞一个 reason");
  const text = renderDeclaration(D());
  assert.ok(text.includes("[Decision Declaration]"));
  assert.ok(text.includes("逐字留存"), "渲染必须说明 rawOutput 是证据");
  assert.ok(text.includes("不提取"), "渲染必须写明里面的数字归引擎、shadow 不提取");
  console.log("✔ ① 合法声明通过**四条**判据（engine / candidates / selected / rawOutput）；renderDeclaration 只读");
}

// ② 四条判据各有反例
{
  assert.ok(
    declarationViolations(D({ selected: "zzz" })).some((v: string) => v.includes("不在 candidates")),
    "selected 不在候选集必须判非法",
  );
  assert.ok(
    declarationViolations(D({ candidates: [] })).some((v: string) => v.includes("candidates 为空")),
    "空候选集必须判非法",
  );
  assert.ok(
    declarationViolations(D({ rawOutput: "   " })).some((v: string) => v.includes("rawOutput")),
    "rawOutput 空白（不是非空）必须判非法 —— 没有原始声明就不叫声明",
  );
  assert.ok(
    declarationViolations(D({ engine: "" })).some((v: string) => v.includes("engine")),
    "空引擎名必须判非法",
  );
  assert.equal(declarationViolations(D()).length, 0, "合法时违规数为 0");
  console.log("✔ ② 四条判据反例齐备（selected / candidates / rawOutput / engine）");
}

// ③ choose：明示偏好、唯一提及、以及**含糊时显式失败**（规则 ③「不猜」）
{
  const byPrefer = choose(input({ context: { prefer: "run_test" } }), heuristicEngine);
  assert.equal(byPrefer.status, "ok");
  if (byPrefer.status !== "ok") throw new Error("unreachable");
  assert.equal(byPrefer.declaration.selected, "run_test");
  assert.ok(byPrefer.declaration.rawOutput.includes("explicit-prefer"), "rawOutput 必须留下规则轨迹");

  const byMention = choose(input({ context: { note: "先 read_shadow 再动手" } }), heuristicEngine);
  assert.equal(byMention.status, "ok");
  if (byMention.status !== "ok") throw new Error("unreachable");
  assert.equal(byMention.declaration.selected, "read_shadow");
  const reordered = choose(input({ context: { z: "先 read_shadow 再动手", a: "无关" } }), heuristicEngine);
  assert.equal(reordered.status === "ok" && reordered.declaration.selected, "read_shadow", "结论不得依赖键序");

  // **两个**候选都被提到 ⇒ 含糊 ⇒ 显式不可用（不取第一个蒙过去）
  const ambiguous = choose(input({ context: { note: "read_shadow 或 run_test 都行" } }), heuristicEngine);
  assert.equal(ambiguous.status, "unavailable");
  if (ambiguous.status === "unavailable") assert.ok(ambiguous.reason.includes("no_rule_matched"));

  assert.equal(choose(input({ context: { note: "随便" } }), heuristicEngine).status, "unavailable");

  const notACandidate = choose(input({ context: { prefer: "nope" } }), heuristicEngine);
  assert.equal(notACandidate.status, "unavailable");
  if (notACandidate.status === "unavailable") assert.ok(notACandidate.reason.includes("not_a_candidate"));
  const dupCandidates = choose(input({ candidates: ["x", "x"], context: { prefer: "x" } }), heuristicEngine);
  assert.equal(dupCandidates.status, "unavailable");
  if (dupCandidates.status === "unavailable") assert.ok(dupCandidates.reason.includes("ambiguous"));
  console.log("✔ ③ choose：明示偏好 / 唯一提及 / 含糊与解析不到一律**显式失败**");
}

// ④ 失败面：引擎缺失 / 引擎抛错 / 引擎产出非法声明
{
  const missing = choose(input(), undefined);
  assert.equal(missing.status, "unavailable");
  if (missing.status === "unavailable") assert.equal(missing.reason, "engine_missing");

  const throwing = { name: "boom", decide: () => { throw new Error("炸了"); } };
  const r1 = choose(input(), throwing as never);
  assert.equal(r1.status, "unavailable");
  if (r1.status === "unavailable") assert.ok(r1.reason.includes("engine_threw"), "抛错必须变成**可见的**不可用");

  const lying = { name: "lying", decide: () => D({ selected: "不在候选里的东西" }) };
  const r2 = choose(input(), lying as never);
  assert.equal(r2.status, "unavailable");
  if (r2.status === "unavailable") assert.ok(r2.reason.includes("invalid_declaration"), "非法声明必须被挡在 ok 之外");
  console.log("✔ ④ 引擎缺失 / 抛错 / 产出非法声明 —— 三条路径都是显式 unavailable");
}

// ⑤ 未知引擎名**不得落回默认**（ADR-0049；同族先例：evidenceProvider 拼错曾静默退回 fs）
{
  const ok = resolveEngine(HEURISTIC_ENGINE_NAME);
  assert.ok(!isUnavailable(ok as never), "已知引擎名必须解析到引擎");

  const unknown = resolveEngine("not-an-engine");
  assert.ok(isUnavailable(unknown as never), "未知引擎名必须 unavailable");
  assert.notEqual(unknown, heuristicEngine, "**绝不**静默 fallback 成默认引擎");
  if (isUnavailable(unknown as never)) assert.ok((unknown as { reason: string }).reason.includes("engine_unknown"));

  assert.deepEqual(engineNames(), [HEURISTIC_ENGINE_NAME]);
  assert.equal(ENGINES.length, 1, "T1 的后端表**只有** heuristic（无网络 / 无 LLM / 无 jev）");
  console.log("✔ ⑤ 未知引擎名显式 unavailable，且后端表只有 heuristic（T1 边界）");
}

// ⑥ **端到端**：`produced` → lineage 必须能过**真实**的 `core/lineage-validator.ts` 投影门
//     （本层零生产消费者的前提下，这是它离「生产契约」最近的一次验证 —— 不再是只测自己）
{
  const traceable = {
    declaration: D(),
    source: "session/2026-09-20-abc",
    createdAt: "2026-09-20 10:00:00",
    evidence: [{ type: "file" as const, locator: "adr/0096-decision-primitive.md" }],
  };
  const lineage = producedToLineage(traceable);
  assert.ok(!isUnavailable(lineage as never));
  assert.equal(producedDecisionIsTraceable(traceable), true);
  const verdict = validateAtomProjection({ type: "decision", lineage: lineage as never });
  assert.equal(verdict.allowed, true, `produced 决策必须能进 context，实得：${verdict.reason}`);

  // **反证**（否则上一条可能是恒真的假绿）：无 evidence 的 decision 必须被**下游**挡下
  const naked = validateAtomProjection({
    type: "decision",
    lineage: { ...(lineage as object), evidence: [] } as never,
  });
  assert.equal(naked.allowed, false, "反证：无 evidence 的 decision 必须被下游挡下");
  for (const bad of [{ ...traceable, evidence: [] }, { ...traceable, source: "  " }, { ...traceable, createdAt: "" }]) {
    assert.equal(producedDecisionIsTraceable(bad), false);
    assert.ok(isUnavailable(producedToLineage(bad) as never), "不可追溯必须显式 unavailable（ADR-0049）");
  }
  console.log("✔ ⑥ 端到端：过**真实**投影门（正例）+ 无证据被下游挡下（反证）+ 三类缺件显式 unavailable");
}

// ⑦ **结构判据**（本层最重要的一条）：协议里**没有**承载置信度/概率/分数的位置
{
  const dir = fileURLToPath(new URL("../decision/", import.meta.url));
  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".ts"))
    .sort();
  assert.deepEqual(
    files,
    ["choice.ts", "engine.ts", "guard.ts", "heuristic.ts", "lineage.ts", "types.ts"],
    "文件集变了 ⇒ 这条判据覆盖的对象也变了，先确认再放行",
  );

  const typesSrc = readFileSync(join(dir, "types.ts"), "utf8");
  const importLines = typesSrc.split("\n").filter((l) => /^\s*import\b/.test(l) || /\brequire\s*\(/.test(l));
  assert.deepEqual(importLines, [], "types.ts 必须**零 import** —— 它列在 PURE_MODULES 里，加 import 会让结构门变红");

  // 禁词只针对**字段名**：guard.ts 在**禁令理由**里点名它们是允许的（先例：planning/guard.ts 同样点名 score/optimal）。
  const FORBIDDEN = ["confidence", "score", "best", "optimal", "correct", "expectedSuccess", "precision", "winner", "ranking", "probabilities", "reportedDistribution"];
  const FIELD_RE = /^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:/;
  const fieldNamesOf = (src: string): string[] =>
    src
      .split("\n")
      .map((l) => FIELD_RE.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]);

  const all = files.flatMap((f) => fieldNamesOf(readFileSync(join(dir, f), "utf8")).map((n) => `${f}:${n}`));
  assert.ok(all.length > 0, "抽取器必须真的抽到字段名（否则这条判据是空的、会假绿）");
  const hits = all.filter((x) => FORBIDDEN.includes(x.split(":")[1]));
  assert.deepEqual(hits, [], `**全层**字段名不得出现禁词，实得 ${hits.join(",")}`);

  // ⑦ 的**核心**：`EngineDeclaration` 的字段集**恰好**是那四个 —— 加任何字段都会红
  const HEAD = "export interface EngineDeclaration {";
  const declFields = (src: string): string[] => {
    const at = src.indexOf(HEAD);
    if (at < 0) return []; // 锚点消失 ⇒ 空 ⇒ 由下面的断言判红（缺件不静默）
    const body = src.slice(at + HEAD.length);
    const end = body.indexOf("\n}");
    return fieldNamesOf(end >= 0 ? body.slice(0, end) : body);
  };
  const real = declFields(typesSrc);
  assert.deepEqual(
    real,
    ["engine", "candidates", "selected", "rawOutput"],
    "EngineDeclaration 的字段集**必须恰好**是这四个 —— 加任何字段（尤其是置信度/概率/分数）都会红。" +
      "这不是「我们保证不用」，而是**吸收的形状里没有那个槽**（ADR-0096 §12）。" +
      "若你要加字段：先读 §12 与 adr/0037 的「❌ Confidence」，并说明为什么门错了 —— **不许改门而不改事实**",
  );
  // **标定**：证明这个检测器真能看见非法字段（否则上面那条是恒真的假绿）
  const synthetic = HEAD + "\n  readonly engine: string;\n  readonly probabilities: Readonly<Record<string, number>>;\n}\n}";
  assert.ok(declFields(synthetic).includes("probabilities"), "标定失败：检测器看不见非法字段 ⇒ 上一条判据无效");
  console.log(`✔ ⑦ types.ts 零 import；全层 ${all.length} 个字段名禁词 0 处；EngineDeclaration 字段集恰为 4 个（含标定）`);
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · **没有生产消费者**：本层尚未被任何读路径 / 工具接线（ADR-0096 §7 的决定）⇒ 它目前只被本测试消费；");
console.log("  · **没有落盘**：⑥ 证明了产出的 `AtomLineage` 能过**真实**投影门，但**写原子**仍由既有 persistence 负责（T1 不碰）；");
console.log("  · **引擎原始输出里的数字无人建模**：⑦ 保证 shadow 侧**装不下**它；但把它**渲染给模型看**之后，");
console.log("    模型要不要据此行动，**不在本层的管辖内**（那是 agent 的推理，不是 shadow 的记录）—— 这是本条残余的边界。");
console.log("ALL PASS ✅");
