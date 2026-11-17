# ADR-0027: 任务面提为「可选默认轴」

- 状态：proposal
- 日期：2026-11-17
- 关联：ADR-0026（升维/面轴）、ADR-0025（默认给面）、`read_shadow({dim})`
- 定位：回答「默认的『面』用哪个轴织」——是否/如何让「任务面」成为可选默认。

## Context

- ADR-0025：默认读首段给「面」，当前面轴 = **会话**。
- ADR-0026：已实现 `task` 面轴（确定性词法聚类），`read_shadow({dim:"task"})` 可读。
- 实测（真实语料）：task 聚类到 **13 面**，但**最大面吃 47% 点**、阈值敏感（0.08→6 面 / 0.35→21 面）⇒ **task 面目前是「粗任务面」**，不适合无条件当默认。

## Decision

- **保持默认面轴 = 会话**（精确、稳定）；task 面**不无条件提为默认**（它太粗，会把不同事糊成一面）。
- 提供**可选默认轴**：新增配置 `face.axis: "session" | "task"`（默认 `"session"`）。
  - `read_shadow({dim:"face"})` 用配置的轴；`read_shadow({dim:"task"})` 强制任务面；`dim:"face"` + `face.axis="task"` 等价于 task。
- 该配置**只改默认面的织法**，不改 atoms/面内容/信封/守恒；C1–C7 不变。
- 变更默认行为（用户设 `face.axis="task"`）时，README/STATUS 必须写明「task 面是词法近似、粗分」。

## Consequences

- 正：用户想以「这件事」为主视角时，可一行配置切换，无需每次传 `dim`。
- 负：task 面粗（最大面 47%），设成默认会损失"按会话"的精确；故默认仍 session。
- 边界：解析质量的根在**点坐标（entry/goal 覆盖低）**，本 ADR 不承诺"精确任务边界"。

## Non-goals

- 不把 task 设为无条件默认；不引 LLM 语义聚类造假关系；不改 C1–C7。

## 实施（方案先行，后接码）

- A：本条 ADR（proposal）。
- B：`contract/config.ts` 加 `face.axis`（默认 session，未知值显式失败）；`dimension.ts` 读配置；`schema/docs` 同步；测试。
- C：如用户后续要求，再评估「按任务为默认」的精确度门槛。
