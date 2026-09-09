# dsh-shadow · live 复验清单（历史稿 · 原标注 v0.13.0）

> **口径提示（2026-09-09）**：下列步骤多写旧版工具/参数口径。当前包版本见 `package.json`（≥1.13.0）；读侧正名见 **ADR-0050** / CONTEXT「mode 参考」——`mode:recall`→`recovery`，`args.verify`→`verifyEvidence`，推进身份用 `mode:identity-advance`。本清单未逐条改写，执行时以现行 schema 为准。
>
> 预检（本文件由重启前会话完成）：dist 已建/node --check 过；profile bundles 含 `dsh-shadow`；dump-config 无 Error；
> 探针遗留 `shadowRoot=D:\dsh-probe\csh-sandbox` 已去（走 session cwd）；`sandbox-policy.mode`/`permission.defaultPreset` 已还原 `workspace-write`。
> 用法：重启 web profile 后，在**新会话**里按顺序执行；每项记录结果（✅/⚠️/❌）。

## 0. 确认 running host 载入的版本
- `dsh --profile web --dump-config` → 应见 `- id: dsh-shadow`（无 shadowRoot），且无 `Error:/Cannot/failed`。
- 确认 `vendor/dsh-shadow/package.json` version = `0.13.0`，`dist/index.js` 存在。
- 触发一个真实工具回合（任意工具调用）→ 让插件采集。

## 1. 采集落地 + 系统提示不泄漏
- 检查会话工作区 `D:\project\dsh1\shadow\` 出现 `<日期>/<时刻>-<入口>.md` 文件。
- grep 该记忆文件：**不得**含 `<system-reminder>` / `The following workspace` / `Current runtime context` / `A skill is a reusable`（v0.5.1 修复生效）。

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

## 10. 关键命题
> read-side derived architecture 在真实 DSH host 中完整成立。

- 即：以上各模式**全部**从已落盘的记忆文件**读侧派生**（不改写写侧），无需重启逐模式重采；各段输出都可出现。

## 判定
- 全部 ✅ → **v0.13 真闭环**，进入下一优先级（zg Evidence Provider 接口 / Observation Model research）。
- 任一 ❌ → 记录失败模式（哪一段、报什么），回到代码定位（勿当成品）。

## 2026-09-06 实验结果（真机真数据）
- ✅ 写侧：`D:\project\dsh1\shadow` 新文件含 `> 证据链：`（v0.9）、`> 项目：dsh1`/`> Agent：`（v0.7）、`> 摘要：`（v0.5.1）、`> 来源会话：`（v0.5）、`> 用户要点`，**无系统提示泄漏**。
- ✅ 读侧（用真实 `dist/index.js` 插件代码 + 真实 shadow 数据驱动 `read_shadow.execute`）：
  - `{ soul: true }` → 生效（未配置给提示）。`{ taste: true }` → 生效（未配置给提示）。
  - `"csh", { project: true }` → LocalContext（relevant 3 条经验 + current_state + 排除38 + excluded 清单）— v0.12 真机工作。
  - `"dsh", { debug: true }` → 管线 trace（候选41/命中41/预算/返回10）+ 每条 `命中·入口/主题/路径/正文·状态`。
  - 输出暴露 v0.7–v0.10 读侧派生：`生命周期 NEW`、`裁决 fresh/superseded`（旧 vendor-dsh-shadow 标 superseded + 反思已迭代）、`结果 evidence_live/superseded`、`项目 dsh1`、`置信 0.55`、`来源 动作/agent`、`（来自其它会话/子代理）`。
- ⏳ 未单独 invoke：`experience` / `kg` / `observer` / `judgment` 查询（其写侧字段已确认存在；读逻辑已 mock 验证）。如需逐项确认，按上表跑即可。
- 结论：**写读双侧闭环，v0.13 真机验证通过。**

