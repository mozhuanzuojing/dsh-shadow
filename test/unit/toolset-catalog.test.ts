// dsh-shadow v2 — 工具集台账目录：结构完整性 / 两级边界 / 分类过滤 / 反查不编造。
//
// 纪律：本测试**不碰机器** —— 一切探测走假 runner。否则「某台机器装没装」会写进断言，
// 换一台机器就恒红（v1 toolset-catalog ④ 的教训），而一条永远红的测试会掩盖以后真正的失败。
import assert from "node:assert/strict";
import {
  CAPABILITIES,
  LEDGER_SNAPSHOT,
  capabilityOf,
  findCapabilities,
  providerCapabilities,
  referenceCapabilities,
  remedyFor,
} from "../../dist/engine/toolset/catalog.js";
import { surveyCapabilities } from "../../dist/engine/toolset/probe.js";
import { renderSurvey } from "../../dist/engine/toolset/render.js";
import { CATEGORY_ORDER } from "../../dist/engine/toolset/types.js";

interface FakeBehaviour {
  ok: boolean;
  out?: string;
  code?: string;
}

/** 记录调用的假 runner：默认「未检出」；可按调用序号返回不同行为。 */
const recordingRunner = (behaviour: (callIndex: number, cmd: string, args: string[]) => FakeBehaviour = () => ({ ok: false })) => {
  const calls: string[] = [];
  const runner = async (cmd: string, args: string[]) => {
    calls.push([cmd, ...args].join(" "));
    const b = behaviour(calls.length - 1, cmd, args);
    return {
      ok: b.ok,
      code: b.ok ? 0 : (b.code ?? "ENOENT"),
      out: b.out ?? (b.ok ? `${cmd} 1.0.0` : ""),
      err: "",
    };
  };
  return { calls, runner };
};

// ─────────────────────────────────────────────
// ① 目录结构自洽：字段、分类、探针、处置
// ─────────────────────────────────────────────
assert.ok(CAPABILITIES.length >= 90, `台账应有 ≥90 项（实际 ${CAPABILITIES.length}）`);
assert.equal(providerCapabilities().length, 2, `provider 应为 zg / semble 两项（实际 ${providerCapabilities().length}）`);
assert.ok(referenceCapabilities().length >= 90, `reference 应覆盖通用工具目录（实际 ${referenceCapabilities().length}）`);
assert.equal(CATEGORY_ORDER.length, 17, `分类数应为 17（实际 ${CATEGORY_ORDER.length}）`);

const ids = CAPABILITIES.map((c) => c.id);
assert.equal(new Set(ids).size, ids.length, `台账 id 不可重复：${ids.filter((x, i) => ids.indexOf(x) !== i).join(", ")}`);
for (const c of CAPABILITIES) {
  assert.ok(c.id && c.label && c.kind && c.category && c.provides && c.degradesTo && c.doc, `字段不齐：${c.id}`);
  assert.ok(c.probe.length > 0 && c.probe[0], `probe 不能为空：${c.id}`);
  assert.ok(!c.probe.includes(""), `probe 含空参数（会变成传空路径）：${c.id}`);
  assert.ok(c.remedy.default?.cmd, `缺 default 处置（非 Windows 平台要靠它）：${c.id}`);
  assert.ok(CATEGORY_ORDER.includes(c.category), `分类未登记进 CATEGORY_ORDER：${c.id} → ${c.category}`);
}

// ─────────────────────────────────────────────
// ② 两级边界：provider 有实义退路 + 安装配方；reference 明写「不影响插件行为」
//    并如实标注 v2 未接线（不冒充一条不存在的接线）。
// ─────────────────────────────────────────────
for (const c of referenceCapabilities()) {
  assert.ok(
    c.degradesTo.includes("不影响插件行为"),
    `reference 的 degradesTo 必须说明「不影响插件行为」；违反：${c.id} → ${c.degradesTo}`,
  );
  assert.equal(c.wired, undefined, `reference 不应带 wired 标记：${c.id}`);
}
for (const c of providerCapabilities()) {
  assert.equal(c.category, "插件内接线", `provider 必须归在「插件内接线」分类：${c.id}`);
  assert.equal(c.wired, false, `v2 尚未接线：provider 必须显式 wired:false（不得冒充接线）：${c.id}`);
  assert.ok(c.install, `provider 必须有安装配方：${c.id}`);
  assert.ok(c.degradesTo.length >= 8 && !/^无[（(]/.test(c.degradesTo), `provider 的 degradesTo 必须有实义：${c.id}`);
}

// ─────────────────────────────────────────────
// ③ 数据诚实：版本号是 v1 台账快照、非本机实测；无可靠装法就不给命令
// ─────────────────────────────────────────────
assert.match(LEDGER_SNAPSHOT.at, /^\d{4}-\d{2}-\d{2}$/, `快照日期应形如 YYYY-MM-DD：${LEDGER_SNAPSHOT.at}`);
assert.ok(LEDGER_SNAPSHOT.source.includes("legacy/v1"), `快照来源应可复核：${LEDGER_SNAPSHOT.source}`);
for (const c of referenceCapabilities()) {
  if (c.winget) {
    assert.ok(c.note?.includes(`winget ${c.winget}`), `note 应保留 winget 包 ID：${c.id} → ${c.note}`);
    if (c.version !== undefined) {
      assert.ok(/^[0-9]/.test(c.version), `声称的版本应像版本号：${c.id} → ${c.version}`);
    } else {
      assert.ok(c.note?.includes("未声称版本"), `取不到版本时必须显式写「未声称版本」：${c.id} → ${c.note}`);
    }
  } else {
    assert.equal(c.version, undefined, `无 winget 包不得声称版本：${c.id}`);
    assert.equal(c.install, undefined, `无 winget 包不得给安装配方：${c.id}`);
  }
  assert.ok(!String(c.note ?? "").includes("本机实测"), `台账不得声称本机实测（版本来源是 v1 快照）：${c.id}`);
}

// ─────────────────────────────────────────────
// ④ 反查：id / 二进制名 / 别名 / 用途词 / 分类名 均可命中；未登记不编造
// ─────────────────────────────────────────────
const expectHit: [string, string][] = [
  ["rg", "rg"],
  ["ripgrep", "rg"],
  ["fd", "fd"],
  ["fdfind", "fd"],
  ["jadx", "jadx"],
  ["反编译", "jadx"],
  ["z", "zoxide"],
  ["neovim", "nvim"],
];
for (const [need, id] of expectHit) {
  assert.ok(findCapabilities(need).some((c) => c.id === id), `"${need}" 应命中 ${id}；实际：${findCapabilities(need).map((c) => c.id).join("/")}`);
}
assert.ok(findCapabilities("搜索与查找").length >= 3, "按分类名应命中该分类多条");
assert.ok(findCapabilities("coreutils").length >= 2, `coreutils 应命中多变体（实际 ${findCapabilities("coreutils").length}）`);
assert.equal(findCapabilities("完全不存在的能力xyzzy").length, 0, "未登记 → 零命中");
assert.equal(findCapabilities("").length, 0, "空串 → 零命中");
assert.equal(findCapabilities(undefined).length, 0, "undefined → 零命中");
assert.equal(findCapabilities("q").length, 0, "未映射的单字符不裸匹配（长度 <2 直接零命中，防误撞）");
assert.equal(capabilityOf("nope"), undefined, "未登记 id → undefined");
assert.equal(remedyFor("nope"), undefined, "未登记 id 无处置（不编造命令）");
console.log(`✔ ①–④ 目录自洽：${CAPABILITIES.length} 项（provider ${providerCapabilities().length} + reference ${referenceCapabilities().length}）· 分类 ${CATEGORY_ORDER.length} · 反查与未登记纪律成立`);

// ─────────────────────────────────────────────
// ⑤ 巡检范围：默认只探 provider；survey:"all" 才全探；category 只列该分类
// ─────────────────────────────────────────────
const defaultRun = recordingRunner();
const rows = await surveyCapabilities({ runner: defaultRun.runner });
assert.equal(rows.length, CAPABILITIES.length, `默认巡检应列出全部条目（实际 ${rows.length}）`);
assert.ok(rows.slice(0, 2).every((r) => r.capability.kind === "provider"), "全台账顺序应为 provider 优先");
const probed = rows.filter((r) => r.available !== null);
assert.equal(probed.length, providerCapabilities().length, `默认巡检只应探测 ${providerCapabilities().length} 项 provider（实际 ${probed.length}）`);
assert.deepEqual(
  [...defaultRun.calls].sort(),
  providerCapabilities().map((c) => c.probe.join(" ")).sort(),
  `默认巡检的探测命令应恰为 provider 的 probe：${defaultRun.calls.join(" | ")}`,
);
assert.ok(
  rows.filter((r) => r.capability.kind === "reference").every((r) => r.available === null && r.detail === "未探测"),
  "reference 默认必须是 null=未探测（区别于「未检出」）",
);

const allRun = recordingRunner();
const allRows = await surveyCapabilities({ survey: "all", runner: allRun.runner });
assert.equal(allRun.calls.length, CAPABILITIES.length, `survey:"all" 应并行探测全部条目（实际调用 ${allRun.calls.length}）`);
assert.ok(allRows.every((r) => r.available !== null), "survey: \"all\" 后不存在「未探测」行");

const cat = "搜索与查找";
const expectedInCat = CAPABILITIES.filter((c) => c.category === cat);
assert.ok(expectedInCat.length >= 3, `分类 "${cat}" 应有多条（实际 ${expectedInCat.length}）`);
const catRun = recordingRunner();
const catRows = await surveyCapabilities({ survey: "providers", category: cat, runner: catRun.runner });
assert.equal(catRows.length, expectedInCat.length, `分类过滤应只列 ${expectedInCat.length} 条（实际 ${catRows.length}）`);
assert.ok(catRows.every((r) => r.capability.category === cat), "分类过滤后不得混入其他分类");
assert.equal(catRun.calls.length, 0, "category + 默认 survey 不应探测 reference");
const catAllRun = recordingRunner(() => ({ ok: true }));
const catAllRows = await surveyCapabilities({ survey: "all", category: cat, runner: catAllRun.runner });
assert.equal(catAllRun.calls.length, expectedInCat.length, "survey: \"all\" + category 应探测该分类全部条目");
assert.ok(catAllRows.every((r) => r.available === true), "假 runner 全可用时应全部检出");
assert.equal((await surveyCapabilities({ category: "不存在的分类", runner: recordingRunner().runner })).length, 0, "未知分类 → 空集（由 engine 显式报错，不编造）");
console.log(`✔ ⑤ 巡检范围：默认探 ${probed.length} 项 provider；survey:"all" 探 ${allRun.calls.length} 项；分类过滤 ${cat} → ${catRows.length} 条`);

// ─────────────────────────────────────────────
// ⑥ 巡检渲染：分类分组、未探测/未检出可区分、数据来源与「探测失败≠未安装」
// ─────────────────────────────────────────────
const out = renderSurvey(rows, { survey: "providers" });
assert.ok(out.includes("# 工具集台账"), "应含标题");
assert.ok(out.includes("## 插件内接线"), "应含分类标题");
assert.ok(out.includes("## GNU 工具链"), "应列出 reference 分类");
assert.ok(out.includes("（未探测）"), "reference 应标「未探测」");
assert.ok(out.includes("未探测**"), "应给出「要探测全部」的指引");
assert.ok(out.includes("数据来源"), "应披露数据来源");
assert.ok(out.includes("不是本机实测"), "必须说明版本不是本机实测");
assert.ok(out.includes("探测失败 ≠ 未安装"), "必须说明探测失败不等于未安装");
assert.ok(out.includes("尚未接线"), "v2 未接线的 provider 必须显式标出（不冒充接线）");
assert.ok(out.includes("（v2 未接线）"), "provider 行应标 v2 未接线");
const outAll = renderSurvey(allRows, { survey: "all" });
assert.ok(!outAll.includes("未探测**"), "survey: \"all\" 不应再提示「要探测全部」");
console.log("✔ ⑥ 巡检渲染：分类分组 / 未探测与未检出可区分 / 数据来源与诚实纪律齐备");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 各 reference 条目 probe 旗标的**正确性**（可能某工具不支持该旗标 → 只显示「未检出」，不会误报可用）；");
console.log("    口径已由 ⑤ 的「探测失败≠未安装」与假 runner 隔离兜住。");
console.log("  · 台账数据与 v1 快照的逐条一致性 —— 数据是移植时静态核对，未在本机重跑 winget 核验。");
console.log("ALL PASS ✅");
