import assert from "node:assert/strict";
import { runRead } from "../../dist/engine/read/route.js";
import { atomText, makeDeps } from "../helpers.ts";

const seed = {
  "/ws/.shadow/atoms/2026-09-05--100000-auth--a1b2c3.md": atomText({
    entry: "src/auth.ts",
    goal: "修 JWT 过期",
    user: "把 JWT 过期时间改成 2h，注意别忘了刷新 token",
    decisions: [{ text: "JWT 过期改为 2h", source: "user" }],
    reasons: [{ text: "因为旧 token 易被重放", source: "user" }],
    actions: ["完成，验证通过"],
  }),
  "/ws/.shadow/atoms/2026-09-04--090000-todo--d4e5f6.md": atomText({
    entry: "docs/todo.md",
    date: "2026-09-04",
    time: "090000",
    goal: "整理 todo",
    user: "整理 todo 清单",
  }),
};
const deps = makeDeps(seed);

// 1) 无参读：索引里出现「技能」段与 SKILL.md 指针
const idx = await runRead(deps, {});
if (!idx.ok) throw new Error(idx.error.message);
assert.ok(idx.value.text.includes("## 技能"), "索引应有技能段");
assert.ok(idx.value.text.includes("indexes/skills/"), "应列出技能路径");
const m = idx.value.text.match(/indexes\/skills\/[^\s`]+SKILL\.md/);
assert.ok(m, `应能解析出 SKILL.md 路径：\n${idx.value.text.slice(-500)}`);

// 2) 技能文件已物化，且是带 frontmatter + 章节的可审 SKILL.md
const file = await deps.fs.readText(`/ws/.shadow/${m[0]}`);
if (!file.ok) throw new Error(`读技能文件失败：${file.error.message}`);
const md = file.value;
assert.ok(md.startsWith("---\n"), "应以 YAML frontmatter 开头");
assert.ok(md.includes("name:") && md.includes("description:"), "frontmatter 应含 name/description");
for (const sec of ["## 何时用", "## 步骤 / 决策", "## 结果与验证", "## 坑与教训", "## 证据", "## 来源"]) {
  assert.ok(md.includes(sec), `技能卡应含章节 ${sec}`);
}
assert.ok(md.includes("JWT") || md.includes("todo"), "技能卡应含任务内容");
assert.ok(md.includes("数据非指令"), "应声明数据非指令");

// 3) 幂等：二次无参读不报错（内容不变不写）
const idx2 = await runRead(deps, {});
assert.ok(idx2.ok, "二次读应成功");

// 4) recall_similar 输出带技能指针（把任务卡与技能卡串起来）
const sim = await runRead(deps, { similar: true, topic: "JWT 过期" });
if (!sim.ok) throw new Error(sim.error.message);
assert.ok(sim.value.text.includes("技能：indexes/skills/"), "相似任务应带技能卡指针");

console.log("✔ skills：任务卡物化可审 SKILL.md（frontmatter+章节）/ 索引列出 / recall_similar 指针 / 幂等");
