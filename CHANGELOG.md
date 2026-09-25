# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.26] `T6` ② 结案（兜底根写入的可见信号）+ **发版出口装闸门**

⚠ **本版号是第二次使用**：上一个 `v1.21.26`（`e230c6e`）的 `verify` 是 **exit 1**（两条测试红），已被 revert（`880624b`），
tag 也删了 —— 事故经过见 §2，本版把它修对之后重新发。**代码面 + 工具面 + 台账面**。

### 1. `T6` ②：兜底根写入「未受会话授权」的可见信号（`lastScopeNotice`）

- `core/scope.ts`：新增 `noteFallbackScope(core, scope)` —— 纯函数，**只有 `scope === "fallback"` 才置信号**
  （非 fallback 一律不写：否则告警变噪声、会被习惯性忽略）；用**结构化泛型**而不是 import `WriterCore`，
  避免 `scope ↔ writer/core` 的循环依赖。
- `core/writer/core.ts`：加 `lastScopeNotice: { at, note }`（与 `lastFlushError` 并列、同形）。
- `core/writer/materialize.ts`：写侧由 `resolveWorkspace` 改取 `resolveShadowScope`（**同源**），落到兜底根时
  **置信号 + `console.error`**（对齐紧邻的 `lastFlushError` 两件套）。
- `core/writer/index.ts`：读侧出口 `getFlushWarn()` 加一段 —— **这就是「可见」的实现**
  （否则等于把 `T6` 的 `②` 做回 `③`「维持现状、静默」）。

### 2. ⚠ 事故记录：上一个 `v1.21.26` 曾以**红门**发布并推远端

- **事实**：上一个 `v1.21.26`（`e230c6e`）被 commit / 打 tag / **push 到远端**时，`verify` 是 **exit 1** ——
  `test/writer-write.test.ts` 的「无落盘失败警告」与 `test/t8-silent-degradation.test.ts` 的「显式关掉不得留痕」两条红；
  两条断言都是**整条横幅逐字节为空**，而它们的 fixture 恰好都是「**有 agent、没有 cwd**」⇒ 落到兜底根 ⇒ 新信号把横幅填满。
- **直接原因**：发版出口**没有闸门**（在此之前只有「内容改写」上装了守卫）⇒ 人手工走 commit/tag/push，退出码从未被当判据。
- **根因两处，都要记**：
  1. **上一版写进台账的「机械可执行设计」基于不完整侦察** —— 没查「谁把**整条横幅**当健康判据」；
     台账原话「**无 session** + 无显式 root 的测试」也**不准**：`materialize.ts` 的 `flush(agent)` 头两行以 `agent.id`
     取 pending，`agent` 不存在时**提前 return** ⇒ **可达**的兜底根写路径是「**有 agent、但解析不出 cwd**」
     （现已由 `test/scope-fallback-notice.test.ts` ⑤b 钉成断言）。
  2. **发版出口无门**（本次补上，见 §4）。
- **恢复**：`git revert e230c6e` → `880624b`（HEAD 一直保持在这里，直到本版）；tag 移回 `v1.21.25`（远端当时只剩它一个）。

### 3. 冲突的处置：**不收窄判据、不削弱断言**

- **判据保持 `scope === "fallback"`**，覆盖「无 session」与「有 agent 无 cwd」两种子场景；
- **两条 fixture 的 scope 显式化**（各加一行 `shadowRoot: "D:/ws"` + 就地写明理由）—— 它们要测的是「seam 能落盘」与
  「关掉不留痕」，**不该由 fixture 的缺省值来决定生产判据**；**断言一字未改**，scope 三态另有
  `test/recall-attribution.test.ts` 场景 12 钉住，覆盖面没有减少；
- **`test/scope-fallback-notice.test.ts`**（新增）：① 无 session 置信号 · ② 有 agent 无 cwd 置信号 · ③ 显式 root 不置 ·
  ④ 隐式 scope 不置 · ⑤ **有 agent 无 cwd 的真实 flush ⇒ 读侧横幅可见** · ⑤b 无 agent ⇒ **不可达、不落盘、无信号** ·
  ⑥ 显式 root 的真实 flush ⇒ 横幅**逐字节为空**；
- 上一版台账那句「**不是收窄能解决的**」：**方向对、理由不对**。收窄到「无 session」**确实**能让两条测试变绿，
  但它同时**让信号不可达**（→ 静默）—— **那才是不能靠收窄的理由**（更正已回写 `BACKLOG.md` 的 `T6` 条目）。

### 4. 发版出口装闸门：`npm run release` = `tools/release.ts`

- 顺序：三方版本一致预检（判据与 `audit:docs` ① **共用同一份实现**，只为快速失败）→ **`npm run verify`（闸门）** →
  `git add/commit` → 删旧 tag（本地 + 远端）→ 打新 tag → 推分支 → 推 tag → 打印 `HEAD` 与 `tag → sha` 供核对。
- **闸门 = 退出码**：非 0 **立即退出、一个 git 写操作都不发生**；`exit 2` 单独提示「结构 / 语料根缺失 ⇒ 那次绿是假绿」。
- `tools/release.lib.ts`（纯判据：`gateDecision` / `planRelease` / `planViolations` …）+
  `tools/release.selftest.ts`（正反对照：`exit 1` 与 `exit 2` 都不许放行；`--tags` / `--force` / 裸 push / 空参数都抓得到）。
- **刻意不做**：没有 `--skip-verify`（那正是事故成因）；不 `--force`；不 `--tags`（精确指定 ref）；`--dry-run` 只打计划、什么都不跑。
- **本版的闸门验证是「意外但真实」的一次**：`npm run release` 首跑时 `verify` 真的红了
  （`tools/release.ts` 自己的 TS2339 —— `tsconfig.tools.json` 是 `strict: false`，判别联合在那里收窄不了），
  工具**如约**停在第一步：exit 1、无任何 git 写操作、tag 未动。那次红顺手修掉两处：`die` 改**函数声明**、
  `parseReleaseArgs` 返回**扁平字段**（与本仓 `{ok, code, lines}` 同族）。

### 5. 验证

- `SHADOW_EVAL_ROOT=D:\project\net1 npm run verify` → **exit 0**（`run-tests` **68/68**；上一版 67/67，差额 = 新增的 1 个测试文件）。
- **复现原场景（红）**：把上一版实现原样应用 → `npm run build` → 跑那两条测试 ⇒ **两条都红**，`actual` 就是兜底根横幅全文
  （一手证据与逐条断言位置写在 `BACKLOG.md` 的 `T6` 更正节）。
- **端到端闸门**：见 §4 末条（红 ⇒ 零 git 写操作，实测）。

### 6. 诚实标注（做不到的不假装）

- **仍未真机复核**：落到兜底根时的**真实围栏行为**（是否真被 `dsh-fs-sandbox` 拒绝）—— 与 `V1`–`V4` 同族，缺真机条件；
  本条结的是「**代码 + 可见信号**」这一半。
- **本轮唯一的契约面改动**是那两条 fixture 各一行（见 §3）；其余都是加法。

### 7. 棘轮记账：`b_keys` 93 → 100（+7），逐条说明「为什么不是缺陷」

`audit:ratchet` 的判据是「线索只能降不能升、新桶必须记账」⇒ 新增工具带来的**新线索**必须有人看过才能录基线。
本版新增的 7 条**全部**来自新工具，逐条如下：

| 新线索 | 位置 | 为什么不是缺陷 |
|---|---|---|
| `t=--dry-run` · `t=--help` · `t=--message` · `t=-h` · `t=-m` | `tools/release.lib.ts` 的 `parseReleaseArgs` | 比较的是 **CLI 入参**（`process.argv`）—— 该值的**生产者在仓库之外**（用户 / npm 脚本）。工具自己的判据就写着这一类：「可能来自**外部数据**…此时分支可达，只是不由本仓生产。**不得凭静态分析定罪**」 |
| `f=git tag v1.21.26` | `tools/release.selftest.ts` | 标定测试里**故意构造**的计划字符串（断言顺序与末条），与生产无关 |
| `message=z` | `tools/release.selftest.ts` | 同上：解析结果的**标定断言**（`--message=z` 收下的就是 `z`） |

- **没有一条是「忘了接线」**：7 条都不是产品面的可写值，而是「入参 / 测试夹具」。
- **录基线不等于「这些都无害」**，它是「**有人看过并记账**」—— 下次真要动它们，`audit:ratchet` 仍会因**桶消失**而报红（缺件不静默）。
- **命令**：`node tools/audit-wiring.ts . --update-ratchet`（`corpus.wiring` 段一并更新：files 958 → 962 = 新工具 3 个 + 新测试 1 个）。
- `audit-drift` 的桶**未变**（逐桶相等）⇒ 未动它的段。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**。
- **下一批**：`T9` → `T11` → `T13` 后半（须先立 ADR）→ `T17-C` → `T18` → `T21`。
- **仍等你**：`D2` 填可信根（只有人能加）· `6.3 待定语义`（明写「不修，需先拍板」）。
