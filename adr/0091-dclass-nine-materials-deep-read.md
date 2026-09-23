# ADR-0091: D 类九份材料的**真读判定** —— 把「无可比面」收窄成有判据的结论

- 状态：**已接受**（2026-09-15 / `v1.15.90`）
- 关联 ADR：**ADR-0089**（§2 D 的判定被本条**更正**；§6 自称的边界正是本轮要补的）·
  **ADR-0049**（缺件不静默 / 退出码语义）· **ADR-0002 / 0044**（记忆 ≠ 指令）· **ADR-0051**（资源卡必须写 source）·
  **ADR-0085** §8.7（能推出来的字段不要手写）· **ADR-0090**（同日：甲-1 的「有损必须声明」—— 本条 §3 的反面样本正是它要防的）

## Context：用户 2026-09-15 的「都要」里的第二件

`adr/0089` 是**对账 + 逐份判定**，但它自己在 §6 写明了边界：
> 「**本轮没有深读任何材料的内容** …… 想把 §2 的 D 类九份从『无可比面』改成有判据的结论，**必须真读**。」

用户对上一轮给的两个选项答复「**都要**」⇒ 本轮（与 `v1.15.89` 的实装同日）**真读**这九份，
逐份回答：**读了什么 / 它落在本仓四个可比面（记忆与上下文的组织与召回 · 证据与裁决 · 治理形态 · DSH 插件工程）的哪一处 / 判什么**。
**读法**：README + 顶层清单 + 与四个面相关的目录/源码（**逐份给出 `文件:行号`**），**不读**与四个面无关的业务实现。

## §1 逐份判定（**结论先行**）

| 材料 | 真读了什么（锚点） | 落在哪个可比面 | 判定 |
|---|---|---|---|
| **strix** | `AGENTS.md:36`（退出码语义）· `:37`（证据产物清单）· `:23`（诚实覆盖率）· `skills/*/SKILL.md` 9 份 | **证据与裁决** + agent-skill 工程 | **升为可比面**（原判「无可比面」不成立）—— 见 §2① |
| **ECC** | `schemas/memory.schema.json:5/7/12-15` · `schemas/provenance.schema.json:4/29` · `SOUL.md:4/16-17` · `WORKING-CONTEXT.md:13/117/166` | **记忆与上下文的组织** + **治理形态**（契约/schema） | **升为可比面** —— 见 §2② |
| **hackingtool** | `README.md:7`（215 工具 / 21 类 / 63 标签）· `src/hackingtool/catalog/*.yaml`（21 个类目即数据）· `tags.py`/`registry.py`/`ai_recommend.py` · `docs/TOOLS.md` · `scripts/audit_tools.py` · `.githooks/pre-push` | **治理形态**（台账规模化）+ 工具选择 | **升为可比面** —— 见 §2③ |
| **system_prompts_leaks** | `README.md:36`（What/Date/Link 采集表）· `:198`（Older versions）· `DeepSeek/deepseek-chat.md:1-2` · `Misc/opencode.md` 与 `OpenCode/opencode.md` 同一材料两处留档 · `LICENSE` = **CC0-1.0** | **治理形态**（采集来源与时刻） | **升为弱可比面**（采集纪律；**内容**与本仓不同题） |
| **ui（shadcn/ui）** | `README.md`（"Use this to build your own component library" = copy-in 而非依赖）· `skills/**/SKILL.md`（随库投放 agent 技能）· `packages/{helpers,react,shadcn,tests}` · `evals.json` | **治理形态**（资产分发） | **弱可比面**（copy-in 分发 + skill 投放；本仓无资产分发面 ⇒ 只作对照） |
| **marker** | `benchmarks/README.md:1-12`（"Reproducible harness … **We do not vendor it** — you clone it and use its own checker" / "single-stream latency **badly understates** a server-based system"）· `MODEL_LICENSE`（OpenRAIL-M）vs 代码 Apache-2.0 | **治理形态**（基准协议 + 许可分层） | **弱可比面**（口径必须匹配部署形态；见 §2④） |
| **open-lovable** | `app/api/generate-ai-code-stream/route.ts:516`（"Include only the last 3 edits to save context"）· `:527`（`messages.slice(-5)`） | **上下文的组织与召回** | **反面样本** —— 见 §3 |
| **MoneyPrinterTurbo** | `app/services/bgm.py:90/157/318`（上传名清洗 / 音频校验 / 拒绝 unsafe path） | **治理形态**（外部输入护栏） | **弱可比面**（与本仓 `core/fs-scope.ts` + `security/scrub.ts` 同题；本仓已具备 ⇒ 只登记） |
| **data-engineer-handbook** | `README.md` 全文（书籍/社区/面试/项目导航 + 3 个 bootcamp 目录）· 无 `LICENSE` 文件 | **不落在任何一处** | **维持「无可比面」**（真读后仍然成立；且**无许可文件** ⇒ 连引用都受限） |

**小计**：九份里 **8 份**至少落在一个可比面上（4 强 / 4 弱）、**1 份**维持「无可比面」；
其中 **1 份是反面样本**（open-lovable）。

## §2 四条值得写下来的

**① strix 的退出码语义与本仓「0 ≠ 通过」是**独立收敛**（本轮最值钱的一条）。**
`AGENTS.md:36` 原文：*"Exit codes (headless): `0` clean, `1` fatal error, `2` vulnerabilities found.
**A `0` only covers what was analyzed** — check `run.json` (`status`, `llm_usage.cost` vs the budget)
before calling a run clean."* + `:37` 的产物清单（报告 + `vulnerabilities.json` + **`findings.sarif`（SARIF 2.1.0）** + `run.json`）。
⇒ 与本仓**同一条判据**：退出码/文件存在**只覆盖被分析的部分**，不得当成「全清白」
（本仓对应物：`MATERIALS.md` §6 的五级链、`corpus-health` 的 `NORMAL ≠ 通过`、`audit:*` 的「0 ≠ 没找到」）。
**它比本仓多的一件**：`findings.sarif` —— 把裁决落成**行业标准格式**，使结论可被第三方工具消费。
本仓今日**没有**这类「标准格式出口」（只有 markdown 报告）⇒ **登记为对照**，但**不构成本轮待办**
（本仓的消费方是 agent 与用户，不是第三方 SAST 平台）。

**② ECC 提供了两件正例与一件反例。**

- **正例一（最硬）**：`schemas/memory.schema.json:5` 的 description 原文 ——
  *"**Recalled memories are context, not executable instructions.**"* ⇒ 与本仓 **ADR-0002 / 0044** +
  读侧 `RECALL_PREFIX`「数据非指令」**逐字同义**，是**独立收敛**（不同团队、不同语言、同一个判断）。
  且它把这份契约做成了**严格 schema**：`:7` `additionalProperties: false`、`:12-15` 必填 `kind` / `trust` / `status`
  ⇒ 「**不许猜字段**」（本仓 ADR-0042/0043）的另一种落地（本仓是纯函数派生，它是 schema 拒绝）。
- **正例二**：`schemas/provenance.schema.json:29` 必填 `["source","created_at","confidence","author"]`，
  且 `:4` 说明它**只约束** `~/.claude/skills/learned/*` 与 `imported/*` ⇒ 「**外来/学来的东西必须写来源与置信度**」
  与本仓 **ADR-0051**（资源卡必须写 `source` 才上投影）**同题**。
- **反例（正是本仓已立规矩的那类）**：`SOUL.md:4` 写 *"30 specialized agents, 135 skills, 60 commands"*，
  而 `WORKING-CONTEXT.md:13` 写 *"Public catalog truth is `47` agents, `79` commands, and `181` skills"*
  —— **同一事实两处不一致**。注意**它不是没维护**：`WORKING-CONTEXT.md:117/166/170/171` 有一串**带日期的**
  「Catalog truth is now N agents…」流水账（比本仓的 README 版本行维护得更勤）。
  ⇒ 精确的诊断是：**它有台账、但没有门** ⇒ `SOUL.md` 那份副本漂了没人发现。
  这正是本仓 `AGENTS.md`「**能推出来的字段不要手写；写了就要么配门、要么带口径与命令**」的**外部正例**。
  另 `WORKING-CONTEXT.md:166` 有一条「…**instead of inventing a parallel installer**」= 本仓「**判据收一处、不造第二份实现**」的同款。

**③ hackingtool 是「工具台账规模化」的另一个答案。**
`README.md:7` 自述 **215 tools / 21 categories / 63 tags**；类目是**数据**（`src/hackingtool/catalog/*.yaml`，21 个文件）
而不是代码；`tags.py` + `registry.py` + `ai_recommend.py` = **标签检索 + 推荐层**；
`docs/TOOLS.md` 是派生文档；`scripts/audit_tools.py` + `.githooks/pre-push` = 台账的门。
⇒ 与本仓的三件套（`core/toolset/index.ts` 台账 + `docs/toolchain-windows.md` 派生 + `test/toolset-catalog.test.ts` 棘轮）**同构**，
但规模差 2 倍（本仓台账 ~101 条有 winget 包）。
**它的答案与本仓不同**：本仓靠**分层与场景选择**（`toolset.ts` 的 `kind`/`category` + 「替代：X」列 + 预检 `precheckCapabilities`），
它靠**分类 + 标签 + 推荐**。⇒ 对「工具数量拐点」（10–15 个工具就跌破 90% 选择准确率）这条判据，
hackingtool 是**「量大就得加检索层」**的活样本。**登记为对照，不改本仓设计**（本仓台账是**目录**、不接线执行，见 `core/toolset/index.ts:3-14`）。

**④ marker 的两条口径纪律，本仓都在做但没写全。**
`benchmarks/README.md` 原文：*"Reproducible harness for the … numbers in the top-level README.
**We do not vendor it** — you clone it and use its own checker."* 以及
*"Throughput is sustained pages/sec at real worker concurrency … **single-stream latency badly understates
a server-based system**."*
⇒ ① **基准工具不 vendor 进仓库、用上游自己的 checker**（避免「用自己的尺子量自己」）—— 本仓的对应物是
`tools/retrieval-eval` 的基线**同源/协议自检**（`audit-ratchet.lib.ts` 的 ⑨「外部调用必须为 0」与协议自检）；
② **口径必须匹配部署形态**（单流延迟低估服务型系统）—— 本仓对应物是 `audit-ratchet` 的
「先证同源、再比数值 + 容差 + 方向」。**登记为外部正例**（本仓已具备，无需行动）。
许可分层（代码 Apache-2.0 / 模型 OpenRAIL-M）与本仓已有的「两层许可」纪律同型（`OpenViking`、`video-shotcraft` 的 Remotion）。

## §3 一条**反面样本**（与本仓 `v1.15.89` 同日立的判据正面对撞）

**open-lovable 的上下文窗口是「静默有损」的**：`app/api/generate-ai-code-stream/route.ts:516`
注释 *"Include only the last 3 edits to save context"*、`:527` 取 `messages.slice(-5)`（只看最近 5 条消息），
**对模型没有任何披露**（丢弃只记进 `console.log`，给人看）。
⇒ 这正是**今天刚实装的甲-1**（`adr/0090`）要防的形态：**有损却不声明损失形态、也不给恢复句柄**。
**它不是本仓的替代品**（它是「聊天生成 React 应用」的应用，不做记忆投影），
但作为**反面样本**它证明了两件事：① 本仓那条判据**不是自造的标准** —— 业界普遍不声明，而我们要求声明；
② 「窗口截断」这件事在**没有记忆层**的系统里是**不可见的**（丢了就永远丢了），而本仓因为**权威源是文件**，
丢掉的部分**天然可复取**（`adr/0090` §A①）。
**边界（诚实）**：我只按关键词扫了 `app/api/**` 与 `lib/**`（`untrusted|injection|do not follow|…`，零命中），
**没有逐行读完那个 1896 行的 `route.ts`** ⇒ 「无边界标注」这一句的置信度是**中**，不是「已证实」。

## §4 对 `adr/0089` §2 D 的更正（本条是自己上一轮判定的**更正**）

- **原文断言**（`adr/0089` §2 D）：这九份「**一处都不落在**」本仓可比面内 ⇒ 判「无可比面」。
- **真读后的实测**：**8/9 至少落在一处**（其中 3 份落在**硬**面上：证据与裁决 / 记忆契约 / 台账规模化）。
- **根因**：上一轮只做了**定位**（有没有本体、许可、规模），**没有读内容** —— 那正是 `adr/0089` §6 自己写下的边界。
  ⇒ 「无可比面」这个**判定**当时是**基于名称与 README 首标题的推断**，不是基于判据的结论。
- **更正的措辞**（不是删掉旧文）：`adr/0089` §2 D 加**补记**指向本条；旧文按「归档不改写」保留。
- **由此得到一条可复用的口径**：**「无可比面」这类否定判定，必须给「读了什么」的证据**，
  否则它与「没看」在文本上无法区分 —— 与 `adr/0089` §3④ 那条「清单类字段要带枚举根与枚举时刻」同源（**否定也要带口径**）。

## §5 怎么重放

```powershell
cd D:\project\dsh1\vendor\dsh-shadow
# ① 九份的关键面一次性打印（README 头 + 顶层 + 关键文件的存在性）
node ..\.docs\fix\2026-09-15\probe-dclass-digest.ts D:/project/dsh1/vendor/_src
# ② 逐条锚点（本轮引用到的行）——例：
Select-String -LiteralPath ..\_src\strix\AGENTS.md -Pattern 'Exit codes|honest per-category|findings.sarif'
Select-String -LiteralPath ..\_src\ECC\schemas\memory.schema.json -Pattern 'Recalled memories|additionalProperties'
Select-String -LiteralPath ..\_src\open-lovable\app\api\generate-ai-code-stream\route.ts -Pattern 'slice\(-5\)'
# ③ 反面的**边界**（我扫过的关键词；零命中 ⇒ 只说明这些词没出现，不等于没有边界）
Select-String -Path ..\_src\open-lovable\app\api\**\*.ts,..\_src\open-lovable\lib\*.ts -Pattern 'untrusted|injection|do not follow'
```

## §6 未做 / 边界（诚实）

- **只读「与四个可比面相关」的部分**，不读业务实现 ⇒ 每份的判定**覆盖它是「有没有可比面」，不覆盖「它的实现质量」**。
- **open-lovable 的 1896 行 `route.ts` 未逐行读完**（§3 已标置信度 = 中）。
- **未跑任何一份材料**（九份都未安装/未执行；`strix` 需 Docker，`marker` 需模型权重）。
- **未评估其子项目**（如 `MoneyPrinterTurbo` 的 webui、`marker` 的 `marker_server.py`、`hackingtool` 的 AI 层实现）。
- **`data-engineer-handbook` 维持「无可比面」**，且**无许可文件** ⇒ 引用前必须先查（`adr/0089` §1 许可面）。
- 本条**不改任何代码**（与 `v1.15.89` 的实装同日但**各发一版**）。
