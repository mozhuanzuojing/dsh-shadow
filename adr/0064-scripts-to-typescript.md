# ADR-0064: 仓库脚本全量切到 TypeScript（用户指令）；工具面首次获得类型门

- 状态：**已接受（2026-09-11）**
- 决定日期：2026-09-11
- 关联 ADR：ADR-0062（接线审计工具——本 ADR 迁移的正是它）、ADR-0058（winget 核验器）、ADR-0060（检索评测器）
- 关联术语：`../CONTEXT.md`
- 版本：`1.15.22`

## Context

用户 2026-09-11 指令：**「所有的 js 脚本 mjs 脚本必须全部切换到 ts」**。

迁移前的现状（实测清点）：

| 类别 | 文件 | 语言 |
|---|---|---|
| 产品入口 | `index.ts` → `dist/index.js` | **TS**（tsc 编译） |
| 测试 | `test/*.test.ts`（31 个） | **TS**（Node 原生 type-stripping 直跑） |
| 工具 | `tools/*.mjs`（6 个） | ❌ **JS** |
| 回放脚本 | `test/replay-*.mjs`（2 个） | ❌ **JS** |

⇒ 仓库是「**核心 TS、工具 JS**」的混合体。而按 ADR-0062/0057/0059 的教训，
**工具恰恰是发现问题的那一侧**（接线审计、引用漂移测量、检索评测），它却是**唯一没有类型门**的部分。

## Decision

### 1. 8 个 `.mjs` 全部改为 `.ts`（`git mv`，保留历史）

```
tools/audit-wiring.lib.mjs       -> tools/audit-wiring.lib.ts
tools/audit-wiring.mjs           -> tools/audit-wiring.ts
tools/audit-wiring.selftest.mjs  -> tools/audit-wiring.selftest.ts
tools/retrieval-eval.mjs         -> tools/retrieval-eval.ts
tools/winget-verify.mjs          -> tools/winget-verify.ts
tools/winget-verify-seed.mjs     -> tools/winget-verify-seed.ts
test/replay-metrics.mjs          -> test/replay-metrics.ts
test/replay-real.mjs             -> test/replay-real.ts
```

**运行方式不变、零构建**：Node ≥ 22.6 的 type-stripping 让 `node tools/audit-wiring.ts` 直接可跑
（本机 Node 26.7.0 实测）。**唯一约束**：Node 的 ESM 解析要求**显式扩展名**，故相对导入必须写
`./audit-wiring.lib.ts`（写 `./audit-wiring.lib` 会 `ERR_MODULE_NOT_FOUND`）—— 已实测确认，见下。

`package.json` 的 5 条 script 同步改指 `.ts`（script **名**不变，调用方无感）。

### 2. 新增 `tsconfig.tools.json` + `npm run typecheck:tools`：**工具面第一次有类型门**

```jsonc
{ "include": ["tools/**/*.ts"], "noEmit": true, "allowImportingTsExtensions": true, ... }
```

**它当场就抓到一个真问题**（这正是做这件事的理由）：
`tools/winget-verify.ts` 的 `runWinget` 返回 `Promise<unknown>`，下游
`r.out` / `r.code` / `r.err` / `{ expectedVersion }` 全是隐式 `any` ——
**字段名写错编译器不会响**。迁移后报 6 处 `TS2339/TS18046`，已补**显式接口**：

```ts
interface WingetRun { ok: boolean; code: number | string; out: string; err: string }
```

⇒ 一个「只是改扩展名」的迁移，**顺手把一处静默类型漏洞补上了**。

### 3. **不**给测试套加类型门（附实测依据，不是偷懒）

曾试 `tsconfig.tests.json`（`include: ["test/**/*.ts"]`），实测结果：**10 个文件 79 处类型错误**。
逐条看过后**决定不加**，理由：

- 报错集中在**故意喂畸形输入**的守卫测试上（`test/concept-guards-2.test.ts` 等）：
  它们的**目的**就是把 `{ status: "supported" }`（缺 8 个必填字段）、
  `boundary.identityExcluded: boolean`（类型要求字面量 `true`）这类**不合法形状**喂给守卫，
  断言守卫**拒绝**它。这模拟的正是运行时真实输入（LLM / 宿主 / 读进来的 JSON），
  **本来就是 ill-typed 的**。
- 给它们加类型门，唯一出路是满屏 `as any` —— 那会让测试从「证明守卫挡住脏数据」
  退化成「证明带 cast 的脏数据被挡住」，**削弱证据力**，而不是提高质量。
- ⇒ **类型门加在「本该类型正确」的面上（生产源码 + 工具），不加在「故意类型错误」的面上（守卫测试）。**
  这是一条可复用的判断，不是本轮的临时取舍。

（若将来测试拆成「守卫型 / 单元型」两类目录，可只对单元型加门。）

### 4. 文档与注释里的路径引用一并归一

`adr/0058`、`adr/0060`、`adr/0062`、`BACKLOG.md`、`CHANGELOG.md`、`CONTEXT.md`、
`core/toolset.ts`、`core/projection-store.ts`、`docs/toolchain-windows.md`、`tools/toolset-seed.json`
里的 `tools/*.mjs` 路径引用全部改为 `.ts`（**历史条目也改**：文件已不存在，
留旧路径就是文档漂移；改动本身记在本版本条目里，可追溯）。

### 5. `_research/` 下的本地探针脚本同样切到 `.ts`

用户说的是「所有 js/mjs 脚本」。`_research/` 虽**有意不纳入版本控制**，但它们是**在跑的脚本**，
故 6 个也一并改扩展名（`measure-metadata-leak` / `measure-metadata-quality` / `measure-path-visibility` /
`triage-a` / `migrate-to-ts` / `migrate-pass2`）。

## Alternatives Considered

| 备选 | 否决理由 |
|---|---|
| 保留 `.mjs`，只加 JSDoc 类型 | 不满足用户指令；且 JSDoc 类型不参与 `tsc` 门，等于没门 |
| 把 `tools/*.ts` 放进主 `tsconfig.json` 的 `include` | 主配置 `rootDir: "."` + `outDir: "dist"` 会**把工具编译进 `dist/tools/`**，改变包布局与 `files` 白名单语义。用独立 `noEmit` 配置更干净 |
| 用 `tsx` / `ts-node` / `esbuild` 跑工具 | 引入新依赖。**Node 26 原生 type-stripping 已够**（本机实测 `node x.ts` 直接跑通，含跨文件 `.ts` 导入） |
| 给测试套也加类型门 | 见 Decision §3：79 处错误里绝大多数是**故意的**；加门只能用 `as any` 消掉，反而削弱测试 |
| 把 `.mjs` 内容原样复制成 `.ts` 后逐步补类型 | 就是本 ADR 的做法（先只加**类型门报出来的**那些）。**不预先批量补类型** —— 没有门驱动时补类型是猜测，不是工程 |

## Consequences

### 正
- 仓库内**再无手写 `.js` / `.mjs` 脚本**（可机械核对：`Get-ChildItem -Recurse -Include *.js,*.mjs`
  在排除 `node_modules` / `dist` 后为空）。
- **工具面第一次有类型门**，且它第一次运行就抓到一个静默类型漏洞（`WingetRun`）。
- `node <file>.ts` 直跑，**零构建、零新依赖**，与测试套（`node test/*.test.ts`）**同一套机制**，
  概念负担不增反降。
- 文档路径引用与磁盘一致（16 个文件一并归一）。

### 负 / 已知边界
- **审计工具现在会扫到它自己**。`tools/*.ts` 由 `.mjs` 变成 `.ts` 后进入
  `tools/audit-wiring.ts` 的扫描语料（它按 `.ts` 后缀走），B 类线索 **81 → 85**。
  **新增的 4 条全部来自工具自身的字符状态机**（`c === "\\"`、`c2 === "*"` 这类**单字符局部别名比较**），
  正是 ADR-0062 已记录的噪声类型（「短局部变量别名」）。A 类 **30 → 30 不变**。
  ⇒ **计数变化有解释、已核对，不是新缺陷**。
- **测试套无类型门**（Decision §3 的理由）。故 `test/**/*.ts` 里的类型错误**不会被发现** ——
  这是**明知的取舍**，不是遗漏。
- `tsconfig.tools.json` 只覆盖 `tools/**`；`test/replay-*.ts` 两个回放脚本**不在任何类型门内**
  （它们在 `test/` 下，而测试面有意不加门）。⇒ 这两个脚本的 `.ts` 后缀**只带来语法检查，
  不带来类型检查**。诚实记录。
- type-stripping **只擦类型、不做类型检查**：`node x.ts` 跑得过**不代表**类型正确，
  必须靠 `npm run typecheck:tools`。**两条命令都跑才算过。**

## 自检

- [x] 满足用户指令：仓库内 `.js`/`.mjs` 脚本数 = **0**（机械核对，见 Consequences）。
- [x] 与 ADR-0062 一致：审计工具的**逻辑未改**（只改扩展名与导入说明符），标定测试仍 `ALL PASS ✅`。
- [x] 与 ADR-0058/0060 一致：核验器与评测器的**行为未改**（实测复跑：`--id jqlang.jq` → `status: ok`；
      `eval:retrieval` 复现同量级读数）。
- [x] **零新依赖**：仍只有 `typescript` + `@types/node`。
- [x] `npx tsc --noEmit`（生产）clean；`npm run typecheck:tools` clean；全套回归 **32/32**。
- [x] 迁移用脚本完成（`_research/migrate-to-ts.ts` + `migrate-pass2.ts`），可复核改了什么。
- [ ] **未做**：把 `typecheck:tools` 接入自动门禁（本仓无 CI，与 ADR-0062 的 V6 同一缺口）。
- [ ] **未做**：`test/replay-*.ts` 的类型门（见「负 / 已知边界」）。
