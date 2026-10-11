// dsh-shadow —— `G1`：收口（`compact`）**触发链不含模型判定**的守卫（判据源：`adr/0113` §1.4 / §1.5 / §6）。
//
// ## 守的是什么（为什么需要它）
// `adr/0038` §6 标题即结论：「**方向 A（写侧按 episode 成文件）不做**」，理由②③是
// 「**任务边界无法由 agent 自决**」与「**Agent 无法知道任务何时结束**」。材料的 steward 恰恰
// **用一次模型调用**判「到点 / 在途」（`DeepSeek-Bot@41710f6a` 的 `ds-bot/src/host/steward.js` 的
// `STEWARD_SYSTEM`）⇒ 把它接进本仓的触发条件就是**让模型判任务边界**，**直接撞 §6 理由②③**。
// `adr/0113` §1 判：判据可以吸收，**机制层不吸收**；运行时**唯一决定者**是 `core/writer/compact.ts` 的
// `maybeCompact`（由 `flush` 调用），条件只有「开关 + 客观时间间隔」。本文件把那句话变成**能红的三道门**。
//
// ## 三道门
//   门1（复用既有门）：`core/writer/render.ts` **零 import**，且已登记进 `tools/audit-layers.lib.ts` 的
//     `PURE_MODULES` ⇒ `npm run audit:layers` 的 ② 会替我们守住「保持零依赖」。本块断言这两条前提成立：
//     **登记被摘掉 ⇒ 本块红**（那正是「门被从 verify 里摘掉」这一形态，本仓记过同族代价）。
//   门2（源码级棘轮）：收口触发链的两个模块（`compact.ts` + `render.ts`）里**不得出现模型符号**，
//     并带**负对照标定**：含模型调用的夹具必须报红，**把真实源码改坏一处也必须报红** ⇒ 证明不是恒绿。
//   门3（条件断言）：`maybeCompact` / `runCompact` 的 `if` 条件**只能是**白名单里那几条（开关 + 客观时间量
//     + 数据非空 / 是否要留痕）；出现**任何**新条件 ⇒ 红，逼一次显式复核 —— 包括 `if (judge(ctx))`
//     这类**换个写法就绕过门2**的判据。
//
// ## ⚠ 能力边界（照 `adr/0113` §1.4 抄准，**不许**含糊）
//   · **零 import ≠ 零副作用**：门1 走的 `auditLayers` ② 只判「**有没有 import**」（判据在
//     `tools/audit-layers.lib.ts` 的白名单分支）⇒ 它挡的是「引入模型 / IO 模块」这条**现实路径**，
//     挡不住**不靠 import** 的 `fetch` / 全局量 / `process`。门1 是「抬高代价」，**不证明**结构上不可能。
//   · **正则棘轮换写法会漏**：门2 只认符号名。间接取句柄、把调用藏在被 import 的**别处**模块、
//     或给函数起一个不含模型词的别名（`judge()`）都**不会**被门2 抓到。
//   · **`CompactDeps.core` 是 `any`**（`core/writer/compact.ts` 的 `CompactDeps`）⇒ 门3 的签名断言
//     **今天就绕得过去**：`core` 本身能挂任何东西。门3 挡的是「显式加一个模型参数 / 显式加一条模型条件」。
//   · 本文件的 `ifConditions` **不是解析器**：按**括号配平**取条件串，不认字符串 / 正则字面量里的括号。
//   · 门2 复用 `tools/audit-wiring.lib.ts` 的 `stripComments`：**注释不算命中** —— 否则 `render.ts`
//     文件头那句「无 LLM」会自我误伤（这条边界由本文件的标定块钉住）。
//   · **门覆盖的是「触发链」而不是整个 `core/writer/`**：`materialize.ts` / `core.ts` / `index.ts` /
//     `llm.ts` 确实调 LLM（摘要 / 召回排序），那是**另一个面**、不在 `maybeCompact` 的链上 ⇒ 不进门。
//   · 门在 `verify` 里**自动跑**（`test/*.test.ts` 由 `test:all` 执行）；为此**不改** `package.json`
//     的 verify 链（那会牵动 `audit:docs` ② 的双向点名，属另一件事）。
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { PURE_MODULES } from "../tools/audit-layers.lib.ts";
import { stripComments } from "../tools/audit-wiring.lib.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const readSrc = (rel: string): string => readFileSync(join(ROOT, rel), "utf8");

/** 收口触发链的两个模块：`maybeCompact` → `runCompact` → `consolidateText`（`render.ts`）。 */
const CHAIN = ["core/writer/compact.ts", "core/writer/render.ts"];

// ── 门2 的检查器（纯函数：真实源码与夹具走**同一份**判据）──────────────────────────────
const MODEL_TOKENS = ["streamText", "askModel", "summarize", "llm", "model"];
const modelHits = (src: string): { token: string; line: number }[] => {
  const masked = stripComments(src);   // 注释不算：否则「无 LLM」这类说明文字会自我误伤
  const out: { token: string; line: number }[] = [];
  for (const token of MODEL_TOKENS) {
    const re = new RegExp(`\\b${token}\\b`, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(masked)) !== null) out.push({ token, line: masked.slice(0, m.index).split("\n").length });
  }
  return out;
};

// ── 门3 的检查器（纯函数；边界见文件头：不是解析器）────────────────────────────────────
/** 取一段函数体里 `if (<cond>)` 的条件串（**括号配平**，故 `!onByDefault(...)` 这种嵌套也能取全）。 */
const ifConditions = (body: string): string[] => {
  const out: string[] = [];
  const re = /\bif\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(body)) !== null) {
    let depth = 1;
    let i = re.lastIndex;
    for (; i < body.length && depth > 0; i += 1) {
      if (body[i] === "(") depth += 1;
      else if (body[i] === ")") depth -= 1;
    }
    out.push(body.slice(re.lastIndex, i - 1).replace(/\s+/g, " ").trim());
  }
  return out;
};

/** 取 `export const <name> = async ...` 到**列首** `};` 的函数体（本仓该形态唯一，够用）。 */
const bodyOf = (src: string, name: string): string => {
  const start = src.indexOf(`export const ${name} = async`);
  assert.ok(start >= 0, `找不到 ${name} 的导出 —— 改名会让本门失效，必须同步更新本文件`);
  const end = src.indexOf("\n};", start);
  assert.ok(end > start, `找不到 ${name} 的函数体结尾（列首「};」）`);
  return src.slice(start, end + 3);
};

// ── 门1：render.ts 零 import + 已登记（登记缺失 = 门被摘掉）────────────────────────────
{
  const renderSrc = readSrc("core/writer/render.ts");
  const imports = renderSrc.match(/^\s*import\s/gm) || [];
  assert.equal(imports.length, 0, `render.ts 必须零 import（PURE_MODULES 的前提），实际 ${imports.length} 条`);
  assert.ok(PURE_MODULES.includes("core/writer/render.ts"),
    "render.ts 必须登记进 tools/audit-layers.lib.ts 的 PURE_MODULES —— 白名单制下漏登 = 它悄悄长出 import 也没人报");
  assert.deepEqual(modelHits(renderSrc), [], "render.ts 里不得出现模型符号（与门2 同款判据）");
  console.log("✔ 门1：render.ts 零 import 且已登记进 PURE_MODULES（audit:layers ② 守「保持零依赖」）");
}

// ── 门2：收口链源码级棘轮（不含模型 / LLM 调用）+ 负对照标定 ─────────────────────────────
{
  for (const rel of CHAIN) {
    const hits = modelHits(readSrc(rel));
    assert.deepEqual(hits, [], `${rel} 属收口触发链 ⇒ 不得出现模型/LLM 符号；命中 ${JSON.stringify(hits)}`);
  }

  // 标定①：夹具（含模型调用）必须红 —— 检查器不是恒绿
  const fixture = 'export const f = async (ctx) => { const t = await streamText({ model: llm("m") }); summarize(t); };\n';
  const fh = modelHits(fixture);
  assert.ok(new Set(fh.map((h) => h.token)).size >= 3, `含模型调用的夹具必须被点名 >=3 个符号；实际 ${JSON.stringify(fh)}`);

  // 标定②：把**真实源码**改坏一处 ⇒ 必须红（同一份判据、同一份文本，不是另一套逻辑）
  const broken = readSrc("core/writer/compact.ts").replace("export const maybeCompact",
    "const llm = null;   // 注入：模拟「收口链引入模型句柄」\n\nexport const maybeCompact");
  assert.ok(modelHits(broken).some((h) => h.token === "llm"),
    "真实源码注入一处模型符号后必须报红（否则门是恒绿的）");

  // 标定③（精度）：注释里的符号名不算命中
  assert.deepEqual(modelHits("// streamText(x)\n/* llm · model */\n"), [], "注释里的符号名不算命中（先剥注释）");
  console.log("✔ 门2：收口链（compact.ts + render.ts）无模型符号；夹具与真实源码各注入一处 ⇒ 检查器都报红");
}

// ── 门3：触发条件断言（只有开关 + 客观时间量 + 数据非空；任何新条件 ⇒ 红）─────────────────
{
  const masked = stripComments(readSrc("core/writer/compact.ts"));
  const rc = bodyOf(masked, "runCompact");
  const mc = bodyOf(masked, "maybeCompact");

  // 触发链的判据面（符号级，不引行号）
  assert.ok(mc.includes("!onByDefault(core.compactCfg.enabled)"), "maybeCompact 的唯一开关必须是 compactCfg.enabled");
  assert.ok(mc.includes("runCompact(deps, fs, ws, cacheFor(ws))"), "maybeCompact 认完开关后应直接交给 runCompact（中间不得插判定）");
  assert.ok(rc.includes("numOr(core.compactCfg.gapMinutes, core.episodeGap)"), "时间量必须只来自 compactCfg.gapMinutes / episodeGap（客观量）");
  assert.ok(rc.includes("deriveEpisodes(parsed, { gapMinutes: gap })"), "episode 切分必须只按 gapMinutes");
  assert.ok(rc.includes("eps.slice(0, -1)"), "只能收口**已关闭**的 episode（当前打开的那个不收）");

  // 签名：今天三个参数，不得接收模型 / LLM 句柄（⚠ `CompactDeps.core` 是 any ⇒ 只挡「显式传句柄」）
  const sig = mc.slice(0, mc.indexOf("=>")).replace(/\s+/g, " ");
  const params = sig.slice(sig.indexOf("(") + 1, sig.indexOf(")")).split(",").map((p) => p.trim().split(":")[0].trim());
  assert.deepEqual(params, ["deps", "fs", "ws"], `maybeCompact 的参数名称必须恰为 (deps, fs, ws)；实际 ${JSON.stringify(params)}`);
  assert.deepEqual(modelHits(sig), [], `maybeCompact 的签名里不得出现模型符号；实际 ${sig}`);

  // 条件白名单：开关 + 客观时间量 + 「数据非空 / 是否要留痕」这类守卫（`adr/0113` §1.4 门3）
  const ALLOWED = [
    "!onByDefault(core.compactCfg.enabled)",
    "!parsed.length",
    "eps.length <= 1",
    "!atoms.length",
    "prev",
    "marks.length",
    "notice",
  ];
  const conds = [...ifConditions(rc), ...ifConditions(mc)];
  // 不恒绿：抽取器坏掉会返回 []，那时「未知条件为空」是**假绿** ⇒ 先钉住条数与关键项
  assert.ok(conds.length >= 8, `条件抽取器应至少取到 8 条 if（runCompact 7 + maybeCompact 1）；实际 ${conds.length}：${JSON.stringify(conds)}`);
  assert.ok(conds.includes("!onByDefault(core.compactCfg.enabled)") && conds.includes("eps.length <= 1"),
    `关键触发条件必须被抽到（否则本门在看空气）；实际 ${JSON.stringify(conds)}`);
  const unknown = conds.filter((c) => !ALLOWED.includes(c));
  assert.deepEqual(unknown, [],
    `收口链出现白名单外的条件 ⇒ 必须显式复核它是否引入模型判定 / 自决任务边界（adr/0038 §6 理由②③）；未知条件 ${JSON.stringify(unknown)}`);

  // 标定：往**真实** runCompact 文本里注入一条「模型判任务边界」的条件 ⇒ 必须恰好报出它
  const broken = rc.replace("const gap = numOr(", "if (modelJudgesBoundary(ctx)) return;   // 注入\n  const gap = numOr(");
  const injected = ifConditions(broken).filter((c) => !ALLOWED.includes(c));
  assert.deepEqual(injected, ["modelJudgesBoundary(ctx)"], `注入模型条件后必须恰好报出它；实际 ${JSON.stringify(injected)}`);
  console.log("✔ 门3：触发条件只有 enabled + 客观时间量（gap）+ 数据非空；注入一条模型判定条件 ⇒ 报未知（能红）");
}

console.log("ALL PASS ✅");
