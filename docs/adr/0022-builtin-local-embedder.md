# ADR-0022: 内置本地向量（无 provider 也能做真向量检索）

- 状态：**accepted**（2026-10-30 修订：本地模型改为**神经 embedder**，哈希降级为离线兜底）
- 日期：2026-10-30
- 关联：ADR-0019/0021（代码索引）、`engine/read/embedding.ts`、`engine/read/neural-embedder.ts`、`engine/read/local-embedder.ts`
- 定位：回答「本机没有 embedding provider 时，向量检索怎么办」。

## Context

- 现实：本机 magpie 网关 `POST /v1/embeddings` 返回 **500**（无 embedding 模型）；要求用户另配 provider 等于 embedding 功能不可用。
- 用户要求：**没有 provider 就内置**，并且**参考 Cursor**——语义检索要用真模型，而不是哈希近似。

## Decision

1. **默认本地神经 embedder**（`engine/read/neural-embedder.ts`）：
   - 用 `@huggingface/transformers`（transformers.js + ONNX Runtime）在本地跑 **`Xenova/multilingual-e5-small`**（中英混合、检索型、q8 量化）；
   - e5 需要非对称前缀：文档/代码块 `passage: `、查询 `query: `（已实现）；
   - 首次使用从 HuggingFace **下载 ONNX 权重并缓存**（之后离线复用）；模型 id 写入索引，换模型自动重建。
2. **哈希兜底**（`engine/read/local-embedder.ts`，512 维特征哈希）：
   - 仅在神经网络不可用（无网络/模型缺失/推理失败）或显式 `provider:"hash"` 时使用；
   - 明确标注「**本地哈希 · 子词近似、非语义**」，不冒充语义。
3. **provider 四档**（`codeSearch.embedding.provider`）：
   - `auto`（默认）：有 `model` 走 HTTP，否则走本地神经；失败自动降级（HTTP→神经→哈希），输出注明回落原因；
   - `local`：强制本地神经；
   - `hash`：强制哈希（零依赖/极快/离线）；
   - `http`：OpenAI 兼容 `/embeddings`（需 `model`）。
4. **始终启用（无开关）**：向量检索始终参与 `search_code`（provider 只决定“用哪种”）。
5. 索引仍走 `.shadow/indexes/code/embeddings.json`：AST 语法块、内容 hash 复用、`sourceSig`（stat-only）增量、进程内缓存。
6. **异步建索引**（参考 Cursor 的异步索引）：神经模型首次/变更后构建在后台进行，`search_code` **先返回 BM25/符号**，向量段标注「索引构建中」；后续查询命中缓存。哈希/HTTP 仍同步（便宜）。
7. **失败可见 + 退避**：后台构建失败会记录 error，下一次查询直接返回「构建失败：…（Ns 后重试）」，60s 内不重复触发（避免每次查询都下载/解析）。
8. **降级链按序尝试**：`auto` = HTTP(model) → 本地神经 → 哈希；`local` = 神经 → 哈希；`http` = HTTP → 哈希；`hash` 只哈希（`embedder-chain.ts`，已被单测锁定）。
9. **模型缓存**放标准目录 `~/.cache/huggingface`（可用 `DSH_SHADOW_HF_CACHE` 覆盖），不再落 `node_modules` 包内。

## Consequences

- 正：**无 provider 也能得到真语义向量**（e5 检索模型），中英混合 query 可用；离线时自动降级哈希，不阻塞。
- 负/边界：
  - 首次使用需**联网下载模型**（ONNX q8，几十~百 MB 级）并缓存；离线首次会降级哈希；
  - 本地 CPU 推理：建索引（数千块）可能数十秒~分钟级，之后按块 hash 增量；
  - `@huggingface/transformers` + `onnxruntime-node` 增大安装体积（原生运行时）；
  - 哈希向量的“同义改写”能力仍有限，只作兜底。
- 回滚/替换：换模型只改 `neuralModel`；删除 `.shadow/indexes` 可重建；实现同一 `Embedder` 接口即可替换。

## Non-goals

- 不把哈希向量当语义模型；不做模型训练/微调。
- 不改 BM25/符号路径；向量作为**附加召回段**展示。

## 验证

- `test/unit/neural-embedder.test.ts`（e5 前缀 / pooling+normalize / 非 e5 无前缀 / 默认模型，假 pipeline 注入）；
- `test/unit/local-embedder.test.ts`（哈希兜底：确定性、归一、相关>无关）；
- `test/unit/search-code-tool.test.ts`（`provider:http` 无 model → 回落哈希并注明；不吞 BM25/符号）；
- 真机：下载 `Xenova/multilingual-e5-small` 后 `embed` 输出维度/相似度（见提交说明）。
