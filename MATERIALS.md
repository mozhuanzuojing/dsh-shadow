# MATERIALS.md —— **本地全部材料**总台账（磁盘枚举，单一来源）

> **口径**：本表只登记**磁盘上真实存在**的材料，数字来自枚举命令（见 §5「更新方法」），**不凭记忆改数**。
> **为什么单开一份**：`references.md` 只登记**与记忆层有关的参考材料**；而「本地全部材料」还包括
> **DSH 本体**、**DSH 生态插件**与**在用的工具**——它们不属于 `references.md` 的题材，但属于同一个审查面。
> ⇒ 本文件是**文件清单/状态的唯一来源**；`references.md` 保留其题材内的核实记录（两处**不重复登记同一事实**）。
>
> **建立日期**：2026-09-12（`v1.15.39` 之后，目标轮次第 1 轮）。**枚举口径**：`Get-ChildItem -Recurse -File`（**不排除** `node_modules`/`.git`，除非另注）；
> 字节为文件字节和。**同目录不同口径会得出不同数字**，故本表每个数字都可按 §5 复算。

---

## 1. 名册（8 项，按「对本项目的相关度」排序）

| # | 目录 | 远端 | HEAD / 版本 | 许可 | 规模（枚举口径见 §0） | 身份 |
|---|---|---|---|---|---|---|
| 1 | `dsh-w/deepseek-harness` | `deepseek-ai/deepseek-harness` | `cd5ef81481` / **0.1.2-alpha.1** | **MIT** | 74,163 文件 / 1.64 GB（**含** `node_modules`） | **DSH 宿主本体源码**（Cordis 可组合 agent 宿主） |
| 2 | `hl_mem` | `lohr13/hl_mem` | `aa5d068` / **v1.1.7** | **Apache-2.0** | 1,025 文件 / 16.8 MB | 证据驱动的长期记忆服务（Python + SQLite） |
| 3 | `openviking` | `volcengine/OpenViking` | `592c0fe` | **AGPL-3.0**（`crates/ov_cli` 与 `examples` 为 Apache-2.0） | 3,891 文件 / 93 MB | 自进化上下文库；**原生 DSH 记忆插件**（直接替代品） |
| 4 | `dsh-shadow` | `mozhuanzuojing/dsh-shadow` | 本仓 | MIT | 3,000+ 文件 / 37.7 MB | **本项目**（记忆投影插件） |
| 5 | `archify` | `tt-a1i/archify` | `82e63c9` | **MIT** | 422 文件 / 36 MB | 架构图/可视化插件（**在用**，报告 L2 产物） |
| 6 | `awesome-dsh-plugin` | `mozhuanzuojing/awesome-dsh-plugin` | `271834d5` / 0.1.0 | **CC**（清单类） | 1,726 文件 / 8.5 MB | **DSH 插件清单**（生态索引） |
| 7 | `ppt-master` | `hugohe3/ppt-master` | `a160e776` | **MIT** | 14,354 文件 / 725 MB | AI 生成原生 PowerPoint（文档→PPT） |
| 8 | `voyager` | `Nagi-ovo/voyager` | `b68eeac` / pkg `voyager@1.7.1`（版权 Jonathan Braat ⇒ **上游 fork**） | 见 `LICENSE`（版权行 2022 Jonathan Braat） | 56,514 文件 / 610 MB | 与 DSH 有关的 fork（其提交含 `docs(dsh):`） |

**另有（非「外来材料」，但同属本工作区）：**
- `dsh-shadow/.shadow/`（327 KB）——**记忆树本体**（我的思维/决策投影，是本项目的一等数据，不是参考资料）。
- `.docs/`（850 KB）——本工作区的**证据文档**（`fix/<日期>/…`），按用户规则产出。

---

## 2. 逐项状态：已吸收什么 / 未读什么 / 下一步

### 2.1 `dsh-w/deepseek-harness`（**平台层：所有其它结论的底座**）

| 面 | 规模 | 状态 |
|---|---|---|
| `docs/` | **357 文件 / 3.85 MB** | ✅ 部分深读（架构 / cordis-primer / capability-seams / agent-lifecycle / config-catalog / api-gateway / **postmortem 0001**）；未读面仍大 |
| `vendor/cordis` + 另 8 包 | 218 文件 / 1.4 MB | ✅ **已读关键面**：`loader/src/config/isolate.ts`（隔离继承）、`loader/src/index.ts:192-199`（`unwrapExports`）、`cordis/src/reflect.ts`（`get` 与代理陷阱）——**三处与运行面 0.1.5-rc.2 逐字节相同**（v1.15.43 核对） |
| `.agents/` | **2,459 文件 / 12.5 MB** | ⚠ 只做**结构索引**（agent 预设/技能/指令层的组织方式），未逐个读 |
| `packages/` | 12,492 文件 / 94 MB | ⚠ 按需局部读了：`runtime-diagnostics/invariants`（全文）、`bundle/{base,web-app,sdk-minimal}/cordis.patch.yml`、`preset/agent-presets/presets/*`、`packages/AGENTS.md`；**其余未读** |
| `apps/` `native/` `python/` `website/` `snapshots/` | 545 / 54 / 36 / 8 / 626 文件 | ❌ 未读 |

**⚠ 必须先标定的一条**：本地克隆是 **0.1.2-alpha.1**，而**运行中的宿主是 `dsh-web-app@0.1.5-rc.2`**
⇒ **本地文档可能落后于运行体**。任何据此得出的结论都要问「运行版是否仍这样」。
**✅ 已逐项核对（v1.15.43，8 个平面；见 `BACKLOG.md` T16 第 4 项）**：**机制面零漂移**
（`isolate` 继承 / `export default` 丢命名空间 / `ctx.get` vs 属性代理 三处源码哈希与克隆面相同）⇒ **克隆面行号可继续引用**；
但**组合/产物面全漂移**（base −2 行、web-app +10−1 行、sdk-minimal +16 行含 `invariants` 装配、
agent preset 内容 6 文件不同）。
**一条会误导下游的纪律偏差（已记 `BACKLOG.md` T16）**：`packages/AGENTS.md` 末条写「**Every package owns `./invariant`**」，
而 0.1.5-rc.2 的**发布产物**上 `dsh-invariants` / `dsh-base` / `dsh-web-app` 都**不再发** `./invariant` 与 `lib/invariant.js`
（0.1.1-rc.x 是发的；服务包如 `dsh-session` 四版本都发）⇒ **引用该纪律时必须注明版本与包型**。
**已吸收痕迹**：本项目曾用它做过一次会话接口核对（`CHANGELOG.md` v1.15.1 段），但那是对照 GitHub 官方源码 + 运行时，
**不是**读这个本地克隆。
**下一步**：`apps/` / `packages/` 其余面**按需局部读**（不为覆盖率而读）；平台契约的权威答案已收进
`references.md` §6.5 与 `adr/0074` 补记。

### 2.2 `hl_mem`（**重点材料**，已三轮）

| 三轮 | 覆盖 |
|---|---|
| v1.15.30（ADR-0073） | 摘要/矩阵/README 层面：一条可借鉴（D8）+ 逐条不吸收 |
| v1.15.37（ADR-0076） | 补齐 `docs/adr/0004`（26 KB）+ `capability-matrix` 全文 + 评测治理 |
| v1.15.39（ADR-0078） | **首次克隆后一手读源码**：三处自我更正（守卫不是写侧 / 协议是窄面+默认 observe / 路径计数错） |

**已吸收**：D8（README 表补三列）、ADR-0077 三件（信号表棘轮 / `verify` 冒烟门 / 错误方向不对称）、
**ADR-0078 的门禁形状已在 v1.15.41/v1.15.42 落地两处**（结构门 `audit-layers` / 确定性基准门 `retrieval-eval`）。
**门禁面已读（v1.15.43，`references.md` §6.6）**：`scripts/` 11 个 `check_*.py` + **5 个 workflow** +
`benchmarks/release/`（协议 JSON / 比较器 / 签入 results）+ `tests/eval/`（第二套更严的 gate）。
**未读（诚实边界）**：`tests/` 其余 ~375 个测试体 · `src/` 其余 ~344 文件 · `docs/*.md` 顶层(13) ·
`evaluation/tools/` 其余 15 个 runner · `benchmarks/archive/v030/*`。
**下一步**：**按需局部读**（已不再为覆盖率而读；凡要吸收的形态，当轮必须落到本仓代码并过 `verify`）。

### 2.3 `openviking`（**吸收最深的一份**）

- **已吸收**：ADR-0065（三条：目录级 L0/L1 sidecar / L0 从 L1 确定性抽取 / sidecar 自报 `freshness`）
  → ADR-0075 **已实现**；另有 `hotness` 出处**勘误**（把「OpenViking 式」改为 MemoryBank）。
- **已知的、未吸收的关键事实**（`references.md` §5 记着）：它**原生支持 DSH**
  （`examples/dsh-memory-plugin`，7 个 `viking_*` 工具、`agent/pre-step` waterfall 注入、`ctx.provide("openvikingMemory")`），
  是本项目记忆层的**直接替代品**；两条边界：**dsh 不感知 compaction**、**每个 subagent = 独立会话、父子关系不保留**。
- **本轮**：🔄 子代理在查「**还有什么形态可移植但没吸收**」（AGPL ⇒ 只取概念不取代码）。
- **未读**：3891 文件中的绝大部分（含 `docs/` 全量、`crates/`、`examples/dsh-memory-plugin` 源码）。

### 2.4 `archify`（**在用工具**，从未被审查为 repo）

- 现状：仅作为「报告 L2 的架构图/可视化插件」出现在 `references.md` 与 `.docs` 里；其**视觉自检产物**被 `.gitignore` 收掉（`docs/*.visual-check.*`）。
- **未读**：仓库本体（422 文件）、它的技能定义、它与 DSH 的挂载方式。
- **下一步（低优先）**：审查「它的插件形态」作为**DSH 插件工程的对照样本**（MIT ⇒ 可参考代码结构）。

### 2.5 `awesome-dsh-plugin`（**生态索引**）

- 现状：本项目曾用它做过一次「同题件调研」（`CHANGELOG.md`：查过 `dsh-housekeeper` / `dsh-python-env` / `dsh-desktop-app` / `dsh-need-finder` 等），**未审查该仓库本身**。
- **关键待答**：清单是**自动生成**还是**手写**？有没有生成脚本/CI/去重校验？（决定这份索引**会不会失真**——本项目刚在别处踩过「手写索引必漂移」。）
- **下一步**：子代理已在本轮定位（§2.8 汇总）。

### 2.6 `ppt-master`（**零提及**）

- 现状：本项目全部文档里**零提及**。725 MB / 14,354 文件，MIT。
- **为什么值得看**：它是「文档 → 成品产物」的生成器，与本项目的「记忆 → 报告」在**形态上同族**（都是「源 → 派生产物 + 体例」）。
- **下一步**：定位（子代理本轮做），再判是否需要深读。

### 2.7 `voyager`（**零提及**）

- 现状：本项目全部文档里**零提及**。610 MB / 56,514 文件；`package.json` 为 `voyager@1.7.1`、版权 Jonathan Braat ⇒ **上游 fork**，而远端是 `Nagi-ovo/voyager`，其提交含 `docs(dsh):` ⇒ 该 fork 做了 DSH 适配。
- **下一步**：定位「它到底是 DSH 的什么」（前端？插件？）再定优先级。

### 2.8 并行深读（**四路全部回报**，2026-09-12）

> **时态说明（v1.15.44 回填）**：本节各条里「本轮 / 子代理在查 / 下一步」的**将来时措辞**是**第一轮当时**的原文，
> 已全部兑现 —— 四路回报**均已整合**（结论落 `adr/0074` 补记、`adr/0078`、`adr/0080`、`BACKLOG.md` T13–T16、
> `references.md` §6.2–§6.6）。**第 5 轮又追加三路并行查证**（A 段残余 18 条 / T12 时间炸弹 / T16 版本偏差），
> 结论见 `CHANGELOG.md` v1.15.43。**§2.3–§2.7 的「下一步」均已执行到「定位」这一步为止**，未再深入。

| 路线 | 对象 | 交付 | 最要紧的产出 |
|---|---|---|---|
| A | harness `docs/` 357 篇（读 22 篇全文 + 10 篇部分） | ✅ 已回报 | **4 条下游契约理解错误**；本轮已用**运行体**复核其中第 1 条（见下） |
| B | `vendor/cordis` + `loader` + `agent-presets` + `.agents/` 索引 | ✅ 已回报 | **3 条理解错误**（`isolate` 是**行级**、`group` **不**继承；权威判据在 `mount.ts`；`ctx.set` 不是 provide） |
| C | `openviking` 未吸收面 | ✅ 已回报 | **8 条可移植**（对 T13/G1/T14/T15/D3）+ **8 行「承诺 vs 落地」不一致表** |
| D | `voyager` / `ppt-master` / `archify` / `awesome-dsh-plugin` | ✅ 已回报 | 身份与关系定位（**只有 archify 是真 DSH 插件**） |

**本轮最要紧的一条（已用运行体裁定，落 `adr/0074` 补记）**：
平台文档说省略 `sandboxPolicy` 是合法的 ⇒ 看似推翻 ADR-0074；**回运行体（0.1.5-rc.2）核对后**：
省略确实合法（`dsh-fs-sandbox/index.js:158` `sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()`），
但**无参 `resolve()` 取的是服务级根**（`dsh-sandbox-policy/lib/index.js:116-117` `config.workspaceRoot ?? process.cwd()`），
只有 **`resolve({session})`** 才用 **`session.header.cwd`**（`:138-142`）
⇒ **ADR-0074 的结论成立，机制表述已修正**（不是「插件读环境变量」，而是「平台服务在无 session 时按进程级解析」）。
**副产品（v1.15.40 第 2 轮两次更正，**都是自我更正**）**：
① 第 1 轮我据子代理的表述写成「本仓 `core/fs-scope.ts` **重造了**平台已有的 `ctx.sandboxPolicy`」——**判断错误**：
   读自己的代码后确认 `core/fs-scope.ts:34-35` **本来就是委派**（`context?.get?.("sandboxPolicy")` → `sp.resolve({ session })`）。
② 第 2 轮我进一步据「对三个包 grep `DSH_PERMISSION_MODE` 得 0 命中」断言「该环境变量在运行体里不存在」——**也是错的**：
   它存在于**部署组合** `@deepseek-ai/dsh-base/cordis.patch.yml`（运行体 0.1.5-rc.2 的 `:208-212`：
   `mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'` / `workspaceRoot: !!js process.cwd()`）。
⇒ **两条教训**：**(a)** 子代理/文档的表述**不能代替读自己的代码**；**(b)** **grep 之前先写清枚举范围**
（这与第 1 轮我踩的 `-like` 正斜杠、`specs/` 假阴性是同一族）。**净结论**：`fs-scope.ts` 与 ADR-0074 **两处都对**，
只是「包层读 config」与「部署层配 env/cwd」**两层**必须分清——已写进 `core/fs-scope.ts` 的注释留档。

**T16 第 1 条已结案（运行体 Service 目录，2026-09-12 第 2 轮）**：
`ctx.sandboxPolicy` 在运行体里**是注册服务**且**对普通插件可见**，平台自身给出两种接入方式：
`access.optional = { expression: "ctx.get(\"sandboxPolicy\")", requiresUndefinedCheck: true }`、
`access.hardDependency = { inject: ["sandboxPolicy"], expression: "ctx.sandboxPolicy" }`；
契约原文还逐字印证了 ADR-0074 补记的结论：「**A session cwd is its workspace-write boundary;
the configured root is the fallback for agentless calls and sessions without a cwd.**」
（⇒ 文档里「only the sandboxed executor and provider read the service」在本运行体上**不成立**：
`dsh-web-app` 自己的包就是 `static inject = ['fs','sandboxPolicy','sessions','typert']`。）

**其它已入账的动作项**（见 `BACKLOG.md` T16）：`isolate` 行级语义（技能散文不精确）/ 平台已有而下游可能在重造的四项
（`ctx.sessionProjections` / `ctx.storageDomain` / `ctx.invariants` / `ctx.jobs`）/ `export default` 自查**已通过**（本仓无 `export default`，`unwrapExports` 那条静默缺陷**不适用**）。

---

## 3. 论文层（`arXiv` / 期刊）

### 3.1 已在用（本项目已引，出处已核实过）

| 论文 | 用途 | 出处 |
|---|---|---|
| **MemoryBank**（Ebbinghaus 遗忘曲线） | `retention` 的 **hotness** 衰减的**真实出处**（ADR-0065 勘误：曾被误标为 OpenViking） | [arXiv:2305.10250](https://arxiv.org/abs/2305.10250) |
| 工具数量拐点（10–15 个工具 → 选择准确率跌破 90%） | 工具台账规模判据 | [arXiv:2606.30317](https://arxiv.org/abs/2606.30317) |
| RAPTOR / HeteRAG / UMG-RAG | ADR-0060 多粒度检索层的学术等价物 | 见 `CONTEXT.md` |
| LongMemEval | 长期记忆评测口径（hl_mem 用过） | 见 hl_mem `evaluation/results/README.md` |

### 3.2 检索到的**新线索**（**MemStrata 已一手读完**；其余仍**仅检索、未读全文** —— 诚实标注）

| 论文 | 为什么对本项目重要 |
|---|---|
| **Temporal Validity in Retrieval Memory: Eliminating Stale-Fact Errors for AI Agents over Evolving Knowledge**（**MemStrata**；Neeraj Yadav；**arXiv:2606.26511v1**，2026-06-25；21 页 / 5 表） | ⭐⭐ **与 D3 直接同题，且是同题里证据最硬的一份**。**已一手读完正文（§1–§8）+ Appendix B/C/D + Table 1/2/3 表体**；**A.1/A.2 表体与 Table 4/5 未读到**（HTML 截断，尝试路径见 `adr/0080`）。**裁定见 `adr/0080-memstrata-temporal-validity-paper.md`**。要点：① 取代键是 **`(subject, relation)` 二元组**（**不是**三元组；`object` 是被比较的值）——⚠ **第 2 轮我写成三元组，已更正**；② 机制「If one exists with a *different* object, the new assertion supersedes it ... **No cosine, no LLM judge**」（§4.1）；③ 账本**实现只有三个字段** `valid_from/valid_to/superseded_by`（§4.2），**as-of 查询作者自陈「build on but do not evaluate here」**；④ ⭐ **ADR-0059 的不可达性证明**（Table 1：cosine 分 duplicate/其余 **AUROC 0.5926**，**任何阈值 precision 上限 0.667**，「0.95 floor 不可达」）——**本仓 README/CONTEXT 早已引用的「0.59」原始出处即此**；⑤ ⭐ **「错误方向不对称」的可测形态**：`stale-fact-error rate`（分子=以被取代值作答的矛盾题数，分母=矛盾题数 30/20/20/20）+ **允许弃答 / 强制作答两 regime 必须同报**（Table 3：naive_rag 0.10→0.40 等）；⑥ ⭐ **去掉取代层的消融**：演化准确率 **0.99→0.33**（≈naive_rag 0.32）、**条件编造率 0.04→0.25（~6×）**、峰值 0.56（D.1b，`retain_all_turns` 默认关、写路径其余冻结）；⑦ **两处它自己的不诚实，本仓引以为戒**：摘要写「**~0%**」而表体是 `0.03`（**实为 1/30**）、且**准确率与 stale 错误复用同一 3B 判官**（作者自陈有「同行重叠」）。**⚠ 可复现材料：Reproducibility Statement 声称发布 harness/数据集/prompt，但**本版未给任何 URL/仓库名**（双盲匿名）⇒ **不得写作「已发布」**（第 2 轮措辞已降级）。 | [arXiv:2606.26511](https://arxiv.org/abs/2606.26511) · [HTML](https://arxiv.org/html/2606.26511v1) · 裁定 `adr/0080` |
| **A Survey of Agent Memory in the Second Half: Towards Self-Evolving and Long-Horizon Agents** | 综述：可能给出「记忆系统」的分类学与**评测现状**（对 T11、G1–G4 的空白判断有用） | [arXiv:2602.06052](https://arxiv.org/abs/2602.06052) |
| **From Storage to Experience: A Survey on the Evolution of LLM Agent Memory Mechanisms** | 综述（ACL Findings 2026）：**记忆机制的演化分期** | [ACL 2026 Findings](https://aclanthology.org/2026.findings-acl.2069/) |
| **Caching for the Future: Scrub Jay Episodic Memory Principles for Agent Memory Systems** | 从动物认知取原则（**缓存/前瞻性记忆**）——与「什么该忘、什么该留」的判据可能有关 | [arXiv:2608.04746](https://arxiv.org/abs/2608.04746) |

**纪律**（沿用 0073 起）：**未读全文前不得引用其结论**；读到后必须区分「它声称的」与「有原始数据的」，
并**不得把别家读数当作本系统的证据**。**进度**：✅ `2606.26511`（MemStrata）**已读完正文 + Appendix B/C/D +
Table 1/2/3**（裁定 `adr/0080`；**A.1/A.2 表体与 Table 4/5 仍未读到**，HTML 截断）；其**后续论文**
（*Temporal Validity on Real Software Histories*）**未读**；**分数未复现**。
**下一步**：两篇综述（`2602.06052` / ACL 2026 Findings）只用来做 **G1–G4 的空白核对**，**不**作为本系统证据。

### 3.3 检索到但**判为不相关**（登记以便不再重复检索）

`OCELOT`（隐私泄漏预算，[arXiv:2606.12341](https://arxiv.org/abs/2606.12341)）· `BioXArena`（生物医学多模态基准，[arXiv:2605.15766](https://arxiv.org/abs/2605.15766)）· `ipiton/agent-memory-mcp`（MCP 记忆服务实现，非论文）。

---

## 4. 整合：这些材料各自「喂养」本项目的哪一处

| 材料 | 喂给 | 动作词 |
|---|---|---|
| harness `docs/` + `vendor/cordis` + `.agents/` | **平台契约**（工具注册 / fs 契约 / 组合与 preset / 能力接缝） | **审查 + 纠错**（若下游理解有错，最高价值） |
| harness 运行体（`cordis_inspect_*`） | 版本偏差与**契约语义**的**唯一裁判**（克隆 0.1.2-alpha.1 vs 运行 0.1.5-rc.2） | **标定** |

**运行体 Service 目录的两个结论（v1.15.40 第 2–3 轮，均取自运行体而非文档）—— ⚠ 第 2 条的表述已被 v1.15.42 的运行时可读读取推翻**：
1. ✅ **仍成立**：`ctx.sandboxPolicy` / `invariants` / `jobs` / `storage` / `storageDomain` / `sessionProjections`
   都在**声明的契约目录**里（access 同时给出 `optional: ctx.get(...)` 与 `hardDependency: inject:[...]`）。
   ⚠ **但「目录」不是活性表**（见第 3 条）。
2. ❌ **已被推翻（原写「四项里只对一项成立，唯一候选 `invariants`」）**：`invariants` 的注册表
   **在正在运行的 web 部署里根本没有被挂载** —— 用**只读动态 Host 插件**逐名读 `ctx.get` 得
   `ctx.get('invariants') === undefined`，而同一次探测里**只在宿主/Web 层挂载、任何预设都不提供**的
   `spillStore`/`tokenMeter`/`shellEnv`/`codeRuntime`/`webServer`/`clientModules`/`sessionTitle`/`sessionQuery`
   **全部读到** ⇒ 沙箱 `ctx.get` 读的是**全局服务表**，`undefined` 就是**真的没挂**。
   ⇒ **`invariants` 判「暂不吸收」**（本仓写 `ctx.get('invariants')?.register(...)` 在此部署＝**静默 no-op＝假闸门**）；
   重启该项的前置 = **同时把挂载行写进部署组合**（范本 `dsh-sdk-minimal/cordis.patch.yml:103-104`）或**缺件响亮报告**（ADR-0049）。
   另三项（`sessionProjections` 文件派生 ≠ 会话事件折叠 / `storage` 会撞 ADR-0001 / `jobs` 无后台长任务）**判定不变**。
3. ⭐ **新增纪律（比上面两条都重要）**：**Service 目录 ≠ 活性表**。反例三条：
   **`e2b` 在目录里而 `dsh-e2b` 在本 profile 里根本没安装**（`Test-Path` = `False`）；
   `dsh-invariants` **装了但没挂**；`authorization` / `inspector` 在目录里而 `ctx.get` 均 `undefined`
   （`inspector` 尤其反直觉：它是 Inspect 自身的宿主侧门面）。
   ⇒ **凡结论是「某能力运行体里有没有」，唯一判据是运行时读取**；不得用目录、文档或「安装包里存在」代替。
   （细节与读数表：`references.md` §6.5.1。）
4. **一条教训（可复用）**：怀疑「重造」时，**先取契约判用途，再判是否重造** —— 服务同名不等于用途相同
   （本条避免了一次无效改造，也避免了一次假闸门）。
| hl_mem（余下 `tests/` + `evaluation/`） | T13（结构性门禁）/ T14（确定性基准门）/ T11①（评测纪律） | 吸收（形态） |
| openviking（未吸收面） | T9 / T13 / T14 / T15 / G1 / D3 | 吸收（**只取概念**，AGPL） |
| archify / ppt-master / voyager / awesome-dsh-plugin | DSH 插件工程的**对照样本** + 生态索引可信度 | 定位 → 按需审查 |
| 论文（§3.2） | D3 的外部证据（2606.26511）+ G1–G4 的空白核对（综述） | 深读 → 只作对照 |
| `.shadow/`（记忆树） | **本项目自己的一等数据**（本轮工作的依据与产物） | 消费（不审查） |

---

## 5. 更新方法（**改这张表必须重跑这些命令**）

```powershell
cd G:\project\dsh1
# 名册与规模（口径：递归、不排除 node_modules；要口径洁净的数字就加过滤）
Get-ChildItem -Directory -Force | ForEach-Object { ... }        # 见建立时的命令
# 每个 repo 的身份与版本
foreach ($d in @('hl_mem','openviking','archify','awesome-dsh-plugin','ppt-master','voyager')) { git -C $d remote get-url origin; git -C $d log -1 --format='%h %ad %s' --date=short }
# harness 分面规模（**排除 node_modules**）
Get-ChildItem -Recurse -File <面> | Where-Object { $_.FullName -notmatch '\\node_modules\\' }
# 许可证
Get-ChildItem <repo> -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING)' }
```

**纪律**：① 数字必须**写出枚举口径**（含不含 `node_modules`、含不含隐藏文件）；
② 发现「同一目录两个数字不同」时，**先查口径**再判谁错（本项目已踩过：同一目录 8 个 vs 9 个 `.py`，差额是 `__init__.py`）。

---

## 6. 诚实边界（本台账**尚未**回答的）

- 除 hl_mem（含其**门禁面**）/ openviking / harness 的**关键面**外，**其余材料的「内容」尚未深读**
  （§2.4–§2.7 只做定位；§2.8 四路回报的结论已分别落 ADR / BACKLOG）。
- **论文**：MemStrata **已读完正文 + Appendix B/C/D + Table 1/2/3**（`adr/0080`）；
  **A.1/A.2 表体与 Table 4/5 未读到**（HTML 截断）；**后续论文未读**；**分数未复现**；
  §3.2 其余三篇（两篇综述 + Scrub Jay）**仍只检索未读全文**。
- harness 是 **0.1.2-alpha.1 的克隆**，与运行体 **0.1.5-rc.2** 的偏差**已逐项核对（v1.15.43，8 个平面，T16 结案）**
  —— 机制面零漂移、组合/产物面全漂移；**未纳入**运行中会话**实际挂载**的组合（用户 profile patch / 自制预设 / 动态插件）。
- 名册的**文件计数包含 `node_modules`**（harness / ppt-master / voyager / archify 等前端/TS 仓库），
  ⇒ **不能直接与「源码规模」混用**；口径洁净的数字见 §2 的分面表与子代理回报。
- **本台账只登记「读了什么、吸收了什么、还差什么」**——结论与判据一律落在 `adr/`、`BACKLOG.md`、`references.md`。
- **本轮的台账更新只改「状态列与结论」，未改任何计数**（按 §5 纪律：**改数必须重跑枚举命令**）。
