# ADR-0065: 吸收 OpenViking（含一处出处勘误：`hotness` 衰减不是 OpenViking 的）

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0060（多粒度检索层形态 —— 本 ADR 为其「路由」建议找到**独立先例**）、ADR-0054（Semble 阈值性质）、ADR-0055/0058（工具台账）、ADR-0049（缺件不静默）
- 关联术语：`../CONTEXT.md`
- 版本：`1.15.22`

## Context

用户 2026-09-11 指令：**「关注 openviking 并吸收」**。

先明确对象与可信度：**OpenViking**（`volcengine/OpenViking`，ByteDance 火山引擎）是
「面向 AI Agent 的上下文数据库」，把 memory / resource / skill 统一成一个 `viking://` 虚拟文件系统。
它有一篇被 **VLDB 2026 接收**的论文（VikingMem，[arXiv:2605.29640](https://arxiv.org/abs/2605.29640)）。

本 ADR 的证据来源**只用一手材料**：官方 README、官方文档
[Context Layers](https://docs.openviking.ai/en/concepts/03-context-layers) /
[Retrieval](https://docs.openviking.ai/en/concepts/07-retrieval)。
**不采信第三方拆解文档的转述**（下面第 4 节正是一个「第三方转述与一手材料冲突」的实例）。

## Decision

### 1. 先记一条**冲突**：本仓 README 把 `hotness` 衰减标成了「OpenViking 式」，**这是误标**

`README.md:177` 原文：

> 召回用 **OpenViking 式 hotness**（命中数 × 半衰期衰减）加权……
> （借鉴 MemoryBank 衰减 / A-MEM 动态合并 / MemGPT archival）

**一手材料核查结果**：在 OpenViking 的官方 README + Context Layers + Retrieval 三份文档里，
以下关键词的出现次数**全部为 0**：`decay`、`hotness`、`half-life`、`reinforce`、`recency`、
以及任何「命中数 / 访问次数加权」的表述。

⇒ **OpenViking 的检索不是时间衰减加权**，它的三层是**静态分层 + 目录递归 + 重排**。
「命中数 × 半衰期衰减」的真实出处是 **MemoryBank**（Zhong et al., AAAI 2024,
[arXiv:2305.10250](https://arxiv.org/abs/2305.10250)：以 Ebbinghaus 遗忘曲线按**回忆时间与频率**衰减）——
而这**同一条句子里本来就引了 MemoryBank**。

**处置**：把 `hotness` 的出处从「OpenViking 式」改为「**MemoryBank 式**」（引用本来就在，只是标错了一个词），
并把 OpenViking **真正贡献的东西**标到它该在的位置（下面第 2 节的本仓对应关系表）。

> 这条的意义不止于改一个词：**出处标错会让后来者去找一个不存在的先例**。
> 本仓纪律要求「结论要有证据」，那么**归因**也必须有证据。

### 2. 吸收项：OpenViking 的 L0/L1/L2 与本仓 `tierFor` **形状同源、粒度不同**

| 维度 | OpenViking（一手材料） | 本仓 dsh-shadow | 判断 |
|---|---|---|---|
| 层名 | L0 abstract / L1 overview / L2 detail | L0 / L1 / L2（`retrieval/render.ts` 的 `tierFor` + `renderByTier`） | **同名同序，独立收敛** |
| **分层对象** | **目录**（`.abstract.md` / `.overview.md` 是**目录级 sidecar**；「**不为每个普通文件建对应 sidecar**」，文件摘要**聚合进所属目录的 L1**） | **每条记忆（文件）** | ⚠ **粒度不同** —— 这是最值得吸收的一条 |
| 容量 | 默认 **256 字符**（L0）/ **4000 字符**（L1），可由 `semantic.abstract_max_chars` / `overview_max_chars` 配置；只限正文，不截元数据 | 按**预算**逐层展开（`maxChars` / 每候选 `cap`），非固定字符数 | 两种取向：固定上限 vs 预算自适应。**本仓的预算取向更贴合「按 token 花」的目标**，不改 |
| L0 怎么来 | **从 L1 正文里确定性抽取**（H1 之后、首个 `##` 之前的「Brief Description」段） | L0 = 摘要行（写侧产出） | ⚠ OpenViking 的「L0 是 L1 的纯投影」**保证两层不漂移**；本仓两层的产出路径不同 |
| 自报新鲜度 | sidecar frontmatter 带 `freshness`（**直接子项覆盖率** `total_entries` / `sampled_entries` / `unsampled_entries` + `pending_child_changes`） | `shadowSourcesFingerprint`（源指纹，用于投影缓存失效） | 同源思路（**派生件自报是否过期**），粒度不同 |
| 读取面 | `abstract()` / `overview()` 只回正文；直接 `read(".abstract.md")` 才回 frontmatter；`ls` 隐藏 sidecar | `read_shadow` 按 tier 渲染；`debug:true` 暴露管线 | 一致（**面向不同消费者给不同视图**） |

**可吸收的三条（记入 `BACKLOG.md` 的 D6，不在本轮实现）**：
1. **目录级（`entry` 级 / 日期级）的 abstract+overview sidecar** —— 让「判断相关**不必先读任何记忆文件**」。
   本仓今天只能靠全局 `_index.md`；而 OpenViking 的做法是**每层目录都带 L0/L1**。
2. **上层由下层确定性派生**（L0 ⊂ L1）—— 消除层间漂移。本仓 L0/L1/L2 各自从原文派生，
   存在「同一记忆的两层说法不一致」的可能。
3. **派生件自报覆盖率与待处理变更**（`freshness`）—— 比单一指纹更能回答「这份摘要是**基于哪几个子项**得出的」。

### 3. 吸收项：它的检索算法**独立佐证了 ADR-0060 的三条建议**

ADR-0060 的结论是「**单索引 + 层级表示 + 路由**，而不是建 N 个库全量扇出；加判别层优先于加库；
多来源须各自标定阈值」。OpenViking 的一手文档给出的正是这个形状（原文照抄）：

```
Query → Intent Analysis → Hierarchical Retrieval → Rerank → Results
         ↓                    ↓                      ↓
      TypedQuery      Directory Recursion       Refined Scoring
```

- **路由**：`HierarchicalRetriever` 用**优先队列递归**搜目录，`GLOBAL_SEARCH_TOPK = 10` 起手。
- **判别层**：`Rerank` 只在 THINKING 模式触发；**重排失败或返回非法结果时回退到向量分**
  （⇒ 与 ADR-0060「加判别层优先于加库」同向）。
- **阈值**：递归里是 `if final_score > threshold` —— **有阈值、可弃权**，
  这与 ADR-0054 实测的「Semble 无阈值、离题也返回最高分」形成对照，
  进一步支持「**阈值必须按来源标定**」。
- **收敛预算**：`MAX_CONVERGENCE_ROUNDS = 3`（top-k 连续 3 轮不变即停）——
  与 ADR-0060 的「同候选预算」是同一类**确定性上界**思路。

**一条特别的读数（值得单独记）**：
`retrieval.score_propagation_alpha` 的**默认值是 `1.0`**，而公式是
`final_score = alpha * embedding_score + (1 - alpha) * parent_score`
⇒ **默认父分权重为 0，即层级分数传播默认是关闭的**。

这说明：**层级在这个系统里主要买的是「递归下钻扩大候选」，不是「分数平滑」。**
对 ADR-0060 是一个**精化**：层级表示的价值在**召回路径**，不在**打分**。
本仓的 `indexEngine.provider` 单值路由 + `tierFor` 层级渲染与这一判断相容。

### 4. 不吸收的项（附理由）

| 项 | 不吸收的理由 |
|---|---|
| `viking://` 虚拟文件系统 + `ls`/`tree`/`find` 浏览范式 | 本仓的 Atom **本来就是真实文件**（`<工作区>/.shadow/**.md`），已经能 `ls`。再套一层虚拟 FS 是**重复抽象**；且会与 ADR-0003「Memory 文件是 source of truth」的落地方式冲突 |
| LLM 意图分析生成 **0–5 个 TypedQuery** | 本仓有 `recall.enabled` 的语义扩词，且**默认关**；文献与本仓记录都对「让 LLM 参与判语义」持保留（ADR-0059）。**保留现状**：确定性路径为默认，LLM 路径 opt-in |
| 把 memory / resource / skill **统一成一个树** | 本仓已有 `NodeType` + `resource` 节点（ADR-0052 系列），且 **skill 不在本仓职责内**（skill 属 DSH 的 `~/.agents/skills`）。**不扩职责边界** |
| 用它的 embedding / VLM 后端（Doubao / Jina） | 本仓不引入云端 embedding 依赖（ADR-0043 相关约束仍在，且向量库选型**本身尚未裁决**）。**不动** |
| 它的**代码** | 主工程许可是 **AGPLv3**（`crates/ov_cli` 与 `examples` 为 Apache 2.0）。本仓 MIT + 随 DSH 分发 ⇒ **只看概念，不取代码**。（也是本 ADR 只写「形状对照」不写「移植」的原因） |
| 它的 benchmark 读数（LoCoMo 80–83%、tau2-bench +6.87/+11.87pp） | 与 ADR-0060 同一纪律：**别家的语料与后端，不能当本系统的证据**。只作参考，不引用为「已验证」 |

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 只改文档措辞，不写 ADR | `hotness` 误标 + 三条可吸收项 + 一次对 ADR-0060 的精化，**值得留决策记录**；且本仓纪律要求结论有据可查 |
| 直接照 OpenViking 的 256/4000 字符上限改本仓分层 | 本仓按 **token 预算**逐层展开是有意设计（「按 token 花」，见 CHANGELOG v1.16 前的分层记录）。改成固定字符数会**丢失预算自适应** |
| 立刻实现「目录级 sidecar」 | 会新增一类**派生文件**（须先定它在 ADR-0003 下算 Projection 还是 source），并牵动 `_index.md` 的定位。**升为 D6 待裁决**，不在本轮顺手做 |
| 采信第三方拆解文档（说 OpenViking 是 Apache 2.0） | **与一手 README 冲突**：主工程是 **AGPLv3**。许可判断错误会导致误用代码 ⇒ 一律以仓库内 `LICENSE` 与 README 为准 |

## Consequences

### 正
- 修正了一处**归因错误**（`hotness` → MemoryBank），避免后来者去找不存在的先例。
- 为 **ADR-0060 的「路由」建议找到独立先例**（OpenViking 的 HierarchicalRetriever），
  且**精化**为「层级买的是召回路径，不是分数平滑」（依据：`score_propagation_alpha` 默认 1.0）。
- 把「目录级 L0/L1 sidecar」「上层由下层派生」「派生件自报覆盖率」三条**记成 D6**，
  它们正好服务本目标的第 (3) 与第 (4) 条（多粒度检索层 / 可执行的真相与漂移检测）。
- 明确**不取代码**（AGPLv3）与**不扩职责**（skill 不属本仓），边界清晰。

### 负 / 已知边界
- 本 ADR **没有新增任何本仓代码**，全部是「对标 + 勘误 + 待办」。这是**有意的**：
  可以吸收的三条都涉及新派生文件的归类（ADR-0003），须先裁决（D6）。
- 「OpenViking 无时间衰减」这一结论的**证据形态是「官方文档里没有」**（三份文档 0 命中），
  不是「读过它全部源码」。⇒ **表述必须止于「官方文档未见」**，不得说「它一定没有」。
  （这与 ADR-0054 对 Semble 的实测性质处理同一态度：**说清证据的强度**。）
- 未核验 OpenViking 源码是否另有未文档化的衰减实现；未在真机跑过 OpenViking。

## 自检

- [x] 与 ADR-0060 一致：**未推翻**其结论，反而提供独立先例与一处精化。
- [x] 与 ADR-0054/0059 一致：继续坚持「阈值按来源标定」「不让 LLM 判语义」。
- [x] 与 ADR-0003 一致：**未**新增派生文件；把这件事升为 D6 待裁决。
- [x] **归因有据**：`hotness` 误标的证据是「三份官方文档关键词 0 命中」+「同句已引 MemoryBank」。
- [x] **不冒充已证**：benchmark 读数只作参考；「无衰减」止于「官方文档未见」。
- [x] 许可判断以一手 `LICENSE`/README 为准（AGPLv3），据此决定**不取代码**。
- [ ] **未做**：D6 三条吸收项的落地（目录级 sidecar / 上层派生 / 覆盖率自报）。
- [ ] **未验证**：OpenViking 真机行为（本机未安装，且它需要 Python 3.10+ 与独立服务）。
