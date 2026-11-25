# dsh-shadow

多维投影记忆：给 agent 记住每一句话背后的**为什么**。点（原始证据）→ 线（同一件事的时间串）→ 面（取景后的投影）→ 观察意识（全局聚合）；线是源，atoms 是证据账本，派生件可整份重建。

## 它会做什么

- **采集**：每个回合成一个「点」，内含完整背景（坐标 · 证据链 · 材料 · 用户提示/决策 · 动作 · 概况），追加进工作区 `.shadow/lines/<…>.md`；点内嵌完整正文，背景可无损重建。
- **默认读先给「面」**：`read_shadow()` / `read_shadow(topic)` 先给 Observer 视角取景的「面」（Episode/Task/Decision/材料 + 显式盲区），随后才是下钻检索点；`raw:true` 取纯检索原文。
- **召回与查询**：`recall_shadow`（任务恢复包）、`shadow_query`（跨类型 ShadowNode，带 evidence）、`recall_similar`（相似过往任务卡）、`shadow_adjudicate`（correct/withdraw/restore/pin/unpin/retain，全部追加源记录）。
- **代码检索**：`search_code` 在工作区只读检索，持久索引（语法块 + 增量）+ BM25 + tree-sitter 符号 + 向量段（默认本地 `Xenova/multilingual-e5-small`，不可用时回落哈希并在结果中注明）。
- **能力台账**：`shadow_toolset` 只读探测本机能力，安装必须经宿主审批；`shadow_lab` 提供 51 个研究 mode（写型需显式 `write:true`）。
- **降级可见**：读/写/索引失败会留 `Signal`，恢复后清除；未知 mode 显式失败，不静默。

## 怎么用

装好后无需配置：本插件**没有功能开关**，lab 也始终注册。数据落在**当前工作区**的 `.shadow/` 下（atoms / lines / indexes），换工作区就是换记忆。

- 想恢复上次的上下文：`recall_shadow("上次在做的事")`；
- 想看某件事的大背景：`read_shadow({ topic })` 或 `read_shadow({ background: true, topic })`；
- 想按主题穿透某一维：`read_shadow({ dim, topic })`；
- 想纠正一条记忆：`shadow_adjudicate({ action: "correct", target, note })`。

## 边界与代价

- **安装体积**：默认能力带本地推理与符号解析，`npm install` 会拉入 `onnxruntime-node`/`onnxruntime-web` 与 `tree-sitter-wasms`，实测安装后约 0.5 GB（包本身 ~0.5 MB）。
- **首次向量检索**：需要从 HuggingFace 下载 `Xenova/multilingual-e5-small`（ONNX q8）到 `~/.cache/huggingface`；离线首次会回落哈希向量（非语义），结果里会注明。
- **运行要求**：Node ≥ 26，DSH ≥ 0.2.2-rc.2。
- **远端工作区**：Windows 上的 UNC / WSL（9P）路径会跳过派生 SQLite 索引，直接读 atoms，并留 `index/REMOTE_FS` 信号（派生索引可重建，atoms 是权威）。
- **隐私**：记忆只写在工作区 `.shadow/`，不上传；`search_code` 只读。

## 验证到哪一步

- 仓库内 `npm run verify` 覆盖 typecheck、全部测试文件（单元 / 失败注入 / e2e / parity）、分层门与文档门。
- `npm run check:pack` 会把 `npm pack` 的 tarball 装进隔离目录并真实 `import`，确认安装形态可用（不只是仓库内联调能跑）。
- 已发布形态在 Plugin Manager 的显示（标题 / 描述 / 图标）需要安装后实际看一眼；未安装时不做断言。
