# CONTRACT C6 错误注入与读者盲测（2026-11-01）

> 版本：v2.11.0 · 样本：真实 workspace `D:\project\local-workbench` · 读者：独立 fresh-context agent（非人工）· 判卷：独立 agent
> 结论：**错误注入 5/5 可定位；盲测 10 例均分 5.6/8（70%），无编造理由/伪造历史，但材料与工具序列漏召回明显。**
> 这不是“通过 C6”，而是**可重复的基线 + 发现的缺口**。

## 1. 五类错误注入

自动测试：[`test/unit/contract-errors.test.ts`](D:\project\dsh-shadow\test\unit\contract-errors.test.ts)

| # | 注入 | 断言 | 结果 |
|---:|---|---|---|
| 1 | 假理由：有决策、无 `> 决策理由` | 只能显示“未明确”，不得生成“因为…” | ✅ |
| 2 | 错路径：材料 `missing/config.json` | `conflictRels` 标 stale；输出提示证据问题 | ✅ |
| 3 | 旧版本：同 entry 新旧 Atom | 旧项 `⚠被取代→新项`；纠正/撤回可定位 | ✅ |
| 4 | 无证据断言：用户原话路径不可验证 | `facts` 显示 `not_found`，不显示 `✓ verified` | ✅ |
| 5 | 伪造历史：查询从未发生主题 | 明确“无匹配”，不生成过去 | ✅ |

5/5 通过；**没有一条测试依赖 LLM 判断真假**。第 3 类的纠正/撤回同时验证了 C5 的 `shadow_adjudicate`。

## 2. 读者盲测（10 例 pilot）

生成器：[`tools/contract-blind.ts`](D:\project\dsh-shadow\tools\contract-blind.ts)

- 从真实库按 entry 分层抽 10 个 Atom（排除 `entry=shadow` 元数据）；每个 case 只给 query + Top-8 检索结果。
- 读者是独立 fresh-context agent，只读 `packets.json`；判卷 agent 读 `key.json` 与读者回答。
- 评分：materials / constraints / actions / evidence 四维各 0–2，满分 8；另判 reasonFabricated / confabulation。

### 结果

- **均分 5.6 / 8（70%）**
- 分维合计（10 例）：materials **13/20**、constraints **13/20**、actions **12/20**、evidence **18/20**
- **reasonFabricated = 0**（无编造理由）
- **confabulation = 0**（无伪造历史）

| case | materials | constraints | actions | evidence |
|---|---:|---:|---:|---:|
| 01 | 2 | 1 | 1 | 2 |
| 02 | 2 | 2 | 1 | 2 |
| 03 | 1 | 1 | 1 | 2 |
| 04 | 0 | 1 | 1 | 2 |
| 05 | 2 | 2 | 2 | 2 |
| 06 | 0 | 1 | 1 | 1 |
| 07 | 2 | 1 | 2 | 2 |
| 08 | 0 | 1 | 0 | 1 |
| 09 | 2 | 1 | 2 | 2 |
| 10 | 2 | 2 | 1 | 2 |

### 主要缺口（判卷原话归纳）

1. **材料漏召回**：case 04 期望的 8 份材料（tools.ts / code-index.ts / config.ts / ADR / eval 报告 / CHANGELOG …）全部未进 Top-8；case 06 材料实际是 `dsh-remote-wsl/README.md`，读者把相邻结果当材料；case 08 有真实材料却被整体判成噪声。
2. **动作只到结论，不到工具序列**：多个 case 只复述“verify + 推送”的结论，`job_output` / 后续 `edit/read` 缺失。
3. **无约束时的表达**：没有用户约束的 case 多写“不足”，而不是“无约束/无决策”，影响约束维度判断。
4. **边界混淆**：case 10 把相邻 atom 的完成陈述算作本 case 结果；未构成伪造，但指令/执行边界不清。

> 读者没有编造；失分主要来自 **packet 召回粒度不足**，不是“读者不诚实”。这与机械基线的 2.10/5 完整度相互印证。

## 3. 结论与下一步

- **C6 错误可定位**：5/5 自动通过；旧版本可纠正/撤回。
- **C6 读者盲测**：10 例 pilot 已建立；70% 不是合格线，是基线。
- **全量 30 例**与**人工读者复核**仍未做；pilot 只证明流程可运行。
- 下一步：先补材料/工具序列的召回粒度（而不是加更多归档/性能），再扩大到 30 例；继续把 **reasonFabricated / confabulation 必须为 0** 作为硬门。

## 4. 复现

```powershell
node tools/contract-blind.ts --ws="D:/project/local-workbench" --n=10
node tools/contract-eval.ts --ws="D:/project/local-workbench" --sample=30
node tools/test.ts --concurrency=8
```

盲测包与 key 写在 `_tmp/contract-blind-<date>/`（已 gitignore）；不要提交真实语料的 key。
