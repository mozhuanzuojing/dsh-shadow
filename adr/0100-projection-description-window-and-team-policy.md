# ADR-0100: 投影模式的**描述可见窗口**与 persona 的 `team:policy` 执行口径（+ 本机旧副本退役）

- 状态：**已接受** · 随 `v1.20.4` 落地
- 决定日期：2026-09-23
- 关联 ADR：**ADR-0099**（上一轮把 Agent Teams 描述对齐 `0.1.7`；本文补它**没覆盖到的两处**：描述写在哪里才看得见、
  persona 是否该携带上游 policy）· **ADR-0098**（预设声明行形态与「旧 `$DSH_HOME/.agent-presets/<id>/` 目录已退役」——
  本文把它落到**本机部署面**：那份副本删除）· **ADR-0056 §2/§3**（复用优先与往返纪律 —— 本文**不改其判据**，只把
  「开不开 Team」的硬门前移到上游）· **ADR-0049**（缺件不静默 —— §5 的「未复核面不声称」沿用其取向）
- 关联术语：`../CONTEXT.md`（团队协作纪律与描述可见窗口 / teammate 名额 / Agent Teams 的平面）
- 定位：**可见性缺陷修复 + 口径对齐 + 部署面退役**。回答三件事：① 「文件里有」为什么「界面上没有」；
  ② persona 与上游 `team:policy` 的边界与代价；③ 本机那份旧副本为什么必须走掉。
- 触发：用户指令「dsh-shadow 里面的投影模式的描述没有更新 agent Team相关内容」。先摆证据再定范围
  （三个候选：GUI 卡片上的描述 / 仓库里的 `description` + persona / 本机遗留副本），用户三处全选，
  并选定遗留副本的处置 = **备份后删除**。

## 1. Context：可见性窗口是**量出来的**，不是猜的

v1.20.3 把 Agent Teams 的内容**确实写进了** `presets/projection.patch.yml` 的 `description`（本文不推翻它），
但用户仍然报「描述没有更新 Agent Team 内容」。⇒ 判据不能停在「文件里有没有」，要问**人看到的那个界面渲染了什么**：

| 面 | 实测 | 后果 |
|---|---|---|
| 预设选择器的卡片 | `@deepseek-ai/dsh-client-ui-agent-preset` 的 `lib/client.js`：`cardDesc` 用 `-webkit-line-clamp: 4`；卡片列宽 `minmax(268px,1fr)`、描述字号 13px | 可见窗口 ≈ **4 行 ≈ 90 字**；v1.20.3 把 Agent Teams 写在**最后一句** ⇒ 卡片上**看不到** |
| 悬停/展开 | 同一组件给 `<code>`/名称挂了 `title`（原生 tooltip 是完整文本），但描述本身**没有**展开控件 | 想看到就得悬停 —— 不能把「关键事实」放在只有悬停才出现的位置 |
| 本机旧副本 | `~/.dsh/.agent-presets/projection/preset.yml`（2026-09-11 起未再动） | 仍写「上限 **4** / 只用一次用 **`subagent`** / 前置挂 `dsh-experimental-agent-team@0.1.5-rc.1` 且 `maxMembers: 4`」 |

**第二条 Context（口径面）**：0.1.7 的 `team:policy` 段是**权威**且**每会话自动注入** —— 它由
`dsh-experimental-tool-agent-team` 的 `lib/index.js` 里 `const POLICY` 定义、随工具装配进
`systemPrompt.section({ name: "team:policy" })`。逐条读出来的规则里有五条**本预设 persona 从没有过**：

1. **只有用户显式要求**用 Agent Teams / teammate 才建（创建硬门）；
2. 成员**共享同一文件系统** ⇒ 写工作要拆成**互不重叠的作用域**、写进共享任务的 `write_scopes`；重叠只是提示、不是锁；
3. 需要排序就用 `blocked_by`（任务依赖）；
4. 共享任务板按 **list → get → claim（带当前 revision）→ 干活 → complete**；**任务就绪不会启动执行者**；
5. 文件写遇 `FS_STALE_VERSION` 要重读、把改动 rebase 到新内容再重试；Bash / formatter / 代码生成**不受版本守卫保护**。

persona ⑤ 当时是 **v1.15.4 时代的子集**（并行批派 + revision CAS + `wait_agent` 前置），上面五条一条都没有。

## 2. Decision

**D1（描述面）**：`description` 重排为「身份 → **Agent Teams** → 纪律」，保证 `Agent Teams` 落在**前 90 字**内；
并点名提供 Teams 的 profile 层 bundle 与「名额随该 bundle 出厂 `maxMembers`」（**不写死一个会腐烂的上限数**）。

**D2（口径面）**：persona ② 补**上游硬门**，⑤ 携带上述五条 `team:policy` 规则的**压缩执行口径**，⑦ 补
「两个创意角色默认由 agent 自己先后担任」。**边界写清**：上游 `team:policy` 仍是权威；预设这份买的是
「**决定要不要开 Team 那一刻**」的口径一致，**不是新能力**。

**D3（门）**：`test/preset-projection.test.ts` 新增 **④** —— ④a 描述前 90 字必须含 `Agent Teams`；④b persona
必须带六个锚点（`显式要求` / `写作用域必须互不重叠` / `blocked_by` / `list → get → claim` / `任务就绪不会` /
`FS_STALE_VERSION`）。**理由**：这一处已经腐烂过一次，而它腐烂时**文件是「对」的、只有界面是错的** ⇒ 没有门就必然再犯。

**D4（部署面）**：本机 `~/.dsh/.agent-presets/projection/` **备份为 `projection.bak-<时间戳>/` 后删除**。
0.1.7 对 `$DSH_HOME/.agent-presets/<id>/` **无读取者**（在装着的 `@deepseek-ai/*` 包体里 grep `\.agent-presets`
**0 命中**）⇒ 它不是「旧但能用」，是**纯误导**：冻在里面的描述写着**一个已撤回的上限**与**一条已不存在的降级路径**。

## 3. Alternatives（为什么不是别的做法）

| 备选 | 否掉的判据 |
|---|---|
| 只改仓库文件、不动描述顺序 | **正好是用户报的那个缺陷**：文件里有、界面上没有 ⇒ 没修 |
| 把 `description` 写短到只留一句 | 悬停/详情里就没信息了；且 ⑥⑦ 的索引价值也丢了 ⇒ 取「前置 + 后置」而非「砍掉」 |
| 让 persona 只留「见上游 `team:policy`」一句 | 那个「决定要不要开 Team」的时刻，agent 读的是**预设**（policy 段的措辞是「Teams 可用」，**不含本预设「默认不派 / 复用优先」的成本判据**）⇒ 两者要合起来读才完整 |
| persona **全文照抄**上游 `team:policy` | 纯重复（每个请求都带一遍），而 persona 是**常驻**成本；本文只取执行口径 + 预设特有判据 |
| 保留旧副本、只把它改写成新口径 | 它是**冻结部署产物**（ADR-0098 已定「不得手改」），且已无读取者 ⇒ 手改等于把一份死件养起来；而**备份后删除**同时满足「可回滚」与「不再误导」 |
| 为「上游漂移」加自动门 | 要读上游包体、还得判断语义，**超出「必要条件门」的能力**；本文只锁六个字符串锚点，并把「上游改口径 → 回来重核」写成显式触发条件 |

## 4. Consequences

- **可见窗口里第一次出现 Agent Teams 的硬事实**（bundle 名 + 名额出处 + 无 `subagent` 可回落）。
- **persona 变长**：`yaml.safe_load` 真解析 `persona.config.prefix`，**3047 → 3583 字符（+536）**。这是**常驻**成本，
  按预设 README 的口径回填了实测值；若判定不值，**要同时放松 ④b 再退回** v1.15.4 子集（不放假门）。
- **判据没有松动**：「默认不派人」与「复用优先（≥2 次）」**原样保留**；上游那道「只有用户显式要求才建」是**更严**的门，
  它只**前移**了「开不开 Team」，不改「开着时怎么花」。
- **本机少一份可被误读的「现行描述」**；`≤0.1.6` 回退场景要靠那份 `projection.bak-<时间戳>/`（已披露）。
- **新增一条跨仓同步面**：用户级规则 `moe-subagent-dispatch.md`（规则为源）+ `~/.dsh/AGENTS.md` 手工聚合一起改
  （规则自己的「落地」段要求两处一起改）。

## 5. Verification

- **真 YAML 解析器**（一次性探针，放 `%TEMP%`、用完即删）：`description` 仍是**单行 plain scalar**（无「冒号 + 空格」，
  即 v1.20.3 踩过的 `mapping values are not allowed here` 那颗雷）；声明行 id 仍 `preset-projection`；行清单仍 **27 项**；
  `tool-subagent*` **0**；`tool-agent-team` **不在**；`Agent Teams` 落在**前 90 字**（实测第 58 字起）。
- `node test/preset-projection.test.ts` → ①②③④ 全绿（exit 0）。
- `npm run verify`（`audit:docs` ①②③④⑤⑥⑦ + layers/scripts/granularity/retrieval/ratchet/tsc/全部测试）+
  `dsh --profile web --dump-config` 复核组合面。
- **部署面**：`~/.dsh/.agent-presets/projection/` 备份（3 个文件）后删除，`.agent-presets/` 下无同名活目录。
- ⚠ **未复核（不声称）**：① GUI 的 4 行截断是从**装着的客户端源码**读出的，**没做浏览器实拍**，「≈90 字」是按列宽与
  字号**估算**，未像素级标定；② 上游 `team:policy` 的**后续漂移没有自动门**，只锁了六个锚点；③ 本部署至今
  **0 次**真 `spawn_teammate`（ADR-0099 §4 实测），故新增的写作用域 / 任务板口径**只有文档与测试证据，无运行证据**。
