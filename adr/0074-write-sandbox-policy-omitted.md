# ADR-0074: 写入省略 `sandboxPolicy` ⇒ 记忆一条都落不了盘

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：**ADR-0062**（接线审计：本 ADR 是「机制对了、断的是谁调用它」的第 **10** 个实例，但断点从「**谁调用**」换成了「**谁传参**」）、ADR-0049（缺件不静默）、ADR-0057（插件 `dist/` 不热加载 / 验证成本）、ADR-0003（记忆文件 = source of truth）、**ADR-0055 §1**（`reference` 不影响插件行为，用于对照「什么才叫不影响」）
- 关联待办：`../BACKLOG.md` 的 **B3**（重启后真机复核）、**T6**（兜底根场景本修复未覆盖）
- 版本：`1.15.31`

## Context

### 1. 现象（真机，两次、跨版本）

`read_shadow` 返回值顶部长期挂一条横幅：

```
> ⚠ shadow 最近一次落盘失败（2026-09-11T11:35:11.891Z：cannot write
> "G:\project\dsh1\.shadow\2026-09-11\2026-09-11--193511-shadow.md":
> file access denied under workspace-write mode）。你读到的可能是旧/不完整记忆…
```

时间戳有**两次**：`11:28:02Z`（`v1.15.12`，重启前）与 `11:35:11Z`（`v1.15.30`，重启后）。
⇒ **与本次升级无关**，是一直坏着；且**读路径完好、写路径全挂**。

### 2. 逐层定位（全部读宿主编译产物，非猜测）

```
插件 11+ 处写点，全部两参调用：fs.writeText(t, text)
      │  第 5 参 sandboxPolicy 省略
      ▼
dsh-fs-sandbox/lib/index.js:125-126, 153-166
      policy = sandboxPolicy ?? this.ctx.sandboxPolicy.resolve()   ← ★ 无 session
      … if (mode === "danger-full-access") return target;          ← L156 直接放行
      … for (const root of writableRoots(policy)) …                ← L160 判定包含
      … throw FsError(`cannot write "…": file access denied under workspace-write mode`)
      ▼
dsh-sandbox-policy/lib/index.js:141-148
      resolve({}) → mode         = request.mode ?? undefined ?? this.defaultMode
                                  = process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
                    workspaceRoot = resolve(undefined ?? this.workspaceRoot)
                                  = resolve(process.cwd())        ← ★ 服务进程启动目录
      ▼
dsh-sandbox/lib/index.js  writableRoots(policy) = [policy.workspaceRoot, "/tmp", tmpdir()]
```

配置出处（`@deepseek-ai/dsh-base/cordis.patch.yml` L207-212）：

```yaml
- id: sandbox-policy
  name: '@deepseek-ai/dsh-sandbox-policy'
  config:
    mode: !!js process.env.DSH_PERMISSION_MODE ?? 'workspace-write'
    workspaceRoot: !!js process.cwd()
```

**根因**：插件的写入目标是**会话工作区** `session.header.cwd`，而省略 `sandboxPolicy` 拿到的是
**部署 fallback** ——`workspaceRoot = process.cwd()`（`dsh web` 服务进程的启动目录）。
两者不同时，`isPathUnder(target, process.cwd())` 判定失败 ⇒ 抛 `FS_SANDBOX_DENIED`。

**关键反直觉点**：本部署 `settings.yaml` 的 `permission.defaultPreset: danger-full-access`，
会话策略**本来就是 `danger-full-access`**（若带上 session，`checkedTarget` 会在 L156 直接放行）。
**是「漏传参」把一次本可放行的写入，降级成了 workspace-write 围栏下的越界写。**

### 3. 排除的两个替代解释（此前记账里的说法，两个都不成立）

| 候选原因 | 判定 | 依据 |
|---|---|---|
| `.shadow` 目录不存在 | **排除** | `dsh-fs-local` L497 写前 `mkdir(directory, { recursive: true })`；且报错出自 L164 的 `!contained` 分支，不是 `ENOENT` |
| 解析不出 session cwd、落到兜底根 `~/.dsh-observer/shadow` | **排除** | 报错路径 `G:\project\dsh1\.shadow\…` **就是会话 cwd**，`resolveShadowScope` 走的是 `implicit` 分支 |

第 2 条是 `CHANGELOG.md` v1.15.x 的「记账未修」原文里的归因。它**把触发条件说窄了**：
真实触发条件是「**会话工作区 ≠ 服务进程启动目录**」，与能否解析 cwd **无关**。

### 4. 与既有记账的冲突

`CHANGELOG.md` v1.15.12 §A3 曾判「`fs.writeText` 只传 2 参 = **非缺陷**（勘误）」，理由是
「省略 = 用**当前会话策略**」。契约原文（`dsh-fs-sandbox` 的 `writeText` JSDoc，Inspect 复核）：

> `sandboxPolicy` … **Omit to leave the backend its own default.**

**「backend's own default」= 部署 fallback，不是「调用方当前会话的策略」。** 两者无关。
⇒ 该判定是**把「后端默认」误读成「我的会话」**，故 v1.15.31 就地加勘误（原文保留，可追溯）。

## Decision

### 1. 在**取得 fs 的三处**包一层会话作用域门面，而不是改 40 处调用点

新增 `core/fs-scope.ts`，导出两个纯函数：

```ts
sessionPolicy(context, session)   // = context.get("sandboxPolicy")?.resolve({ session })
policyForAgent(context, agent)    // = sessionPolicy(context, agent?.session)
scopedFs(rawFs, policy)           // 只把 writeText 的第 5 参补齐；无策略 ⇒ 原样返回 rawFs
```

三处接入（覆盖**全部**写入路径）：

| # | 位置 | 会话来源 |
|---|---|---|
| ① | `core/writer-materialize.ts` 的 `flush(agent)` | 事件载荷带的 `agent.session` |
| ② | 同文件 `ensureIndex(ws, session)` | 新增可选参；由读侧入口透传 |
| ③ | `index.ts` 的 `queryDeps.fs` | `queryDeps` 由 `const` 改为 `makeQueryDeps(exec)`，按本次 `exec.agent.session` 构造 |

**为什么不逐点改**：所有写入都经由**同一个 `fs` 对象**向下传递（`flush`/`ensureIndex`/`queryDeps`
是插件取得 fs 的**仅有三处**，已用 `get("fs")` 全仓 grep 核实）。在取得处包一次 ≡ 全部写入点都补上，
且**不必动任何 `persistence/*` 模块的签名** —— 那才是真正的 40 处改动 + 40 处回归面。

### 2. 边界：**不越权**

- 只填写调用方**没给**的策略；显式传入的一律**原样转发**（`sp ?? policy`）。
- 策略来自 `resolve({ session })`，即**该会话自己的 mode**。门面**从不构造 `danger-full-access`**，
  也**从不覆盖会话的 `read-only`**（测试 ③ 是这条的正对照：只读会话写入仍被拒）。
- 这守的是 inv 178 `Authority ≠ Ownership` / inv 182「scope 不可隐式扩大」：
  **补传会话自己的策略不是提权，插件按它自己会话的授权写入。**

### 3. 无 `sandboxPolicy` 服务时**不是降级**（故不报 host gap）

`dsh-fs-sandbox` 自己 `static inject = ["sandboxPolicy"]` —— 该服务缺失时**围栏本身不挂载**
（用的是不带围栏的后端），写入不受影响。因此 `sessionPolicy` 返回 `undefined`、门面**原样返回原 fs**，
即**在旧宿主上本修复是恒等变换**。这正是不把 `sandboxPolicy` 写进 `SOFT_IMPACT` 的理由。

### 4. **保留「没有 stat」这件事**（门面必须尊重特性探测）

`persistence/meta.ts:50` 的分派是 `typeof fs.stat === "function" ? await fs.stat(target) : undefined`。
门面若无条件补一个 `stat`，会让该探测**恒真**、改变既有分支（无 `stat` 后端上的「诚实降级」路径失效）。
故门面**只转发真实存在的方法**（`stat` / `editText` 都是条件挂载），并由测试 ⑥(c) 锁住。

### 5. 先复现，再修（本仓纪律）

新增 `test/fs-sandbox-scope.test.ts`，mock fs **忠实复刻 `checkedTarget` 的围栏判定**
（`mkFencedFs`：部署 fallback root `C:/svc` **故意** ≠ 会话工作区 `D:/proj`）。
**修复前先跑**（暂存新 `dist`、用旧 `dist`）：

```
[dsh-shadow][error] flush FAILED: cannot write "D:/proj/.shadow/2026-09-11/2026-09-11--195034-shadow.md":
  file access denied under workspace-write mode
AssertionError: 会话工作区 ≠ 服务启动目录时，记忆仍必须落盘（旧版省略 sandboxPolicy ⇒ 被围栏拒绝）；
  实际写入 []
```

**报错文案与真机横幅逐字同型** ⇒ mock 复刻是忠实的（不是「测 mock」）。
修复后 6 组断言全过。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 逐点给 40 个写入调用点加第 5 参 | 动 40 处签名 + 40 处回归面，而收益与「在 3 处取得点包一层」**完全等价**（所有写入共用同一 fs 对象）。违背「精准修改」 |
| 直接传 `{ mode: "danger-full-access", workspaceRoot: ws }` | **提权**：门面会绕过会话真实的 `read-only`，撞 inv 182。本 ADR 明确拒绝 |
| 传 `{ mode: <部署默认>, workspaceRoot: ws }`（只修 root、不动 mode） | 对当前部署**看起来够用**（默认 mode 是 workspace-write，root 换成 ws 后判定通过），但它**绕开了会话级 mode** —— 只读会话会被静默放行。仍是提权，只是隐蔽 |
| 用 `Object.create(rawFs)` 做通用转发 | 更短，但会连带暴露后端**所有**方法（含未来新增的受围栏操作），且私有字段（`#x`）后端会炸。显式转发让「插件用到什么」是可见的，surprise 会**响**而不是变行为 |
| 让 `resolve()` 默认带上「当前会话」 | 那是**改宿主语义**，超出插件范围；且 `resolve()` 在无 session 时本就无法知道是哪个会话 |
| 什么都不做，只记进 BACKLOG | 后果是**整棵记忆树永不落盘** —— 读侧降级为「读旧文件」，采集/索引/meta/投影全部只活在内存里。这是**功能静默失效**，不是「未接线的优化」（对比 D1 的 `ChangeSet`），故按同类口径修 |

## Consequences

### 正

- **写入恢复**：会话工作区 ≠ 服务启动目录时，记忆 / `_index.md` / `_meta.json` / 投影缓存 /
  `resources/` 全部恢复落盘（`dsh web` 从任意目录启动都成立）。
- **读侧一并修好**：③ 让 `_index.md`、query-log、identity timeline、validation history 等
  **读路径里的写入**同样带策略 —— 不修 ③ 等于「只修一半」（读时重建索引仍会失败）。
- **在旧宿主上零行为变化**：无 `sandboxPolicy` 服务时门面恒等返回原 fs。
- **不越权**：正对照测试证明只读会话写入仍被拒。
- 把「`fs.writeText` 只传 2 参」这条**两次记账都判错**的结论就地改成可执行的判据
  （不是「数几参」，而是「**这次写入用的是谁的 mode / 谁的 root**」）。

### 负 / 已知边界

- **行为变更（预期内）**：写入不再受 `process.cwd()` 约束，改受**会话工作区**约束。
  这是修复的目的；但它是行为变化，显式记录。
- `makeQueryDeps(exec)` 由「一次构造」变为「**每次工具调用构造一次**」——
  多一次对象分配（含两个 getter 的闭包），代价可忽略；**刻意不展开 `queryDeps`**
  （展开会急切求值 `fs` / `approval` 两个 getter，把 `apply()` 时尚未就绪的服务固化进去 ——
  那正是这两处特意写成 getter 要避免的事）。
- **兜底根场景未覆盖**：`resolveShadowScope` 落到 `~/.dsh-observer/shadow` 时**没有 session 可问**，
  仍走部署 fallback ⇒ 该场景下写入仍会被围栏拒绝。**这是本修复的已知空白**，升为 **T6**
  （它是「兜底根本身是否该存在」的设计问题，不是补一个参数能解决的）。
- **真机未验证**：插件 `dist/` 不热加载（ADR-0057）⇒ 需**再重启一次**宿主才能在真机复核
  （记 **B3**）。本次的绿是 mock 绿，不是真沙箱绿。
- `editText` 只做门面转发断言，插件今天不调用它（补它是为了不留「同处机制只修一半」的缺口）。

## 自检

- [x] **先复现再修**：旧 `dist` 上跑出新测试的红，且**报错文案与真机横幅逐字同型**；修复后 6/6 绿。
- [x] **根因来自宿主编译产物，不是猜测**：三层调用链（`fs-sandbox` → `sandbox-policy` → `sandbox`）+ 配置出处均已引用行号。
- [x] **两个替代解释都排除**，且指出既有记账把触发条件说窄了。
- [x] **边界锁进测试**：不越权（③ read-only 正对照）、不破坏特性探测（⑥c `stat`）。
- [x] **恒等降级**：无策略 / 无 fs / 无服务 / resolve 抛错四种情况均断言（⑥a）。
- [x] `npx tsc --noEmit` exit 0；`npm run build` exit 0；全套回归 **39/39 ALL PASS**（38 + 新增 1）。
- [x] 未改任何 `mode` / 读侧语义 / API；新增一个模块 + 三处接入 + 一个测试。
- [ ] **未验证**：真机（需重启宿主，**B3**）；真沙箱而非 mock。
- [ ] **未做**：兜底根场景（**T6**）。
