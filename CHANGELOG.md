# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.22.1] 写侧降级三态化 · 判据收一处 · 文档与状态面回核

### 1. 补的是什么洞

主线是 **ADR-0049 / ADR-0085 那一族：失败与成功在读者眼里逐字相同**。

- **写侧「只 `console.log`、返回 `void`」**：`trajectory/` `stance/` `selfhood/` `reflection/` 下一批写侧函数的契约里
  **没有返回值**，失败只进日志 —— 而 `console.log` **不算** ADR-0049 认可的可见信号 ⇒ 读侧照旧说「已记录」。
  最严重的一处是 `query/contverify.ts` 的四个写模式：失败渲染成成功，**同段输出里没有任何反证**（定为 P0）。
- **恒空的假读数**：`stance/planning/types.ts` 的 `PlanningComparison` 此前**全仓零消费者**，渲染器只能 `(c as any)` +
  「约束文本含 `under` 子串」嗅探，`violatedConstraints` 因此**恒空** ⇒ 每次都打印 `violatedConstraints: —`，
  读者读成「没有任何约束被违反」（B5）。
- **旗标落不回 goal**：`core/admission/intent.ts` 的 `FLAG_GOAL` 只有 7 个键，而 `read_shadow` 的 schema 有 19 个 boolean 参数
  ⇒ 多处旗标静默回落到 `DEFAULT_GOAL`「召回相关记忆」；而 Intent **有落盘副作用**（写进 `ObserverContext`）。
  同文件 `FLAG_ORDER` 是**手写的第二份清单**，往一处加而漏另一处就永远取不到 goal（A10 / A28）。
- **同一事实被写在多处**：记忆线索头解析散在 4 个模块（且口径已分叉：一处取原始串、一处取切开后的数组）；
  降级措辞散在各层；`HOST_BASELINE` 是验证基线的**第 4 份副本**，而 `audit:docs` ⑦ 只守前三处，
  这处漂移**永远不会有门报警**，偏偏它印在给用户看的降级横幅里（A1）。
- **`clean` 落在门的盲区**：`npm run clean` 原先是内联 `node -e "…"` —— 既不是文件也不是 TS，
  却每个 build / 发版都跑，而 `audit:scripts` 只认文件（A26）。

### 2. 做法与边界

| 项 | 处置 | 边界（写清防顺手扩大） |
|---|---|---|
| 三态形状 | `persistence/outcomes.ts` 收 `PersistOutcome` / `ReadOutcome<T>` / `DegradeNote` | **零依赖、只有类型**：任一层可引而不再多一条依赖边；只放形状，不放渲染 |
| 读者可见 | `query/degrade.ts` 收 `unwrittenWarn` / `readCauseWarn` | `ok:true` ⇒ **空串** ⇒ 健康路径输出**逐字节不变** |
| 判据收一处 | `core/view/clue.ts`（线索头解析，**零 import**，供 `tools/` 在 build 前直引）· `core/host-baseline.ts`（基线从 `package.json` **运行时派生**） | clue.ts 只解析 `> <标签>：<值>` 一类，Reflection 族不进；派生之后**不再给 ⑦ 加比对面**（那会再造一份副本） |
| 裁决透传 | `query/planning.ts` 真的构造 `PlanningComparison` 交给渲染；空数组 ⇒ 该段**整段省略** | 渲染器只报调用方**真的声明了**的约束，不反过来说「没有违反」 |
| 旗标门 | 新增 `test/intent-flags.test.ts`：用**真实注册面**取 schema，断言 19 个 boolean 参数都有 goal 映射、顺序表与映射表同源 | 判据是「宿主真正看到的参数面」，不是「源码里有几处 `type:"boolean"`」 |
| clean | `tools/clean.ts` + `npm run clean` 改指它 | 只搬家不改语义；`force: true` 让「本来就没有」不报错 |

### 3. 文档与状态面（本轮同批回核）

评审轴（`../.docs/fix/2026-10-07/review-shadow-spec.md`）登记的「文档 vs 实现」缺陷，逐条落地：

| 处 | 文件 | 改动 |
|---|---|---|
| ① | `README.md` | 安装/粘贴路径写成**不存在的 `D:` 盘** ⇒ 改成 `G:\project\dsh1\dsh-shadow`；「只读工具**不写工作区**」与同页 `queryLog` 行、与 `core/view/projection-store.ts` 的注释相反 ⇒ 限定为「不写 `atoms/` 权威语料」；复杂度门「热点棘轮只降不升」与 `fresh` 分支相反 ⇒ 补「新热点只记账」；「每个文件自己打印 `ALL PASS ✅`」对 3/59 不成立 ⇒ 限定；`SHADOW_EVAL_ROOT` 的本机值同步换根 |
| ② | `CONTEXT.md` | 遗忘的「默认**关**」与 README 默认开关表、`core/util.ts` 的 `onByDefault` 相反 ⇒ 改「默认开（v1.15.85）」；新增 `影子存储根`、`ADR 条数口径` 两条术语 |
| ③ | `MATERIALS.md` | §1 的复核块按新枚举时刻重出（本仓 HEAD / 漂移列）；§1.1 的 24 行**一字未改**（归档层） |
| ④ | `BACKLOG.md` | 头部那组手写计数改成「判据 + 命令，不写数」；新增 `T29`（ADR 交叉引用被「去数」削断的损害面 + 复现命令）；`satisfiedConstraints` 那条按 B5 的实际收口更新 |
| ⑤ | `LIVE-VERIFY-checklist.md` | 「现 1.21.0」与已废弃的 `vendor/dsh-shadow` 路径 ⇒ 修正；判定/结论两行由「全部 ✅ 真机验证通过」改成**如实的部分完成** |
| ⑥ | `docs/maintainers.md` | 模块归属表的「28 个 / 140 格子」⇒ 改「以生成器输出为准」；「core 43 个文件 / 4 个零 import」⇒ 改实测与判据；`reference` 44 项 / 13 分类 ⇒ 改实测读法；`:158-160` 那段「2026-09-12 目录已不在本机、无 t15*」与实测相反 ⇒ 更正；登记 7 个 `.shadow/` 存储根、两个未登记工具、新模块与新工具 |
| ⑦ | `tools/module-ownership.ts` | 删掉 `decision` 层的死 `OWNS` 条目（该层已按 `T26` 整层删除） |
| ⑧ | `presets/projection.patch.yml` | **只**补文件头注解：基体的上游代与逐字节结论以 README 的验证基线为准 |
| ⑨ | `adr/0026` | 末尾**补记**（正文一字未改——已接受 ADR 只写补记）：`epistemic/simulation/types/state.ts` 与 `CounterfactualState` 已删 |

### 4. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 文档派生字段门 | `node tools/docs-consistency.ts .` | ①–⑦ 见「当前状态」 |
| 2 | 引用越界门 | `node tools/citation-audit.ts .` | 0 越界 |
| 3 | 模块归属表 | `node tools/module-ownership.ts` | 由生成器打印，文档不再手写 |
| 4 | 材料名册 | `node tools/materials-ledger.ts G:\project\dsh1` | 8 份材料 / 本仓 HEAD 见该次枚举 |
| 5 | 全仓闸门 | `npm run verify` | 由 `npm run release` 的第一步执行（闸门是退出码） |

### 5. 诚实标注

- **本版**把「文档能对上代码」当**一次核对**，不是**一次保证**：`audit:docs` 的 ①–⑦ 都是必要条件，
  它答「有没有 / 一致不一致」，答不了「顺序与描述对不对」。
- **ADR 交叉引用被削断这件事未修**：`adr/0087` 等文件里的 `ADR- / 0051` 这类残片来自 `v1.21.13` 的 D12「全量删数」，
  而本仓口径是「**冻结 ADR 不改正文、只写补记**」⇒ 恢复编号会与 D12 的既有决定冲突，**需用户裁决**；
  本轮只在 `BACKLOG` `T29` 登记损害面与复现命令（见该条「需用户裁决」）。
- **`adr/` 无索引**：文件数与最高编号**不是同一件事**（有断号、有 `-1` 变体）⇒ 口径已写进 `CONTEXT.md`
  「ADR 条数口径」，但**没有**建索引文件（新增产物须另立决定）。
- **生成物未回核**：`docs/architecture-seams.*`（`v1.12.2` 的当时证据）与 `docs/absorb-verdict.*` 内容已旧，
  本轮**不改产物**，只在 `docs/maintainers.md` 注明「勿当现状读」——`citation-audit` 的引用正则扫不到 `.html` / `.candidate.json`
  （`AGENTS.md` 已记该边界），故它们的过期**不会有任何门报警**。
- **两处失配的行号引用在源码/测试面，不在本轮写面**：`core/util.ts` 与 `test/t8-explicit-zero.test.ts` 把
  「`abstracts.showInIndex` 默认 3」的出处写成 `core/types.ts:55`（实为 `indexSchema` 那行）、把 `episodeShow` 的落点写成
  `materialize.ts:212`（实为 `core/writer/core.ts`）——`citation-audit` 只判**越界**，这两处没越界却指错，需改源码注释与测试（未做）。
- **`satisfiedConstraints` 仍有两处算法**：B5 只收掉了渲染器的子串嗅探与恒空假读数；
  `stance/agency/engine.ts` 仍从 `args.candidates` 上按 `satisfied >= violated` 自行挑候选，与 planning 面不同源（`BACKLOG` 已更新）。
- **未跑 `npm run verify` 全链**：本轮只跑上述只读门；全链由 `npm run release` 的闸门跑。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`T29`（ADR 引用残片，**需用户裁决**）；`T28`（参考资料目录化 + 节级引用门）；
  `adr/` 索引（新增产物须另立决定）；`docs/architecture-seams.*` 的重生成或退役决定。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料** · **推 `main` 与 tag**（本版提交后需推送 —— 上个版本的提交与 tag 都没推）。
