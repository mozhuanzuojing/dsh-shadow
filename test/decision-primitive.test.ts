#!/usr/bin/env node
// dsh-shadow —— test/decision-primitive.test.ts：**Decision 原语**的闸（ADR-0096 / T1）。
//
// 这道闸守四件事：
//   ① **声明必须自洽** —— 分布与候选集逐字对齐、值域 [0,1]、和 ≈ 1、selected ∈ candidates（**七条**判据各有反例）；
//   ② **缺件不静默** —— 「无分布」必须**显式写 `null`**；`undefined`（忘了填）**判非法**，两者不是一回事；
//   ③ **不猜** —— 规则没命中 / 偏好解析不到唯一候选 / 未知引擎名，一律**显式 `unavailable`**，绝不落回默认；
//   ④ **协议里没有禁词** —— 字段名不得出现 confidence/score/…（本仓的线：认知不确定性可、成功信念禁）。
//
// 另有一条**静态**判据（⑨）：`decision/types.ts` 必须**零 import**（它在 PURE_MODULES 里，是承诺不是装饰）。
//
// ⑪ 是**端到端**（过真实的 `core/lineage-validator.ts` 投影门 + 反证）；
// ⑫ 是 **T19 闸门**（`adr/0096` §12）：本层**不允许**出现概率型后端 —— 要引入**必须先另立 ADR**（`BACKLOG.md` 的 T19）。
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
  DISTRIBUTION_SUM_TOLERANCE,
} from "../dist/decision/guard.js";
import { choose, orderByReported } from "../dist/decision/choice.js";
import { resolveEngine, engineNames, ENGINES } from "../dist/decision/engine.js";
import { heuristicEngine, HEURISTIC_ENGINE_NAME } from "../dist/decision/heuristic.js";
import { producedToLineage, producedDecisionIsTraceable } from "../dist/decision/lineage.js";
import { validateAtomProjection } from "../dist/core/lineage-validator.js";

/** 一份**合法**声明的样板；各反例只改动其中一处。 */
const D = (over: Record<string, unknown> = {}) => ({
  engine: "test-engine",
  candidates: ["a", "b", "c"],
  selected: "a",
  reportedDistribution: { a: 0.5, b: 0.3, c: 0.2 },
  rawOutput: "raw-output",
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
  console.log("✔ ① 合法声明通过**七条**判据（引擎名 / 候选非空 / selected / rawOutput / 分布三判据）；renderDeclaration 只读");
}

// ② 分布三判据：**键**多一个/少一个、值越界、非有限数、和偏离 1 —— 各有反例
{
  const extra = declarationViolations(D({ reportedDistribution: { a: 0.4, b: 0.3, c: 0.2, d: 0.1 } }));
  assert.ok(extra.some((v: string) => v.includes("逐字对齐")), "多一个键必须判非法");

  const missing = declarationViolations(D({ reportedDistribution: { a: 0.6, b: 0.4 } }));
  assert.ok(missing.some((v: string) => v.includes("逐字对齐")), "少一个键必须判非法");

  const outside = declarationViolations(D({ reportedDistribution: { a: 1.5, b: -0.3, c: -0.2 } }));
  assert.ok(outside.some((v: string) => v.includes("[0,1]")), "越界值必须判非法");

  const notFinite = declarationViolations(D({ reportedDistribution: { a: Number.NaN, b: 0.5, c: 0.5 } }));
  assert.ok(notFinite.some((v: string) => v.includes("[0,1]")), "NaN 必须判非法（有限性也要判）");

  const badSum = declarationViolations(D({ reportedDistribution: { a: 0.5, b: 0.5, c: 0.5 } }));
  assert.ok(badSum.some((v: string) => v.includes("求和")), "和 != 1 必须判非法");

  // 边界：恰好落在容差上应当**通过**（容差是显式的，不是装饰）
  const atTolerance = declarationViolations(
    D({ reportedDistribution: { a: 0.5 + DISTRIBUTION_SUM_TOLERANCE / 2, b: 0.3, c: 0.2 - DISTRIBUTION_SUM_TOLERANCE / 2 } }),
  );
  assert.deepEqual(atTolerance, [], "容差内的和应当通过（显式容差必须真的生效）");
  console.log("✔ ② 分布判据：键多/键少/越界/NaN/和偏离 各有反例；容差真的生效");
}

// ③ **缺件不静默**：`null` = 显式「本引擎不产出分布」（合法）；`undefined` = 忘了填（**非法**）
{
  const explicitNull = declarationViolations(D({ reportedDistribution: null }));
  assert.deepEqual(explicitNull, [], "显式 null 必须合法 —— 规则引擎本来就没有概率");

  const omitted = declarationViolations(D({ reportedDistribution: undefined }));
  assert.ok(omitted.length > 0, "undefined（忘了填）必须判非法：这与「没有分布」不是一回事");
  console.log("✔ ③ 显式 null 合法 / undefined 非法 —— 「不产出」与「忘了填」在类型上就分得开");
}

// ④ 其余判据的反例：selected / candidates / rawOutput / engine
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
  console.log("✔ ④ selected / candidates / rawOutput / engine 四条反例齐备");
}

// ⑤ choose：明示偏好、唯一提及、以及**含糊时显式失败**（规则 ③「不猜」）
{
  // 规则 ①：调用方明示 prefer
  const byPrefer = choose(input({ context: { prefer: "run_test" } }), heuristicEngine);
  assert.equal(byPrefer.status, "ok");
  if (byPrefer.status !== "ok") throw new Error("unreachable");
  assert.equal(byPrefer.declaration.selected, "run_test");
  assert.equal(byPrefer.declaration.reportedDistribution, null, "规则引擎必须显式报 null，不得自造分布");
  assert.ok(byPrefer.declaration.rawOutput.includes("explicit-prefer"), "rawOutput 必须留下规则轨迹");

  // 规则 ②：唯一逐字提及（**与 context 键序无关**）
  const byMention = choose(input({ context: { note: "先 read_shadow 再动手" } }), heuristicEngine);
  assert.equal(byMention.status, "ok");
  if (byMention.status !== "ok") throw new Error("unreachable");
  assert.equal(byMention.declaration.selected, "read_shadow");
  const reordered = choose(input({ context: { z: "先 read_shadow 再动手", a: "无关" } }), heuristicEngine);
  assert.equal(reordered.status === "ok" && reordered.declaration.selected, "read_shadow", "结论不得依赖键序");

  // 规则 ③：**两个**候选都被提到 ⇒ 含糊 ⇒ **显式不可用**（不取第一个蒙过去）
  const ambiguous = choose(input({ context: { note: "read_shadow 或 run_test 都行" } }), heuristicEngine);
  assert.equal(ambiguous.status, "unavailable");
  if (ambiguous.status !== "unavailable") throw new Error("unreachable");
  assert.ok(ambiguous.reason.includes("no_rule_matched"), `含糊必须显式失败，实得 ${ambiguous.reason}`);

  // 什么都没提到 ⇒ 不可用
  assert.equal(choose(input({ context: { note: "随便" } }), heuristicEngine).status, "unavailable");

  // prefer 明示了却解析不到 / 解析到多个 ⇒ 显式失败（**不退回规则 ②**）
  const notACandidate = choose(input({ context: { prefer: "nope" } }), heuristicEngine);
  assert.equal(notACandidate.status, "unavailable");
  if (notACandidate.status === "unavailable") assert.ok(notACandidate.reason.includes("not_a_candidate"));
  const dupCandidates = choose(input({ candidates: ["x", "x"], context: { prefer: "x" } }), heuristicEngine);
  assert.equal(dupCandidates.status, "unavailable");
  if (dupCandidates.status === "unavailable") assert.ok(dupCandidates.reason.includes("ambiguous"));
  console.log("✔ ⑤ choose：明示偏好 / 唯一提及 / 含糊与解析不到一律**显式失败**");
}

// ⑥ choose 的失败面：引擎缺失 / 引擎抛错 / 引擎产出非法声明
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
  console.log("✔ ⑥ 引擎缺失 / 抛错 / 产出非法声明 —— 三条路径都是显式 unavailable");
}

// ⑦ 未知引擎名**不得落回默认**（ADR-0049；同族先例：evidenceProvider 拼错曾静默退回 fs）
{
  const ok = resolveEngine(HEURISTIC_ENGINE_NAME);
  assert.ok(!isUnavailable(ok as never), "已知引擎名必须解析到引擎");

  const unknown = resolveEngine("not-an-engine");
  assert.ok(isUnavailable(unknown as never), "未知引擎名必须 unavailable");
  assert.notEqual(unknown, heuristicEngine, "**绝不**静默 fallback 成默认引擎");
  if (isUnavailable(unknown as never)) assert.ok((unknown as { reason: string }).reason.includes("engine_unknown"));

  assert.deepEqual(engineNames(), [HEURISTIC_ENGINE_NAME]);
  assert.equal(ENGINES.length, 1, "T1 的后端表**只有** heuristic（无网络 / 无 LLM / 无 jev）");
  console.log("✔ ⑦ 未知引擎名显式 unavailable，且后端表只有 heuristic（T1 边界）");
}

// ⑧ orderByReported 是**视图**：null ≠ 候选为空；且 **argmax ≠ selected 是合法的**（刻意不判）
{
  assert.equal(orderByReported(D({ reportedDistribution: null })), null, "无分布 ⇒ null");
  assert.equal(orderByReported(D({ reportedDistribution: undefined })), null, "缺分布 ⇒ 同样 null（不猜）");

  const ordered = orderByReported(D({ reportedDistribution: { a: 0.2, b: 0.7, c: 0.1 } }));
  assert.deepEqual(ordered, ["b", "a", "c"], "按引擎**自报**降序");

  // 刻意不判 argmax == selected：选择与分布是**两条独立事实**。
  const offArgmax = D({ selected: "a", reportedDistribution: { a: 0.1, b: 0.8, c: 0.1 } });
  assert.equal(declarationIsClean(offArgmax), true, "selected 不必等于 argmax（要求它就等于让数字决定选择）");
  console.log("✔ ⑧ 视图与「候选为空」分得开；argmax ≠ selected **合法**（刻意不判）");
}

// ⑨ **静态**判据：`types.ts` 零 import（PURE_MODULES 的承诺）+ **全层六个文件**的字段名无禁词
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
  const FORBIDDEN = ["confidence", "score", "best", "optimal", "correct", "expectedSuccess", "precision", "winner", "ranking"];
  const FIELD_RE = /^\s*(?:readonly\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\??\s*:/;
  const fieldNamesOf = (file: string): string[] =>
    readFileSync(join(dir, file), "utf8")
      .split("\n")
      .map((l) => FIELD_RE.exec(l))
      .filter((m): m is RegExpExecArray => m !== null)
      .map((m) => m[1]);

  const all = files.flatMap((f) => fieldNamesOf(f).map((n) => `${f}:${n}`));
  assert.ok(all.length > 0, "抽取器必须真的抽到字段名（否则这条判据是空的、会假绿）");
  assert.ok(
    all.some((x) => x.endsWith(":reportedDistribution")),
    "抽取器口径自检：必须能看到 reportedDistribution",
  );
  const hits = all.filter((x) => FORBIDDEN.includes(x.split(":")[1]));
  assert.deepEqual(hits, [], `**全层**字段名不得出现禁词（本仓的线：认知不确定性可、成功信念禁），实得 ${hits.join(",")}`);
  console.log(`✔ ⑨ types.ts 零 import；**全层 6 个文件**共 ${all.length} 个字段名里禁词 0 处`);
}

// ⑩ lineage：可追溯才投影；不可追溯**显式** unavailable（而不是产出会被下游静默拒掉的坏 lineage）
{
  const traceable = {
    declaration: D(),
    source: "session/2026-09-20-abc",
    createdAt: "2026-09-20 10:00:00",
    evidence: [{ type: "file" as const, locator: "adr/0096-decision-primitive.md" }],
  };
  assert.equal(producedDecisionIsTraceable(traceable), true);
  const lineage = producedToLineage(traceable);
  assert.ok(!isUnavailable(lineage as never));
  assert.equal((lineage as { createdBy: string }).createdBy, "tool", "createdBy 没有「引擎」档，T1 复用 tool");
  assert.equal((lineage as { evidence: unknown[] }).evidence.length, 1, "evidence 原样带上，不补写");

  for (const bad of [
    { ...traceable, evidence: [] },
    { ...traceable, source: "  " },
    { ...traceable, createdAt: "" },
  ]) {
    assert.equal(producedDecisionIsTraceable(bad), false);
    const r = producedToLineage(bad);
    assert.ok(isUnavailable(r as never), "不可追溯必须显式 unavailable（ADR-0049：缺件不静默）");
  }
  console.log("✔ ⑩ lineage：只搬运不补写；不可追溯显式 unavailable");
}

// ⑪ **端到端**：`produced` → lineage 必须能过**真实**的 `core/lineage-validator.ts` 投影门
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
  const verdict = validateAtomProjection({ type: "decision", lineage: lineage as never });
  assert.equal(verdict.allowed, true, `produced 决策必须能进 context，实得：${verdict.reason}`);

  // **反证**（否则上一条可能是恒真的假绿）：无 evidence 的 decision 必须被**下游**挡下
  const naked = validateAtomProjection({
    type: "decision",
    lineage: { ...(lineage as object), evidence: [] } as never,
  });
  assert.equal(naked.allowed, false, "反证：无 evidence 的 decision 必须被下游挡下");
  console.log("✔ ⑪ 端到端：过**真实**投影门（正例）+ 无证据被下游挡下（反证）");
}

// ⑫ **T19 闸门**：本层**不允许**出现概率型后端（`adr/0096` §12 / `BACKLOG` T19）
//
// ⚠ 若你正为此处的**变红**而改这一块：**先读 `adr/0096` §12 与 `BACKLOG.md` 的 T19**。
//   那道门问的不是「代码能不能跑」，而是「把模型自报的置信度当决策依据，`adr/0037` 划的界还成不成立」。
//   **不许为了让测试变绿而改断言** —— 那正是本仓说的「改门而不改事实」。
{
  const sample = input({ context: { prefer: "read_shadow" } });
  for (const e of ENGINES) {
    const r = e.decide(sample);
    assert.ok(
      isUnavailable(r as never) || (r as { reportedDistribution: unknown }).reportedDistribution === null,
      `T19 闸门：引擎 ${e.name} 报了分布 —— 引入概率型后端前先另立 ADR（adr/0096 §12 / BACKLOG T19），并同步改本断言`,
    );
  }
  console.log(`✔ ⑫ T19 闸门：${ENGINES.length} 个后端**都不报分布**（概率后端必须另立 ADR）`);
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · **没有生产消费者**：本层尚未被任何读路径 / 工具接线（ADR-0096 §7 的决定）⇒ 它目前只被本测试消费；");
console.log("  · **没有落盘**：⑪ 证明了产出的 `AtomLineage` 能过**真实**投影门，但**写原子**仍由既有 persistence 负责（T1 不碰）；");
console.log("  · **没有概率型后端**：`reportedDistribution` 的三条判据由本测试的样板声明覆盖，而 T1 的唯一引擎报 `null`");
console.log("    ⇒ 真实概率生产者要等 llm / jev 后端，且**必须先过 ⑫ 那道 T19 闸门**（另立 ADR）；");
console.log("  · 未实测「引擎自报的概率是否校准」—— 本层**不**做校准、不做阈值（ADR-0096 §3/§4），故无处可测。");
console.log("ALL PASS ✅");
