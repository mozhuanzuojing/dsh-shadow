// dsh-shadow —— v1.12.6/1.12.7 回归（mock host，驱动真实插件代码）：
//   ① mode 描述下沉：工具 schema 变短 + 指针；CONTEXT.md「mode 参考」表覆盖源码里的**全部 62 个** mode（棘轮）。
//   ② 召回信封：截断自报家门（总数 = 命中 − 返回，冷却也算在内）+ 空命中给可执行下一步与近似候选（标「未验证」）。
//   ③ deprioritize：只降权、不移除（被降权的树仍可搜到，只是排名靠后，且 debug 能解释）。
//   ④ v1.12.7 修复：scrubFinal 不再把整篇读侧输出压成一行（保留 \t\n\r）。
//   ⑥ 无参读索引的**预算**（v1.15.85）：入口路径不得把整篇 `_index.md` 塞回来（真 `.shadow` 实测 2199 KB / 24628 行）。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as mod from "../dist/index.js";
import { deprioritizeFactor, DEPRIORITIZE_FACTOR, approxEntries } from "../dist/retrieval/rank.js";
import { truncationNote, renderIndexBudgeted } from "../dist/retrieval/render.js";
import { NEVER_WORSE_UNIT } from "../dist/retrieval/loss.js";
import { intentOf } from "../dist/core/admission/intent.js";
import { today } from "../dist/core/util.js";   // fixture 日期必须**相对今天**（v1.15.38 约定，见下方 seeds 注释）

const { apply, name, inject } = mod;
const WS = "D:/ws";
const repoRoot = new URL("../", import.meta.url);   // 仓库根（cwd 无关）
const queryDir = new URL("query/", repoRoot);

// ── mock host 工厂：每个用例一套独立 fs/tools，互不串线 ──
const makeHost = (config: any, seeds: { rel: string; text: string }[] = []) => {
  const files = new Map<string, string>();
  for (const s of seeds) files.set(s.rel, s.text);
  const fs = {
    async resolve(path: string) { return { targetKey: path, displayPath: path }; },
    async readText(target: any) { const v = files.get(target.displayPath); return v === undefined ? "" : v; },
    async writeText(target: any, content: string) { files.set(target.displayPath, content); return { version: "v1" }; },
    async listDir(target: any) {
      const base = String(target.displayPath).replace(/\\/g, "/").replace(/\/+$/, "");
      const prefix = base + "/";
      const names = new Set<string>();
      for (const k of files.keys()) {
        const nk = k.replace(/\\/g, "/");
        if (!nk.startsWith(prefix)) continue;
        const first = nk.slice(prefix.length).split("/")[0];
        if (first !== "_index.md") names.add(first);
      }
      return [...names].map((n) => ({ name: n }));
    },
  };
  const agentsById = new Map<string, any>();
  const A = { id: "A", session: { header: { cwd: WS } } };
  agentsById.set("A", A);
  const registry = new Map<string, any>();
  const services: any = {
    fs,
    agents: { currentInitiator: () => null, get: (id: string) => agentsById.get(id) },
    systemPrompt: { context: () => {} },
    tools: { register: (def: any) => registry.set(def.name, def) },
    llm: undefined,
    agentDefaultModel: undefined,
  };
  const ctx: any = {
    get: (k: string) => services[k],
    on: () => () => {},
    inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
  };
  apply(ctx, config);
  return {
    files,
    tool: registry.get("read_shadow"),
    read: (args: any) => registry.get("read_shadow").execute(args, { agent: A }),
  };
};

const memText = (entry: string, line: string) =>
  `# ${entry}\n\n> 完整线索\n> 概况：0 动作 · 1 用户消息 · 0 决策\n\n- [10:00:00] [${entry}] ${line}\n`;
const mem = (date: string, time: string, slug: string) => `${WS}/.shadow/${date}/${date}--${time}-${slug}.md`;

// ⚠ **日期必须相对今天，不能硬编码**（`recall-attribution.test.ts` 里 v1.15.38 立下的**同一条**约定）：
//   `forget` 缺省=开、`staleDays` 默认 14 ⇒ 写死的日期一旦变旧到 14 天，三条种子会被遗忘判据**全部**滤掉，
//   ② 段当场红成「无匹配」。v1.15.97 实测：种子原为 `2026-09-04/05/06`，本地日期滚到 2026-09-20 起红
//   （v1.15.96 发版当天 age=10/11/12 仍是绿的 ⇒ 这是一颗**到期才引爆**的雷，不是代码回归）。
//   相对顺序必须保留：`alpha-ref`（1 天前，最新）> `alpha-src`（2 天前）> `alpha-util`（3 天前）—— ③ 段按日期断言排序。
const seeds = [
  { rel: mem(today(2), "100000", "alpha-src"), text: memText("src/alpha.ts", "一手代码 alpha 实现") },
  { rel: mem(today(1), "100000", "alpha-ref"), text: memText("references-agents/alpha.md", "通用命名 alpha 说明") },
  { rel: mem(today(3), "100000", "alpha-util"), text: memText("src/alpha-util.ts", "alpha 工具函数") },
];
const baseCfg = { summary: { enabled: false }, recall: {} };

// ─────────────────────────────────────────────
// ① mode 描述下沉
// ─────────────────────────────────────────────
const host = makeHost(baseCfg, seeds);
const modeDesc = String(host.tool.parameters.properties.mode.description || "");
assert.ok(modeDesc.length > 0, "mode 参数仍在");
assert.ok(modeDesc.length < 600, `mode 描述应下沉到 <600 字符，实际 ${modeDesc.length}`);
assert.ok(modeDesc.includes("CONTEXT.md「mode 参考」"), "mode 描述应带 CONTEXT.md 指针");
assert.ok(modeDesc.includes("episode") && modeDesc.includes("task"), "常用 mode 仍应在描述里");
assert.ok(modeDesc.includes("real-refer"), "家族清单应含 real-refer（reality* 通配不到它）");

// CONTEXT.md「mode 参考」表覆盖源码里的全部 mode（棘轮：新增 mode 不写文档就红）
let src = "";
for (const f of readdirSync(queryDir)) if (f.endsWith(".ts")) src += readFileSync(new URL(f, queryDir), "utf8");
const modes = new Set<string>();
const grab = (re: RegExp) => { for (const m of src.matchAll(re)) for (const q of m[1].matchAll(/"([a-z][a-z0-9-]*)"/g)) modes.add(q[1]); };
grab(/MODES\s*=\s*new Set\(\[([\s\S]*?)\]\)/g);
grab(/modes:\s*\[([\s\S]*?)\]/g);
for (const m of src.matchAll(/mode\s*[!=]==\s*"([a-z][a-z0-9-]*)"/g)) modes.add(m[1]);
// planning.ts 用 `String(args?.mode || "") !== "plan"` 这种写法，上面的正则抓不到
for (const m of src.matchAll(/mode\s*\|\|[^)]*\)\s*[!=]==\s*"([a-z][a-z0-9-]*)"/g)) modes.add(m[1]);
assert.equal(modes.size, 62, `源码声明的 mode 应正好 62 个，实际 ${modes.size}：缺 ${[...modes].length ? "" : ""}`);
const contextMd = readFileSync(new URL("CONTEXT.md", repoRoot), "utf8");
const tblStart = contextMd.indexOf("## mode 参考");
const tblEnd = contextMd.indexOf("## 关联", tblStart);
assert.ok(tblStart >= 0, "CONTEXT.md 应有「mode 参考」小节");
const modeTable = contextMd.slice(tblStart, tblEnd > tblStart ? tblEnd : undefined); // 只在表内找，避免正文别处蒙混
const missing = [...modes].filter((m) => !modeTable.includes(`\`${m}\``));
assert.equal(missing.length, 0, `CONTEXT.md「mode 参考」表缺少这些 mode：${missing.join(", ")}`);
console.log(`✔ ① mode 描述下沉：${modeDesc.length} 字符（原 1747）+ 指针；CONTEXT.md「mode 参考」表覆盖全部 ${modes.size} 个 mode`);

// ─────────────────────────────────────────────
// ② 召回信封：截断自报 + 空命中给下一步
// ─────────────────────────────────────────────
const rOne = await host.read({ topic: "alpha", limit: 1, max_tokens: 4096 });
assert.ok(!rOne.includes("无匹配"), "有命中时不应是无匹配");
assert.ok(rOne.includes("> 未返回的命中："), `limit 截断应自报家门：\n${rOne}`);
assert.ok(rOne.includes("limit=1 上限 2 条"), "截断原因应写清是 limit 并给条数");
assert.ok(rOne.includes("\n> 未返回的命中："), "信封应自成一行的引用块（换行不被压掉）");
assert.ok(rOne.includes("\n"), "读侧输出应保留换行（v1.12.7 修复：scrubFinal 不再压成一行）");
assert.ok(rOne.includes("> 下一步："), "截断应给下一步");
assert.ok(rOne.includes("> 未返回示例："), "截断应列未返回示例");

const rAll = await host.read({ topic: "alpha", limit: 10, max_tokens: 4096 });
assert.ok(!rAll.includes("未返回的命中"), `全部返回时不出现截断披露：\n${rAll}`);

// 冷却必须计入总数（否则出现「未返回 0 条 / 却丢了 N 条」的自相矛盾）
const coolHost = makeHost({ summary: { enabled: false }, recall: { cooldownTurns: 5 } }, seeds);
await coolHost.read({ topic: "alpha", limit: 1, max_tokens: 4096 });
const c2 = await coolHost.read({ topic: "alpha", limit: 1, max_tokens: 4096 });
const cm = /未返回的命中：(\d+) 条（命中 (\d+) · 本次返回 (\d+)）/.exec(c2);
assert.ok(cm, `冷却场景也应有截断披露：\n${c2}`);
assert.equal(Number(cm![1]), Number(cm![2]) - Number(cm![3]), `未返回数必须 = 命中 − 返回：${cm![0]}`);
assert.ok(c2.includes("冷却"), `应说明冷却原因：${cm![0]}`);
assert.ok(c2.includes("等几回合再查") || c2.includes("调低"), "冷却为主因时下一步应指向冷却，而不是只叫提高 max_tokens");

// 全冷却 ≠ 没找到：给的是命中本身，不能标成「近似候选」
const coolAll = makeHost({ summary: { enabled: false }, recall: { cooldownTurns: 5 } }, seeds);
await coolAll.read({ topic: "alpha", limit: 10, max_tokens: 4096 });
const cAll = await coolAll.read({ topic: "alpha", limit: 10, max_tokens: 4096 });
assert.ok(cAll.includes("全部命中都在冷却中"), `全冷却应说清原因：\n${cAll}`);
assert.ok(cAll.includes("冷却中的命中（是命中，不是近似）"), "全冷却时不得把命中标成近似候选");
assert.ok(!cAll.includes("近似候选·未验证"), "全冷却时不出现「近似候选」标签");

// 预算截断（集成）：12 条长记忆 + 小预算
const longSeeds = Array.from({ length: 12 }, (_, i) => ({
  rel: mem(today((i % 8) + 1), `1000${String(i).padStart(2, "0")}`, `budget-${i}`),
  text: memText(`src/budget${i}.ts`, `alpha 填充 ${"内容".repeat(80)}`),
}));
const budgetHost = makeHost(baseCfg, longSeeds);
const rBudget = await budgetHost.read({ topic: "alpha", limit: 12, max_tokens: 256 });
assert.ok(rBudget.includes("预算 1024 字"), `预算截断应自报家门：\n${rBudget.slice(-260)}`);
const bm = /未返回的命中：(\d+) 条（命中 (\d+) · 本次返回 (\d+)）/.exec(rBudget);
assert.ok(bm, `预算截断也应有计数：${rBudget.slice(-260)}`);
assert.equal(Number(bm![1]), Number(bm![2]) - Number(bm![3]), "预算截断计数也要自洽");

// 纯函数分支（集成里难稳定触发的组合）
const tCool = truncationNote({ matched: 2, returned: 1, limit: 10, maxChars: 4000, droppedByLimit: 0, droppedByBudget: 0, droppedByCooldown: 1, dropped: [] });
assert.ok(tCool.includes("未返回的命中：1 条"), `冷却应计入总数：${tCool}`);
assert.ok(tCool.includes("冷却 1 条"), `冷却分解：${tCool}`);
assert.equal(truncationNote({ matched: 2, returned: 2, limit: 10, maxChars: 4000, droppedByLimit: 0, droppedByBudget: 0, droppedByCooldown: 0, dropped: [] }), "", "没丢东西就不加信封");

const rNone = await host.read({ topic: "alpa", max_tokens: 4096 }); // 词形相近但无命中
assert.ok(rNone.includes("无匹配"), "无匹配语义保留");
assert.ok(rNone.includes("> 下一步："), `空命中应给下一步：\n${rNone}`);
assert.ok(rNone.includes("近似候选·未验证"), `空命中应给近似候选并标注未验证：\n${rNone}`);
assert.ok(rNone.includes("alpha"), "近似候选应命中词形相近的入口");
assert.ok(!rNone.includes("可作指令"), "不得把无匹配说成可作指令");

// recall 恢复包的空分支也要给下一步
const rRec = await host.read({ mode: "recovery", topic: "完全不相干-zzz" });
assert.ok(rRec.includes("> 下一步："), `恢复包空命中应给下一步：\n${rRec}`);

// 近似候选：对称归一化 + hit≥2，单 bigram 噪声不得混入
assert.deepEqual(approxEntries("todo", ["todo", "src/todo.ts", "docs", "mode", "shadow"]), ["todo", "src/todo.ts"], "不应让 docs/mode/shadow 这类单 bigram 噪声进来");
assert.equal(approxEntries("alpa", ["src/alpha.ts"]).length, 1, "approxEntries 应给出近似入口");
assert.equal(approxEntries("完全无关主题xyz", ["src/alpha.ts"]).length, 0, "无相近入口时不给候选");
assert.equal(approxEntries("a", ["src/alpha.ts"]).length, 0, "单字符查询不给候选（2-gram 不足）");
console.log("✔ ② 召回信封：limit/预算/冷却截断自报且计数自洽 + 空命中给下一步与近似候选（标未验证）");

// ─────────────────────────────────────────────
// ③ deprioritize：只降权、不移除
// ─────────────────────────────────────────────
assert.equal(deprioritizeFactor(".shadow/2026-09-06/x.md", "references-agents/alpha.md", ["references-agents"]), DEPRIORITIZE_FACTOR, "命中降权子串");
assert.equal(deprioritizeFactor("D:\\ws\\_reports\\x.md", "src/alpha.ts", ["_reports"]), DEPRIORITIZE_FACTOR, "反斜杠路径也应归一匹配");
assert.equal(deprioritizeFactor(".shadow/2026-09-06/x.md", "references-agents/alpha.md", "references-agents"), DEPRIORITIZE_FACTOR, "字符串配置也应生效");
assert.equal(deprioritizeFactor(".shadow/2026-09-06/x.md", "src/alpha.ts", ["references-agents"]), 1, "未命中不降权");
assert.equal(deprioritizeFactor(".shadow/x.md", "src/alpha.ts", []), 1, "默认空=不降权");

const noDp = makeHost(baseCfg, seeds);
const withDp = makeHost({ summary: { enabled: false }, recall: { deprioritize: ["references-agents"] } }, seeds);
const rNo = await noDp.read({ topic: "alpha", max_tokens: 4096 });
const rDp = await withDp.read({ topic: "alpha", max_tokens: 4096 });
assert.ok(rNo.indexOf("references-agents/alpha.md") < rNo.indexOf("src/alpha.ts"), `不降权时新日期的 references-agents 在前：\n${rNo}`);
assert.ok(rDp.includes("references-agents/alpha.md"), "降权不等于移除（仍可搜到）");
assert.ok(rDp.indexOf("src/alpha.ts") < rDp.indexOf("references-agents/alpha.md"), `降权后一手代码应排前：\n${rDp}`);
const rDbg = await withDp.read({ topic: "alpha", debug: true, max_tokens: 4096 });
assert.ok(rDbg.includes("降权(deprioritize)"), `debug 应逐条解释降权原因：\n${rDbg}`);
assert.ok(rDbg.includes("降权·deprioritize"), "debug 应有降权汇总行");
console.log("✔ ③ deprioritize：只降权不移除（排序变化 + debug 可解释 + 默认空不生效 + 字符串容错）");

// ─────────────────────────────────────────────
// ④ ADR-0050：旧名显式拒绝（禁止落空进默认召回）
// ─────────────────────────────────────────────
const hostRetire = makeHost(baseCfg, seeds);
const rOldRecall = await hostRetire.read({ mode: "recall", topic: "alpha" });
assert.ok(rOldRecall.includes("已废止"), `mode:recall 应显式拒绝：\n${rOldRecall}`);
assert.ok(rOldRecall.includes("recovery"), "应指向 recovery");
assert.ok(!rOldRecall.includes("一手代码"), "不得落空进主题召回");
const rOldId = await hostRetire.read({ mode: "identity" });
assert.ok(rOldId.includes("已废止") && rOldId.includes("identity-advance"), `mode:identity 应指向 identity-advance：\n${rOldId}`);
const rOldReality = await hostRetire.read({ mode: "reality", observation: "x" });
assert.ok(rOldReality.includes("已废止") && rOldReality.includes("real-evidence"), `mode:reality 应指向 real-evidence：\n${rOldReality}`);
const rOldVerify = await hostRetire.read({ topic: "alpha", verify: true });
assert.ok(rOldVerify.includes("已废止") && rOldVerify.includes("verifyEvidence"), `verify:true 应显式拒绝：\n${rOldVerify}`);
const rOldArgsRecall = await hostRetire.read({ recall: true, topic: "alpha" });
assert.ok(rOldArgsRecall.includes("已废止") && rOldArgsRecall.includes("recovery") && rOldArgsRecall.includes("config.recall"), `args.recall 应显式拒绝并区分 config.recall：\n${rOldArgsRecall}`);
const rNewRecovery = await hostRetire.read({ mode: "recovery", topic: "完全不相干-zzz" });
assert.ok(!rNewRecovery.includes("已废止"), "正名 recovery 不得被拒");
const rKeepIdentity = await hostRetire.read({ identity: true });
assert.ok(!rKeepIdentity.includes("已废止"), `args.identity 保留：不得废止\n${rKeepIdentity}`);
assert.ok(rKeepIdentity.includes("Identity") || rKeepIdentity.includes("Soul") || rKeepIdentity.includes("主体"), `args.identity 应返回主体锚或配置提示：\n${rKeepIdentity}`);
const rKeepVerifyEv = await hostRetire.read({ topic: "alpha", verifyEvidence: true, max_tokens: 4096 });
assert.ok(!rKeepVerifyEv.includes("已废止"), `verifyEvidence 正名不得被拒：\n${rKeepVerifyEv}`);
assert.ok(rKeepVerifyEv.includes("Evidence") || rKeepVerifyEv.includes("verified") || rKeepVerifyEv.includes("not_found") || rKeepVerifyEv.includes("unavailable") || rKeepVerifyEv.includes("证据"), `verifyEvidence 应走 Gateway：\n${rKeepVerifyEv}`);
const rRetiredModeVerify = await hostRetire.read({ mode: "verify", evidenceRefs: ["evt-1"] });
assert.ok(rRetiredModeVerify.includes("已废止") && rRetiredModeVerify.includes("verification"), `mode:verify 应显式拒绝并指向 verification：\n${rRetiredModeVerify}`);
const rKeepModeVerification = await hostRetire.read({ mode: "verification", evidenceRefs: ["evt-1"] });
assert.ok(!rKeepModeVerification.includes("已废止"), `mode:verification（VerificationRun）正名不得被拒\n${rKeepModeVerification}`);
assert.ok(modeDesc.includes("recovery") && modeDesc.includes("identity-advance"), "schema 常用 mode 应含正名");
console.log("✔ ④ ADR-0050/0053 旧名显式拒绝 + 保留面仍可用（identity / verifyEvidence / verification / recovery）");

// ─────────────────────────────────────────────
// ⑤ intentOf：mode 串不得错挂「召回相关记忆」
// ─────────────────────────────────────────────
assert.equal(intentOf({ mode: "recovery" }, "x").goal, "恢复任务记忆包");
assert.equal(intentOf({ mode: "identity-advance" }, "x").goal, "推进身份时间线");
assert.equal(intentOf({ identity: true }, "x").goal, "确认主体");
assert.equal(intentOf({}, "topic").goal, "召回相关记忆");
console.log("✔ ⑤ intentOf mode/旗标 goal 消歧");

// ─────────────────────────────────────────────
// ⑥ 无参读索引的**预算**（v1.15.85）：入口路径不得把整篇 `_index.md` 塞回来
// ─────────────────────────────────────────────
// 真 `.shadow` 实测：`_index.md` **2199 KB / 24628 行**（8310 条记忆）⇒ 此前那条路径整篇原样返回。
const manySeeds = Array.from({ length: 300 }, (_, i) => ({
  rel: mem(today((i % 8) + 1), `1000${String(i).padStart(2, "0")}`, `idx-${i}`),
  text: memText(`src/idx${i}.ts`, `索引填充 alpha ${i}`),
}));
const bigHost = makeHost(baseCfg, manySeeds);
const rIdx = String(await bigHost.read({}));
assert.ok(rIdx.includes("# shadow 目录说明与索引"), `预算内应保留索引**前言**（说明 + 今日摘要）：\n${rIdx.slice(0, 200)}`);
assert.ok(rIdx.includes("> 未返回的内容："), `索引超预算必须披露：\n${rIdx.slice(-400)}`);
const im = /共 (\d+) 行 \/ (\d+) 字，本次返回 (\d+) 字/.exec(rIdx);
assert.ok(im, `披露要给行数/总字数/返回字数：\n${rIdx.slice(-400)}`);
assert.ok(Number(im![3]) <= 1600 * 4, `返回字数不得超预算（实际 ${im![3]} > 6400）`);
assert.ok(Number(im![2]) > Number(im![3]), "总字数应大于返回字数（确属截断）");
assert.ok(/未返回的段：[\s\S]*\(\d+ 行\)/.test(rIdx), `未返回的段应带**行数**（知道丢了多少）：\n${rIdx.slice(-400)}`);
assert.ok(/未返回的段：[\s\S]*(主题索引|意识轨迹)/.test(rIdx), `未返回的段应**点名**：\n${rIdx.slice(-400)}`);
assert.ok(rIdx.includes("> 部分返回的段："), `装不下整段时应标「部分返回」——否则会出现「预算 6400 字、只返回 1260 字」那种**把预算浪费掉**的结果：\n${rIdx.slice(-400)}`);
assert.ok(rIdx.length >= 1600 * 4 * 0.8, `预算应被基本用满（实际 ${rIdx.length} / ${1600 * 4}）`);
assert.ok(rIdx.includes("> 下一步："), "应给下一步（穿透 / 提高预算 / 直接读文件）");
assert.ok(rIdx.length <= 1600 * 4 + 1200, `整体长度也应受约束（实际 ${rIdx.length}）`);
// 正控：索引本来就小 ⇒ **零多余文字**（不得出现信封），且段落原样
const tinyR = String(await makeHost(baseCfg, seeds).read({ max_tokens: 8000 }));
assert.ok(!tinyR.includes("未返回的内容"), `索引放得下时不得出现预算信封：\n${tinyR.slice(-200)}`);
assert.ok(tinyR.includes("## 近期记忆（按日期）"), "小索引应原样返回（含段结构）");
// 负控（纯函数）：连第一节都放不下 ⇒ 硬截断也必须自报；预算内 ⇒ 逐字原样
// 负控：连**第一行**都放不下（这里是单行 4003 字 > 预算 20 字）⇒ 只能硬截断，且必须自报
// ⚠ v1.15.89：这个用例的**长度**被放大了（原来 400 字）—— 因为 never_worse 守卫（甲-2/D10）在
//   「原文只有 400 字、而披露要 400+ 字」时会**逐字退回原文**（那才是没有损失的那一份）。
//   两件事因此拆成两条断言：**这里**证「超大原文 + 极小预算 ⇒ 硬截断且自报」，
//   **下面**证「披露比原文长 ⇒ 退回原文」。
const hardIdx = renderIndexBudgeted("## " + "字".repeat(4000), 20);
assert.ok(hardIdx.includes("已按字符硬截断"), `硬截断必须自报：\n${hardIdx}`);
// 反向不变量（甲-2）：有损输出（正文 + 披露）若比原文还长 ⇒ 逐字退回原文，且**不留任何披露**
const smallIdx = "## " + "字".repeat(400);
assert.equal(renderIndexBudgeted(smallIdx, 20), smallIdx, `披露比原文长时必须退回原文（单位：${NEVER_WORSE_UNIT}）`);
// 正控：能装下若干行 ⇒ 走「部分返回」而不是硬截断
const partIdx = renderIndexBudgeted("## 甲\n" + "字".repeat(400), 50);
assert.ok(partIdx.includes("> 部分返回的段：") && !partIdx.includes("已按字符硬截断"), `能按行装就不该硬截断：\n${partIdx}`);
assert.equal(renderIndexBudgeted("## 甲\n短", 4000), "## 甲\n短", "预算内必须逐字原样");
console.log(`✔ ⑥ 索引预算：${im![2]} 字 → 返回 ${im![3]} 字 + 按段披露；小索引零多余文字`);

// ─────────────────────────────────────────────
// ⑦ 分层省略的披露与恢复句柄（v1.15.89 / ADR-0090 = rtk 甲-1 / 甲-2 落地）
//    甲-1：有损必须声明**形态** + 交出**恢复句柄**（本仓句柄 = 记忆文件路径 ⇒ 零新增存储）；
//    甲-2：有损输出不得比原文长（纯函数那一半由 `test/loss-and-handle.test.ts` 覆盖）。
// ─────────────────────────────────────────────
{
  const rLoss = await budgetHost.read({ topic: "alpha", limit: 12, max_tokens: 256 });
  assert.ok(rLoss.includes("> 分层省略："),
    `条目被降档/省略片段时必须披露 —— 否则「被省略」与「本来就短」在输出上不可区分：\n${rLoss.slice(-400)}`);
  assert.ok(rLoss.includes("> 可复取：") && /\.shadow\/\d{4}-\d{2}-\d{2}\//.test(rLoss),
    `披露必须交出**句柄**（记忆文件路径）：\n${rLoss.slice(-400)}`);
  // 正控：那些**本来就短**的记忆 ⇒ 不得被说成「被省略」（否则披露本身在撒谎）
  const rShort = await host.read({ topic: "alpha", limit: 10, max_tokens: 4096 });
  assert.ok(!rShort.includes("> 分层省略："), `本来就短 ⇒ 不添一句话：\n${rShort.slice(-300)}`);

  // 开关（v1.15.91 / `adr/0092`）：默认为**开**（判据走 `onByDefault`）；显式 `false` 只关「披露」，
  // **不改「给了什么」** —— 这条正是开关的边界，必须钉住（否则「关掉省 token」会悄悄变成「关掉就多给内容」）。
  // 条目渲染形如 `[.shadow/<日期>/<文件>.md]`（`mm.rel` 是**工作区相对**路径）
  const rels = (s: string) => [...s.matchAll(/\[\.shadow\/[^\]]+\]/g)].map((m) => m[0]).join("|");
  const offHost = makeHost({ summary: { enabled: false }, recall: { lossDisclosure: false } }, longSeeds);
  const rOff = await offHost.read({ topic: "alpha", limit: 12, max_tokens: 256 });
  assert.ok(!rOff.includes("> 分层省略："), `显式关掉后不得出现省略披露：\n${rOff.slice(-300)}`);
  assert.ok(rels(rLoss).length > 0, "（前置）开着时确实返回了条目");
  assert.equal(rels(rOff), rels(rLoss), "开关只许改「说了什么」，不许改「给了什么」（返回条目标识必须逐字相同）");
  assert.ok(rOff.length < rLoss.length, `关掉应更短（少两行披露）：on=${rLoss.length} off=${rOff.length}`);
}
console.log("✔ ⑦ 分层省略：给条数 + 逐条句柄（可复取）；本来就短的不被说成省略；开关（默认开）只改披露、不改内容");

console.log("ALL PASS ✅");
