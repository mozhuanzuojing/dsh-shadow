# ADR-0043: Shadow Contract（影子契约：Atom / Projection / Evidence / Mutation，提议·暂不实现）

- 状态：**已提出（2026-09-07，先冻结契约；暂不实现**——用户明确"不是直接写实现，先定义身份边界"）
- 决定日期：2026-09-07
- 关联 ADR：ADR-0037/0038/0039/0040/0041/0042（全部自洽）
- 关联术语：`../CONTEXT.md`（Memory Atom / Episode / Task / ContextReference / Shadow Node）

## Context

ADR-0042 提出了 Shadow Knowledge Graph。用户在 2026-09-07 的架构反馈强调：**dsh-shadow 现在缺的不是代码，而是"身份边界"**。若边界错，后面 zg/PageIndex 接入会把系统带偏。因此**先冻结 Shadow Contract**（Atom/Projection/Evidence/Mutation），作为 Phase 0——比代码更重要。

> **dsh-shadow 的定位**：
> ```text
> 文件事实系统（Atom）
>   + 派生索引系统（Projection）
>   + Agent 上下文组装系统（Query Context）
> 不是：知识库 / 不是 RAG / 不是 向量数据库
> ```

## Decision：冻结 Shadow Contract

### 1. Atom（事实源 / Source）—— 什么是真实源

- **Source 只能是：`human / code / tool`**（如 `memory/foo.md`、`src/AuthFilter.java`、`docs/sso.pdf`、`adr/0042.md`、`git log`）。
- **Atom 是 source of truth，不可由系统生成**；删 Atom = 删事实。LLM **永不**创建/修改 Atom。
- 来源形态 = 文件事实系统（`一切皆文件`）。

### 2. Projection（投影 / 可重建）

- **Projection = system generated，从 Atom 派生，可以重建**。
- 例：`shadow-index/nodes.jsonl`（由 memory/decision/task/code/document 聚合生成的 `{id,type,source,title,mtime,...}`）。
- **`rm -rf shadow-index` 完全无影响**，重新生成即可。这是"一切皆文件 + 派生索引"的落地。
- Projection 不覆盖 Atom（Node 是投影，Atom 仍是 source）。

### 3. Evidence（证据 / 可追溯）

- 所有查询结果必须**可追溯**：每一条返回的 context item 都带 `evidence`（来源路径/行号/文档节点）→ 指向 Atom。
- 例：
  ```json
  { "type":"decision", "content":"...", "evidence":"adr/0042.md" }
  { "type":"code",     "content":"...", "evidence":"AuthFilter.java:120" }
  { "type":"document", "content":"...", "evidence":"SSO 规范 3.2" }
  ```
- **无证据的 context 不返回**（宁可空，不可编）。

### 4. Mutation（谁可以写）

| 层 | 谁写 | 能不能 |
|---|---|---|
| Source（Atom） | human / code / tool | 写事实 |
| Projection（Node/index） | system generated | 生成/重建投影 |
| LLM | **read + summarize only** | **永不 create fact / 永不生成关系** |

### 5. relations 只派生、不创造（生命线）

- 关系只能从**可观察信号**派生：`filesystem / AST / git / document tree / 明确 metadata`。
- 例：
  ```text
  AuthFilter.java --calls--> SignUtil.java    （来源：AST）
  ADR-0042 --references--> PathRegistry.java  （来源：markdown link / 明确引用）
  SSO.pdf --contains--> 第三章签名算法         （来源：document tree）
  ```
- **LLM 只能"解释关系"，不能"制造关系"**。否则半年后错误关系成为系统事实。

### 6. query 是输出，不是存储

- `shadow.query({ query, scope:["memory","decision","code","document"], mode, evidence:true })` → 返回 `{ context: [...] }`（跨源、带证据）。
- **context 是输出的组装，不是存储**；不引入"query 缓存/知识库"层。

## 明确不做

- ❌ 现在实现（先冻结契约；Phase 0 契约 → 再动代码）。
- ❌ LLM 创建事实 / 修改 Atom / 生成 Node 或关系。
- ❌ 让 dsh-shadow 变成 知识库 / RAG / 向量数据库 / Jira。
- ❌ Node 覆盖 Atom / 投影冒充事实源。

## 分阶段（供后续，未实现）

```text
ADR-0042（方向）
  → ADR-0043 Shadow Contract（本契约）
  → Phase 0：契约落地（明确各文件/目录的 Source|Projection 边界）
  → Phase 1A：Projection Layer（Atom → ShadowProjection → Node View，shadow-index/nodes.jsonl）
  → ShadowNode View + shadow.query({query,scope,mode,evidence})
  → Phase 2：Index Engine（providers: KeywordIndex/SemanticIndex/CodeIndex；zg/ripgrep/tree-sitter/LSP/git 皆可入）
  → Phase 3：Knowledge Engine（保留 Tree：规范→章节→条款→约束，不转 vector/chunks）
  → Phase 4：经验闭环
```

## 自检（本 ADR 无代码，仅记录）

- [x] 与 ADR-0037/0038/0039/0040/0041/0042 自洽（Evidence≠Interpretation / Episode=投影 / Memory=source / Node=派生投影 / relations 只派生）。
- [x] 明确这是身份边界（Contract），比代码更重要；先冻结，再分阶段实现。
