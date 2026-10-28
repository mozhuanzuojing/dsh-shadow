# ADR-0036 · Observer Continuity Shadow Protocol（Global/Workspace 分层，封存后补全）

> 时间：2026-09-07 ｜ 状态：已实现（v1.0.1） ｜ 版本：封存后补全（非能力层）
> 前置：ADR-0034（v1.0.0-alpha Observer Runtime Closure）。定位：**给 global shadow 正确定位**——它不是"全局项目记忆"，而是 **Observer Continuity Shadow（observer 层）**；与 **Workspace Shadow（World 层）** 严格分层、不可混合。
> 背景：v1.0-alpha 的 `Observer Continuity` 缺了**跨 workspace 的连续载体**。若无 global shadow：`新项目→新 workspace shadow→新上下文` → Observer 变成 `Project A/B/C Observer`，连续性断裂（`Memory isolated → Continuity broken`）。这正是 v0.37 Recall + v0.39 Long Horizon 最自然的落点。

## 第一条宪法：两 Shadow 不可混合

```
Global Shadow  = Observer Continuity Shadow    （observer 层）
Workspace Shadow = World Interaction Shadow    （world 层）
```
关系是：
```
Observer Boundary
      |            │
      +------------+
      |            |
 Global Shadow    Workspace Shadow
   ~/.dsh-observer  project/.dsh-shadow
    谁保持连续      这个世界是什么
```
**不是** `Global → Workspace` 的从上到下。

## Global Shadow 存什么（三类白名单）

1. **Observer Configuration**：当前交互约定（如"用 TypeScript / 严格类型检查 / 默认输出 ADR 格式"）。
   - 是 `当前交互约定`，**不是** `TypeScript 比 Java 好`。
2. **Observer Boundary State**：运行时政策（ADR-0029~0034 的 policy shadow）：不自动改目标 / 不提升权限 / 不创建 preference / 不推断 identity。
3. **Recall Index**：`我曾经在哪里观察过什么` 的索引（id + location），**不是** `我知道那个项目的所有东西`。

## Global Shadow 不存什么（红线）

❌ 项目代码知识（`bank-service 使用 Oracle`）
❌ 项目规则（`这个项目禁止 Lombok`）
❌ 项目目标（`我要完成支付系统`）

否则：`Global Shadow → Experience accumulation → Preference formation → Identity drift`，**撞 v0.39.1 的 231**。

## 最终结构

```
~/.dsh-observer
├── observer/
│   ├── identity-boundary.json
│   ├── runtime-policy.json
│   └── preferences.json
├── recall-index/
│   └── index.json
└── lineage/
    └── continuity.json

project-A/.dsh-shadow
├── observation/   representation/   simulation/
├── planning/      action/           history/
```

## 命名

- Global：`~/.dsh-observer`（observer 层），下面 `~/.dsh-observer/shadow`。
- Workspace：`project/.dsh-shadow`（world 层）。
- 二者不能混合（`Observer Continuity Shadow ≠ Workspace Memory`）。

## 边界 / 非目标

- 本 ADR 只定协议，不含实现。实现验收：`tsc` + `node --check` + mock（分层/不混合/白名单）+ 提交/推送。
- Global shadow 只读 observer 层（config / boundary state / recall index）；写侧只落 observer 白名单类别；禁项目知识入 global；`Global ≠ Workspace` 不混合（否则撞 231）。
- 无新能力；无 Agent/Autonomous 命名；`global 是 Observer 层，workspace 是 World 层`。

## 一句话

**全局影子是 Observer 的连续性，不是项目的知识——它回答"我是谁/我如何被约束/我在哪里观察过"，永远不回答"这个项目是什么"。**
