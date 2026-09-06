# ADR-0002 · Experience 对象 + Memory≠Evidence 裁决接缝

> 时间：2026-09-06 ｜ 版本：v0.10.0 ｜ 状态：采纳
> 前置：ADR-0001（自建投影文件树，不引入向量库）

## 背景

dsh-shadow 已从"记忆插件"升级为"人类→Agent 投影系统"。在灵魂 5 层里，`Experience` 回答"**我经历过什么**"，
`Memory ≠ Evidence` 回答"**我记得 / 当下是否成立**"。本 ADR 固化 Experience 对象契约，以及 Shadow 与证据源
（当前为工作区 `fs`，后续可插 zvec-grep）之间的"裁决接缝"。

## 核心判断

1. **Memory ≠ Evidence**（在 P1–P4 三个"Memory ≠"之外新增第四条）：
   - Memory = 我记得什么 / 我当时为何这么认为（带 provenance + judgment）。
   - Evidence = 当下哪些路径/事实可验证（在工作区/代码/文档里）。
   - Shadow 不做检索器，做"解释器 + 裁决器 + 身份层"；证据验证交给可插拔证据源。

2. **Experience 是结构化对象，不是零散行**。大部分字段已由"完整线索头"采集，少数字段（Outcome/Reflection）由裁决**派生**。

## Experience 对象契约

| 字段 | 来源 | 状态 |
|---|---|---|
| `situation` | 记忆 `# entry` | 已有 |
| `problem` | `> 背景/材料` | 已有 |
| `intent` | `> 目标：`（goalByAgent） | 已有 |
| `evidence` | `> 证据链：证据(...)` | 已有 |
| `decision` | `> 用户提示/决策：` + `决定 ...` | 已有 |
| `implementation` | 证据链实现路径 + `改/读` | 已有 |
| `outcome` | **裁决派生**：`evidence_live` / `evidence_stale` / `superseded` | v0.10 |
| `reflection` | **裁决派生**：`无后续修正记录` / `证据缺失，需重新验证` / `后续已迭代（存在同入口更新记忆）` | v0.10 |
| `lesson` | `> 摘要：`（auto-summary，可作为教训；可后续升级独立 `> 教训：`） | 已有 |
| `confidence` | `confidenceOf`（命中/状态/新鲜度派生） | 已有 |
| `provenance` | `> 来源会话/项目/Agent/日期` | 已有 |
| `scope` | `> 项目：` + 条目域 | 已有 |

> 结论：Experience 设计 = 11 字段里 9 个已在 v0.9 前就位；v0.10.0 补的是 **Outcome + Reflection（裁决派生）**。

## Memory≠Evidence 裁决接缝

证据路径存在性 + 同入口更新记忆检测 → 三态裁决：

```
              证据路径存在性？        同入口有更新记忆？
 verdict  =  fresh    （存在        &  无）
           stale     （缺失        &  无）
           superseded（任意         &  有）
```

- 读侧：每条召回在打分后做裁决 → `verdict/outcome/reflection` 暴露在 provenance + debug；superseded 降权。
- Experience 分支：对匹配记忆同样裁决，`结果/反思` 入 Experience。
- 置信度联动：verified/active → 上浮；stale/superseded → 下浮（`confidenceOf` 基础 + 裁决微调）。

## 证据源可插拔（zg 接缝）

- **当前**：轻量验证 = 证据路径是否存在（`fs.readText` 抛错=缺失）。这是"capture handler 已不存在"类过时的最小实现。
- **后续（可插拔）**：把 `conflictOf` 的"存在性"升级为"内容验证"——调用 zvec-grep（`zg query`）确认该证据路径的
  语义仍指向记忆所言。Shadow **只消费证据结果**，自身绝不建 embedding/BM25/向量索引（延续 ADR-0001）。
- 落地形态：`verifyEvidence(fs|zg, ws, evidencePaths)` 判定 fresh/stale → 回填裁决。zg 未装时回退 fs 存在性（安全降级）。

## Observer / Observation Window（v0.11.0 补充）

> Oracle vs Observer：`read_shadow(topic)` 默认是 Oracle（端全局答案）；`observer: true` 时切换为 Observer。

- **动机**：GLOBAL_MODEL（Soul + Memory + Experience）代表"灵魂看见整体"；但模拟一个人的体验，不能把后验
  答案当现在已知。Observer = 用全局模型**限制视角**，只呈现"这个人在 t₀ 会看到什么/如何倾向"。
- **机制**（已在 v0.11.0 落地）：
  - `asOf`（YYYY-MM-DD）：时间锚定，只召回 `memory.date ≤ asOf`；晚于窗口的记忆不入。
  - `observer`：呈现为 `[Observation Window]`，给出 `as-of <date>` + `当时可知`（情境/问题/决策），
    把 `outcome/lesson/verdict/reflection` 标为 `[后验]`——它们是之后才知，不是当下已知。
- **验证**：mock 场景 37（observer+asOf 排除更新记忆、当时可知/[后验] 分离）。

## Projection + Observer 透镜（v0.12.0 补充）

> 核心转译：**Global Knowledge ≠ Local Experience**，工程化即 **Global Model ≠ Observation Window**。
> dsh-shadow 是"人类观测结构投影系统"，`project()` 是其收敛点。

- **Observer 透镜**（Soul-as-Observer，curated）：`soul.json` 的 `observer: { what_matters, what_to_ignore }`。
  决定"给定世界，什么该被看见/忽略"。**刻意不把它做成 `values/preferences/personality`——那是 Persona**；
  它是"选择观察窗口的结构"。自动推断显著/人格是研究级问题，v0.12 用 curated + 启发式，不冒充已解决。
- **Projection**：`read_shadow(topic, { project: true })` 把 `topic` 当当前任务，经透镜算显著 →
  `LocalContext { relevant:{原则/经验/偏好}, current_state, uncertainty, excluded }`。
  **与 retrieval 的本质区别：retrieval=相关排名；projection=带取舍的局部上下文**（`excluded` 是"为体验而限制视角"的工程化身）。
- 最小 **Judgment**：`relevant.experiences` 呈现 `情境 → 决策 → 教训`，即"面对这种情况我如何判断"的雏形。
- **验证**：mock 场景 38（Projection：透镜加权→relevant，what_to_ignore→excluded）。

## Judgment + Taste（v0.13.0 补充）

- **Judgment**：`read_shadow(topic, { judgment: true })` 从记忆（含「决策」的记录）派生「面对\<情境\> → 我判断/选择\<决策\>」，
  按情境去重、取最近。**Knowledge ≠ Judgment**：这层回答"遇到这种情况我曾经如何判断"，而非"我知道什么"。
- **Taste**：`read_shadow({ taste: true })` 读 curated 偏好（`soul.json.taste` + `shadow/taste/taste.json` 的 喜欢/不喜欢）。
  **curated-first**：自动品味识别不可靠，v0.13 只做 curated；采样（从偏好类用户消息抽 like/dislike）留后续。
- **验证**：mock 场景 39（Judgment）/ 40（Taste）。至此灵魂四对象（Soul/Experience/Judgment/Taste）+ Memory 五层就位。

## 与 benchmark 的关系

将 dsh-shadow-probe 的"召回成功与否"判定升级为：
```
Memory Quality → Retrieval Quality → Evidence Quality → Task Success → Judgment Quality → Human Alignment
```
并把 C2–C30 的"插件缺陷 vs 业务域断层"进一步分成 **Discovery / Ranking / Evidence** 三分失败诊断
（找不到 / 找错 / 找到但无法验证）。zg 的严格 A/B（same model/prompt/task/env/limits，仅检索不同）可直接复用。

## 取舍 / 排除

- 排除：Shadow 内建向量检索（重造 zg）——违反本 ADR 与 ADR-0001。
- 排除：Outcome/Reflection 做"写侧显式采集"（新增事件/用户标注）——v0.10 用派生（更快、更稳）；若后续要
  "agent 主动记录验证结果/反思"，再加法（读侧派生可回退）。
- 取舍：超时/空证据被视为"存在"（避免误伤非代码路径），与"无法判定时视为存在"一致。

## 验证

- mock 场景 35（Experience 全字段 + 裁决 fresh）/ 36（supersede → 旧的 superseded+降权+反思，新的 fresh）。
- 全量 1–36 场景 PASS；`tsc` + `node --check` 通过。
