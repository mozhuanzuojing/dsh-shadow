# ADR-0053: 同名双义收口（ADR-0050 保留面的第二轮正名，v1.15.5）

- 状态：**已接受（2026-09-10）**——破坏性正名：再收 3 个「一个词两层含义」的保留项；另 2 项**明确判定保留**并写明理由。
- 决定日期：2026-09-10
- 关联 ADR：ADR-0050（API 正名硬切，本 ADR 是它的第二轮）、ADR-0045（Evidence Lineage → `AtomEvidenceRef`）、ADR-0035（VerificationRun）、ADR-0021（Observer Federation / ObserverDifference）、ADR-0043（Shadow Contract）
- 关联术语：`../CONTEXT.md`（VerificationRun / Evidence Gateway / AtomEvidenceRef / ObserverDifference）

## Context

ADR-0050 硬切了 4 个旧名，并在 §2 留下一份「**保留**」清单：`args.identity`、`mode:"verify"`、`recall-*`、`model-*`、Gateway `EvidenceRef`、`realityEvidenceRef` 字段名。当时的口径是靠**注释桥**消歧（「`recall` 一词仍多义……靠 mode 正名 `recovery` + 注释桥消歧，不改工具名」）。

保留清单里仍有 3 项属于**同一个词承担两层含义**，注释桥只能让人不误用，不能让人**不误读**：

| 词 | 层 A | 层 B | 今天靠什么区分 |
|----|------|------|----------------|
| `verify` | `mode:"verify"` = 跑 VerificationRun（证据运行） | `args.verifyEvidence` = 经 Evidence Gateway 验**证据路径** | 注释（`index.ts` 参数描述里写「≠ mode:verify」） |
| `EvidenceRef` | Gateway `EvidenceRef{path}`（`core/types.ts`） | lineage `AtomEvidenceRef{type,locator}`（`core/lineage.ts`） | 只差 `Atom` 前缀，类型系统不拦混用 |
| `reality*` | `mode:"real-evidence"`（正名后） | 字段 `realityEvidenceRef` **仍在用已废止的词根 `reality`**；`index.ts` 自己标注「字段名历史遗留」 | 无 |

`mode:"reality"` 已于 ADR-0050 废止，但**同族的字段名**没跟着改——这是「正名硬切」只切了一半的残留。

## Decision

### 1. 再正名 3 项（复用已有正名，不生造新词）

| 废止 | 正名 | 依据（正名从哪来） |
|------|------|--------------------|
| `mode:"verify"` | **`mode:"verification"`** | 对象名早已是 `VerificationRun`（ADR-0035）；`verification` 是本仓既有词 |
| Gateway `EvidenceRef` | **`GatewayEvidenceRef`** | 沿用 ADR-0050 给 lineage 的 `AtomEvidenceRef` **同一构词法**（来源前缀 + `EvidenceRef`） |
| 字段 `realityEvidenceRef` | **`realEvidenceRef`** | 对齐 ADR-0050 已定的正名 `mode:"real-evidence"` |

- 代码内**不保留旧名兜底**（ADR-0050 同一口径）。
- `mode:"verify"` 进 `RETIRED_MODES` → 显式拒绝并指向 `verification`。
- **`realityEvidenceRef` 不做拒绝**：它是参数而非 mode，旧值会自然落空（`""`），不构成「看起来成功、语义已错」。

### 2. 明确判定**保留** 2 项（并写明理由，不再靠注释桥）

| 保留 | 为什么不改名 |
|------|--------------|
| `recall` 的多义 | `config.recall` 之下还有 `cooldownTurns` / `debug` / `deprioritize`——这些是**整条召回管线**的旋钮，**A 档关键词召回同样使用**。改名成 `semanticRecall` 会与语义不符（`semanticRecall.cooldownTurns` 是错的）。四义由**位置**区分：`config.*` / `mode:*` / 工具名 / 无 mode+topic。 |
| `args.identity` | ADR-0050 已把与之撞车的 `mode:"identity"` 正名为 `identity-advance`，二者今天已不撞。再改它就要**生造**一个词（如 `soulIdentity`/`identitySnapshot`），违反本仓「禁止生造黑话」。 |

> 本 ADR 初稿曾打算把 `config.recall` → `config.semanticRecall`；**核对 `cooldownTurns`/`debug`/`deprioritize` 的作用域后否决**——这不是取舍，是改名会变错。

### 3. 版本

`1.15.5`（破坏读侧入参/mode 名与内部类型名；不新增能力，mode 总数不变）。

## Consequences

- 外部提示词 / 预设若仍传 `mode:"verify"`，收到可见废止提示（不再静默错答）。
- `dist` 类型声明随之改名；`index.ts` 导出的 `EvidenceRef` 变 `GatewayEvidenceRef`（**导出面变化**）。
- `mode:"verify"` 的参数描述（`evidenceRefs` / `runtimeVersion`）与提示词接线同步改口径。
- 测试棘轮同步：`recall-envelope` 的「保留面仍可用」断言从 `mode:"verify"` 改为 `mode:"verification"`，并新增 `mode:"verify"` 的废止拒绝用例。
- **历史 ADR 正文保留原措辞**（ADR-0050 同口径）；本 ADR 是它们的新指针。

## 自检

- [x] 3 个正名全部**复用本仓已有词**，无生造。
- [x] 保留的 2 项各自写明「改名会错在哪」，不是含糊的「暂不改」。
- [x] 与 ADR-0050 一致：硬切、无兼容别名、旧 mode 显式拒绝。
- [ ] **未验证**：本轮尚未跑构建与回归（落地时补；见 CHANGELOG v1.15.5 的验证段）。
