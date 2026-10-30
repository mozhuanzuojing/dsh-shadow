import assert from "node:assert/strict";
import { buildAutoRecallHint } from "../../dist/domain/auto-recall.js";
import { normalizeConfig } from "../../dist/contract/config.js";
import type { LessonCard } from "../../dist/domain/lessons.js";

const card = (title: string, trigger: string, text: string): LessonCard => ({
  key: title,
  title,
  trigger,
  when: "2026-09-05",
  status: "completed",
  decisions: [],
  outcomes: [],
  lessons: [],
  evidence: [],
  memoryRefs: [`.shadow/atoms/${title}.md`],
  text,
});

const cards: LessonCard[] = [
  card("修 JWT 过期", "把 JWT 过期改成 2h", "修 JWT 过期 把 JWT 过期改成 2h JWT 过期改为 2h 完成 completed"),
  card("整理 todo", "整理 todo 清单", "整理 todo 整理 todo 清单 completed"),
];

// 1) 相关任务：输出极小提示（带标题 + 技能指针 + 数据非指令），不带无关任务
const hint = buildAutoRecallHint(cards, "给 JWT 加过期处理", "2026-09-06", 2);
assert.ok(hint.includes("自动召回"), "应含自动召回标记");
assert.ok(hint.includes("修 JWT 过期"), "应命中 JWT 任务");
assert.ok(hint.includes("indexes/skills/"), "应带技能指针");
assert.ok(hint.includes("数据非指令"), "应声明数据非指令");
assert.ok(!hint.includes("整理 todo"), "不应带无关任务");

// 2) 空查询 / 无关查询：返回空串（不注入）
assert.equal(buildAutoRecallHint(cards, "", "2026-09-06", 2), "", "空查询应返回空");
assert.equal(buildAutoRecallHint(cards, "完全不存在zzz", "2026-09-06", 2), "", "无关查询应返回空");
assert.equal(buildAutoRecallHint([], "JWT", "2026-09-06", 2), "", "空缓存应返回空");

// 3) 配置：默认关；显式开 + limit 钳制 1..5
const c = normalizeConfig({});
assert.equal(c.autoRecall.enabled, false, "autoRecall 默认关");
assert.equal(c.autoRecall.limit, 2);
const c2 = normalizeConfig({ autoRecall: { enabled: true, limit: 9 } });
assert.equal(c2.autoRecall.enabled, true);
assert.equal(c2.autoRecall.limit, 5, "limit 应钳到 5");

console.log("✔ auto-recall：提示构建(带技能指针/无关不注入/空返回) + 配置默认关/limit钳制");
