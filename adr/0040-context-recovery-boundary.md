# ADR-0040: Context Recovery Boundary（上下文恢复 / 上下文复核边界，提议·暂不实现）

- 状态：**已提出（2026-09-07，先冻结边界；暂不实现**——用户明确"不会马上写代码"）
- 决定日期：2026-09-07
- 关联术语：`../CONTEXT.md`（Memory Atom / Episode / 收口归档 / Task）
- 关联 ADR：ADR-0037（Evidence≠Interpretation）、ADR-0038（Episode=投影）、ADR-0039（Task/Event）

## Context

Cursor 的三层 Memory（① Conversation Evidence ② Derived Context ③ Revalidation）暴露了一个 dsh-shadow 尚未回答的问题：

> dsh-shadow 现在能回答"**发生了什么 / 为什么决定**"（Observation→Memory Atom→Episode→Decision），但还不能回答"**以前知道的东西，现在还能不能作为行动依据**"。

Cursor 是**开发助手**（"记住路径"），而 dsh-shadow 的目标是**可验证的 Observer 连续性**——所以**吸收 Cursor 的三个点，但绝不直接复制"记住路径"式**。

用户 2026-09-07 判断：**dsh-shadow 下一阶段不是"更聪明地记忆"，而是解决"以前知道的东西现在还能不能作为行动依据"。**

## Decision

在既有四层（Observation / Memory Atom / Episode / Decision）之上，**新增第 5 层 Context Validation Layer（上下文复核层）**，并**冻结下列边界**。**暂不实现**（先让 v1.2.x 真实数据积累 + 测指标，再决定实现）。

### 冻结边界（P0/P1/P2 + invariants）

**P0 · Candidate + Revalidate（最高价值）**：`Memory → Candidate → Validation → Current Context`；**禁** `Memory → Truth` 直通。路径不是永久事实（昨天 `补丁20260907`，今天 `20260908`），Memory 若固化会漂移；发现过期就**重扫**。

**P1 · Evidence Pointer**：每条记忆要知道"**为什么知道这个**"（来源 turn / evidence pointer）。这是 provenance，让记忆可被追问"为什么知道"。

**P2 · Transformation Trace**：`Mapping ≠ Source Fact`。例：
```yaml
Observation:  path: D:\U8\u8-20260630\OpenAPI适配+U8补丁20260907
Representation:
  wslPath: /mnt/d/U8/u8-20260630/OpenAPI适配+U8补丁20260907
  rule: windows_wsl_mapping      # 转换规则（非事实），可回溯
```
否则未来 replay "为什么知道这个路径" 回答不了。

**ContextReference（不是 Memory）**：
```typescript
interface ContextReference {
  subject: string;                 // 如 "patch-directory"
  value: string;                   // 如 `D:\U8\...`
  source: MemoryAtom[];            // 来源证据（facts）
  status: "validated" | "stale" | "unknown"; // 当前是否还能用
}
```
> Memory = 曾经观察到（historical）；ContextReference = **当前是否还能使用**（current usability）。二者不同。

### Invariant 映射（与既有原则自洽，不破坏）

| 既有原则 | 新增对应 |
|---|---|
| Experience ≠ Truth | **Memory ≠ Current State** |
| Representation ≤ Evidence | **Context ≤ Validation** |
| History ≠ Reality | **Replay ≠ Current Environment** |
| Accessibility ≠ Epistemic Status | **Available Path ≠ Valid Path** |

## 明确不做

- ❌ 现在写代码（先 v1.2.x 真实数据 + 测指标再决定）。
- ❌ 叫 "Memory Upgrade" / "Long Term Memory v2"（容易跑偏）；叫 **Context Recovery Boundary / Observer Context Validation Layer**。
- ❌ 复制 Cursor"记住路径"式记忆（那是开发助手行为；dsh-shadow 目标是可验证 Observer 连续性）。
- ❌ 让 Memory 变成知识库；Memory 始终是**可验证的历史证据**。

## 下一阶段指标（先记录，供第二次 Replay）

在既有指标上增加：

```text
Context Validity Rate = 历史引用仍有效比例
  例：历史引用 100 → 仍有效 72 → 需重新验证 28
```

这才能回答"**以前知道的东西现在还能不能作为行动依据**"——比"文件多了多少"更有价值。

## 自检（本 ADR 无代码，仅记录）

- [x] 与 ADR-0037/0038/0039 自洽（Evidence≠Interpretation / Episode=投影 / Task=生命周期），不冲突。
- [x] 吸收 Cursor 但保持 Observer Runtime 原则：Memory 是**可验证历史证据**，不变成知识库。
