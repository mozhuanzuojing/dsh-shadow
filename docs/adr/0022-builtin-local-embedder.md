# ADR-0022: 内置本地向量（无 provider 也能做向量检索）

- 状态：**accepted**
- 日期：2026-10-30
- 关联：ADR-0019/0021（代码索引）、`engine/read/embedding.ts`、`engine/read/local-embedder.ts`
- 定位：回答「本机没有 embedding provider 时，向量检索怎么办」。

## Context

- 现实：本机 magpie 网关 `POST /v1/embeddings` 返回 **500**（无 embedding 模型）；要求用户另配 provider 等于 embedding 功能不可用。
- 用户明确要求：**没有 provider 就内置**。

## Decision

1. **内置本地 embedder**（`engine/read/local-embedder.ts`）：**特征哈希**把「词 + 相邻词 + 字符 3-gram + 中文 2-gram」映射到 512 维，TF 取 `1+log`，L2 归一；确定性、零依赖、离线。
2. **provider 三档**（`codeSearch.embedding.provider`）：
   - `local`：强制内置；
   - `http`：OpenAI 兼容 `/embeddings`（需配置 `model`）；
   - `auto`（默认）：有 `model` 走 http，否则走 local；http 失败时**自动回落 local** 并在输出注明。
3. **默认启用**：`codeSearch.embedding.enabled` 默认 true（配合内置 embedder 即开即用）。
4. **诚实标注**：内置向量明确写「**子词近似、非语义**」；http 成功才写「语义（embedding）」。不把哈希向量冒充语义模型。
5. 索引仍走 `.shadow/indexes/code/embeddings.json`：块内容 hash 复用、`sourceSig`（stat-only）增量、进程内缓存；本地/HTTP 的 model id 不同，切换会自动重建。

## Consequences

- 正：**无 provider 也能用向量检索**；离线、零依赖、确定性；对拼写/词形/子词更稳。
- 负/边界：哈希向量**不是语义**——同义改写（jwt vs token? 仅在文本共现时有效）仍可能不中；512 维向量使索引 JSON 变大（本地默认上限 2000 块）；默认开启会让首次 `search_code` 多一次建索引成本。
- 后续可替换：若将来用 transformers.js/ONNX 本地神经模型，只需实现同一 `Embedder` 接口（id 变化触发重建），上层不改。

## Non-goals

- 不声称内置向量达到神经 embedding 的语义能力；不做模型下载/联网。
- 不改 BM25/符号路径；向量只作为**附加召回段**展示（不覆盖前两段）。

## 验证

- `test/unit/local-embedder.test.ts`（确定性、512 维归一、相关>无关、接口）；
- `test/unit/search-code-tool.test.ts`（`provider:http` 无 model 显式不可用；`auto` 走内置本地向量；两者都不吞 BM25/符号结果）；
- 全量 `npm run verify` 见提交记录。
