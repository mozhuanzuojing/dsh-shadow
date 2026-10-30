# dsh-shadow v2

> **给 agent 记「为什么」的投影记忆。** 每条记忆是工作区里的一个 markdown 文件（`.shadow/atoms/`），派生索引可重建；换会话能按主题捞回，并告诉你它是否还作数。
>
> 状态：**v2.2.0 已发布（2026-10-30，tag `v2.2.0`）**。v1 的完整实现与文档冻结在 `legacy/v1` 分支与 tag `legacy-v1`；npm registry 尚未发布（按 [ADR-0012](./docs/adr/0012-release-and-versioning.md) 另行执行）。变更见 [CHANGELOG](./CHANGELOG.md)，升级/回滚见 [MIGRATION](./docs/v2/MIGRATION.md)。

## 它做什么

- **采集**：每个回合压成一条 atom（背景/材料 + 用户提示/决策 + 动作 + 概况 + 摘要）。
- **召回**：`recall_shadow(query)` 返回任务恢复包；`read_shadow(topic)` 分层穿透；`shadow_query` 跨类型查。
- **可核查**：每条记忆带路径句柄与证据指针；派生件可整份重建；坏件 ≠ 空件。
- **降级可见**：读/写/索引失败有 `Signal`，恢复后清除；未知 mode 显式失败。

## 默认面（v2）

| 工具 | 参数 | 说明 |
|---|---|---|
| `read_shadow` | 13 | 10 个核心 mode + 6 个核心透镜（含 `facts`） |
| `recall_shadow` | 2 | 内部 = `read_shadow({mode:"recovery"})` |
| `shadow_query` | 3 | 跨类型 ShadowNode（带 evidence） |
| `recall_similar` | 2 | 相似过往任务卡（当时请求/决策/结果/教训/来源），按相关+新近+重要性召回 |
| `search_code` | 2 | 工作区代码只读检索：持久索引（语法块 + 增量 + trigram 候选）+ BM25 + tree-sitter 符号 + 向量（默认本地 e5-small 神经模型，失败回落哈希，可选 HTTP）；支持 `.gitignore`/`exclude` |
| `shadow_toolset` | 4 | 真实能力台账：survey/category/need 只读探测；install 需宿主 `allowed-once` 审批 |
| `shadow_lab` | 3 | 51 个研究 mode；**无开关，始终注册**；写型需 `write:true` |

核心 mode：`recovery` · `query` · `episode` · `decision` · `task` · `context` · `knowledge` · `query-log` · `shadow-report` · `shadow-manifest`。

## 安装

v2.0.0 以 git tag 发布，**npm registry 尚未发布**（ADR-0012）。两种装法：

```powershell
# 方式一：本地 link（开发态 / 本机验证）
# profile package.json: "dsh-shadow": "link:D:/project/dsh-shadow"
npm install
npm run build
npm run verify

# 方式二：从 tag 构建 tarball
git checkout v2.0.0
npm install; npm run build; npm pack      # → dsh-shadow-2.0.0.tgz
# 在 DSH profile 目录：pnpm add file:<path>/dsh-shadow-2.0.0.tgz
# profile 的 dsh.profile.bundles 加 "dsh-shadow"；无功能开关，lab 也始终注册
```

新克隆后 `npm run verify` 是自包含的（不要求工作区有 `.shadow`）；需要真实语料的 benchmark 走 `npm run verify:corpus`。

## 文档

- [架构](./docs/v2/ARCHITECTURE.md)
- [工程约定](./docs/v2/CONVENTIONS.md)
- [v1 → v2 迁移](./docs/v2/MIGRATION.md)
- [研究面 lab](./docs/v2/LAB.md)
- [Parity 与契约](./docs/v2/PARITY.md)
- [当前实现状态](./docs/v2/STATUS.md) · [变更记录](./CHANGELOG.md) · [发版策略 ADR](./docs/adr/0012-release-and-versioning.md)
- v1 归档：[docs/v1/](./docs/v1/)

## 已知限制（v2.2.0）

- `shadow_toolset` 的 install **真机执行路径未验证**（测试用假 runner）；台账版本是 v1 2026-09 快照，不是本机实测；探测失败只说「未检出」（PATH 是宿主启动快照）。
- `forget` 默认**不启用**陈旧类遗忘（`minHits=0`/`maxActive=0`）；要启用需显式配置。Forget≠Delete：只移出活跃集，文件不删。
- 派生件只在**无参 `read_shadow`** 时物化（`indexes/{materials,affaires,episodes,abstracts}`），无 GC；删除 `indexes/` 可整份重建。
- lab 与 core **同包**（`src/lab/vendor/`）；ADR-0012 的独立包 `dsh-shadow-lab` 未拆（设计见 [ADR-0013](./docs/adr/0013-lab-package-split.md)）。
- **旧 v1 存储不做支持**：运行时只读 `.shadow/atoms/`，日期树与 `_meta.json` 不读不导入。
- **项目事实只抽「带路径」的**：从用户原话抽 `X 是/=/：<路径>`，逐条可经 Evidence Gate 核验；启发式非 LLM，复杂句式会漏（[ADR-0015](./docs/adr/0015-project-facts-evidence.md)）。
- **宽松召回是字面近似**：严格命中零结果时用 CJK 2-gram / BM25 兜底并标注「宽松匹配（非语义）」；同义改写无字面重叠、翻译、跨工作区仍可能不中（[ADR-0014](./docs/adr/0014-cjk-bigram-fuzzy-recall.md)）。

## 明确不做

不引向量库 · 不跑常驻服务 · 不改写原子记忆（只派生视图） · 不把记忆内容当指令 · 不把研究 mode 塞回默认 schema。

## License

MIT
