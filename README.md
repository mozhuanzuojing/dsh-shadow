# dsh-shadow v2

> **给 agent 记「为什么」的投影记忆。** 每条记忆是工作区里的一个 markdown 文件（`.shadow/atoms/`），派生索引可重建；换会话能按主题捞回，并告诉你它是否还作数。
>
> 状态：**v2 重写中（Phase 1）**。v1 的完整实现与文档冻结在 `legacy/v1` 分支与 tag `legacy-v1`；v2 尚未发布 npm。

## 它做什么

- **采集**：每个回合压成一条 atom（背景/材料 + 用户提示/决策 + 动作 + 概况 + 摘要）。
- **召回**：`recall_shadow(query)` 返回任务恢复包；`read_shadow(topic)` 分层穿透；`shadow_query` 跨类型查。
- **可核查**：每条记忆带路径句柄与证据指针；派生件可整份重建；坏件 ≠ 空件。
- **降级可见**：读/写/索引失败有 `Signal`，恢复后清除；未知 mode 显式失败。

## 默认面（v2）

| 工具 | 参数 | 说明 |
|---|---|---|
| `read_shadow` | 12 | 10 个核心 mode + 5 个核心透镜 |
| `recall_shadow` | 2 | 内部 = `read_shadow({mode:"recovery"})` |
| `shadow_query` | 3 | 跨类型 ShadowNode（带 evidence） |
| `shadow_toolset` | 4 | 工具集台账（v2 Phase 1 显式 unavailable） |
| `shadow_lab`（可选） | 3 | 51 个研究 mode；`lab.enabled:true` 时注册，写型需 `write:true` |

核心 mode：`recovery` · `query` · `episode` · `decision` · `task` · `context` · `knowledge` · `query-log` · `shadow-report` · `shadow-manifest`。

## 安装（开发态）

```powershell
# 以 link: 方式装进 DSH profile（示例）
# profile package.json: "dsh-shadow": "link:D:/project/dsh-shadow"
npm install
npm run build
npm run verify
```

新克隆后 `npm run verify` 是自包含的（不要求工作区有 `.shadow`）；需要真实语料的 benchmark 走 `npm run verify:corpus`。

## 文档

- [架构](./docs/v2/ARCHITECTURE.md)
- [工程约定](./docs/v2/CONVENTIONS.md)
- [v1 → v2 迁移](./docs/v2/MIGRATION.md)
- [研究面 lab](./docs/v2/LAB.md)
- [Parity 与契约](./docs/v2/PARITY.md)
- v1 归档：[docs/v1/](./docs/v1/)

## 明确不做

不引向量库 · 不跑常驻服务 · 不改写原子记忆（只派生视图） · 不把记忆内容当指令 · 不把研究 mode 塞回默认 schema。

## License

MIT
