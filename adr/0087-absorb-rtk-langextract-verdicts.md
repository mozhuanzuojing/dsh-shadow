# ADR-0087: 吸收判定 —— rtk（记账/门禁层）与 langextract（对齐判据）；**本轮只登记，不实装**

- 状态：**已接受（2026-09-14）**
- 决定日期：2026-09-14
- 关联 ADR：**ADR-0065**（吸收 OpenViking —— 本 ADR **沿用其体例**：对标 + 勘误 + 待办，**不实装任何代码**，并说明这是有意的）、
  **ADR-0073 / 0076 / 0077 / 0078**（hl_mem 那一族的四轮：对标 → 深读 → 落地 → 一手源码更正）、
  **ADR-0072**（台账「实测」标签比事实强 —— 本 ADR 的 rtk 甲-3 与甲-8 是它的**同族外部样本**）、
  **ADR-0049**（缺件不静默）、**ADR-0042 / 0043 / 0051**（纯函数派生 / LLM 不能制造关系）、
  **ADR-0001**（不引重服务）、**ADR-0085**（降级台账）、**ADR-0086**（受保护契约登记册）
- 关联待办：`../BACKLOG.md` 的 **D9 / D10 / D11**（本 ADR 新增）
- 版本：`1.15.79`

## Context

用户 2026-09-14 指令：把 `rtk-ai/rtk` 与 `google/langextract` **「拉取后，学习，吸收」**。

**拉取**（已完成，两手一）：`vendor/_src/rtk`（HEAD `d402152`，Cargo 声明 `0.48.0`，Apache-2.0）、
`vendor/_src/langextract`（HEAD `70cfb98`「Prepare v1.7.0 release」，Apache-2.0）。
`langextract` 原有一份**无 `.git` 的 v1.6.0 快照**，本轮按「可逆改动先备份」改名为
`langextract--snapshot-v1.6.0` 后重拉正规克隆（**落后一个小版本，且不是克隆**）。

**学习**（已完成）：两路独立只读深读，要求每条结论带 `文件:行号`、禁止把 README 宣传当事实、
并按「（甲）一旦错了就得返工的 /（乙）其余的」两栏交付。**未安装、未运行**（本机无 Rust 工具链；
装包有副作用且撞 ADR-0049 的审批边界）。

**吸收**（本 ADR 的产出）：见 Decision。**本轮不实装**，理由见 §C，**并且这个「不实装」是决定，不是漏做**。

> **体例说明**：`adr/0065` 的先例是「一个只做对标 + 勘误 + 待办的 ADR 是正当的，且不实装是有意的」。
> 本 ADR 沿用。**一手源码证据的来源是本地克隆**（`参考文献` 两仓均已在 `vendor/_src/` 下）——
> 这正是 `adr/0078` D1 更正① 的教训：**只读 API / README 的描述会在读源码后被推翻**。

## Decision

### A. rtk 的判定：**压缩实现层无用，记账层与门禁层有 8 条判据形态**

**先立一条边界**：rtk 压的是**命令行输出**，本仓压的是**agent 每回合的记忆投影** —— **没有共同消费方**。
⇒ 它 63 个 TOML 过滤器 + 全部 Rust 命令过滤器，**搬过来就是无人调用的死代码**。

**可吸收的 8 条判据形态**（按本 ADR 的落地优先级排序；证据均为 `vendor/_src/rtk` 内路径）：

| # | 形态 | 证据（`src/` 相对路径:行号） | 对本仓的落点 | 为什么值得 |
|---|---|---|---|---|
| 甲-1 | **有损必须声明损失形态 + 交出恢复句柄**；拿不到句柄就不许输出有损结果 | `core/toml_filter.rs:568-578`（`Lossiness{None,Tail,Whole}`）、`main.rs:1606-1630`（注释原文 *"Never emit an unrecoverable truncation marker: fall back to full raw"*）、`core/tee.rs:17-27`、`core/retriever.rs:85-93` | 投影写出侧的截断点 + `read_shadow` 分层省略路径 | **唯一同时满足本仓三条铁律的「丢信息可恢复」设计**：损失形态是枚举值、句柄是内容哈希、取回是纯字节切片。本仓 L0/L1/L2 只解决「给多少」，**没解决「省略的那部分去哪了」** |
| 甲-2 | **`never_worse` 守卫**：压完比原文长就退回原文 | `core/guard.rs:16-23`、`core/runner.rs:16-24`（`emit_guarded` 是唯一出口）、测试 `guard.rs:29-66` | 投影写出侧的裁剪/摘要/去重出口 | 全函数兜底、不猜、失败方向永远偏向原文 —— 落在「纯函数派生」的允许面内 |
| 甲-3 | **估算与实测分成两种类型、两个字段**，弱档在展示处自带标记，**不许合并** | `discover/mod.rs:34-49`（`Coverage::Measured/Estimated`）、`discover/report.rs:99-131`（注释原文 *"Kept as its own field … instead of silently going quiet about it"*）、`analytics/gain.rs:531-532`、`gain.rs:438-452`（样本不足输出 `-`） | `core/toolset.ts` 的 `verSrc` + `tools/toolset-authority.lib.ts` 的 `claimOf()` | **直接续 ADR-0072**：本仓 `verSrc` 现在是**嵌在 `note` 字符串里的字符串**，下游 `claimOf()` 用**正则反解**它 —— 正是 rtk 这条要防的「把弱档折进散文」。且 `gain.rs` 的「样本不足不下判断」是小成本高价值 |
| 甲-4 | **默认裁决 fail-closed**：没有规则时的默认结果是保守，且**默认值本身有测试锁死**（测试名直写失败模式） | `hooks/decision.rs:38-97`（注释 *"`Default` must never reach `AllowRewrite` … (#1155)"*）、`hooks/rewrite_cmd.rs:199-231`（*"MUST be 3, not 0!"*）、`:257-270` | 缺件降级决策路径（ADR-0049） | **本仓已具备同形**（`test/missing-dependency.test.ts`）⇒ **登记，不重复建设** |
| 甲-5 | **保留清单要落成负断言**（断言「不丢」，而非「还在」） | `parser/formatter.rs:50-56`、`:124-148` + 测试 `:243-260`（`assert!(!out.contains("up-to-date"))`）、`core/filter.rs:404-441` | 投影 markdown 契约 + mock-harness | 最便宜的「缺件不静默」落地：把「绝对不能丢」从隐含共识变成可执行断言。**但清单必须按消费方建** —— rtk 自己的反例在 `FIX_PERF.md:110-122`（过滤后摘要让 agent 报 0 warning 且不重试） |
| 甲-6 | **规则与黄金样例同址**，且「没有样例的规则」被门禁判失败 | `filters/README.md:41-45`（内联 `[[tests.*]]`）、`hooks/verify_cmd.rs:34-42`（`--require-all` 对无样例者 `bail!`）、`core/toml_filter.rs:2165-2179` | `tools/audit-*.ts` 族 | 本仓有双向棘轮，但**无法回答「有几条判据是没有样例的」** |
| 甲-7 | **审计诚信两件**：门禁必须自证会响（`--self-test`）；**审计不得把自己的逃生门算成成绩** | `scripts/check-test-presence.sh:12-26`（`--self-test` 先造违例再断言能抓到）、`discover/mod.rs:227-234`（注释原文 *"`rtk proxy` … must not count — that would let the audit flatter itself via its own escape hatch"*）、`:196-225`（*"by construction, not just by doc comment"*） | `tools/audit-layers.ts` / `audit-wiring.ts` / `audit-drift.ts` | **前半本仓已具备**（各 `*.selftest.ts` 都带正/负对照，见 `verify` 输出）；**后半是缺口**：本仓的「降级/透传路径」若被审计算成成功，覆盖率会永远好看 |
| 甲-8 | **数字口径要查到「字段注释」一级**，且反事实基线必须封顶在**消费方本来会收到的量** | `FIX_PERF.md:262-264`（自列待修 #4 原文 *"Cap the counterfactual at what the agent would actually have received."*）、`:9-27`（同基准 cost ON 0.4614 / OFF 0.4604 = **−0.2%**，而字节口径显示「压缩有效」）、`core/tracking.rs:506-507`（注释写 *"Actual tokens"* 而 `:1786` 实算 `estimate_tokens`） | `tools/docs-consistency.ts` 增量 | 一个专门写了 `savings-explained.md` 讲清口径的仓库，**仍在字段注释里把估算写成 Actual**，并已传播进用户文档 ⇒「**文档写对了 ≠ 注释写对了**」 |

**rtk 明确不吸收（8 条，逐条理由）**：
1. **63 个 TOML 过滤器 + 全部 Rust 命令过滤器** —— 输入面不存在，搬来是死代码。
2. **命令改写 / 工具调用拦截**（`hooks/**`、`.claude/hooks/*`）—— 直接改变「实际执行哪条命令」= **扩执行范围**，与 inv 178–182 正面冲突；**连思想都不该借**，因其收益在本仓没有对应场景。
3. **`rtk discover` 的「漏掉的节省」判据本身** —— 输入是**宿主私有格式**（Claude Code transcript JSONL）+ shell 文本；本仓的审计对象是**自己的产物**。搬来会把「别人宿主的记录格式」变成本仓的判据依赖。
4. **SQLite + gzip 的 recall 实现** —— ADR-0001 不引重服务。**吸契约不吸实现**（内容寻址 / 字节保真 / 按 hash 取回 / 老化上限），且用文件重做时必须自己重定义去重与老化语义。
5. **`insta` 快照测试** —— 它在 rtk 里**根本不存在**（`Cargo.toml` 无 `[dev-dependencies]`，`cmds/jvm/mvn_cmd.rs:3769-3774` 反而写明 *"no snapshot-testing crate"*）；`docs/contributing/CODING_PRACTICES.md:140,149` 要求 `use insta::assert_snapshot;` 是**文档虚构**。以此为理由引入快照库属于「照文档吸收」。
6. **`scripts/validate-docs.sh` / `update-readme-metrics.sh`** —— 前者只 grep 5 个命令名、打印计数却**从不断言**、且**不在任何 CI 里**；后者自述是占位实现。本仓 `tools/docs-consistency.ts` 已明显强于它。
7. **telemetry**（默认开启的每日 ping + `ureq` 出网）—— 隐私与出网取向无关本仓；且它把**估算的 token** 再换算成**估算的美元**（`README.md:490,497`「基于固定内部常数」）= **把估算叠成估算**，与甲-8 相反。
8. **`--ultra-compact` 这类「再压一档」开关** —— 无独立判据，只是同一批格式器的第三档输出；本仓 L0/L1/L2 是**语义分层**，再加符号化档只会稀释「每档代表什么」。

### B. langextract 的判定：**卖点是真的，纪律是软的；可吸收的判据形态在本仓大多没有消费方**

**一手核实的关键事实（本轮由父代理复核，非仅采信深读结论）**：
`char_interval` 由**确定性 token 级对齐**算出（`langextract/resolver.py:327-400` → `:789-1073`），
**不是**让模型吐位置 —— 卖点是真的。**但它的纪律是软纪律**：

- 定位不到只降级成 `char_interval=None`，然后**静默流到下游**：`resolver.py:1021-1038` 收
  `unaligned_extractions` 只为跑一次 fuzzy 重试，**之后无计数、无 warn、无 raise**；
  `align_extractions` 在 `:1073` 直接 `return`。父代理复核：全文件仅两处 `logging.warning`
  （`:311` / `:319`），**都是解析错误，与对齐失败无关**。
- 唯一的硬断言 `tests/test_live_api.py:279-302` `assert_valid_char_intervals`，
  而默认门 `tox.ini:25` 是 `pytest -m "not live_api and not requires_pip and not integration"` ⇒ **被排除**。
- `AlignmentStatus.MATCH_GREATER`（`core/data.py:45`）**全仓只出现 1 次**（就是声明那行）⇒ **死枚举**（父代理复核确认）。

⇒ **本仓不得把它当成「有门的先例」引用**。它恰好是 **ADR-0049 要防的那种形态**：
**降级了，但不可见**。这条是本次学习**最值钱的单点结论**，且它是对我们自己在
`references.md` §8 里那句描述的**更正**（原描述只说了「自动检测 + 降级为 None」，没说「**没有任何强制点**」）。

**可吸收的判据形态（登记为对照，本轮不实装）**：

| # | 形态 | 证据 | 为什么本轮不实装 |
|---|---|---|---|
| 乙-1 | **对齐结果必须分级**（EXACT / GREATER / LESSER / FUZZY），不是布尔「有/无位置」 | `core/data.py:43-47`；赋值点 `resolver.py:1006`/`:1011-1014`/`:1241` | **本仓没有消费方**：Evidence Gateway 判的是**路径是否存在**（`evidence/gateway.ts:15` 三态 `verified/not_found/unavailable`），**没有「模糊命中」这一维**。硬加就是假闸门 |
| 乙-2 | **`char_interval != None` ≠ 逐字命中**（fuzzy 也写区间，但切片 ≠ 引用文本） | `tests/fuzzy_alignment_cases_test.py:203-211`、`:212-235` | 同上（无文本对齐面）。**但它是本仓「无证据不返回」的一条警示**：若将来做文本对齐，判据必须是「位置存在 **∧** 切片与引用文本逐字相等」 |
| 乙-3 | **双闸数值判据：覆盖率 + 密度**（0.75 / 1/3） | `resolver.py:57-58`、`:1377-1404`、`:759-772` | 同上；且**数值是经验值不能当结论抄** |
| 乙-4 | **命中率必须是一等可见指标**（正/反两例齐全） | 正：`benchmarks/benchmark.py:222-245`（打印 `N ungrounded entities ignored`）；反：`visualization.py:595-601`（**部分**无位置时静默丢弃、无计数） | **本仓已具备同形**：被证据门拒收的原子进 manifest（`core/node.ts:32-34`，v1.15.57 修）⇒ 登记即可 |
| 乙-5 | **`Prompt alignment` 三档 + 默认出声**（OFF/WARNING/ERROR），校验对象写死在文档里 | `extraction.py:71`、`prompt_validation.py:48-53`/`:130-220`/`:223-269`、`SKILL.md:86-90`（自陈「验证器不强制这些规则」） | 本仓 ADR-0049 已有档位；**但「校验对象写死在文档里」这个细节值得记**（防读者误以为它守的是产出质量） |
| 乙-6 | **分片必须带可换算回全局的区间**（局部坐标 + 偏移量只在 align 处加一次） | `chunking.py:343-506`、`:216-243`；offset 加回 `annotation.py:411-429` | 本仓目前无长文件分片审计需求 |
| 乙-7 | **无位置项在多轮合并中永不去重**（会随轮数线性膨胀） | `annotation.py:99-100`（任一方 `None` 即 `return False`），行为被测试固化为期望：`tests/annotation_test.py:1094-1115` | **要有消费方才谈得上**；本仓今日无多路合并。**但它是一个现成的坑**：若将来做多路合并，去重键必须含「无证据档」，否则无证据项会成倍膨胀、顶穿「无证据不返回」 |

**langextract 明确不吸收（逐条理由）**：
1. **LLM 抽取写入路径本身** —— 它整个存在的前提是「LLM 制造内容，再用对齐事后追认」，与 ADR-0042 / 0043 / 0051 直接冲突。**只取判据形态，不取写入路径**（与 `adr/0073` 对 hl_mem 的处置同型）。
2. **few-shot 示例反推 schema**（`core/schema.py:44-49`、`providers/schemas/*.py`）—— 从示例**猜字段**，并把猜出的字段集当约束下发，违反「不许猜字段」。
3. **依赖栈**（`pyproject.toml:30-48`：pandas / numpy / requests / absl-py / pydantic / google-genai / google-cloud-storage）—— 违反 ADR-0001。
4. **IPython / Jupyter 耦合的返回类型**（`visualization.py:37-60`）—— 本仓无 notebook 面；只借「自包含 HTML」这条约束。
5. **`fuzzy_alignment_algorithm="legacy"` 滑窗实现**（`resolver.py:591-715`）—— 已被 LCS 取代并标 deprecated，**双实现违反「一处事实只在一处」**。
6. **Provider 插件注册表**（`providers/router.py` + entry-points 发现）—— 解决的是本仓没有的问题。
7. **`_extractions_overlap` 的「任一方 None 即不重叠」**（`annotation.py:99-100`）—— 明确**不能照抄**（见乙-7）。
8. **`prompt_validation` 的 OFF 档作为默认可达的免检后门** —— **可关 = 可静默**，与 ADR-0049 口径相反。
9. **`AlignmentStatus.MATCH_GREATER`** —— 死枚举项，不要跟着抄进本仓的状态机。
10. **batch API 路径**（`providers/*_batch.py`）—— 需要云存储与作业轮询，属重服务。

### C. 为什么本轮**不实装**（这是决定，不是漏做）

三条独立成立的理由：

1. **不允许建没有消费方的机制。** 本仓已八次记录同一族缺陷 ——「**机制存在、没接线**」
   （`audit:wiring` 的 A/B 两类就是为它造的）。langextract 的全部可吸收项 **在本仓今日都没有消费方**
   （乙-1…乙-7 逐条已注明）；rtk 的甲-1 需要先定**恢复存储策略**（不许 rusqlite，用文件重做要自己定义去重/老化），
   甲-2 需要先定**中文 token 口径**（见下），甲-3 会动**已签入的离线棘轮** `tools/toolset-authority.json`。
   **每一件都有一个必须先拍板的前置**，静默替用户选一个就是越权。
2. **`adr/0065` 的先例成立**：只做「对标 + 勘误 + 待办」的 ADR 在本仓是正当的，且**不实装是有意的**。
3. **本轮已产出一件实打实的东西**：对 `references.md` §8 的**更正** —— 那份描述此前只说
   「自动检测 + 降级为 None」，**没说「没有任何强制点、唯一的硬断言在默认门之外」**。
   按 `adr/0078` D1 更正① 的同一纪律：**读源码后要更正此前只读 README 得出的描述**。

**三条前置里的两条，本 ADR 已给出可判定的选项**（不替用户选）：
- **甲-2 的中文口径**：rtk 用 `text.len()`（**字节**）/4（`core/tracking.rs:1705-1714`），
  而 UTF-8 中文 3 字节/字 ⇒ 按 0.75 token/字估算，**真实约 1 token/字，偏差方向与英文相反**。
  ⇒ 本仓若采纳，必须**换成自己实测的估值，或明确比较字节数并在字段名上写清是字节**。
  **（深读专家已声明：这条是他从编码事实推出的推断，rtk 源码里没有任何 CJK 口径讨论 —— 不是 rtk 的陈述。）**
- **甲-3 的落地形态**：新增**类型化字段**作唯一事实源，`note` 由它**派生**（渲染保持不变 ⇒
  `tools/toolset-authority.json` 与双向棘轮**不受影响**），`claimOf()` 不再正则反解散文。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 照 `adr/0077` 那样**实装**三五条 | **每一条都有必须先拍板的前置**（存储策略 / 中文口径 / 动签入棘轮）。静默选一个 = 越权；三条全做 = 远超一次「拉取后学习」的授权面 |
| 把 rtk 的 63 个过滤器按「输出压缩」搬到本仓 | **输入面不存在**：本仓不接管 shell 输出（证据：刚落盘的记忆正文只有 `- [09:11:18] [pwsh] 调用 pwsh` 这类动作行，**不含命令输出**）⇒ 搬来是死代码 |
| 借 rtk 的命令改写 hook 给 DSH 接上 | **正面冲突**：它改变「实际执行哪条命令」= 扩执行范围，撞 inv 178–182。**连思想都不该借** |
| 把 langextract 的对齐器实现进本仓 | **没有消费方**。本仓判的是路径存在性，不是文本对齐 ⇒ 会造出一个「生产零调用」的机制（正是 `audit:wiring` A 类要抓的东西） |
| 把 langextract 当「有门的先例」写进文档 | **事实错误**：`tox.ini:25` 默认门排除 live_api，唯一的硬断言在门外；fuzzy 之后无任何出声。**先核实再落笔**正好挡下了这个错 |
| 引入 `insta` 或任何快照库（理由是「rtk 这么做」） | **rtk 根本不这么做**：`Cargo.toml` 无 dev-dependencies，`mvn_cmd.rs:3769-3774` 明确声明不用快照库。那两句要求是**文档虚构** ⇒ 「照文档吸收」的反例 |
| 顺手把 rtk 的 telemetry / `--ultra-compact` 一并吸收 | telemetry 涉及出网与隐私、且把估算叠成估算（与甲-8 相反）；`--ultra-compact` 无独立判据、会稀释分层语义 |
| 用 `--depth 1` 之外的手段补 rtk 的「未核实」项 | 本机**无 Rust 工具链**，装它撞 ADR-0049 的审批边界且属出网副作用。⇒ 未核实项**如实登记**，不靠猜补齐 |
| 两仓合成一份 ADR 但只写「值得借鉴」不写判定 | 「可吸收 / 不吸收 / 未核实」三栏是这份工作的**全部价值**；只写「值得看」等于把工作外包给下一个人 |

## Consequences

### 正

- **判定了两类不同性质的对象**：rtk 是「**记账/门禁层的密集样本**」（有 8 条形态，2 条已是本仓同形，1 条是本仓缺口）；
  langextract 是「**卖点真、纪律软**」——它的精华判据在本仓**没有消费方**，而它本身是 ADR-0049 的**反面教材**。
- **一处事实更正**：`references.md` §8 此前对 langextract 的描述不完整（只写了「自动检测 + 降级为 None」，
  没写「**没有任何强制点**」）。本 ADR + 更正后的 §8 把这条补上，并**明确禁止**把它当「有门的先例」引用。
- **一条可复用的自我防错**：`adr/0078` 的「读源码后更正只读文档的描述」在本轮**第二次**生效
  （第一次是 hl_mem 的 `assert_transition()`）。
- **8 + 7 条判据形态入册**，各带 `文件:行号`，且**逐条注明「为什么本轮不实装」**——下一轮不必重读两仓。
- **三条前置被点明并给了可判定选项**（甲-1 的存储策略 / 甲-2 的中文口径 / 甲-3 的落地形态），
  **没有替用户选**。

### 负 / 已知边界

- **本轮零代码改动**（同 ADR-0065）。可吸收项**全部只到「登记 + 待办」**，实装按 D9 / D10 / D11 走。
- **两仓均未安装、未运行**：本机无 Rust 工具链；langextract 未 `pip install`（会出网且撞 ADR-0049 的审批边界）。
  ⇒ 所有结论**止于源码阅读**，**行为未经运行验证**。
- **未核实项如实登记，不自作补齐**（两路专家的清单已并入，摘要见下）：
  rtk 侧 —— `src/hooks/init.rs`（398 KB）未通读、「安装器对 17 个 agent 各写哪个文件」矩阵未核、
  `RtkRule` 计数**四份文档四个数**（60+/60+/70+/30+）哪个对未判、`tests/fixtures/` 约 180 个文件的 golden
  覆盖比例未逐文件统计、「zero dependencies」一句在 `README.md` 里**找不到**（原句在 `docs/contributing/TECHNICAL.md:15`）、
  `FIX_PERF.md` §4 六条待修**是否已修未核**；
  langextract 侧 —— `core/tokenizer.py`（514 行）与 `core/types.py` 未读 ⇒「token 级对齐 = 词级对齐」
  **只在默认 `RegexTokenizer` 假设下成立**、`providers/*_batch.py` 未读、
  「`langextract/` 下没有 `extraction_text` 与源切片比较的代码」**只是 grep 未搜到**（grep 不能证明不存在）。
- **甲-2 的 CJK 结论是推断**（编码事实 + 源码事实推出），**不是 rtk 的陈述** —— 已在 §C 标注。
- **甲-7 的风险**：rtk 的 `--self-test` 会往源码树写文件（靠 `trap rm -f` 清理，`CHANGELOG.md:163-164` 记过一次
  「benchmark 脚本删掉工作树里的 harness」）。本仓若采纳，自证门**必须写临时目录且不触碰受保护契约区**（ADR-0086）。
- **两仓的 star / 活跃度读数有保鲜期**（抓取 2026-09-14）；本 ADR 引用的是 **HEAD 快照**（已写死）。

## 自检

- [x] 与 **ADR-0065** 体例一致：对标 + 勘误 + 待办，**不实装**，并**说明这是有意的**（§C）。
- [x] 与 **ADR-0073 / 0076 / 0077 / 0078** 一致：hl_mem 那族的**不吸收清单未变**；「读源码后更正文档描述」的纪律本轮**第二次**生效。
- [x] 与 **ADR-0072** 一致：rtk 甲-3 / 甲-8 是它的**同族外部样本**（标签/注释不得强于事实），本轮**未**改动 `verSrc` 的任何默认值。
- [x] 与 **ADR-0049** 一致：langextract 被明确记为**该纪律的反面教材**（降级了但不可见），**不得当作「有门的先例」引用**。
- [x] 与 **ADR-0042 / 0043 / 0051** 一致：两仓的 LLM 抽取 / 示例猜字段路径**逐条否决**；只取判据形态。
- [x] 与 **ADR-0001** 一致：不引 SQLite+rusqlite / gzip 实现 / 任何新依赖（rtk 不吸收项 4、langextract 不吸收项 3）。
- [x] 与 **inv 178–182** 一致：rtk 的命令改写 hook **连思想都不借**（扩执行范围）。
- [x] **未越权**：三条前置**未替用户选**；本轮不实装的理由写成三条独立成立的判据。
- [x] **不冒充已核实**：行为未运行（本机无 Rust 工具链 / 未 pip install）；「未核实」清单完整列出，含**专家自己纠正的初判**与原报告被截断后补发的部分。
- [x] **父代理复核了承重结论**：甲-1（软约定非门）、`tox.ini:25` 排除 live_api、`MATCH_GREATER` 死枚举三处**由父代理独立复核**，不是仅采信深读结论。
- [x] **先判「有没有消费方」再谈吸收**：langextract 全部可吸收项因**无消费方**而不实装 —— 避免制造本仓记录最多的缺陷类型。
- [ ] **未做**：D9 / D10 / D11 的实装；两仓的安装与运行验证。
- [ ] **未验证**：甲-2 的中文 token 偏差量级（未实测）；两仓在真机上的行为。
