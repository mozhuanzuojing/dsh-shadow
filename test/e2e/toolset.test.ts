// dsh-shadow v2 — 工具集 e2e：真实 apply() 接线。
//
// 为什么需要它（v1 ADR-0062 的教训）：执行函数全对、但入口没接线，单元测试依然全绿。
// 这里只走真实入口 apply() → tools 服务 → shadow_toolset.execute，
// 验证：工具注册 / ctx.get("approval") 惰性取 / exec.agent 作为审批凭据 / 拒绝与无通道 fail closed。
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { apply } from "../../dist/index.js";

const ws = mkdtempSync(join(tmpdir(), "dsh-shadow-toolset-"));
const tools = new Map<string, any>();
const approvalCalls: any[] = [];
const services: any = {
  tools: { register: (def: any) => tools.set(def.name, def) },
  systemPrompt: { context: () => {} },
  approval: {
    request: async (req: any) => {
      approvalCalls.push(req);
      // 与 v1 契约一致：宿主审批返回字符串，只有 allowed-once 是授予。
      return "rejected";
    },
  },
};
const ctx: any = {
  get: (k: string) => services[k],
  on: () => () => {},
  inject: (_deps: string[], cb: Function) => cb({ get: (k: string) => services[k] }),
};

const cleanup = apply(ctx, { shadowRoot: ws });
const savedPath = process.env.PATH;
const exec = { agent: { id: "s1", session: { header: { cwd: ws } } } };
try {
  assert.ok(tools.has("shadow_toolset"), "shadow_toolset 应注册");
  const tool = tools.get("shadow_toolset");
  assert.equal(Object.keys(tool.parameters.properties).length, 4, "shadow_toolset 保持 4 参数");
  for (const p of ["survey", "category", "need", "install"]) {
    assert.ok(p in tool.parameters.properties, "缺参数 " + p);
  }

  // 让探测必然「未检出」：不依赖本机装了什么，也保证测试不会真的装任何东西。
  process.env.PATH = "";

  // ① 审批拒绝：不装、给可复制命令、agent 凭据来自 exec
  const rejected = await tool.execute({ install: "rg" }, exec);
  assert.ok(rejected.includes("用户拒绝"), rejected.slice(0, 240));
  assert.ok(rejected.includes("未安装"), "拒绝路径必须明说未安装");
  assert.ok(rejected.includes("winget install --id BurntSushi.ripgrep.MSVC -e"), "拒绝路径必须给可复制命令");
  assert.equal(approvalCalls.length, 1, "一次安装只申请一次审批");
  assert.equal(approvalCalls[0].toolName, "shadow_toolset", "审批须带工具名");
  assert.deepEqual(approvalCalls[0].agent, exec.agent, "审批凭据必须是 exec.agent");

  // ② 无审批服务 → fail closed（ctx.get("approval") 返回 undefined，不抛）
  services.approval = undefined;
  const noChannel = await tool.execute({ install: "rg" }, exec);
  assert.ok(noChannel.includes("无审批通道"), noChannel.slice(0, 240));
  assert.ok(noChannel.includes("未安装"), "无审批通道必须明说未安装");
  assert.ok(noChannel.includes("winget install"), "无审批通道也要给可复制命令");

  // ③ 未登记能力：不探测、不编造
  const unknown = await tool.execute({ need: ["完全不存在xyzzy"] }, exec);
  assert.ok(unknown.includes("台账未登记"), unknown.slice(0, 240));
  assert.ok(!unknown.includes("winget install"), "未登记不得编造安装命令");

  // ④ 非法参数：显式失败（不是静默落回默认）
  const bad = await tool.execute({ survey: "bogus" }, exec);
  assert.ok(bad.includes("INVALID_INPUT"), bad.slice(0, 240));

  // ⑤ 默认巡检：只探 provider（PATH 已空 → 未检出），reference 标「未探测」；诚实纪律出现在真实输出里
  const survey = await tool.execute({}, exec);
  assert.ok(survey.includes("# 工具集台账"), survey.slice(0, 160));
  assert.ok(survey.includes("（未探测）"), "默认巡检 reference 应为未探测");
  assert.ok(survey.includes("探测失败 ≠ 未安装"), "诚实纪律须出现在真实输出里");

  console.log("✔ e2e：apply → shadow_toolset 注册 → 审批拒绝/无通道 fail closed → 未登记不编造 → 默认只探 provider");
  console.log("");
  console.log("未在测试中验证（诚实标注）：");
  console.log("  · allowed-once 真机安装路径（会在本机装软件）：由单元测试用假 runner 覆盖状态机；");
  console.log("  · 真实 DSH Cordis 0.2 宿主的 approval 服务形态：本测试用与 v1 契约一致的 stub（request→字符串）。");
} finally {
  if (savedPath === undefined) delete process.env.PATH;
  else process.env.PATH = savedPath;
  cleanup();
  rmSync(ws, { recursive: true, force: true });
}
console.log("ALL PASS ✅");
