# ADR-0080: MemStrata 全文深读 —— 对 **D3** 与**评测纪律**的可吸收项（论文层第一份硬核）

- 状态：**已接受（2026-09-12）**
- 决定日期：2026-09-12
- 材料：**MemStrata** —「Temporal Validity in Retrieval Memory: Eliminating Stale-Fact Errors for AI Agents over Evolving Knowledge」，Neeraj Yadav，**arXiv:2606.26511v1**（cs.CL，2026-06-25，21 页 / 5 表）。
  **一手读到的**：摘要、§1–§8、Reproducibility Statement、Appendix B/C/D 全文、**Table 1/2/3 表体**、A.3 两张 sweep 表。
  **未读到（诚实边界）**：**A.1 的 8 条件 × 6 基准全部表体**（含 stale 错误的 8 列版、latency 两矩阵）、**Table 4/5（延迟）表体**、**A.2 forced-answer 四张表体**、A.1/A.2 只有小标题与说明段。
  抓取尝试与失败原因见对话记录（`arxiv.org/html` 在 A.1 表体处被截断；ar5iv 同位置；jina 文本代理丢弃 A.1/A.2 表体；PDF 与 TeX 源均因 content-type 不受支持）。
  ⚠ **本 ADR 一律区分「正文声称」与「表里有原始数字」**；未读到分格的数字**不得引用**。
- 关联 ADR：**ADR-0059**（不把语义裁决交给 LLM —— 本文给出**最强的独立量化证据**）、**ADR-0061**（取代生命周期 / 不持久化 —— 本文是**持久化**取法的对照）、**ADR-0076**（「错误方向不对称」—— 本文给出它的**可测形态**）、**ADR-0073 / 0078**（对 hl_mem 的方法与纪律）、**ADR-0049**（缺件不静默）、**ADR-0075**（派生纪律）
- 关联待办：`../BACKLOG.md` 的 **D3**（对照面第四次更新）、**T11①**（marker-free 不变式可照抄）、**T14**（新指标 + 两 regime）、**G1**（本文**同样没有**有效期字段的消融）、**T16**（另一条独立结论见 §5）
- 版本：`1.15.40`

## Context

目标轮次第 3 轮。第 2 轮已在 `MATERIALS.md` §3.2 登记本文（当时只读摘要），并注明「**未读全文，不得引用其结论**」。
本轮读完全文（除 A.1/A.2 表体），**四项可吸收、三项不吸收、三处更正我自己第 2 轮的表述**。

## Decision

### 1. 取代规则的精确定义（**更正我第 2 轮的措辞**）

§4.1 原文：
> **MemStrata normalizes the (subject, relation) key and checks for an active assertion with that key. If one exists with a *different* object, the new assertion supersedes it: the old row's validity interval is closed (valid_to set, superseded_by linked) and the new row opened. Same object → duplicate (reinforce). No prior key → novel (store). No cosine, no LLM judge.**

⇒ **取代键是 `(subject, relation)` 二元组**，`object` 是**被比较的值**，不是键的一部分。
**我第 2 轮写成「确定性 `(subject, relation, object)` 取代规则」是不精确的**（那是摘要里的事实形状表述）；已更正 `MATERIALS.md` 与 `BACKLOG.md`。

**三条与「对象」有关的对照（决定可吸收边界）**：

| 维度 | 本文 | 本仓 | 判断 |
|---|---|---|---|
| 键 | `(S,R)` 规范化二元组 | 自由文本 `entry`（第一条 `# ` 标题） | 粒度更细、但**规范化未定义**（见下） |
| 取代方向 | 由**摄取顺序**决定（§7 自陈「ingestion order」代替真实时间） | 由**文件名的 date+time** 决定 | 本仓**有真实时间**，本文没有 |
| 关链权限 | 确定性规则；LLM 只出现在**回退门控路径** | 确定性读时裁决；LLM 无写路径 | **同向**（ADR-0059 的外部正例） |

**⚠ 最要紧的一条硬约束（本文自曝，直接关系本仓能否照抄「键」这一层）**：
- §7 把 **"entity canonicalization, relation typing"** 明确列为**未来工作** ⇒ **键的规范化规则论文里没有**。
- Appendix C.1 的抽取 prompt 原文：
  > 「The 'subject' describes WHAT that value belongs to and MUST NOT contain the object value. **Two statements that differ only in the value must produce the SAME subject and relation**, so the system can detect the change.」
  ⇒ **键的相等性实际上由 LLM 抽取保证**，不是确定性代码保证。
- ⇒ **本仓若照抄三元组，会一并继承「键相等性依赖 LLM」这个未定义面** —— 这与本仓 ADR-0059（写路径无 LLM）**直接冲突**。**⇒ 不吸收「键」这一层**，只吸收**指标与协议**（见 §3）。
  （§7 自陈「Extraction quality, not the supersession mechanism, is the gating factor」；其模板基准 keying ~97%，而更杂的自然语言基准掉到 **~44%** ⇒ **规则对、抽取层不可靠，端到端照样失效**。）

### 2. 双时间账本：**实现只有三个字段**，且 as-of 未做未评（对 G1 直接有用）

§4.2 原文：
> Facts are retired, not deleted. The store records **valid_from, valid_to, and superseded_by**, so superseded facts remain available for future as-of-time queries ... Active retrieval surfaces only currently-valid rows.

- **实现层只有这三项**；所谓「双时间」的第二轴**没有字段名**（§2 只在 Related Work 里讲 valid time vs transaction time 的概念）。
- §4.2 自陈 as-of 是**未评测**的能力：
  > 「... (a capability we build on but **do not evaluate here**; Section 7)」
  §7 又写：
  > 「... threading real valid_from timestamps plus an "as-of-T" retrieval mode is **future work**, not new storage.」
- ⇒ **对 G1（「知识带有效期字段」的对照消融）的直接回答**：**本文同样没有对「有效期/双时间字段」做对照消融**，它只对**取代层**做了消融（见 §4）。本仓 G1 的空白**在本文找不到现成对照**，只能借其**消融形态**。
- ⇒ 附带的**纪律范例**（本仓应学）：「**存了但没有读路径**」必须显式标注（本文正是这么写的），而不是把「存了」说成「支持了」。

### 3. ⭐ 可吸收甲：`stale-fact-error rate` + **两 regime**（「错误方向不对称」的可测形态）

§5 定义原文：
> **stale-fact-error rate (fraction of contradiction questions answered with the superseded value)**

- **分母 = contradiction questions**；**分子 = 其中以「被取代值」作答的题数**。分母的原始来源（Appendix B.3–B.6）：**30 / 20 / 20 / 20**；静态侧 domain=50、locomo=30（B.7）。
- §5 尾句给出**两 regime**（这一条是本 ADR 认为最该吸收的）：
  > 「We additionally run a **forced-answer supplement** that disables abstention on the RAG conditions, to **expose the stale-commitment that abstention otherwise hides**.」
  A.2 标题给出规模：`no-abstention, 3 conditions × 4 evolving benchmarks`。
  ⇒ **只报「允许弃答」一列会掩盖 stale 错误**（弃答把错误洗成低准确率）。**必须两列同报。**
- **Table 3 表体（原始数字，分母见上）**：

| 演化基准（分母） | naive_rag 允许/强制 | temporal_v6 允许/强制 |
|---|---|---|
| code_mutation (30) | 0.10 / 0.40 | **0.03 / 0.03** |
| config_migration (20) | 0.05 / 0.35 | 0.00 / 0.00 |
| dependency_bump (20) | 0.05 / 0.15 | 0.00 / 0.00 |
| api_evolution (20) | 0.30 / 0.35 | 0.00 / 0.00 |

**⚠ 两处必须照抄的诚实纪律（本文自己踩了，本仓要避开）**：
1. **「~0%」不是 0**：摘要写「drives this to **~0%**」，而表体是 `code_mutation` 的 **0.03**（分母 30 ⇒ **实为 1/30**）。本仓若用该指标，**必须印出分子/分母**，不得只写百分比（「不伪造精度」）。
2. **指标间判据必须独立**：§5.3 自陈
   > 「**Single-judge noise.** The 3B correctness judge occasionally scores a gate-condition answer "correct" while it contains the stale value, producing **a few rows where accuracy and stale-error overlap**.」
   ⇒ 两个指标复用同一判官 ⇒ 出现**同一行既「正确」又「stale 错误」**。本仓若同时报「正确率」与「错误关链率」，**必须各自独立判定并显式列出重叠行**。
3. **分母为 0 未定义**：论文**未提** zero-denominator 处理（静态基准无矛盾题）。本仓移植时应定义为「**不可测**」而非 0（否则就是伪造精度）。

### 4. ⭐ 可吸收乙：三组**消融形态**（G1 缺的正是这个）

| 消融 | 原文读数 | 对本仓的用途 |
|---|---|---|
| **去掉取代层**（D.1b `retain_all_turns`） | 「Removing supersession collapses mean evolving accuracy from **0.99 to 0.33** — statistically indistinguishable from naive_rag (**0.32**) — and **re-raises stale-fact error from 0.00 to 0.05–0.25** ... It also raises **conditional fabrication in every benchmark — mean 0.04 → 0.25 (~6×), peaking at 0.56** on config_migration」 | **G1 缺的就是这个形态**：不只报准确率，还报**代价方向**（保留全部 ⇒ 编造率 ~6×）。且**开关级单变量**：「`retain_all_turns` is an ablation-only flag, **default off**, write path otherwise frozen」「Same models, temperature 0, seed 0」 |
| **两侧夹逼**（D.1 retain-vs-lossy） | 「The lossy variant merges non-contradictory near-duplicates at write time and **collapses on static recall (0.62/0.13)**; the full method retains them and ties RAG (0.82/0.30)」 | **对照要双向**：过度合并丢静态召回，不取代丢时间有效性 ⇒ 设计被夹在中间 |
| **没做就说没做**（D.2） | 「A dedicated single-factor packing cell **was not run separately and is marked future work** — **we do not imply a measurement we did not take.**」 | 措辞纪律可直接借用（本仓「未验证/未做」段） |

另有两条**非贡献**对照（同样是本仓取向的外部正例）：
- D.3：「v6 (gate + LLM relevance verify) vs v6_no_verify (gate only) ... v6 **≤** v6_no_verify on the static/recall tasks (domain 0.80 vs 0.86; locomo 0.13 vs 0.17) **at ∼8× latency**」⇒ **LLM 相关性校验无贡献、代价 8 倍**。
- D.4：「+INFER ≈ v6 on every benchmark ... neutral everywhere」。

### 5. ⭐ 可吸收丙：**marker-free 不变式 + 词边界 tell 自检**（T11① 可直接照抄）

§4.5 原文解释了「marker」是什么、以及为什么必须去掉：
> 「If a stale fact carries any textual marker — "[OUTDATED]", "(legacy)", "deprecated" — a retrieval baseline can disambiguate by **reading the label** rather than by any temporal mechanism, silently inflating its score.」
> 「We enforce a strict marker-free invariant **(by test)**: in every evolving benchmark, the stale and current versions of a fact are **textually identical except for the changed value**, with no old/new/current framing.」

**可执行形式（B.1 原文）**：被禁词表 + **词边界检测** + 强制它的测试名：
> 「The words *old, new, current, previous, deprecated, legacy, outdated* and synonyms never appear in either turn; the only currency signal is ingestion order. Enforced by `tests/memory/test_evolving_benchmarks.py::test_guard_rejects_staleness_tell` and the word-boundary tell-detector `tests/memory/test_swe_longitudinal.py::test_has_tell_is_word_boundary_aware`」

**去掉 marker 的量化后果（B.2，正文只引「up to 14 points」）**：
> 「Removing an explicit [OUTDATED] marker from an earlier contradiction benchmark **dropped reranker-RAG accuracy by 14 points** and a **gate-only baseline by 18 points** while the temporal method moved only **-4** — the marker was a confound baselines read off the text.」

⇒ **本仓 T11① 可直接照抄三点**：① 不变式**由测试强制**（不靠自觉）；② **词边界**检测（避免 "new" 命中 "renew"）；③ **量化「去掉污染后对照组掉多少」**，用以证明该污染真实存在（而不是声称）。

### 6. ⭐ 可吸收丁：Table 1 的**阈值不可达证明**（ADR-0059 最硬的独立证据）

**Table 1 表体完整读到**：

| 类别 | n | 均值 cosine |
|---|---:|---:|
| duplicate | 32 | 0.7998 |
| contradict | 22 | 0.8119 |
| merge | 22 | 0.9381 |
| novel | 22 | 0.4773 |

> 「cosine **AUROC** for separating duplicates from the rest is **0.5926**」
> 「The **maximum precision achievable at any duplicate threshold is 0.667**; the **0.95 floor a safe automatic rule would need is unreachable**.」

两点意义：
1. **本仓 README/CONTEXT 早已引用「AUROC 仅 0.59」这个数字** —— **本文就是它的原始出处**（现已在 `references.md` 标注来源，引用从「二手数字」升级为「一手可核」）。
2. 「**任何阈值下 precision 上限 0.667**」比「AUROC 0.59」更强：它直接否证「调阈值即可安全自动化」。⇒ **ADR-0059 的外部证据从「有数字」升级为「有不可达性证明」**。
   **注意措辞**：这是「**别家的读数支持我们的判据**」，**不是**「我们验证了」（其模型、语料、任务与本仓完全不同）。

### 7. 三项**不吸收**（附理由）

| 不吸收 | 理由 |
|---|---|
| **取代键 `(S,R)` 与其规范化** | 规范化规则**论文未给**（§7 列为未来工作），键相等性**由 LLM 抽取保证**（C.1）⇒ 与本仓 ADR-0059（写路径无 LLM）**冲突**。只可作对照，不可照抄 |
| **持久化取代（`valid_to` + `superseded_by` 回链）** | 与本仓 ADR-0061 的**有意决策**相反（取代是「相对当前可见记忆集」的读时判断，落盘会随可见集失效）。**本文没有论证持久化的必要性**，只是在它的 KV 存储里自然这么做 |
| **向量读路径 / 嵌入 / LLM 判官** | 本仓是文件树 + 关键词打分（ADR-0001/0060 已定形）；本文答案模型 Qwen2.5-Coder-7B、判官 3B、`nomic-embed-text` ⇒ 这一层**不可移植**（可移植的只有指标与协议） |

### 8. 对 **D3** 的净影响（**不替用户拍板**）

D3 的对照现已**四份**：

| 样本 | 取代键 | 关链权限 | 默认行为 | 与 LLM 的关系 |
|---|---|---|---|---|
| hl_mem（ADR-0076/0078） | **四元坐标**（单 slot 授权） | 确定性规则；LLM 永久无资格 | `observe`（只建议） | 写路径**有** LLM 抽取 |
| **本仓现状**（ADR-0061） | 自由文本 `entry` + 时间序 | 确定性读时裁决 | 不持久化 | 写路径**无** LLM |
| 本文 MemStrata | **`(S,R)` 二元组** | 确定性；LLM 仅回退门控 | 持久化取代 | **键相等性靠 LLM**（C.1） |
| OpenViking（ADR-0065） | 非取代路线（分层检索） | —— | —— | —— |

⇒ **本文的净贡献不是「细粒度值得做」，而是**：
① 「确定性取代 vs 相似度」这条线**有了不可达性证明**（§6）；
② 「**不取代的代价**」有了量化（编造率 ~6×，§4）——这正是本仓「错误方向不对称」需要的**另一侧**证据；
③ 它同时暴露**细粒度取代的代价**：键规范化未定义、靠 LLM 保键 ⇒ **粒度越细，越依赖一个本仓不接受的抽取层**。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 因本文支持「确定性取代」就建议 D3 选细粒度 | **越权且论证不足**：本文的键相等性靠 LLM，正是本仓禁区；且它自己承认「extraction quality is the gating factor」（§7） |
| 引用 A.1/A.2 的分格数字 | **未读到表体**（HTML 截断）。只引用 Table 1/2/3 与 A.3；A.1/A.2 的数字**一律标注为「正文声称，分格未读到」** |
| 采用 alphaXiv 等站点的「AI Overview」数字 | **模型生成的衍生文**，非原文；纪律不允许（与「不把别家读数当自己证据」同族） |
| 建议本仓引入 `valid_from/valid_to` 字段体系 | 本仓 `validTime/recordedTime` 源码 0 命中（ADR-0073 已记）；引入属**能力扩张**须另立 ADR，且 G1 的对照**在本文也没做**（§2） |
| 因本文「已发布 harness」就登记为可复现材料 | **本版未给地址**（双盲匿名：正文含 `_For double-blind submission, anonymize the author block and the product/repository identifiers._`）⇒ 已把 `MATERIALS.md` 的措辞降级为「**声称**已发布，本版未给地址」 |

## Consequences

### 正

- **ADR-0059 的外部证据升级为「不可达性证明」**（Table 1：任何阈值 precision 上限 **0.667**；0.95 安全线**不可达**），并**认领了本仓早已引用的 0.59 AUROC 的原始出处**。
- **T14 得到一个完整指标形态**：`stale-fact-error rate` + **允许弃答 / 强制作答两 regime** + **分子分母必须印出** + **与准确率各自独立判定**。
- **T11① 得到可执行不变式**：marker-free + 被禁词表 + 词边界 tell 自检 + 「去掉污染后对照臂掉多少」的量化。
- **G1 的文献缺口被精确定位**：连本文也**没有**对有效期/双时间字段做消融（只有取代层消融）⇒ G1 只能自建，但可借 §4 的三组消融形态。
- **D3 的对照面补上「另一侧代价」**：不取代 ⇒ 编造率 ~6×。

### 负 / 已知边界

- **A.1（8×6 全矩阵）、A.2（forced-answer 四表）、Table 4/5（延迟）表体未读到** ⇒ 凡只出现在正文的数字（如「v6/v6_no_verify 泄漏 25–60%」、「延迟 16–18s vs 16–24s 两处不一致」）**本 ADR 不引用为结论**。
- 本文**模板化基准 + 单 7B 模型 + 单判官 + 每格 n=20–30**（一格 = 3.3%–5%）⇒ 「0.03」这类读数**精度存疑**（作者自己也说「isolate mechanisms rather than rank systems」）。
- **未复现任何读数**（无地址、未运行）；**仍未把别家读数当作本系统的证据**。
- 一处**未验证**的线索：同线 follow-on 论文「Temporal Validity on Real Software Histories ... over GitHub Fixes」被提及，**本轮未读**。

## 自检

- [x] 与 **ADR-0059** 一致：吸收的是**证据与指标**，不是它的写路径（其键相等性靠 LLM，本仓仍禁）。
- [x] 与 **ADR-0061** 一致：**不吸收**持久化取代；本文的持久化是它的存储形态，非对本仓决策的反驳。
- [x] 与 **ADR-0076 / 0077** 一致：「错误方向不对称」由本文补上**另一侧**（不取代的代价）的量化；判据不变。
- [x] 与 **ADR-0049 / 0072** 一致：本文两处不诚实（「~0%」实为 1/30；指标判官不独立）**作为反例记录**，并转成本仓的纪律。
- [x] **更正了自己第 2 轮的表述**（键是 `(S,R)` 非三元组；「已发布」降级为「声称已发布」）。
- [x] **未越权**：D3 仍待用户拍板；本 ADR 只更新对照面与代价面。
- [ ] **未做**：A.1/A.2 表体（技术原因未读到，已记录尝试路径）；follow-on 论文；任何读数复现。
