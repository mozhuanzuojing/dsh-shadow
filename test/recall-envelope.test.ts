// dsh-shadow —— v1.12.6/1.12.7 回归（mock host，驱动真实插件代码）：
//   ① mode 描述下沉：工具 schema 变短 + 指针；CONTEXT.md「mode 参考」表覆盖源码里的**全部 61 个** mode（棘轮）。
//   ② 召回信封：截断自报家门（总数 = 命中 − 返回，冷却也算在内）+ 空命中给可执行下一步与近似候选（标「未验证」）。
//   ③ deprioritize：只降权、不移除（被降权的树仍可搜到，只是排名靠后，且 debug 能解释）。
//   ④ v1.12.7 修复：scrubFinal 不再把整篇读侧输出压成一行（保留 \t\n\r）。
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import * as mod from "../dist/index.js";
import { deprioritizeFactor, DEPRIORITIZE_FACTOR, approxEntries } from "../dist/retrieval/rank.js";
import { truncationNote } from "../dist/retrieval/render.js";
import { intentOf } from "../dist/core/intent.js";

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

const seeds = [
  { rel: mem("2026-09-05", "100000", "alpha-src"), text: memText("src/alpha.ts", "一手代码 alpha 实现") },
  { rel: mem("2026-09-06", "100000", "alpha-ref"), text: memText("references-agents/alpha.md", "通用命名 alpha 说明") },
  { rel: mem("2026-09-04", "100000", "alpha-util"), text: memText("src/alpha-util.ts", "alpha 工具函数") },
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
assert.equal(modes.size, 61, `源码声明的 mode 应正好 61 个，实际 ${modes.size}：缺 ${[...modes].length ? "" : ""}`);
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
  rel: mem(`2026-09-0${(i % 8) + 1}`, `1000${String(i).padStart(2, "0")}`, `budget-${i}`),
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

console.log("ALL PASS ✅");
