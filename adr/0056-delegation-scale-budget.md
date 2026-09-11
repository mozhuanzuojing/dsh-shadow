# ADR-0056: 委派规模与复用优先（teammate 名额硬上限 4 + 往返纪律）

- 状态：**已接受（2026-09-10）**
- 决定日期：2026-09-10
- 关联 ADR：ADR-0049（缺件不静默——不是本轮）、inv 178 `Authority ≠ Ownership`、inv 182 `Delegation Scope 不可扩大`；**修订 v1.15.4 的「team 优先」口径**
- 关联术语：`../CONTEXT.md`（`toolset` / teammate 名额）
- 关联平面：**决策跨两平面** —— 名额硬闸门在 **host**（profile `cordis.patch.yml` 的 `agent-team` 行），往返纪律在 **preset**（`agent-presets/projection/agent.cordis.yml` ②）

## Context

用户 2026-09-10：**「投影模式中的 agent Team 一定要控制子代理的规模，因为 token 消费太大」**。

v1.15.4 曾把 persona 改成「**优先 Agent Team**」，理由是「复用省下每个新 subagent 要重付的系统提示 + 工具 schema 前缀」。但同版已核实并记录：**「换 Teams 更省」这个因果不成立** —— `fresh`/`fork` 这条轴两边完全一样，而 Teams **多付**一笔固定开销。于是 v1.15.4 的措辞留下一个真问题：

> 「优先 Teams」在**只用一次**时是**净亏**。正确的规则不是「优先 Team」，而是「**优先复用**」。

本轮把成本结构逐项查实（读上游代码 + 官方 README），得到决定性的四条：

| 事实 | 证据 |
|------|------|
| 每个成员**每次请求**都背 `team:policy` + **9 个**工具 schema | 官方 README：*"Fixed policy and schema cost on every Team member request"* |
| peer 消息**永久进对方历史**，此后每次请求都重发 | 官方 README：「每次 peer 投递都会把发送者前缀与消息内容加入 target 历史」 |
| `maxMembers` **不是并发上限，是会话终身累计上限** | 上游 `lib/index.js`：`L564` 在**创建时**检查 `state.members.length >= this.maxMembers`（`TEAM_MEMBER_LIMIT`）；`L1244` 只 `push`；**`members.splice/pop/filter/delete` 命中 0 处**（无任何移除路径）；`L563` 重名抛错 + README「即使**创建失败**的 teammate 也保留其名字」⇒ **失败也吃名额** |
| **（v1.15.17 补）上述四条已在本机装包后独立复核** | `@deepseek-ai/dsh-experimental-agent-team@0.1.5-rc.2` 装进 profile 后逐条核对：`L1594 DEFAULT_MAX_MEMBERS = 8`（默认值属实）；`L564` 创建时检查（属实）；`members.splice/pop/shift/filter` **实测命中 0 处**（无移除路径，属实）；**且机制比原说法更严格** —— `L561-570` 先把成员以 `phase:"provisioning"` **落盘**，`L572+` 才真的 spawn，失败走 `settleProvisioning`（`L708-721`）**只追加一个新版本把 phase 改成 `"failed"`，不移除条目** ⇒ **失败创建永久占一个名额**，不只是「名字被占」 |
| `workflow` / `subagent` **不吃** teammate 名额 | `dsh-tool-workflow` / `dsh-workflow-worker-thread` / `dsh-tool-subagent` 三个包对 `agentTeams` 的引用数均为 **0** |
| 嵌套**不是**杠杆 | 宿主 roster **扁平**，只有 Lead 能 `spawn_teammate`，不支持嵌套 Team |

⇒ 「规模」至少对应四个互不相同的量（成员数 / 往返轮数 / 提示词规模 / 并行度），成本性质差一个量级。用户选定 **成员数（A）+ 往返轮数（B）**。

## Decision

### 1. 成员数：host 行设 `maxMembers: 4`

在 profile 的 `cordis.patch.yml` 的 `agent-team` 行加 `config: { maxMembers: 4 }`（原来是宿主默认 8）。

- 这是一个 **per-session 终身累计**上限：一个会话从头到尾最多创建 4 个 teammate，**不可释放**，**失败的创建也占名额**。
- 取 **4** 的依据：覆盖本部署自己的**最大显式需求**——① 审查要两个不同视角（2）+ 实现（1）+ 调研（1）= 4；超出即应自己做或串行。
- 撑爆时的降级是**优雅**的：`spawn_teammate` 抛 `TEAM_MEMBER_LIMIT`，Lead 转为自己做——不是「卡死」。
- **已知残余风险**：4 对「失败的创建」**没有余量**；若实测过紧，调 6。

### 2. 判据改为「复用优先」（修订 v1.15.4）

**只有会复用 ≥2 次（或需要共享任务板）才用 teammate**；只用一次就用 `subagent`（要带上下文用 `subagent_fork`）。
「省下前缀」这个理由只在**复用**时成立——用一次时 teammate 比 subagent **更贵**。

### 3. 往返纪律（preset ②）

- **一次委派 = 一条消息**：做什么 / 约束 / 验收 / 输出格式一次给全（挤牙膏式往返会永久堆进对方历史）；
- **同一委派往返 ≤2 轮**（首发 1 + 纠正/返工 ≤1），超出即**自己接手**或换人；
- **唤醒优先 running/idle，避免 inactive 冷恢复**——冷恢复先复用持久对话再追加未投递消息，等于**重付整段历史**。

### 4. 名额耗尽不是死路（写进 ②，避免 Lead 误判为「无法工作」）

自己做 / 用 `subagent` / 大批量同构用 `workflow` 扇出 —— 后两者**不吃名额**（见 Context 表）。

### 5. 版本

`1.15.11`（改 persona + preset 文档 + 主 README；host 行 config 属部署面，不入本包）。

## Alternatives Considered

| 备选 | 否决理由 |
|------|----------|
| 保持默认 8 | 对「控制规模」力度不足；8 = 该会话最多 8 个成员且永不释放 |
| 3 | 对**失败的创建**太紧：一个坏 spawn 就只剩 2 个可用 |
| 6 | 留了失败余量，但相对 8 只减 2，基本等于没控 |
| 只在 persona 写纪律、不动 host config | 措辞拦不住，硬上限仍是 8；A 与 B 机制不同、**互不替代** |
| 往返收紧到 ≤1 | 首发一次、不许返工追问；与 ④「零分栏退回重派」冲突（重派即第二轮） |
| 往返放宽到 ≤3 | 复利风险高（每条消息永久进历史） |
| 单独立为 ⑧ 而不动 ② | ② 本就是「派谁」的条款，加「派几个、来回几次」是同一条决策链；新增 ⑧ 会让 persona 到 8 条 |

## Consequences

### 正
- token 成本有两个**方向不同**的控制点：A 是**线性乘数**（有宿主硬闸门，改一行 config 即生效），B 是**复利**（需纪律，无闸门可设）。
- 「优先 Teams」的净亏情形被消除：判据从「用哪种机制」改成「**会复用几次**」。
- 修正了 v1.15.4 的一处**未给判据**的措辞（它只说「优先」，没说「什么时候不优先」）。

### 负 / 已知边界
- **本决策自身有常驻成本**：为把纪律写进 persona ②，preset 的 `prefix` 从 **2394 → 2629 字符（+235，YAML 解析值 = 真正进 prompt 的长度）**。这是**为控 token 而增加 token** 的反讽式取舍——之所以仍然值得，是因为它防的是**复利式**增长（peer 消息永久进历史），而它自己是**一次性常量**。若日后发现收益不足，**优先砍这一条**（它的收益依赖 Lead 是否真的遵守纪律）。
- `maxMembers` 是 **host 级**、**全局**生效（作用于所有会话/所有预设）；**投影模式自己设不了**这个闸门——preset 平面只能写纪律。若将来需要按预设分档，需要宿主的 per-agent team 配置（当前不存在）。
- **4 对失败创建无余量**（见 §1 残余风险）。
- 名额是**会话级**，不跨会话累计——新会话重置。

### 风险
- 若 Lead 不遵守往返纪律（B 无硬闸门），复利式烧 token 仍然可能。**缓解**：把纪律写进 persona ②（常驻上下文），并在此 ADR 记录判据，便于后续复核时对照。

## 自检

- [x] 与 v1.15.4 已核实的事实一致：`fresh/fork` 两边同构、Teams **多付**固定前缀 → 故判据必须是「复用次数」而不是「机制偏好」。
- [x] `maxMembers` 的语义经**代码核实**（创建时检查 / 无移除路径 / 失败也占名额），不是照抄文档。
- [x] 「workflow/subagent 不吃名额」经**包级引用核实**（3 个包对 `agentTeams` 引用 0 处）。
- [x] 不越界：host 行只改**一个配置值**；不改上游代码、不新增权限（与 inv 178/182 无关）。
- [ ] **未验证**：`maxMembers: 4` 的实际拦截行为**未在真机触发过**（需要真创建 5 个 teammate 才能验）；`dump-config` 已确认值被读到，但**运行时闸门未实测**。
- [ ] **未验证**：改 host 行 config 是否需要**重启**才生效（v1.15.4 加该行时是热生效，但**改 config** 的路径未单独验过）。
