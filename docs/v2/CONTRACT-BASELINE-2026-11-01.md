# CONTRACT C6 机械基线（2026-11-01）

> workspace：`D:\project\local-workbench`
> 抽样：30 个 Atom（按 entry 分层轮询；排除 entry=shadow 的会话元数据；Atom 级任务代理，不等于完整 Task）
> 库：954 atoms；读取错误：0

## 指标

- 目标 Atom 进入 Top-8：**24/30**（80.0%）
- 证据句柄可解析：**30/30**（100.0%）
- 五要素完整度（材料/用户话/决策/动作/摘要，0–5）：**2.10 / 5**
- 原文中不存在的决策理由：**0**（必须为 0）
- 读取错误（loadAllAtoms）：**0**

## 逐条

| # | entry | date | Top-8 | 完整度 | 证据 | 理由编造 |
|---:|---|---|:---:|---:|:---:|---:|
| 1 | _reports/cursor-memory-reverse-20261030.md | 2026-10-30 | ✓ | 3/5 | ✓ | 0 |
| 2 | _reports/search-code-review-20261030.md | 2026-10-30 | ✓ | 4/5 | ✓ | 0 |
| 3 | _work/shadow-similar-demo.ts | 2026-10-30 | ✓ | 3/5 | ✓ | 0 |
| 4 | D:/project | 2026-10-30 | ✓ | 3/5 | ✓ | 0 |
| 5 | local-workbench | 2026-11-01 | ✓ | 2/5 | ✓ | 0 |
| 6 | D:/project | 2026-10-30 | ✓ | 3/5 | ✓ | 0 |
| 7 | local-workbench | 2026-11-01 | ✓ | 2/5 | ✓ | 0 |
| 8 | D:/project | 2026-10-30 | ✓ | 4/5 | ✓ | 0 |
| 9 | local-workbench | 2026-11-01 | ✓ | 1/5 | ✓ | 0 |
| 10 | local-workbench | 2026-11-01 | ✓ | 3/5 | ✓ | 0 |
| 11 | local-workbench | 2026-11-01 | ✓ | 1/5 | ✓ | 0 |
| 12 | local-workbench | 2026-11-01 | ✓ | 3/5 | ✓ | 0 |
| 13 | local-workbench | 2026-11-01 | ✓ | 1/5 | ✓ | 0 |
| 14 | local-workbench | 2026-11-01 | ✓ | 2/5 | ✓ | 0 |
| 15 | local-workbench | 2026-11-01 | ✓ | 1/5 | ✓ | 0 |
| 16 | local-workbench | 2026-11-01 | ✓ | 2/5 | ✓ | 0 |
| 17 | local-workbench | 2026-10-31 | ✗ | 1/5 | ✓ | 0 |
| 18 | local-workbench | 2026-10-31 | ✗ | 2/5 | ✓ | 0 |
| 19 | local-workbench | 2026-10-31 | ✗ | 1/5 | ✓ | 0 |
| 20 | local-workbench | 2026-10-31 | ✓ | 2/5 | ✓ | 0 |
| 21 | local-workbench | 2026-10-31 | ✓ | 3/5 | ✓ | 0 |
| 22 | local-workbench | 2026-10-31 | ✗ | 1/5 | ✓ | 0 |
| 23 | local-workbench | 2026-10-31 | ✓ | 2/5 | ✓ | 0 |
| 24 | local-workbench | 2026-10-31 | ✗ | 1/5 | ✓ | 0 |
| 25 | local-workbench | 2026-10-31 | ✓ | 3/5 | ✓ | 0 |
| 26 | local-workbench | 2026-10-31 | ✗ | 1/5 | ✓ | 0 |
| 27 | local-workbench | 2026-10-31 | ✓ | 2/5 | ✓ | 0 |
| 28 | local-workbench | 2026-10-31 | ✓ | 1/5 | ✓ | 0 |
| 29 | local-workbench | 2026-10-31 | ✓ | 2/5 | ✓ | 0 |
| 30 | local-workbench | 2026-10-31 | ✓ | 3/5 | ✓ | 0 |

## 边界（必须读）

- 这是**机械基线**：Top-8 命中衡量“给定摘要/决策能否找回源 Atom”，不等于读者能还原完整线索。
- 证据解析只检查句柄指向的文件存在，不判断内容是否支持结论。
- 五要素完整度是结构性计数，不判断表述是否清楚、是否真的回答了“为什么”。
- 语义评分（读者盲测 0/1/2）和 5 类错误注入（假理由/错路径/旧版本/无证据/伪造历史）仍需人工/评审执行；本基线只提供可重复的起点。

## 复现

```powershell
node tools/contract-eval.ts --ws="D:\project\local-workbench" --sample=30 --out="D:\project\dsh-shadow\docs\v2\CONTRACT-BASELINE-2026-11-01.md"
```
