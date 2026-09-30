# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.43] 落地「记忆螺旋」②：材料卡（主轴）

### 1. 为什么是材料卡

`adr/0110` 定下**主轴 = 材料卡**（用户 2026-09-30 拍板）。此前 `> 背景/材料：` 只是一行**路径字符串**：
同一份文档在几十条原子里的引用各自为政、**从不进化**。材料卡把它变成**资产** —— 记「它对哪些事重要」·
「我们从它那里得到过什么结论（逐圈追加）」·「读到的是第几版」·「哪些结论互相冲突」。

### 2. 实现（两块 + 一个工具）

| 件 | 内容 |
|---|---|
| `core/materials/card.ts`（纯逻辑，无 I/O） | `normalizeMaterialKey`（**唯一实现**：路径类 → 反斜杠归一/折叠斜杠/去尾斜杠/盘符大写/**整体小写**；DOI/arXiv/ISBN **前缀先判**，否则它们正文里的 `/` 会被误当路径）+ `materialFileName`（带短哈希 ⇒ 不同 key 不撞名）+ `parseCard`/`renderCard` + **`applyEvidence`（平衡三律的机器判据）** + `mergeCards` |
| `core/materials/store.ts`（派生层 I/O） | 卡 → `.shadow/indexes/materials/<key>-<hash>.md`；**归档圈** → `…history/<圈号>.md`（只追加）；源指纹（`version`，拿不到就写「（未记）」，**可见**） |
| `tools/material-card-merge.ts` | **并卡**（人工收口）：读两张卡 → `mergeCards` → 旧卡挪 `indexes/materials/_merged/`，**证据不删** |

**平衡三律落地为判据**（不是散文）：

| 律 | 判据 | 防的是 |
|---|---|---|
| ① 新证据 | 既无**新结论**（决策语句）也无**新证据指针** ⇒ **不写** | 无脑追加 |
| ② 不矛盾 | 声明冲突 ⇒ 渲染 `> 矛盾：本圈与圈 N`，**双方圈都保留** | 静默覆盖历史结论 |
| ③ 可回退 | **开新圈前**交出上一圈整份快照 ⇒ `history/<圈号>.md`（归档、只追加） | 成长不可逆 |
| ④ 确认闸（§2.5） | **只有 `confirmed` 圈**的 affaire 进「它对哪些事重要」；采集时**用户拍板**（`decisionEvents` 里 `source=user`）才算 confirmed | 未确认的结论改写进化层 |

**与收口同一条判据**：登记发生在**写侧**（`flush` 末尾），不是读路径 —— 这正是 `v1.21.42` 从收口上学到的课。

### 3. 顺手修的三处（都是先造红才发现的）

- `normalizeMaterialKey` 的 **DOI 误判**：`DOI: 10.1000/XYZ` 体内含 `/`，原实现先按「含斜杠 ⇒ 路径」判 ⇒ 前缀归一永不生效。**改为前缀先判**（测试钉住）。
- **接线棘轮挡住一个空接口**：`mergeMaterialCards` 挂在产品面但**零生产调用点** ⇒ `audit:wiring` 红（`a1 18 → 19`）。
  处置与 `adr/0106` 补记二对 `writeRoleCard` 的判定一致 —— 它天然没有自动触发点 ⇒ **做成可用工具**（产品面不留空接口）。
- **自己踩了本仓记过的坑**：括号插错导致 `tsc` 红，而我的单测**照样通过** —— 因为读的是**旧 dist**。
  正是 `AGENTS.md` 写的「只跑类型检查不产出就去跑单测，读到的是旧代码」。（先 build 再跑测试的纪律由此再次验证。）

### 4. 改了哪些文件

| 处 | 文件 | 改动 |
|---|---|---|
| ① | `core/materials/card.ts` · `core/materials/store.ts` | **新建**（纯逻辑 + 派生层 I/O） |
| ② | `core/writer/materialize.ts` | 写侧登记材料证据（438 行，仍在 447 热点基线之下） |
| ③ | `test/material-card.test.ts` | **新建回归**：八条（key 规范化 / 三律各一条 / 确认闸 / 序列化往返与并卡 / **卡必须落 `indexes/` 而非 source 位** / 版本刷新不开圈） |
| ④ | `tools/material-card-merge.ts` | **新建工具**（并卡） |
| ⑤ | `adr/0110` §5 · `CONTEXT.md` · `BACKLOG.md` | ② 结案与术语同步（材料卡 / 平衡三律的取值与实现位置） |

### 5. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 材料卡八条 | `node test/material-card.test.ts` | **ALL PASS** |
| 2 | 写侧收口回归（上版） | `node test/compact-write-side.test.ts` | **ALL PASS** |
| 3 | 接线 / 漂移棘轮 | `npm run audit:wiring --ratchet` · `audit:drift --ratchet` | **逐桶相等 ✅**（并卡改工具后不再新增发现） |
| 4 | 全仓闸门 | `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` | 见闸门输出 |

### 6. 诚实标注

- **本机 466 条真语料仍未收口、也没有材料卡**：插件当前未挂载（desktop profile）⇒ 首次真机后果需挂载后观察；
- `adr/0110` 的 **③（收口改「同一张纪要加圈」+ `history/` 归档圈）仍待做** —— 本版只落了材料卡与平衡三律；
- 源指纹依赖宿主 `fs.stat().version`；拿不到时卡上写「（未记）」（**可见**），而不是假装记过；
- 「它对哪些事重要」在采集路径上**只收用户拍板的结论**（agent 自己的决策只作候选）⇒ 头几圈大概率是候选，
  这是 §2.5 闸门**按设计**在起作用，不是缺陷。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`V12`③ 收口改「**同一张纪要加圈** + `history/<圈号>.md` 归档圈」（正文落 `indexes/`）；
  `T17-C` 的默认值前置条件 ①（`query-error` 有界重试 + 退避）；审计 ref 进 atom lineage（需先过契约面决策）。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料**（报告级基线）· **要不要把 `dsh-shadow` 挂进 desktop profile**
  （当前桌面 GUI 跑 desktop，插件在 web ⇒ 记忆采集自 2026-09-29 17:51 停摆）。
