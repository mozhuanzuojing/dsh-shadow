# ADR-0093: 「标准格式出口」的评估 —— 以 strix 的 `findings.sarif` 为样本（**不引入**）

- 状态：**已接受**（2026-09-15 / `v1.15.91`）
- 关联 ADR：**ADR-0091** §2①（`strix` 的退出码语义与机读产物 —— 本条评估「要不要照着做一个」）·
  **ADR-0087** §C①（**不允许建没有消费方的机制** —— 本条的判据源）· **ADR-0086**（受保护契约面的登记册）·
  **ADR-0049**（缺件不静默 —— 「退出码 0 只覆盖被分析的部分」那条判据）

## Context

用户在 2026-09-15 的答复里点名：**评估 strix 的 `findings.sarif` 那类「标准格式出口」**。
上一轮（`adr/0091` §2①）已记下样本事实：`strix` 每次运行产出**三元组**——
`penetration_test_report.md`（人读）/ `vulnerabilities.json` + `findings.sarif`（**SARIF 2.1.0**，机读）/
`run.json`（运行元数据：`status`、`llm_usage.cost` vs budget），外加退出码 `0/1/2` 与那句
「**`0` 只覆盖被分析的部分**」（`strix/AGENTS.md:36-37`）。**本 ADR 只回答一件事：本仓该不该有等价物。**

## §1 先清点本仓**现有**的机读出口与其消费方（可复算）

| 出口 | 位置 | 消费方（**必须点名**） |
|---|---|---|
| 插件清单（宿主契约） | `package.json` 的 `dsh.bundle.patch` → `cordis.patch.yml` · 工具参数的 **JSON Schema** | **宿主**（DSH 加载与工具调用）—— 这是本仓**唯一**面向外部消费方的机读出口 |
| 审计/评测清单（5 份） | `tools/{audit-ratchet.baseline,retrieval-eval.baseline,retrieval-eval.protocol,toolset-authority,toolset-seed}.json` | 仓内：棘轮测试 + 审计工具（**离线**、同源） |
| 图与检查产物（4 份） | `docs/{absorb-verdict,architecture-seams}.{candidate,visual-check}.json` | 仓内：可视化与 `visual-check` |
| 记忆侧派生件 | `.shadow/_meta.json` · `_index.md` · `query-log/<date>.jsonl` | 读侧自己 + agent（`adr/0003`：派生件不是 source） |

⇒ **本仓已经在用「标准格式出口」**：**给真正的消费方（宿主）的那一份**（清单 + 工具 schema）。
其余机读产物的消费方**全在仓内**。

## §2 三问（引入 SARIF 必须逐条回答）

| 问 | 答案（本轮实测/清点） |
|---|---|
| **谁消费？** | SARIF 的消费方是**第三方静态分析平台**（CI 代码扫描、GitHub Code Scanning 一类）。本仓的「发现」是**记忆投影与治理判据**（线索变多 / 计数漂移 / 闭包失效），不是**代码缺陷**；要塞进 SARIF 就得**先编一套 ruleId 体系** —— 那是造一个**没有消费方的本体** |
| **代价？** | 要么引 schema/库（撞 ADR-0001 的取向），要么手写 emitter；并且按本仓口径还得再配一条「机读产物与报告必须同源」的门 |
| **收益？** | 只有「第三方能消费」这一条 —— 而本仓今日**没有**第三方消费方（消费方清单见 §1） |

## Decision：**不引入 SARIF**（也不造等价的第三方格式）

理由是本仓**既有的**一条铁律，不是新偏好：**不允许建没有消费方的机制**（`adr/0087` §C①；
`audit:wiring` 的 A/B 两类就是为这条造的）。**SARIF 的消费方在仓外，本仓没有**。

**但吸收两条判据 —— 且经清点，本仓已具备，故只登记不实装：**

1. **机读产物必须与报告同源**（`strix` 的报告与 `findings.sarif` 出自同一次运行）。
   本仓对应物：5 份清单**全部由生成器产出、由棘轮消费同一份** —— 改台账/改版本而不重跑生成器 ⇒ **棘轮变红**
   （`test/toolset-authority.test.ts` ②⑦、`tools/audit-ratchet.lib.ts`）。
2. **「这次跑了什么」要有留档**（`strix` 的 `run.json`：状态 + 成本 vs 预算）。
   本仓对应物：`tools/toolset-authority.json` 的 `verifiedAt` + `counts`（并含**拒写**门：自洽失败/「实测」无据 ⇒
   `process.exit(1)` 且**不落盘**）；`tools/retrieval-eval.protocol.json` 记协议与容差、`--determinism-check` 双跑逐字比。
   ⇒ **已具备**（范围仅这两个工具，不是全仓统一——如实记录，不夸大）。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 引入 SARIF（或自造等价格式）给外部平台 | 无消费方 ⇒ 造死机制（本仓已八次记录同族缺陷：机制存在、没人调用） |
| 只做「导出 JSON 摘要」给将来的门用 | **为将来建的机制**同样是没消费方；真需要时那一步的成本很低（清单生成器已存在） |
| 把 `read_shadow` 的返回从 markdown 改成机读 JSON | 直接撞**读侧契约**：`tool-output-v1` 的 hard 半边与「数据非指令」前缀都是按**给模型读的文本**设计的（`adr/0002`/`0044`） |
| 照 `strix` 把退出码语义也一起搬 | 本仓**已有**（`corpus-health` 的 `NORMAL ≠ 通过`、棘轮退出码 0/1/2、`audit:*` 的「0 ≠ 没找到」）⇒ `adr/0091` §2① 已判「同源，登记即可」 |

## Consequences

### 正

- 避免了一次**照样本抄形态**（本仓已有先例教训：`insta` 快照库是「照文档吸收」的反例，`adr/0087` 不吸收项 5）。
- 把「本仓已有什么机读出口、谁在消费」写成了一张可复算的表（此前散在各自工具里）。

### 负 / 已知边界（诚实）

- **未实测 SARIF 的消费链路**（未装 GitHub Code Scanning、未跑 `strix`）⇒ 「SARIF 的消费方在仓外」这句是**按用途判断**，
  不是端到端实测。
- **未读 SARIF 2.1.0 规范**（只读了 `strix` 的产物清单描述与 `AGENTS.md:37`）⇒ 本 ADR 评的是**「要不要有这条出口」**，
  不是「SARIF 该怎么做」。
- **未做全仓「机读产物」普查**（§1 的表来自 `tools/*.json` 与 `docs/*.json` 的枚举 + `package.json` 的 `dsh` 段；
  可能还有未被这两处枚举到的产物）。
- 若将来**真**出现第三方消费方（如把本仓的审计结论喂给别人的平台），本条应**重新评估** —— 那时 §2 的三问答案会变。

## 怎么重放

```powershell
cd D:\project\dsh1\vendor\dsh-shadow
Get-ChildItem tools\*.json, docs\*.json | Select-Object -ExpandProperty Name    # §1 的清单
Select-String -LiteralPath package.json -Pattern '"dsh"' -Context 0,3           # 面向宿主的那个出口
Select-String -LiteralPath ..\_src\strix\AGENTS.md -Pattern 'Exit codes|findings.sarif|run.json'
```

## 补记（2026-09-25，`v1.21.8`）：§1 的「图与检查产物（4 份）」缩为 2 份，且**不再随包发布**

**触发**：用户指令「历史文档也没有清理吗」⇒ 追问后定案「4 个签入产物**留仓但移出发布面**；12 个本地产物**直接删**」。

- **§1 那一行的更正（本补记即更正，§1 正文不改写）**：`docs/{absorb-verdict,architecture-seams}.{candidate,visual-check}.json`
  的 **4 份** ⇒ 现只剩 **2 份** `*.candidate.json`。两份 `*.visual-check.json`（连同 2 份 `*.visual-check.html`
  与 8 张 PNG）**已删除**：它们是 `.gitignore` L9 `docs/*.visual-check.*` 明确排除的**本地产物**，
  **未进版本控制 ⇒ 删除不可恢复**（该代价在用户选项里已明示）。§1 该行的「4 份」与本文件 L81 的重放命令
  （`docs\*.json` 现在只列 2 个）都以此为准。
- **发布面（本条更实质的一半）**：`package.json` 的 `files` 由 `"docs"` 改为 **`"docs/*.md"`**。两个效果：
  ① 4 份 `candidate.json` / `html`（1.27 MB）**留在仓内**（§1 登记的证据不丢）但**不再随包分发**；
  ② 顺带修掉一个**真实缺陷** —— npm 的 `files` 白名单**无视 `.gitignore`**，所以原先的 `"docs"` 把 12 个
  「本意不入库」的 `visual-check.*`（0.96 MB）**也打进了包**。
  实测：包 **1.8 MB → 621.5 kB**、unpacked **4.0 MB → 1.7 MB**、files **513 → 497**（−16 正好是那 16 个产物）。
- **根因（为什么这块长期没被任何门发现）**：引用门 `tools/citation-audit.lib.ts` 的 `CITE` 正则只认
  `md|ts|mts|json|ya?ml|py|sh|ps1` ⇒ **`.html` / `.png` 永远在扫描面之外**。这类产物只能靠人 / ADR 级决定；
  已在 `AGENTS.md` 记一笔。
- **未做**：**不给 HTML/PNG 建扫描** —— 那要造一个**没有消费方**的机制，正是本 ADR §2 第一问否掉的东西。
