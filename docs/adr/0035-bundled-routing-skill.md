# ADR-0035 · 内置 bundled skill provider（`dsh-shadow-routing` 随插件走）

- 状态：accepted
- 日期：2026-11-19
- 关联：skills 子系统；ADR-0029~0034（路由判据内容）

## 背景
路由判据（ADR 见 `docs/v2/ROUTING.md`）原先只放在用户级 `~/.dsh/skills/dsh-shadow-routing/`，**不随插件走**、换机/他人装插件拿不到。希望"SP 内置进插件，装插件即得"。

## 决策（对齐官方 `@deepseek-ai/dsh-skill-badge` 范式）
- skill 正文随包：`dsh-shadow/skills/dsh-shadow-routing/SKILL.md`（`package.json` `files` 含 `skills`）。
- `src/surface/skill-routing.ts`：不可变 `SkillProvider`（`source:'bundled'`，`rank=600`，`list()` 一项，`get()` **每次读包内文件**）；**不 import** `@deepseek-ai/dsh-skill` 类型（duck-type，零新增依赖）。
- `src/index.ts`：`ctx.inject(["skills"], …)` **可选注册** `ctx.skills.registerProvider(() => routingProvider)`；未启用 skill 注册表的组合自动跳过，不影响其它能力。
- 效果：装/启用 dsh-shadow 后，`dsh-shadow-routing` 出现在会话技能目录（**不落到 `~/.dsh/skills`**），卸载即消失、随插件版本。

## 后果
- ＋ 真正"随插件走"、零审批写用户目录、卸载干净；官方范式、零新依赖。
- － 依赖组合启用 `dsh-skill` 注册表（标准 profile 默认有；缺则安全跳过、skill 不出现）；provider 结构按 duck-type 与 `@deepseek-ai/dsh-skill` 契约对齐，若上游契约变动需同步（`test/unit/skill-routing.test.ts` 守基本形状）。
