# ADR-0004: Outcome 读模型与可见降级

- 状态：已接受（v2.0-dev）
- 日期：2026-10-28
- 关联：ADR-0003、ADR-0007
- 定位：回答「读失败、坏件、降级怎么让读者看见」。

## Context

v1 的 `readRel`/`listMemories` 把读失败吞成空；`last*` 信号只 set 不 clear，一次瞬时失败永久挂横幅。ADR-0049「缺件不静默」在默认路径上不成立。

## Decision

- 所有 I/O 返回 `Outcome<T>`：`NOT_FOUND`（正常空）与 `PERMISSION`/`IO`/`CORRUPT`（失败）可区分。
- `loadAtoms` 遇到目录读失败 → 返回错误 + Signal；单文件失败 → 保留其余 + `atoms.partial` Signal。
- 读侧输出统一带 `RECALL_PREFIX` + 当前 active Signal；成功路径清除对应 Signal，不 sticky。
- 索引不可用 → 继续从 atoms 读，但留 `index` Signal；未知 mode → 显式错误 + 最近邻。
- 坏件不得渲染成空件；每条 Signal 必带「原因 + 后果」。

## Consequences

- 读者能区分「没有记忆」与「读不出来」。
- 测试必须覆盖正/负对照：健康路径零横幅。

## Non-goals

不把 Signal 做成持久化告警中心；不重试所有 I/O。
