# ADR-0050: API Canonical Rename（读侧同名硬切，v1.13.0）

- 状态：**已接受（2026-09-09）**——破坏性正名：删旧 mode/参数名，旧名显式拒绝，无兼容别名。
- 决定日期：2026-09-09
- 关联 ADR：ADR-0004（Query Router）、ADR-0008（Observer Kernel）、ADR-0023（Reality Model）、ADR-0029（Identity Continuity）、ADR-0031（Recall Continuity）、ADR-0035（Verification）、ADR-0045（Evidence Lineage）
- 关联术语：`../CONTEXT.md`（记忆恢复 / Identity Continuity / AtomEvidenceRef / Evidence Gateway / VerificationRun）

## Context

`read_shadow` 上曾出现多组同名双义（下表为**改名前**撞车面；正名见 Decision）：

| 撞车 | A（改名前） | B（改名前） |
|------|-------------|-------------|
| `identity` | `args.identity` → curated Identity（soul）——**保留** | `mode:"identity"` → Identity Continuity 推进 → **正名 `identity-advance`** |
| `recall` | `mode:"recall"` → Task Recovery Bundle → **正名 `recovery`** | `recall-*` → Recall Continuity（**保留**）；无 mode 带 topic → 主题召回（**保留**）；工具名 `recall_shadow`（**保留**，内部走 `recovery`） |
| `verify` | `args.verify` → Evidence Gateway → **正名 `verifyEvidence`** | `mode:"verify"` → VerificationRun（**保留**） |
| `EvidenceRef` | Gateway `{path}`（`core/types.ts`）——**保留名** | Lineage `{type,locator}` → **正名 `AtomEvidenceRef`** |
| `reality` | federation `mode:"reality"` 注册 RealityEvidence → **正名 `real-evidence`** | Reality Model 已用 `model-*`（CONTEXT）；ADR-0023 旧文曾写 `mode:"reality"` 查 Claim |

硬删后若仍 fallthrough 进默认主题召回，会出现「看起来成功、语义已错」。故必须**显式拒绝**旧名。

## Decision

1. **硬切正名**（无长期别名）：

| 废止 | 正名 |
|------|------|
| `mode:"recall"` | `mode:"recovery"`（`recall_shadow` 内部跟改） |
| `mode:"identity"`（推进 timeline） | `mode:"identity-advance"` |
| `args.verify` | `args.verifyEvidence` |
| `mode:"reality"`（federation 注册） | `mode:"real-evidence"` |
| lineage `EvidenceRef` | `AtomEvidenceRef` |
| `args.recall` 旁路 | 删除；纳入废止表 |

2. **保留**：`args.identity`（读 Identity）、`mode:"verify"`、`recall-*`、`model-*`、Gateway `EvidenceRef`、`realityEvidenceRef` 字段名。

3. **旧名行为**：`runReadShadow` 在 seam 链之前命中废止表 → 返回 `RECALL_PREFIX` + `已废止：X → 请用 Y`，**禁止**落空进默认召回。

4. **版本**：`1.13.0`（破坏读侧入参/mode 名，非能力膨胀）。mode 总数仍为 61（只改名）。

## Consequences

- 外部提示词 / 预设若仍传旧 mode，会收到可见废止提示（不再静默错答）。
- 历史 ADR 正文保留原措辞；ADR-0023 / ADR-0015 顶加勘误指针。
- 测试与棘轮集合同步改名；新增废止拒绝用例。
- 「recall」一词仍多义（工具名 / Continuity `recall-*` / `config.recall` / 主题召回）——靠 mode 正名 `recovery` + 注释桥消歧，不改工具名。
