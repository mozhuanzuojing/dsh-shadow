# ADR-0019: 代码检索（"忆起代码"）方案与取舍

- 状态：**accepted（阶段 1 `search_code`、阶段 2 tree-sitter 符号、阶段 3 embedding 管线 均已接入；embedding 因本机无 provider，真机语义检索不可用）**
- 日期：2026-10-30
- 关联：ADR-0014（BM25）、ADR-0017（技能卡）、调研 `_reports/cursor-memory-reverse-20261030.md` / `shadow-memory-landscape-20261030.md`
- 定位：回答「找代码/忆起代码」该不该由记忆层承担，以及用什么检索。

## Context

- Cursor 的"忆起代码"= **Merkle 增量 + 语法切块 + embedding 语义检索 + simhash 复用索引**（官方博客，2026-01；语义搜索 +12.5% 准确率）。Basic Memory = 全文 + 语义 + 知识图。
- dsh-shadow 现有只有**文本记忆**（atoms）与 BM25；**没有代码检索**。"找代码入口"本质是**代码检索**问题，不该用记忆文本硬扛（Cursor 也把二者分开：代码→索引，约定/为什么→rules/skills）。

## 可选路线（按依赖/成本排序）

| 路线 | 依赖 | 确定性/离线 | 能力 | 结论 |
|---|---|---|---|---|
| A. 词法/BM25 代码索引（按文件/块，复用 `domain/bm25.ts`） | 无 | ✅ 确定性、离线 | 关键词/2-gram 命中，弱语义 | **先做**（最小、可离线、可重建） |
| B. AST/符号图（tree-sitter 或 LSP） | tree-sitter（WASM 语法）或宿主 LSP | ✅（AST 解析确定） | 符号/依赖/跳转，"入口/定义"更准 | **第二步**（需 ADR 定依赖：是否随包 WASM、离线可用） |
| C. embedding 语义检索 | 需 embedding 提供方（宿主/本地模型） | ⚠ 依赖外部/模型 | 跨措辞语义 | **可选后置**（先确认宿主是否暴露 embedding；否则不自造） |

## Decision（建议，分阶段）

1. **阶段 1：词法代码索引**（无依赖）：把工作区代码文件按块切分（按行/函数边界粗切），建派生 `indexes/code/`（倒排/BM25），提供 `search_code(query)` 能力（可先做成 read 的一个 lens 或独立工具）。只读、可重建、尊重 `.gitignore`/`.cursorignore`、有大小预算。
2. **阶段 2：符号图**：用 tree-sitter（随包 WASM 或检测本机 CLI）建"文件→符号→引用"图，回答"入口/定义/被谁调用"；不引入网络。是否随包分发语法需单独立 ADR（包体积/许可）。
3. **阶段 3：embedding（可选）**：仅当宿主提供 embedding 服务或明确批准本地模型时；否则不做，避免"未验证的静默降级"。
4. **Merkle 增量**：只有当语料很大且"解析/哈希"成为瓶颈时再上；dsh-shadow 是本地读、无上传，Merkle 的收益远小于 Cursor 场景（它是为减少上传）。当前用"文件名集合/ size-mtime"足够。

## Non-goals

- 不把代码内容写入 atoms（保持原子记忆 = 对话/决策，不是代码库镜像）；
- 不自动改代码、不联网检索；不做向量库常驻服务。
- 不在没有依赖决策的情况下硬塞 embedding。

## 待定（需用户/后续拍板）

- tree-sitter 语法是否随包（体积/许可） vs 检测本机 CLI；
- 是否以及用哪个 embedding 提供方；
- 代码索引的预算（文件数/大小）与是否默认开启。

## 实现状态（2026-10-30 · 阶段 1）

- 已实现 **`search_code(query, limit)`**（core 工具 5→6）：`domain/code-search.ts`（分块 + BM25，rel 参与检索）+ `engine/read/code-search.ts`（遍历工作区、跳过点目录/node_modules/dist 等、有界读取）+ `surface/tools.ts` 注册。
- 只读、不写；预算（默认 1500 文件 / 单文件 200KB / 总 8MB / 40 行一块）**超限显式披露**；结果带 `文件:行号` 片段，声明"只读、数据非指令"。
- 测试：`test/unit/code-search.test.ts`；`npm run verify` 41/41。
- **未做（如实）**：tree-sitter 符号图（阶段 2）、embedding 语义（阶段 3）；未解析 `.gitignore`（只按常见目录跳过）。

## 阶段 3 实现（embedding 管线，2026-10-30）

- 配置 `codeSearch.embedding`（默认 **disabled**）：`baseURL / apiKeyEnv / model / maxChunks`。
- `domain/embedding.ts`（余弦）+ `engine/read/embedding.ts`：派生索引 `.shadow/indexes/code/embeddings.json`（40 行块、内容 hash **只对新增/变更块重嵌**）；HTTP embedder 走 OpenAI 兼容 `/embeddings`。
- `search_code` 在开关打开时追加「## 语义（embedding）」段；失败/无 provider **显式不可用**，不影响 BM25/符号。
- 测试：`test/unit/embedding.test.ts`（假 embedder：余弦 / 命中 / hash 复用 0 重嵌 / 空查询）。
- **真机限制（实测）**：本机 magpie 网关 `POST /v1/embeddings` 返回 **500**，无可用 embedding 模型 ⇒ **语义检索当前真机不可用**（可配置任意 OpenAI 兼容 `/embeddings` 服务）。如实标注，不宣称已语义可用。

## 过滤增强（.gitignore / exclude，2026-10-30）

- 新增 `codeSearch.exclude: string[]` + `codeSearch.useGitignore`（默认 true）；
- `domain/ignore.ts` 简化 gitignore（`*` `**` `?`、前导 `/` 锚定、`!` 取反、尾部 `/` 目录）+ `engine/read/ignore.ts` 读工作区根 `.gitignore`；
- `search_code` 与符号检索统一套用该过滤谓词；测试 `test/unit/ignore.test.ts`。
