// dsh-shadow v2 — 工具集用例编排（normalize/runToolset）与 surface 接线。
//
// 这层测的是「机制有没有被调用」——v1 的教训（ADR-0062）：执行函数全对、但入口没接线，
// 测试依然全绿。故这里从 runToolset / makeToolsetTool 的真实入口走，不走内部函数。
import assert from "node:assert/strict";
import { RECALL_PREFIX } from "../../dist/domain/text.js";
import { SignalStore } from "../../dist/engine/signals.js";
import { normalizeToolsetRequest, runToolset } from "../../dist/engine/toolset/run.js";
import type { Runner } from "../../dist/engine/toolset/types.js";
import { makeToolsetTool } from "../../dist/surface/tools.js";

const recordingRunner = (ok = false) => {
  const calls: string[] = [];
  const runner: Runner = async (cmd, args) => {
    calls.push([cmd, ...args].join(" "));
    return ok
      ? { ok: true, code: 0, out: `${cmd} 1.0.0`, err: "" }
      : { ok: false, code: "ENOENT", out: "", err: "" };
  };
  return { calls, runner };
};

// ─────────────────────────────────────────────
// ① 参数归一：未知输入显式失败，不静默落回默认
// ─────────────────────────────────────────────
{
  const d = normalizeToolsetRequest({});
  assert.ok(d.ok && d.value.survey === "providers", "缺省 survey 必须是 providers（默认只探 provider）");
  const upper = normalizeToolsetRequest({ survey: "ALL" });
  assert.ok(upper.ok && upper.value.survey === "all", "survey 取值大小写归一为 all");
  const badSurvey = normalizeToolsetRequest({ survey: "bogus" });
  assert.ok(!badSurvey.ok && badSurvey.error.code === "INVALID_INPUT", "未知 survey → INVALID_INPUT（不落回默认）");
  const badCat = normalizeToolsetRequest({ category: "不存在的分类" });
  assert.ok(!badCat.ok && badCat.error.code === "INVALID_INPUT", "未知分类 → INVALID_INPUT");
  assert.ok(badCat.error.message.includes("可用分类"), "未知分类错误须给出可用分类");
  const needStr = normalizeToolsetRequest({ need: "全文搜索" });
  assert.ok(needStr.ok && needStr.value.need?.length === 1, "need 允许单字符串（容错）");
  const needArr = normalizeToolsetRequest({ need: ["  全文搜索 ", "", "jadx"] });
  assert.deepEqual(needArr.ok ? needArr.value.need : null, ["全文搜索", "jadx"], "need 空白项应被剔除");
  const tooMany = normalizeToolsetRequest({ need: Array.from({ length: 13 }, (_, i) => `n${i}`) });
  assert.ok(!tooMany.ok && tooMany.error.code === "INVALID_INPUT", "need >12 → 显式拒绝（不静默截断）");
  const combined = normalizeToolsetRequest({ install: "rg", survey: "all", category: "搜索与查找" });
  assert.ok(combined.ok && combined.value.install === "rg" && combined.value.survey === "all", "install 与其他参数并存时保留全部（优先级在 runToolset 落地）");
}
console.log("✔ ① 参数归一：默认 providers / 大小写归一 / 未知 survey 与分类显式失败 / need 上限");

// ─────────────────────────────────────────────
// ② runToolset：默认巡检只探 provider；install 优先；预检不装
// ─────────────────────────────────────────────
{
  const { calls, runner } = recordingRunner();
  const r = await runToolset({ runner }, {});
  assert.ok(r.ok, "默认巡检应成功");
  assert.ok(r.value.includes("# 工具集台账"), "输出应含台账标题");
  assert.ok(r.value.includes("（未探测）"), "默认巡检应标出 reference 未探测");
  assert.equal(calls.length, 2, `默认巡检只探 2 项 provider（实际 ${calls.length}）`);
}
{
  const { calls, runner } = recordingRunner();
  const r = await runToolset({ runner }, { category: "搜索与查找" });
  assert.ok(r.ok && r.value.includes("过滤：分类"), "分类过滤须在输出里显式写出");
  assert.equal(calls.length, 0, "category + 默认 survey 不探测 reference");
}
{
  const { calls, runner } = recordingRunner();
  const r = await runToolset({ runner }, { install: "nope" });
  assert.ok(r.ok, "未登记安装是业务结果（ok 值 + 文本），不是内部错误");
  assert.ok(r.value.includes("未登记"), r.value);
  assert.equal(calls.length, 0, "未登记安装不应探测");
}
{
  const { calls, runner } = recordingRunner();
  const r = await runToolset({ runner }, { need: ["完全不存在xyzzy"] });
  assert.ok(r.ok && r.value.includes("台账未登记"), "未命中预检应如实说未登记");
  assert.equal(calls.length, 0, "未命中预检不应探测");
}
{
  const { runner } = recordingRunner();
  const r = await runToolset({ runner, platform: "linux" }, { need: ["全文搜索"] });
  assert.ok(r.ok && r.value.includes("本表为 Windows 口径"), "platform 口径应透传到处置渲染");
}
{
  const r = await runToolset({}, { survey: "bogus" });
  assert.ok(!r.ok && r.error.code === "INVALID_INPUT", "非法参数应从入口显式失败（不是空输出）");
}
console.log("✔ ② runToolset：默认只探 provider / 分类过滤 / 未登记与未命中不编造 / platform 口径透传");

// ─────────────────────────────────────────────
// ③ surface 接线：失败可见（文本 + Signal），成功清除；exec.agent 传给审批
// ─────────────────────────────────────────────
{
  const signals = new SignalStore();
  const tool = makeToolsetTool((exec) => ({ agent: exec?.agent, signals, getApproval: () => undefined }));
  // ① 非法输入：可见拒绝文本（不是能力降级，不写 Signal —— 与 read_shadow 未知 mode 同口径）
  const bad = await tool.execute({ survey: "bogus" }, { agent: { id: "a1" } });
  assert.ok(bad.startsWith(RECALL_PREFIX), `输出必须带统一前缀：${bad.slice(0, 40)}`);
  assert.ok(bad.includes("INVALID_INPUT"), "非法参数必须显式报错");
  assert.equal(signals.active().length, 0, "输入拒绝不算能力降级（文本可见即可，不写 Signal）");
  // ② 意外内部失败：可见错误 + 能力降级 Signal（不是静默）
  const boomArgs = new Proxy({}, { get() { throw new Error("参数读取失败"); } });
  const crashed = await tool.execute(boomArgs as any, { agent: { id: "a1" } });
  assert.ok(crashed.includes("shadow_toolset 内部错误"), crashed.slice(0, 160));
  assert.equal(signals.active().filter((s) => s.capability === "toolset").length, 1, "意外失败应留下可见 Signal（不是静默）");
  // ③ 成功路径清除 Signal（不 sticky）
  const ok = await tool.execute({ need: ["完全不存在xyzzy"] }, { agent: { id: "a1" } });
  assert.ok(ok.includes("台账未登记"), "成功路径应正常渲染");
  assert.equal(signals.active().length, 0, "成功调用应清除 toolset Signal（不 sticky）");
  console.log("  · surface：输入拒绝只给文本 / 意外失败→Signal / 成功→清除");
}
{
  // deps 工厂抛错（如宿主服务未就绪）→ 可见失败文本，不把异常抛给宿主工具调用栈。
  // 注意：工厂自身失败时拿不到 SignalStore，故这一条只能保证「输出可见」；engine 失败才有 Signal。
  const signals = new SignalStore();
  let boom = true;
  const tool = makeToolsetTool(() => {
    if (boom) throw new Error("deps 未就绪");
    return { signals };
  });
  const out = await tool.execute({}, {});
  assert.ok(out.includes("shadow_toolset 内部错误"), out.slice(0, 120));
  assert.ok(out.startsWith(RECALL_PREFIX), "失败输出仍须带统一前缀");
  boom = false;
  const recovered = await tool.execute({ need: ["完全不存在xyzzy"] }, {});
  assert.ok(recovered.includes("台账未登记"), "恢复后应正常工作");
  assert.equal(signals.active().length, 0, "恢复成功后清除 Signal");
  console.log("  · 依赖工厂抛错→可见失败文本，恢复后可用");
}
{
  // 审批门经 surface：假 runner 恒未检出 + 假 approval 拒绝 → 不装、给命令；exec.agent 进审批凭据
  let seen: any;
  const approval = { request: async (req: any) => { seen = req; return "rejected"; } };
  const { calls, runner } = recordingRunner();
  const signals = new SignalStore();
  const tool = makeToolsetTool((exec) => ({ runner, agent: exec?.agent, getApproval: () => approval, signals }));
  const out = await tool.execute({ install: "semble" }, { agent: { id: "agent-9" } });
  assert.ok(out.includes("用户拒绝"), out.slice(0, 200));
  assert.ok(out.includes("未安装"), "拒绝路径必须明说未安装");
  assert.ok(out.includes("uv tool install semble"), "拒绝路径必须给可复制命令");
  assert.deepEqual(calls, ["semble --version"], "拒绝后绝不能执行安装器");
  assert.deepEqual(seen.agent, { id: "agent-9" }, "exec.agent 必须作为审批凭据");
  assert.equal(seen.toolName, "shadow_toolset", "审批须带工具名");
  console.log("  · 审批门经 surface：拒绝不装 / 可复制命令 / agent 凭据正确");
}
console.log("✔ ③ surface 接线：参数→engine→文本；失败可见（文本+Signal）、成功清除、审批凭据来自 exec.agent");

console.log("");
console.log("未在测试中验证（诚实标注）：");
console.log("  · 真实 Cordis 宿主的 tools/approval 服务接线 —— 由 test/e2e/toolset.test.ts 用假宿主走 apply() 验证。");
console.log("ALL PASS ✅");
