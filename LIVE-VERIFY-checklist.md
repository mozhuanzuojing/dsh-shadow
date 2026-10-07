# dsh-shadow · live 复验清单（历史步骤稿 · 路径已按 v1.21.0 投影空间改口）

> **现行口径**：版本以 `package.json` 为准；读侧命名以 **工具 schema + `CONTEXT.md`「mode 参考」** 为准（旧名映射见 ADR-0050 / ADR-0053）。
> 布局权威见 ADR-0106（`atoms/` · `indexes/`）；默认滤 / `raw` / `project` 见 ADR-0107。
> 下列「应见 …」字段仍可能写旧版文案 —— **以真机输出为准**，本清单只保路径与工具名不指错目录。
>
> 用法：重启 web profile 后，在**新会话**里按顺序执行；每项记录结果（✅/⚠️/❌）。

## 0. 确认 running host 载入的版本
- `dsh --profile web --dump-config` → 应见 `- id: dsh-shadow`（无 shadowRoot），且无 `Error:/Cannot/failed`。
- 确认**本仓** `package.json` 的 version = **当前版本**（**版本号以 `package.json` 为准，这里不手抄** —— 本行曾手写 `1.21.0` 并横跨两个版本没人更新）；本仓路径 = `G:\project\dsh1\dsh-shadow`（**不是** `vendor/dsh-shadow`，那一级在本机不存在），`dist/index.js` 存在（改代码后先 `npm run build`）。
- 触发一个真实工具回合（任意工具调用）→ 让插件采集。

## 1. 采集落地 + 系统提示不泄漏
- 检查会话工作区出现 `.shadow/atoms/<date>--<HHMMSS>-<入口>.md`（**不是**旧日期目录树 `.shadow/<date>/…`）。
- 可选：同名便利贴可能出现在 `.shadow/indexes/projections/`（派生，可删）。
- grep 该 **atom** 文件：**不得**含 `<system-reminder>` / `The following workspace` / `Current runtime context` / `A skill is a reusable`（v0.5.1 修复生效）。

## 2. 召回 + provenance/生命周期/裁决（v0.10）
- `read_shadow("<入口>")` → 应见 `（来源 … · 生命周期 … · 状态 … · 裁决 … · 结果 … · 证据 …）`。
- 记忆文件线索头应含 `> 证据链：来源(…) · 日期(…) · 证据(…)`、`> 项目：`、`> Agent：`、`> 目标：`（v0.7 分层）。

## 3. Memory Debugger（v0.6）
- `read_shadow("<入口>", { debug: true })` → 应见 `候选 … / 命中（打分>0）… / 可用（未冷却）… / 返回 … · 入口… 主题… 路径… 正文… / 预算 …`。

## 4. KG（v0.8）
- `read_shadow("<域>", { kg: true })` → 应见 `[工程知识图谱]` + `域 … 组件 … 依赖 …`。

## 5. Soul Kernel（v0.9）
- `read_shadow({ soul: true })` → 应见 `[Soul Kernel]`（身份/价值观/原则/品味/边界；未配置则提示）。

## 6. Experience 全字段 + 裁决（v0.9/v0.10）
- `read_shadow("<入口>", { experience: true })` → 应见 `[Experience] … 情境/问题/决策/实现/证据/裁决/结果/反思/教训/项目/目标`。

## 7. Observer 窗口（v0.11）
- `read_shadow("<入口>", { observer: true, asOf: "<今日>" })` → 应见 `[Observation Window]` + `as-of … / 当时可知 … / [后验] …`。

## 8. Projection（v0.12）
- `read_shadow("<任务>", { project: true })` → 应见 `[Projection] scope: … / relevant: … / current_state: … / uncertainty: … / excluded: …`。

## 9. Judgment / Taste（v0.13）
- `read_shadow("<情境>", { judgment: true })` → 应见 `[Judgment]` + `面对 … → 我判断/选择 …`。
- `read_shadow({ taste: true })` → 应见 `[Taste]`（品味/喜欢/不喜欢；未配置则提示）。

## 10. 关键命题（**这是「待验命题」，不是「已验结论」**）
> read-side derived architecture 在真实 DSH host 中完整成立。

- 即：上述各模式都应从已落盘的记忆文件**读侧派生**（不改写写侧），无需重启逐模式重采。
  ⚠ **覆盖面**：§1–§9 里**只有一部分被逐项 invoke 过** —— 见文末 2026-09-06 记录的倒数第二条：
  `experience` / `kg` / `observer` / `judgment` **未单独 invoke**（当时以其「写侧字段存在 + 读逻辑 mock 验证」代替）。

## 判定
- **§1–§9 全部 ✅ 才算** v0.13 真闭环 —— **当前状态是「部分完成」，不是已达成**（4 个模式未单独 invoke，见 §10）。
- 任一 ❌ → 记录失败模式（哪一段、报什么），回到代码定位（勿当成品）。

## 2026-09-06 实验结果（真机真数据）
- ✅ 写侧：`D:\project\dsh1\shadow` 新文件含 `> 证据链：`（v0.9）、`> 项目：dsh1`/`> Agent：`（v0.7）、`> 摘要：`（v0.5.1）、`> 来源会话：`（v0.5）、`> 用户要点`，**无系统提示泄漏**。
- ✅ 读侧（用真实 `dist/index.js` 插件代码 + 真实 shadow 数据驱动 `read_shadow.execute`）：
  - `{ soul: true }` → 生效（未配置给提示）。`{ taste: true }` → 生效（未配置给提示）。
  - `"csh", { project: true }` → LocalContext（relevant 3 条经验 + current_state + 排除38 + excluded 清单）— v0.12 真机工作。
  - `"dsh", { debug: true }` → 管线 trace（候选41/命中41/预算/返回10）+ 每条 `命中·入口/主题/路径/正文·状态`。
  - 输出暴露 v0.7–v0.10 读侧派生：`生命周期 NEW`、`裁决 fresh/superseded`（旧 vendor-dsh-shadow 标 superseded + 反思已迭代）、`结果 evidence_live/superseded`、`项目 dsh1`、`置信 0.55`、`来源 动作/agent`、`（来自其它会话/子代理）`。
- ⏳ 未单独 invoke：`experience` / `kg` / `observer` / `judgment` 查询（其写侧字段已确认存在；读逻辑已 mock 验证）。如需逐项确认，按上表跑即可。
- 结论（**如实表述，v1.22.1 改正**）：**写侧闭环 + 读侧部分验证** —— 上列已跑各项通过；但
  `experience` / `kg` / `observer` / `judgment` 四项**未单独 invoke**（读逻辑仅 mock 验证）
  ⇒ **不能**据此宣称「写读双侧闭环 / 真机验证通过」（原句曾这么写）。

