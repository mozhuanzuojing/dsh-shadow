# references.md — 参考材料（用户提供，先记录）

> 用户 2026-09-02 提供的参考仓库清单，用于后续设计/实现参考（含「投影模式」预设与能力扩展）。

## 完整清单

- https://github.com/firecrawl/open-lovable
- https://github.com/asgeirtj/system_prompts_leaks
- https://github.com/datalab-to/marker
- https://github.com/shadcn-ui/ui
- https://github.com/volcengine/OpenViking
- https://github.com/DataExpert-io/data-engineer-handbook
- https://github.com/tt-a1i/archify
- https://github.com/Leonxlnx/taste-skill
- https://github.com/obra/superpowers
- https://github.com/harry0703/MoneyPrinterTurbo
- https://github.com/colbymchenry/codegraph
- https://github.com/Fission-AI/OpenSpec
- https://github.com/eze-is/web-access
- https://github.com/addyosmani/agent-skills
- https://github.com/browser-use/browser-harness
- https://github.com/Z4nzu/hackingtool
- https://github.com/affaan-m/ECC
- https://github.com/google/langextract
- https://github.com/thedotmack/claude-mem
- https://github.com/usestrix/strix
- https://github.com/VectifyAI/PageIndex

## 按与本项目（dsh-shadow / 投影模式 / 能力扩展）的关联度粗分

**强相关（记忆 / 设计拷打 / 能力扩展 / DSH 生态）**
- `volcengine/OpenViking` — 自进化上下文库（本项目 ADR 的对照项）。
- `VectifyAI/PageIndex` — **免向量库、基于推理的 RAG/上下文索引**（`Document Index for Vectorless, Reasoning-based RAG`；Python，35.7k⭐）。与 dsh-shadow 的「不引向量库 + 分层/推理式召回」同向（呼应 ADR-0001），**已克隆到 `vendor/_src/PageIndex`**。
- `tt-a1i/archify` — 已在用的架构图/可视化插件（报告 L2）。
- `thedotmack/claude-mem` — MCP 记忆（本机已装，corpora 空）。
- `obra/superpowers` / `leonxlnx/taste-skill` — skills 体系/元技能（design 与能力沉淀参考）。
- `addyosmani/agent-skills` — agent skills 汇总。
- `usestrix/strix` — （需查，疑似 agent 相关）。
- `eze-is/web-access` / `browser-use/browser-harness` — 浏览器自动化/CDP（参考实现）。
- `Fission-AI/OpenSpec` / `colbymchenry/codegraph` — 规格/代码图谱（工程化参考）。

**其它（一般技术/工具参考）**
- `asgeirtj/system_prompts_leaks`、`shadcn-ui/ui`、`datalab-to/marker`、`DataExpert-io/data-engineer-handbook`、`harry0703/MoneyPrinterTurbo`、`Z4nzu/hackingtool`、`affaan-m/ECC`、`google/langextract`、`firecrawl/open-lovable`。

> 备注：本表只是"记录 + 粗分"，未逐一核实仓库内容与最新状态；使用时需按 research-before-action 三步核对。
