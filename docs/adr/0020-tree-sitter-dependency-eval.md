# ADR-0020: tree-sitter 依赖评估与「阶段 2」建议

- 状态：**proposal（依赖评估；未引入任何依赖、未改代码）**
- 日期：2026-10-30
- 关联：ADR-0019（代码检索方案）、ADR-0013（lab 拆包先例）；证据来自 npm registry 元数据 + 本机检查
- 定位：回答「阶段 2 的符号图要不要引入 tree-sitter、怎么引入最合适」。

## Context

- 阶段 1 已用 **零依赖 BM25** 做了 `search_code`（字面/标识符级）。阶段 2 想要"定义/入口/被谁调用"这类**结构**信息，最标准的是 tree-sitter（AST）。
- dsh-shadow 现状：**运行时零依赖**（package.json 的 dependencies 为空）、包体小、离线可用。任何新依赖都要先付代价。

## 依赖评估（实测元数据）

| 方案 | 体积 / 许可 | 适配性 | 结论 |
|---|---|---|---|
| **A. `web-tree-sitter` + 各语言 `.wasm`** | `web-tree-sitter@0.27.1`：**MIT**、0 deps、unpacked **≈4.5MB**（含 js+wasm+debug）、内置 TS 类型 | 需 `Parser.init()` 异步初始化 + ABI 13–15 兼容；wasm 解析官方称"比原生慢" | 放**核心**太重 |
| A 的语法来源①：`tree-sitter-wasms@0.1.13` | **Unlicense（公有领域）**、39 个文件、unpacked **≈49MB**（几十种语言） | 一次装全 = 49MB，明显超预算 | 不可整包进核心 |
| A 的语法来源②：单语言 npm 包（如 `tree-sitter-typescript@0.23.2`） | **MIT**，但 unpacked **≈37MB**（含原生绑定/生成源码） | 我们只要其中 `.wasm`（通常百 KB 级，**推断**，需下载实测）；各语言分头维护/ABI 漂移 | 需"只取 wasm + 自建清单" |
| **B. 本机 `tree-sitter` CLI** | 无包体；但本机 **未安装**（`tree-sitter` 不在 PATH） | 需用户自行安装；离线/无 CLI 时不可用；跨平台安装麻烦 | 不能作默认 |
| **C. 宿主 LSP** | 无包体；DSH 有 `dsh-tool-lsp`，但**插件无法调用工具**，语言服务器还需另装 | 架构不通 | 不可行 |
| **D. 零依赖「正则符号抽取」** | **0 字节依赖**；确定性、离线 | 粗粒度（函数/类/导出/`def`/`func` 等），会漏/误；不建真 AST | **建议作为阶段 2** |
| **E. 可选独立包 `dsh-shadow-code`** | 含 `web-tree-sitter` + 精选 3~5 个 wasm 语法（MIT/Unlicense） | 用户显式安装才可用；核心保持零依赖（同 ADR-0013 lab 拆包思路） | 将来需要真 AST 时再做 |

> 体积口径说明：npm 的 `unpackedSize` 是**整包解包体积**（含原生绑定/源码/文档），不等于单个 `.wasm` 体积；但"整包 4.5MB(运行时) / 37–49MB(语法)"足以说明**不该塞进核心**。

## Decision（建议）

1. **核心包保持零运行时依赖**：阶段 2 采用 **D（零依赖正则符号抽取）**，产出 `文件 → 符号（kind/name/行号）` 的派生索引，用于"找定义/入口"的粗排；与阶段 1 的 BM25 合并展示。
2. **不在核心引入 tree-sitter**；若将来确需精确 AST/调用图，按 **E** 做成**可选的独立包**（`dsh-shadow-code`，peer 依赖核心；自带 `web-tree-sitter` + 精选 wasm 语法；缺失即 `unavailable`，不静默降级）。
3. 若走 E，必须：只 vendored **精选 3~5 个** 语法、记录每个 wasm 的**许可与 ABI**、`Parser.init()` 失败要**显式报 unavailable**、**不联网自动下载**。

## Consequences

- 正：核心保持零依赖/离线/小包；阶段 2 能立刻给出"符号级"线索且无依赖风险。
- 负/边界：正则符号抽取覆盖有限（跨行签名、宏、动态语言易漏）；更精确要靠 E；E 会带来 4.5MB + 语法 wasm 的包体与 ABI 维护成本。

## Non-goals

- 不在核心塞 tree-sitter；不联网下载语法；不把符号索引写进 atoms（仍是派生、可重建）。
- 不用正则去宣称"精确调用图"（做不到，别过度承诺）。

## 待确认

- 阶段 2 的正则符号集覆盖哪些语言（建议：ts/tsx/js、py、go、rs、java 起步）；
- 将来是否真需要 E（取决于"找定义/入口"实际够不够用）。

## 证据

- `web-tree-sitter@0.27.1`（MIT，unpacked 4,687,401B）：<https://registry.npmjs.org/web-tree-sitter/latest>
- `tree-sitter-wasms@0.1.13`（Unlicense，unpacked 51,769,841B，39 文件）：<https://registry.npmjs.org/tree-sitter-wasms/latest>
- `tree-sitter-typescript@0.23.2`（MIT，unpacked 38,844,097B）：<https://registry.npmjs.org/tree-sitter-typescript/latest>
- tree-sitter 本体（MIT）：<https://github.com/tree-sitter/tree-sitter>
- 本机检查：`tree-sitter` CLI 不在 PATH；DSH 侧仅见 `dsh-util-code-language`（语言识别，非解析器）。
