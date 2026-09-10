# ADR-0055: 工具集台账两级（provider / reference）+ 文档棘轮 + 不做代装

- 状态：**已接受（2026-09-10）**
- 决定日期：2026-09-10
- 关联 ADR：ADR-0001（不引向量库）、ADR-0049（缺件不静默）、ADR-0029.1（inv 178 Authority ≠ Ownership）、ADR-0030（inv 182 Delegation Scope 不可扩大）、ADR-0054（Semble 作为候选 provider）
- 关联术语：`../CONTEXT.md`（mode `toolset` / provider / reference）
- **勘误说明**：本 ADR 的编号在 CONTEXT.md / README.md / `core/toolset.ts` 中已被引用（v1.15.10），但 ADR 文件本身当时漏写——本次补齐（这正是本仓 ⑥「四查」要防的「遗漏 / 注释断链」）。

## Context

v1.15.8–v1.15.9 让 dsh-shadow 能**检测缺件并给出可执行命令**，v1.15.9 加了经宿主审批的「一键装」。当时给台账定的边界是**只收插件自己的可选增强**（`zg` / `semble`）。

用户 2026-09-10 要求**扩大**：把 `wsl-cli-tools.md` 那类**通用 CLI 清单**一并分类收集，并点名 `uutils/coreutils` 与 `skylot/jadx`。于是出现一个必须回答的边界问题：

> 通用开发工具（`rg` / `fd` / `jadx` / coreutils…）与插件**没有接线关系**，把它们塞进同一张「能力台账」会不会把「插件依赖」和「工具目录」混为一谈？

不澄清会出现两种误读：① 用户以为装了 `rg` 插件就会用上它（其实插件不读它）；② 维护者以为某个工具是插件的硬依赖（其实无关）。

## Decision

### 1. 台账分两级，`kind` 显式区分

| 级 | 含义 | 缺它 | 例子 |
|----|------|------|------|
| `kind: "provider"` | **插件内接线**的可选增强 | 对应能力**降级**，读侧出现处置行 | `zg`、`semble` |
| `kind: "reference"` | **通用开发 CLI 目录** | **不影响插件行为**；只是查得到「装什么、怎么装」 | `rg`/`fd`/`jq`/`jadx`/`coreutils`… |

`degradesTo` 字段强制写清：provider 填**退到哪条确定性路径**（ADR-0049）；reference 填「无（通用工具，不影响插件行为）」。

### 2. 不给装法就不给（宁缺勿编）

`install` 配方转**可选**。没有可靠安装方式的条目**不编造命令**——宁可只说「未登记装法」。

### 3. 目录文档入仓 + **双向棘轮**

`docs/toolchain-windows.md`（Windows 口径）与 `docs/toolchain-wsl.md`（Linux/WSL 口径）**随包发布**（`package.json` 的 `files` 含 `docs`）。
`test/toolset-catalog.test.ts` 双向比对：

- 正向：台账每个 `winget` ID 必须出现在 Windows 文档里；
- 反向：文档里 `winget install` **实际安装**的包必须已登记进台账 —— 按**命令参数语法**解析（跳过 `--id`/`-e` 等旗标，遇非包 ID token 即停），而不是全文扫「含点号的 token」（那会把 `Apache-2.0`、版本号误收）。

> 该棘轮**首次运行即抓出一个写错的 winget ID**：台账写 `pvolkov.mprocs`，实测应为 `pvolok.mprocs`。这是它存在的理由。

### 4. 探测口径：只说「未检出」，不说「未装」

三态：`true`（检出）/ `false`（未检出）/ `null`（本次未探测，reference 默认不探）。
理由：探测方式可能不适用（该工具没有版本旗标），且**宿主进程的 PATH 是启动时快照**——宿主起来之后装的工具要**重启宿主**才可见。故「探测失败 ≠ 未安装」。

### 5. 插件**绝不代装**（沿用既有边界，不在本轮放宽）

依据是可引用的条文，不是偏好：README 安全边界表「有后果的动作要用户确认」、`references.md` 引 OpenAI《Computer use》同条、**inv 178 Authority ≠ Ownership**、**inv 182 Delegation Scope 不可扩大**（「scope 只能由外部权威以显式协议变更，**不可在执行中隐式扩大**」）。

⇒ 安装**只在显式调用**（`read_shadow({mode:"toolset", install:"<id>"})`）时发生，且**一律先经宿主审批**（`ctx.approval.request`，**只有 `allowed-once` 是授予**）；`rejected`/`cancelled`/`unavailable`/无通道/无 agent/审批抛错/非词表返回值 → **一律不安装**（fail closed）。装完**重新探测**才报结果——**绝不凭退出码宣称成功**。

### 6. 版本

`1.15.10`（扩目录 + 入仓文档 + 棘轮；不新增 mode，`toolset` 已在 v1.15.9 引入）。

## Alternatives Considered

1. **只收插件自己的（维持 v1.15.8 的边界）** —— 用户明确否决：他要的是「保障任务的」通用工具目录。
2. **把通用工具也标成 provider** —— 否决：会让用户以为装了插件就会用上，是**事实错误**。
3. **文档只留在 `~/Downloads`（不受版本控制）** —— 否决：Downloads 易被清理，且无法被测试约束；改为入仓 + 棘轮。
4. **自动安装（缺件即装）** —— 否决：违反 inv 178/182（见 §5）。v1.15.9 的审批门是合规的替代。
5. **台账用外部数据源（npm/winget 实时查询）** —— 否决：引入网络依赖与不确定性；静态登记 + 棘轮比对已够。

## Consequences

- **正**：agent 需要某类工具时不必重新研究「装什么、怎么装」；人读文档与机器台账**不会漂移**（棘轮保证）；边界清楚（provider 影响行为、reference 不影响）。
- **负**：目录需人工维护（`winget` ID 与版本会变）；chocolatey / scoop 渠道**未核实**；`Microsoft.Coreutils` 的**实际安装行为未实测**（只核对了元数据与 README，且其自述为 **preview**）。
- **已知缺口**：`docs/toolchain-wsl.md` 是 Debian 包名口径，与 winget **无对应关系**，故**未做棘轮**。

## 自检

- [x] 与 ADR-0049 一致：缺件可见**且可执行**；未登记条目不编造。
- [x] 与 inv 178 / inv 182 一致：不代装，安装经外部授权（宿主审批）。
- [x] 与「单一 `read_shadow`」纪律一致：复用已引入的 `mode:"toolset"`，**不新增 mode**。
- [x] 修复了本 ADR 的悬空引用（CONTEXT/README/源码 4 处现已可解析）。
- [ ] **未验证**：`allowed-once` → 真正执行安装器 → 重探 这条执行路径（会真装软件、改动机器）；各条目 probe 旗标正确性未逐项验证。
