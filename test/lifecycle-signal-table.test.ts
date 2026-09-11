// dsh-shadow —— core/lifecycle.ts 的**状态机信号表棘轮**（吸收 hl_mem 的 `assert_transition()`；ADR-0077，v1.15.38）
//
// 要防的不是「非法迁移」（这里没有可写坏的持久状态），而是
// **状态机悄悄长出一条生产上不可达的分支**：`lifecycleOf` 读了某个 `rec.<字段>`，
// 而没有任何生产代码写得出来那个触发值 ⇒ 这个状态只活在测试夹具里，读代码的人却以为生产会走到。
// 本仓库已经**四次**踩过同一族缺陷（ADR-0063 / D5 / ADR-0070 T5 / 0062 盲区），共同形态都是
// 「机制对了，断的是谁调用它 / 谁传参 / 谁读它」。散文注释不会在漂移时报警，所以这里把它变成机器可核的声明。
//
// 判据复用：`hasProducer` 来自 `tools/audit-wiring.lib.ts`（**已标定**：它先把比较表达式整段删掉，
// 否则 `if (r.phase === "ghost")` 这类**读点会冒充写入点**）。不另写一份值-写入判据（ADR-0063 的教训）。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { lifecycleOf } from "../dist/core/lifecycle.js";
import { hasProducer, stripComments } from "../tools/audit-wiring.lib.ts";

// ── 声明表：本状态机的**信号表**与**状态表**（吸收 hl_mem 的 `assert_transition()`；ADR-0077）──────
//
// hl_mem 的形态是「迁移只在一处声明 + 断言迁移合法」。本仓库对应的**真实**风险不同：
// 这里没有可写坏的持久状态，风险是**状态机悄悄长出一条生产上不可达的分支**——
// `lifecycleOf` 读了某个 `rec.<字段>`，而**没有任何生产代码写过那个触发值**，
// 于是这个状态只活在测试夹具里，读代码的人却以为生产会走到它。
// （`core/lifecycle.ts` 的注释早已用散文写过这件事；散文不会在漂移时报警，这里把它变成机器可核的声明。）
//
// **为什么这张表刻意不在 `core/lifecycle.ts` 里**（本轮自曝，且是审计工具自检抓出来的）：
//   表必须同时写出**字段名**与**触发值**，而 `hasProducer` 是**文本**判据 ——
//   两者**同一行共现**就会被当成「写入者」⇒ 审计工具**丢掉了 `status=superseded` 这个真线索**
//   （`tools/audit-wiring.selftest.ts` ⑨ 之前那组断言立刻变红）。
//   ⇒ 声明属**测试断言**（它唯一的消费方就是本文件），放测试面既保留全部强制力
//   （棘轮扫的是**生产源码**），又不污染生产判据。
//
// 每个信号必须回答一个问题：**触发它的那个值，生产代码能不能写出来？**
//   `derived`  —— 能：生产里有写入者/调用点。
//   `external` —— 不能：只有外部人工或测试夹具能置位；`why` 必须写明为什么保留它。
const SIGNALS: { key: string; field: string; literal?: string; boolTrue?: boolean; producer: "derived" | "external"; why: string }[] = [
  { key: "pinned", field: "pinned", boolTrue: true, producer: "external", why: "生产只写 pinned:false（core/memory.ts:75、core/writer-materialize.ts:125），**真值无写入者**；保留为外部人工信任标记，优先级最高的外部权威状态" },
  { key: "statusArchived", field: "status", literal: "archived", producer: "external", why: "生产只写 status:\"active\"/\"compacted\"，**archived 无写入者**；保留为外部人工归档" },
  { key: "statusSuperseded", field: "status", literal: "superseded", producer: "external", why: "取代是「相对当前可见记忆集」的读时判断，持久化会随可见集失效；只有外部/夹具置位" },
  { key: "confirmedBy", field: "confirmedBy", producer: "derived", why: "query/query.ts:418 按 observer 回填（保留最后 10 个）" },
  { key: "hits", field: "hits", producer: "derived", why: "query/query.ts:414 `rec.hits = (rec.hits||0)+1` 累加" },
  { key: "superseded", field: "", producer: "derived", why: "**参数**信号，生产者是调用点 query/query.ts:299（`verdictOf` 的读时裁决）" },
  { key: "conflictCount", field: "", producer: "derived", why: "**参数**信号，生产者是调用点 query/query.ts:299（证据路径缺失计数）" },
  { key: "stale", field: "", producer: "derived", why: "**参数**信号，生产者是调用点 query/query.ts:299（年龄/热度判据）" },
];

/** `lifecycleOf` 可能返回的状态全集 + 可达性分类（`externalOnly` = 只有外部权威能给，不靠派生信号）。 */
const STATES: { state: string; reach: "derived" | "externalOnly"; via: string }[] = [
  { state: "TRUSTED", reach: "derived", via: "pinned（外部）**或** confirms>=2（派生）" },
  { state: "ARCHIVED", reach: "externalOnly", via: 'status==="archived"' },
  { state: "SUPERSEDED", reach: "derived", via: 'status==="superseded"（外部）或 superseded 参数（派生）' },
  { state: "STALE", reach: "derived", via: "conflictCount>0" },
  { state: "DECAYING", reach: "derived", via: "stale" },
  { state: "VERIFIED", reach: "derived", via: "confirms>=1" },
  { state: "OBSERVED", reach: "derived", via: "hits>0" },
  { state: "NEW", reach: "derived", via: "全部信号缺省（兜底）" },
];

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

/** 生产源码 = 排除编译产物 / 测试面 / 工具面（与 audit-drift 的 EXCLUDE 同口径）。 */
const isProductionPath = (rel: string): boolean =>
  !rel.split("/").some((s) => ["node_modules", "dist", "test", "tests", "fixtures", "__tests__", "tools"].includes(s));

const walk = (d: string, out: string[] = []): string[] => {
  let es: any[];
  try { es = readdirSync(d, { withFileTypes: true }); } catch { return out; }
  for (const e of es) {
    const p = join(d, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith(".ts")) out.push(p);
  }
  return out;
};

const prodAll = walk(repoRoot)
  .map((f) => f.slice(repoRoot.length + 1).replace(/\\/g, "/"))
  .filter(isProductionPath)
  .map((rel) => ({ file: rel, text: readFileSync(join(repoRoot, rel), "utf8") }));

// 生产源码全量扫描 —— 表本身已在**测试面**（见上方说明），故这里**无需**排除任何生产文件。
//   （历史：表曾在 `core/lifecycle.ts`，为此必须排除该文件；移出后排除与其正控一并删掉，
//    留下的是更干净的判据：生产面就是生产面。）
const prod = prodAll;

const lifecycleSrc = readFileSync(join(repoRoot, "core/lifecycle.ts"), "utf8");
const lcLines = stripComments(lifecycleSrc).split(/\r?\n/);
const fnStart = lcLines.findIndex((l) => l.includes("export const lifecycleOf"));
assert.ok(fnStart >= 0, "应能在 core/lifecycle.ts 里定位 lifecycleOf");
const fnEnd = lcLines.findIndex((l, i) => i > fnStart && /^\};?\s*$/.test(l));
assert.ok(fnEnd > fnStart, "应能定位 lifecycleOf 的函数体结尾");
const fnBody = lcLines.slice(fnStart, fnEnd + 1).join("\n");

/** 生产里对 `<obj>.<field> = <非 =>` 的赋值点（**窄**判据：读表达式如 `rec ? rec.hits : 0` 不匹配）。 */
const assignSites = (files: { file: string; text: string }[], field: string): string[] => {
  const re = new RegExp(`\\.${field}\\s*=[^=]`);
  const hits: string[] = [];
  for (const { file, text } of files) {
    stripComments(text).split(/\r?\n/).forEach((line, i) => { if (re.test(line)) hits.push(`${file}:${i + 1}`); });
  }
  return hits;
};

/** 生产里把某布尔字段写成 `true` 的点（`pinned` 这类**布尔真值**信号的写入判据；`hasProducer` 只认字符串字面量）。 */
const boolTrueSites = (files: { file: string; text: string }[], field: string): string[] => {
  const re = new RegExp(`\\b${field}\\s*[:=]\\s*true\\b`);
  const hits: string[] = [];
  for (const { file, text } of files) {
    stripComments(text).split(/\r?\n/).forEach((line, i) => { if (re.test(line)) hits.push(`${file}:${i + 1}`); });
  }
  return hits;
};

// ─────────────────────────────────────────────
// ① 覆盖：`lifecycleOf` 读的每个 `rec.<字段>` 都必须在信号表里被分类（新增未分类读 ⇒ 红）
// ─────────────────────────────────────────────
{
  const read = [...new Set([...fnBody.matchAll(/rec\??\.(\w+)/g)].map((m) => m[1]))].sort();
  const declared = SIGNALS.filter((s) => s.field).map((s) => s.field);
  const declaredUniq = [...new Set(declared)].sort();
  assert.deepEqual(read, declaredUniq, "lifecycleOf 读取的 rec 字段集必须与信号表声明的字段集**完全一致**（双向，不只 ⊆）");
  assert.ok(read.length >= 4, `应至少读到 4 个字段，实际 ${read.length}`);
  console.log(`✔ ① 覆盖：lifecycleOf 读的 rec 字段 [${read.join(", ")}] 与信号表声明一致（${SIGNALS.length} 个信号）`);
}

// ─────────────────────────────────────────────
// ② 外部权威信号：**生产里写不出触发值**（否则「external」这个分类就是假的）
// ─────────────────────────────────────────────
{
  for (const s of SIGNALS.filter((x) => x.producer === "external")) {
    const sites = s.boolTrue ? boolTrueSites(prod, s.field) : hasProducer(prod, s.field, s.literal!);
    assert.equal(sites.length, 0, `${s.key} 声明为 external，但生产里存在触发值写入者：${sites.join(", ")}`);
    assert.ok(s.why && s.why.length > 10, `${s.key} 必须写明为什么保留这个无写入者的信号`);
  }
  // 正控：同一批判据喂进**写了触发值的假文件**必须报警 —— 否则上面的 0 可能只是判据坏了。
  const fakeArchived = [{ file: "fake.ts", text: 'meta[rel] = { status: "archived", pinned: false };' }];
  assert.equal(hasProducer(fakeArchived, "status", "archived").length, 1, "正控：真写入者必须被 hasProducer 检出");
  const fakePinned = [{ file: "fake.ts", text: "meta[rel] = { pinned: true };" }];
  assert.equal(boolTrueSites(fakePinned, "pinned").length, 1, "正控：`pinned: true` 必须被检出");
  // **判据自曝正控**（本轮真踩过）：把「表 + 生产」混在一起喂给 `hasProducer`，它**必然**误报——
  //   因为表里 `field` 与 `literal` 同行共现。这正是「表不能放在生产面」的原因，也证明
  //   `tools/audit-wiring.selftest.ts` 变红**不是测试坏了**，而是表放错了位置。
  const tableInProd = [...prod, { file: "core/lifecycle.ts", text: 'const S = [{ field: "status", literal: "archived" }];' }];
  assert.ok(hasProducer(tableInProd, "status", "archived").length > 0, "正控：声明表放进生产面时 `hasProducer` 确会误报（这就是必须放测试面的理由）");
  console.log(`✔ ② 外部权威信号 ${SIGNALS.filter((x) => x.producer === "external").length} 个：生产零写入者 + 判据正控 + 「表放生产面必然误报」自曝正控`);
}

// ─────────────────────────────────────────────
// ③ 派生信号：生产里**确有**写入者/调用点（否则这个状态在生产中不可达）
// ─────────────────────────────────────────────
{
  for (const s of SIGNALS.filter((x) => x.producer === "derived" && x.field)) {
    const sites = assignSites(prod, s.field);
    assert.ok(sites.length > 0, `${s.key} 声明为 derived，但生产里找不到 \`.<field> =\` 写入点`);
  }
  const fake = [{ file: "fake.ts", text: "rec.hits = (rec.hits || 0) + 1;" }];
  assert.equal(assignSites(fake, "hits").length, 1, "正控：真赋值点必须被检出");
  assert.equal(assignSites([{ file: "fake.ts", text: "const h = rec ? rec.hits : 0;" }], "hits").length, 0, "正控：**读**表达式不得被当成赋值点");
  // 参数信号的生产者是调用点：`query/query.ts` 必须真的把 `v.superseded` 传进 lifecycleOf。
  const q = prod.find((f) => f.file === "query/query.ts");
  assert.ok(q, "应存在 query/query.ts");
  assert.ok(/lifecycleOf\([^;]*v\.superseded/.test(stripComments(q.text)), "query/query.ts 必须把读时裁决 v.superseded 传给 lifecycleOf（参数信号的生产者）");
  console.log("✔ ③ 派生信号：字段信号有真赋值点（含读/写正控），参数信号有调用点接线");
}

// ─────────────────────────────────────────────
// ④ 状态表：声明集与实现**互满**，且每个状态都有可达性正控（表说可达就必须真能到达）
// ─────────────────────────────────────────────
{
  const returned = [...new Set([...fnBody.matchAll(/\breturn\s+"(\w+)"/g)].map((m) => m[1]))].sort();
  const declaredStates = STATES.map((s) => s.state).sort();
  assert.deepEqual(returned, declaredStates, "lifecycleOf 的 return 字面量集必须与状态表**完全一致**");
  const PRODUCE: Record<string, any[]> = {
    TRUSTED: [{ pinned: true }, 0, 0, false],
    ARCHIVED: [{ status: "archived" }, 0, 0, false],
    SUPERSEDED: [{}, 0, 0, false, true],
    STALE: [{}, 0, 1, false],
    DECAYING: [{}, 0, 0, true],
    VERIFIED: [{ confirmedBy: ["s1"] }, 0, 0, false],
    OBSERVED: [{ hits: 1 }, 0, 0, false],
    NEW: [{}, 0, 0, false],
  };
  assert.deepEqual(Object.keys(PRODUCE).sort(), declaredStates, "可达性正控集合与状态表必须一一对应（多一个 = 状态表漏声明）");
  for (const s of STATES) {
    assert.equal(lifecycleOf(...PRODUCE[s.state]), s.state, `状态 ${s.state} 声明为可达，但正控产不出来（via: ${s.via}）`);
  }
  // 行为侧正控：状态字符串必须在既有行为测试里逐条被断言过（表与行为测试互证）。
  const beh = readFileSync(join(repoRoot, "test/lifecycle-superseded.test.ts"), "utf8");
  for (const s of STATES) assert.ok(beh.includes(`"${s.state}"`), `状态 ${s.state} 在 test/lifecycle-superseded.test.ts 里没有逐条断言`);
  console.log(`✔ ④ 状态表 ${STATES.length} 个状态：与实现互满 + 每个都可产出 + 行为测试逐条覆盖`);
}

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · `producer` 的『参数信号由 query/query.ts:299 生产』只核到**那行确实传了** `v.superseded`；" +
  "`verdictOf` 的裁决语义正确性由 `observer/arbitrate.ts` 自己的测试负责，不在本表范围内；");
console.log("  · 只核本仓库源码。别的会话/外部工具直接改 `_meta.json` 塞入 `pinned: true` 这类运行时事实**扫不到**" +
  "（⇒ 表说的是「本仓库生产代码写不出」，不是「运行时永不会出现」）；");
console.log("  · `lifecycleOf` 内部的**优先级顺序**没有被这张表表达 —— 顺序仍是代码事实，" +
  "表只表达「信号是否可达、状态是否可产出」。");
console.log("ALL PASS ✅");
