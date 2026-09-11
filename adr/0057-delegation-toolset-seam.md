# ADR-0057: 委派 × 工具集台账的接缝（能力预检；装完本进程不可见；缺件只能上报）

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0049（缺件不静默）、ADR-0055（工具集台账两级 + 不代装）、ADR-0056（委派规模与复用）、ADR-0030（inv 182 Delegation Scope 不可扩大）、ADR-0029.1（inv 178/179）
- 关联术语：`../CONTEXT.md`（toolset / provider / reference / 能力预检）
- 版本：`1.15.13`

## Context

用户 2026-09-11：**「agent-team 和工具集要整合、配合，缺一不可」**。

整合前，两块机制**零功能交叉**（全仓 `grep` 证实）：

| 平面 | 机制 | 提供什么 | 现状 |
|---|---|---|---|
| host 插件 | 工具集台账 | 两级条目（provider 2 + reference 48）+ 探测 + 审批安装 | 只有按 id 的入口 `capabilityOf(id)` |
| preset | 委派纪律 | persona ①②（该不该派 / 规模与复用） | 通篇不提工具集、缺件、能力下限 |

`core/toolset*.ts` 全文不提 teammate/subagent；persona ①②–⑦ 全文不提台账。唯一交叉是 `core/toolset.ts:12` 引 inv 182 **作为权限依据**，不是协作。

### 调查中先暴露的三个事实（都不是偏好，是代码/条文）

**F1（P0 缺陷）`mode:"toolset"` 是死代码，潜伏三个版本。**
`query/reads.ts` 定义了 `toolset` ReadQuery，但 `readQueries` 数组**没有把它放进去**。于是 `dispatchReadQuery` 找不到它 → `{mode:"toolset"}` 落到 `query.ts` 的「无 topic」分支 → **静默返回 `_index.md`**。整块台账**没有任何可达入口**，而 README / CONTEXT / ADR-0055 全把它写成现行入口。
**为何三个版本全绿**：三个 toolset 测试（`toolset` / `toolset-exec` / `toolset-catalog`）**全部直接 import 执行函数**，从不走 `dispatchReadQuery`——执行函数是对的，**断的是接线**。→ 已修，并补 `test/toolset-dispatch.test.ts`（只走真实入口）。

**F2（硬约束）「先装再派」在同一个会话内收益为零。**
`core/toolset-exec.ts` 的 `installCapability` failed 分支已写明：「宿主进程的 PATH 是启动时快照，**新装的工具通常要重启宿主才能被本进程看到**」；ADR-0055 §4 同义。而委派的 teammate 是**同进程内的子 Agent**。
⇒「预检 → 缺件先装 → 再派」这条最自然的整合链路**本会话内不成立**；可行处置只剩**降级**或**告知需重启**。

**F3（边界）装工具的审批凭据是「发起者」，故不能顺着委派漏下去。**
`installCapability` 用 `opts.agent` 作审批凭据；读侧传的是 `exec.agent`（`query/reads.ts`）。**谁调用谁就是凭据**。被派出去的 teammate 若自己触发安装，等于把「改机器」塞进委派范围。

## Decision

### 1. 修 F1：`toolset` 挂进 `readQueries` + 真实入口的回归棘轮

`readQueries` 补 `toolset`；`index.ts` 的 mode 描述补 `toolset`。
新增 `test/toolset-dispatch.test.ts`，纪律是**只走 `dispatchReadQuery`**，并加一条双向棘轮：

- 正向：`{mode:"toolset"}` 必须被 `dispatchReadQuery` 接住并渲染台账（**修复前此断言红**，已回档验证）；
- 反向：**可被 dispatch 接住的 mode，必须在 `index.ts` 的 mode 描述里登记**——防「接得上、却说不出口」。

> 通用教训（写进本 ADR 供后续复用）：**测试若绕过真实入口，就测不到接线的断裂**。seam 类重构必须留一条走真实入口的测试。

### 2. 台账新增**按能力需求反查**：`findCapabilities(need)`

原入口 `capabilityOf(id)` 要求调用方**先知道台账 id**；而派活时手里只有一句「这个活得做全文搜索 / 反编译 APK」。
匹配面：`id` / `probe[0]`（二进制名）/ `label` / `provides` / `category`，**词边界**匹配 + 别名归一（`fdfind→fd`、`batcat→bat`、`z→zoxide`、`ripgrep→rg`…，与 WSL 棘轮的 ALIAS 同源）。

**它不是能力评分**：只回答「台账里有没有一个叫这个名字的东西」，**不排优劣、不给主体打分、不产 capability level**（inv 179 `Agency ≠ Identity` / inv 184 `Feedback ≠ Permission Upgrade`；`delegation/types/context.ts` 的禁增列 trust/confidence/reputation/capabilityLevel 同源）。

### 3. 新增**能力预检**：`read_shadow({ mode:"toolset", need:[...] })`

把「需要什么能力」翻译成「本机是否就位 / 缺了退到哪」。**只读**（只探测，绝不安装）。
未命中的需求**不探测、不编造命令**，只如实说「台账未登记」（与 `unavailableHint` 同纪律）。

**输出必须带三条边界**（缺任何一条，读侧就会被误读成「许可」或「禁令」）：

1. **预检不是闸门** —— `reference` 是通用工具目录，ADR-0055 §1 明写它「不影响插件行为」。缺它**不构成**不派活的理由，按「缺件时退到」走降级。
2. **装完本进程内不可见** —— 见 F2。故预检后**不要**按「先装再派」做计划。
3. **缺件只能上报、不能自装** —— 见 F3（inv 182）。

这三条由 `test/toolset-precheck.test.ts` 锁住，且专门断言输出里**不含**评分/等级/优先派类词（防滑向给主体打分）。

### 4. persona ② 补一句「派活前预检」

预设平面只加**纪律**，不加机制（闸门在 host，与 ADR-0056 §7 的平面归属一致）：
派活前 `need:[...]` 预检 → 缺件不构成不派活 → 但别指望「先装再派」（本进程看不见）。

### 5. 顺带修掉一个**恒红的测试**

`test/toolset-catalog.test.ts` ④ 原断言是「**本机应有已检出的 provider**」——这把**某台机器的安装状态**写死进测试。本机 zg / semble 实测均 `ENOENT`，该断言**恒红**；而一条永远红的测试会**掩盖以后真正的失败**。
改为与机器无关的不变量：默认巡检必须真的**探过** provider（`available ∈ {true,false}`，不得为 `null`=未探测）。装了得 `true`、没装得 `false`，**两者都是「探测确实跑了」的证据**。（用 `git stash` 回档确认该断言在本次改动前就已恒红，排除「我引入」的可能。）

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 做成**派活硬闸门**（缺件就不许派） | **事实错误**：ADR-0055 §1 明写 reference「不影响插件行为」。把通用工具当依赖会误导 |
| 预检顺带**先装再派** | 撞 F2（本进程看不见）——装了也用不上，等于白付一次审批 |
| 让 teammate **自己装** | 撞 F3 + inv 182「scope 不可在执行中隐式扩大」；`adr/0030:30`「被授权执行 ≠ 被授权扩大授权」 |
| 台账条目加**能力等级 / 按能力给专家打分** | 撞 inv 179 / inv 184；`delegation/types/context.ts:13` 明确禁增 `capabilityLevel` |
| 把「装机次数」折成「占用 teammate 名额」 | 量纲不同、无依据；自造配额闸门撞 inv 180（Agency Level 变更须 External Authority + Explicit Protocol Change） |
| 只改 persona、不动插件 | 反查与预检无处落地，persona 会指向不存在的调用 |

## Consequences

### 正
- 「缺一不可」落到**一条可调用的接缝**上：派活决策（preset）× 能力事实（host 台账）。
- 三条边界**写在输出里**而非只写在文档里——调用方看输出就知道不能怎么用。
- 补上一条**机制性教训**：seam 重构必须有走真实入口的测试（F1 藏了三个版本的根因）。
- 修掉一个恒红测试，恢复「红=真有问题」的信号价值。

### 负 / 已知边界
- **常驻成本 +145 字符**：为把预检写进 persona ②，`prefix` 从 **2629 → 2774**（YAML 解析值 = 真正进 prompt 的长度）。与 ADR-0056 的 +235 同性质（为控 token 而增 token），但它是一次性常量、防的是「派了活才发现工具没有」的整轮浪费。
- 预检会**真的起进程探测**（每条需求最多探命中的条目数）。已有短路（任一可用即算就位）与超时（provider 15s / reference 3s）。`need` 限 12 条。
- **预检不改变 F2**：它只能告诉你缺不缺、退到哪，**不能**让新装的工具在本会话内可用。
- 预检的**唯一授权动作仍是显式安装**，走既有审批门，本次未放宽任何权限。

## 自检

- [x] 与 ADR-0055 一致：不代装、宁缺勿编、探测三态与「探测失败 ≠ 未安装」口径未变。
- [x] 与 ADR-0056 一致：闸门在 host、纪律在 preset；未把装机折成名额。
- [x] 与 inv 179/182/184 一致：不给主体打分、不扩大委派范围、安装审批凭据仍是发起者。
- [x] F1 修复经**回档复验**（改动前 `findReadQuery({mode:"toolset"})` = MISS，改动后 HIT）。
- [x] 全套测试 29 个文件全过（含新增 2 个）。
- [ ] **未验证**：真机 `read_shadow({mode:"toolset", need:[...]})` 的端到端返回——测试走的是 `dispatchReadQuery` 层，未经过 DSH 工具调用栈。
- [ ] **未验证**：本机无 zg / semble，故预检的「多命中短路」在**已装**状态下未经实测（只在未检出状态验过）。
