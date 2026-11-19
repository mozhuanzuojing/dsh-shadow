import assert from "node:assert/strict";
import { classifyTurn } from "../../dist/domain/turn.js";

// 决策（含否决/替换/改/偏好）
for (const t of [
  "不要多数据库抽象。对 taste.json 继续精修",
  "dsh-remote-wsl 在dsh左下角的入口不要了",
  "只改呼气 去掉百汇",
  "删除 dry_run:true 这个功能 邮件直接发",
  "提的邮件正文与卡片节律不一致，一并改成「吸6/停1/呼4」",
  "这个界面加宽50%",
  "更喜欢B",
  "不要修改任何文件",
]) assert.equal(classifyTurn(t), "decision", `应为决策: ${t}`);

// 确认（不算决策）
for (const t of ["都做", "同意", "重启完成", "好，继续抽查", "要", "收尾", "可以"])
  assert.equal(classifyTurn(t), "confirmation", `应为确认: ${t}`);

// 噪声（脚手架/prompt）
for (const t of [
  "Background subagent reviewer finished and will do no further",
  "This is an automatically generated checkpoint condensing an",
  "只读任务，不要改任何文件。项目：`D:\\project\\dsh1\\dsh-shadow`",
  "独立代码审查一个 DSH 客户端插件的最新改动（只读审查，不要修改任何文件）。",
]) assert.equal(classifyTurn(t), "noise", `应为噪声: ${t}`);

// 背景（描述现状/材料）
assert.equal(classifyTurn("东方禅意风格）。当前统计页像\"台账/表单\"（等权行 + 邮箱混入"), "background");

console.log("✔ turn-classify：决策(含否决/替换/改/偏好) / 确认 / 噪声 / 背景 四分类");
