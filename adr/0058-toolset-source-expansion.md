# ADR-0058: 工具台账扩源（程序化核验；按名字猜包 ID 被证伪；扩目录不触发工具选择拐点）

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0055（台账两级 + 不代装 + 双向棘轮）、ADR-0057（能力预检接缝）、ADR-0054（Semble 候选 provider）、ADR-0049（缺件不静默）
- 关联术语：`../CONTEXT.md`（toolset / provider / reference / 能力预检）
- 版本：`1.15.14`

## Context

用户 2026-09-11：**「现在的工具集不够，去论文 github 上继续找」**。

ADR-0055 曾**否决**「台账用外部数据源（npm/winget 实时查询）」，理由是「引入网络依赖与不确定性；静态登记 + 棘轮比对已够」。本轮要把 50 项扩到能覆盖一个编码 agent 实际要做的活，必须重新审议那条否决。

### 三个必须先查清的问题

**Q1：有没有权威、可程序化、且许可允许引用的数据源？**（ADR-0055 的否决理由是否仍成立）

**Q2：能不能「按工具名自动找包 ID」？**（这是最诱人的自动化，但可能错）

**Q3：目录扩大会不会踩「工具数量 → 选择准确率」的拐点？**

## Decision

### 1. Q1：有权威源，且**分三种用法**——但没有「一站式 API」

（全部经本机实测，见 `_research/toolset_sources.json` 与 `_research/winget_index_probe.json`）

| 源 | 实测结果 | 适用 |
|---|---|---|
| **`winget show`（本机 CLI）** | ✅ **首选**。直接给 版本/发布者/**绰号**/描述/主页/**许可证**，且查的是**本机实际配置的源** | **核验 + 取版本 + 取许可证** |
| winget-pkgs raw manifest（GitHub） | ✅ MIT 可摘抄；**但路径含版本号，不知道版本就拼不出**（实测 `ripgrep`/`jadx` 直接 404） | 读 manifest 原文 |
| winget CDN `source.msix` | ✅ 逐字节吻合 **20,230,433 字节**，`Last-Modified: Fri, 11 Sep 2026 00:00:20 GMT`；解出 `Public/index.db`（**41,680,896 字节** SQLite，**14,816 个包**） | 一次性**全量候选发现** |
| ScoopInstaller/Main bucket JSON | ✅ Unlicense；`ripgrep.json` 等实测 200 | 补 Windows 二进制名 + license |
| Repology API | ✅ 123 个 repo，**确认 `has_winget=False`** —— **给不了 winget ID** | 仅 Linux/WSL 侧 |
| **`api.winget.run`** | ❌ **数据冻结在 2023-03-16**（fzf/ripgrep/neovim 的 `UpdatedAt` 全是 `2023-03-16T14:34:1x`） | **已废，不可用** |

⇒ **修正 ADR-0055 的否决**：否决的是「**让插件在运行时依赖网络查询**」——那条仍然成立，**本轮不放宽**。新增的是**构建期工具**：`tools/winget-verify*.ts` 在**开发时**核验台账，产物是静态 TS 数据，**插件运行时零新增依赖**。

### 2. Q2：**按名字猜包 ID 已被实测证伪** —— 这是本 ADR 最重要的一条

CDN 索引解出后，按 moniker / 命令名 / 名称 / 包 ID 后缀 自动解析工具名，**立刻产出假阳性**：

| 工具名 | 自动猜到 | 真实 |
|---|---|---|
| `xh` | `Mozilla.Firefox.xh` @ 155.0.1 ❌ | `ducaale.xh` @ 0.26.2 |
| `delta` | `eToro.Delta` @ 2026.1.0 ❌ | `dandavison.delta` @ 0.19.2 |
| `choose` | `Aldaviva.AuthenticatorChooser` ❌ | — |
| `ack` | `0xJacky.nginx-ui` ❌ | — |
| `nix` | `ADInstruments.LabChart...OxfordOptronix` ❌ | — |
| `sox` | `AriesOxO.piz` ❌ | `ChrisBagwell.SoX` |
| `sad` | `Avatorsinc.OneDriveAsADrive` ❌ | — |
| `maven` | `HMCL.HMCL.Dev.Maven` ❌ | — |
| `dog` | `Altova.DiffDog.*` ❌ | `ogham.dog` |

**根因**：winget 的包 ID 是 `<Publisher>.<Package>`，同名不同物极多；后缀匹配把无关包的 ID 尾巴当命中。

⇒ **决策：工具名 → 包 ID 的映射必须由人给定（`tools/toolset-seed.json`），机器只做两件事**：
① **核验**「这个精确包 ID 现在还在不在、版本/许可证是什么」；
② **发现候选**（列出同名项供人裁决，**绝不自动选**）。

### 3. 核验纪律：**核验不过的一律不写入**

`tools/winget-verify.ts` + `winget-verify-seed.ts`：

- 对每个**精确包 ID** 调 `winget show`，解析 **locale 无关**（不按「版本:」/「Version:」标签匹配，改用「值像版本形状」+ 首行 `[ID]` 锚点）；
- **诚实区分版本出处**：`verSrc="实测"`（本机跑 `--version` 得到）vs `"权威核验"`（来自 `winget show` 目录，**不代表本机已装**）。新增条目一律标后者。
- 结果：**57/57 通过**（含许可证），写入台账后由既有**双向棘轮**（`test/toolset-catalog.test.ts`）继续约束台账↔文档不漂移。

### 4. Q3：**扩目录不触发工具选择拐点**——但要分清两个量

最硬的证据是 [arXiv:2606.30317](https://arxiv.org/abs/2606.30317)（MCP Server Architecture Patterns，2026-06）：

> tool-selection accuracy drops below 90% between **10 and 15 tools per context** (Haiku 4.5) and between **20 and 30 tools** (Sonnet 4).

**关键限定（必须写清楚，否则会被误用）**：它量的是**每次请求注入 prompt 的工具 schema 数（per context）**，**不是目录条目数**。旁证同向：[arXiv:2608.22695](https://arxiv.org/abs/2608.22695)（in-context routing Match@1 从 0.85 崩到 0.12，交叉点 N≈500）、[arXiv:2606.17519](https://arxiv.org/abs/2606.17519)（110 agents/584 tools，F1 掉 16–23pp，含 retrieval gap + confusion gap）。

⇒ **本台账从来就不进上下文**——它是 `read_shadow({mode:"toolset"})` 按需读的**查表**。故：

- **可以扩**：条目数增长不触碰那个拐点；
- **必须保持小的是「模型面前可调用的工具面」**（tool schema 数）；
- ADR-0057 的 `need:[...]` 预检正是让它保持小的**检索接口**。

**反面**：把每条台账**暴露成一个工具**会直接把拐点踩爆 —— 本 ADR 明令禁止。

### 5. 本次扩源结果

| 项 | 前 | 后 |
|---|---|---|
| 台账总数 | 50 | **107**（2 provider + 105 reference） |
| 分类 | 13 | **17**（新增 容器与编排 / 安全与供应链 / 文档与转换 / 媒体处理） |
| 带许可证信息 | 0 | **57** |

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| **按名字自动解析包 ID** | **实测证伪**：见 §2，9 例假阳性（`xh`→Firefox、`nix`→LabChart） |
| 抄 awesome 清单（modern-unix / awesome-cli-apps） | 两者 **GitHub API `license: null`** 且无 LICENSE 文件 → 默认保留全部权利，批量摘抄有法律风险 |
| 用 `api.winget.run` 做数据源 | **数据冻结 2023-03-16，陈旧 3.5 年**；版本号（fzf 0.38.0）已与真实（0.74.3）脱节 |
| 插件**运行时**查询 winget/npm | **仍否决**（ADR-0055 §5 理由成立）：引入网络依赖与不确定性；改为**构建期核验** |
| 引入 Node 的 sqlite 依赖读 CDN 索引 | 被 `winget show` 取代：**零依赖**、查的是本机实际源、且与仓库既有 shell-out（zg/semble）同法 |
| 把每条台账暴露成独立工具 | **踩爆选择拐点**（§4） |
| 收录 `gradle`/`maven`/`vcpkg`/`radare2`/`ghidra` 等 | 索引里**没有可信上游项**（maven 只搜到 `HMCL.*`）→ **宁缺勿编**（ADR-0055 §2） |

## Consequences

### 正
- 台账从「够用」变成「一个编码 agent 多数活都能查到装什么」，且**每一条都经权威核验**（含许可证，便于合规判断）。
- **纠正了一条会被静默继承的错误做法**（按名字猜包 ID），并把「人裁决 + 机器核验」固化成工具与种子文件。
- **修正了一处静默缺陷**：`tool()` 辅助函数的 `note` 参数在「有 winget 包」分支被整条丢弃 → 传进来的许可证/坑说明**无声消失**。已改为拼接，并新增 `verSrc` 区分版本出处（避免「实测」说谎）。
- 澄清了拐点口径：**扩目录与工具面大小是两个量**，前者可长、后者必须小。

### 负 / 已知边界
- **扩源靠人工裁决 publisher**：57 条是逐个判断的，新条目仍需人给包 ID。**这不是自动化，是核验自动化**。
- 版本取自核验日，**会随时间漂移**；`winget-verify.ts` 可重跑，但**没有 CI 自动跑**（会依赖网络与本机 winget）。
- `probe` 旗标正确性仍未逐项实测（沿用 ADR-0055 的诚实标注）；新条目 `--version` 多数未在本机真跑（本机未装）。
- 台账变大后，`read_shadow({mode:"toolset", survey:"all"})` 会起更多子进程（105 项），**默认仍只探 2 个 provider**，不受影响。

## 自检

- [x] 与 ADR-0055 一致：仍**不代装**、**宁缺勿编**、双向棘轮保护未变；仅把「数据源」从「否决」修正为「构建期可用、运行期仍不依赖」。
- [x] 与 ADR-0057 一致：预检是让工具面保持小的接口；本 ADR 明令禁止把条目暴露成工具。
- [x] 与 ADR-0049 一致：核验失败只说「未取到」，**不说「包不存在」**（`winget-verify.ts` 区分 `unavailable` 与 `not-found`）。
- [x] 实测证据齐备：CDN 字节数/时间戳、14,816 包数、api.winget.run 冻结时间戳、Repology `has_winget=False`、9 例假阳性、57/57 核验、棘轮 101 个 ID 双向通过。
- [x] 全套回归 29 个测试文件通过。
- [ ] **未验证**：新条目 `probe` 旗标在真机（多数工具本机未装，只会显示「未检出」）；`winget show` 解析在其他 winget 本地化（非中/英）下的表现。
