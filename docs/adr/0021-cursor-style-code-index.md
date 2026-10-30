# ADR-0021: Cursor 式代码索引（语法块 + 增量 + trigram 候选 + BM25）

- 状态：**accepted**
- 日期：2026-10-30
- 关联：ADR-0019（代码检索方案）、ADR-0020（tree-sitter）；借鉴来源见文末
- 定位：把 `search_code` 从「每次实时遍历 + 固定 40 行切块」升级为「持久索引 + 语法块 + 增量刷新 + trigram 候选裁剪」。

## Context / 为什么

调研（`_reports/code-search-landscape-20261030.md`）显示业界共识：
- **按语法块切分**（Cursor「syntactic chunks」、cocoindex、Sourcegraph）；
- **持久索引 + 增量**（Cursor Merkle/内容缓存、GitHub Blackbird n-gram、Sourcegraph Zoekt trigram）；
- **trigram 先查候选、再精确匹配**（Cursor 正则索引、Blackbird）。

我们原来的 `search_code`：每次 walk + 读全部代码 + 40 行切块 → 大仓慢、切块会切断函数/类。用户明确要求「重点借鉴 Cursor，不怕重」。

## Decision

1. **语法块**：`engine/read/ast-chunk.ts` 用 tree-sitter 按 function/class/interface/import 等节点切块；单块超字符上限（默认 1500 字符）递归按子声明拆，失败/未知语言退回行切块。
2. **持久索引**：`engine/read/code-index.ts` 写 `.shadow/indexes/code/search-index.json`（派生、可重建）：
   - 每文件记录 `hash + size + mtimeMs + 语法块`；
   - 刷新时 `size/mtime` 未变则**不读内容**直接复用（Merkle「只同步变化分支」的本地等价）；
   - 索引根 = 文件 hash 的排序聚合（root），供变更判断/披露。
3. **trigram 候选裁剪**：内存建 trigram → chunk 倒排（从块文本构建，不额外落盘）；查询按「词内 trigram 全含（AND）、多词取并（OR）」缩候选，再 BM25 排序（Cursor「先 trigram 查候选、再精确匹配」）。
4. **始终启用（无开关）**：`maxChunks=20000`、`maxBytes=16MB` 兜底，超限显式披露；索引异常/不可写时**回退**到实时 `search_code`（不静默失败，头部会显示索引/实时）。
5. **本地化**：索引只存本机 `.shadow/indexes`（gitignore），不上传、不做团队共享；Merkle/simhash 的跨机复用不做（本地无多机场景）。

## Consequences

- 正：查询不再每次读全部源码；只改一个文件时只重读一个文件；结果块是完整函数/类，BM25/embedding 质量更好。
- 负/边界：首次查询要建索引（解析全仓，可能数秒）；索引 JSON 含块文本、体积可观（默认上限 16MB）；`size+mtime` 判断漏掉「同大小且 mtime 被保留」的编辑（罕见，可删索引重建）；trigram postings 在内存构建（进程启动后首次查询有一次性成本）；`maxFiles` 截断会在头部显式披露；符号段复用索引块（AST 的 kind/name），不再二次解析。

## Non-goals

- 不做远程/团队索引共享、不做 Merkle 上传、不做完整 CPG 调用图（见 ADR-0019 阶段规划）。
- 不把代码写入 atoms；索引仍可整份删除重建。

## 验证

- `test/unit/ast-chunk.test.ts`（语法块/行号/回退）、`test/unit/code-index.test.ts`（首次建索引、无变化 0 重读、改一文件只重读 1 个、trigram 候选裁剪）、`test/unit/trigram.test.ts`；
- 全量 `npm run verify` 见提交记录。

## 参考

- Cursor: [Securely indexing large codebases](https://cursor.com/blog/secure-codebase-indexing)（Merkle、syntactic chunks、embedding cache、simhash、+12.5%）
- Cursor: [Fast regex search](https://cursor.com/blog/fast-regex-search)（trigram 倒排、候选后精确匹配）
- GitHub: [The technology behind GitHub's new code search](https://github.blog/engineering/architecture-optimization/the-technology-behind-githubs-new-code-search/)
- Sourcegraph: [context retrieval & evaluation](https://sourcegraph.com/blog/lessons-from-building-ai-coding-assistants-context-retrieval-and-evaluation)
