# dsh-shadow v2 · 工程约定

> 面向维护者。规则优先于习惯；违反规则要有可见理由。

## 1. 运行时与类型

- Node **≥26**（`mise.toml` 钉 26）；`package.json` `engines.node` 同步。
- TypeScript **strict**；`noEmit` 检查与 `tsc` 构建分开。
- 只写可擦除语法：`enum`、`namespace`、参数属性不用；相对导入带 `.ts`。
- 生产代码 import `./x.js`（`tsc` 发射约定）；`tools/` 直跑脚本互引写 `.ts`。

## 2. 构建与清理

```text
npm run build      # clean + tsc → dist/
npm run typecheck  # tsc --noEmit（插件面）
npm run typecheck:tools
npm run typecheck:tests
```

- `tsc` 不删旧产物；**先 clean 再 emit**。
- `dist/` 不进 git；宿主只加载 `dist/`。
- 手写 `tsc` 前先 `npm run clean`。

## 3. 测试分层

| 层 | 位置 | 允许 | 禁止 |
|---|---|---|---|
| unit | `test/unit/` | 纯函数、内存夹具 | fs、网络、宿主 |
| contract | `test/contract/` | 工具 schema、模式清单、错误码、信封 | 真实语料 |
| e2e | `test/e2e/` | 临时 `.shadow`、真实 store | 真实用户工作区 |
| corpus | `test/corpus/` | 冻结快照、检索基线 | 联网、LLM |

- 每个 test 文件独立进程运行；不共享全局注册表。
- 新增 mode / 参数 / 错误码必须同时加 contract 测试。
- 测试失败信息必须列出实际值；禁止空占位（如 `缺 ${""}`）。

## 4. 验证：三条命令

```text
npm run verify          # 自包含：build + typecheck + contract + unit + e2e(fake)
npm run verify:corpus   # 冻结语料：retrieval baseline + granularity + ratchet
npm run verify:release  # 发版闸门：verify + 版本三处 + tag/推送校验
```

- `verify` 不联网、不读用户 `.shadow`、不依赖 `node_modules` 之外的状态。
- `verify:corpus` 必须显式声明语料根（`SHADOW_EVAL_ROOT`）；缺根 **exit 2**，不是通过。
- 任何门失败即停；禁止 `--skip`。

## 5. 发版

```text
npm run release
```

顺序：三方版本一致 → `verify:release` → `git add/commit` → 删旧 tag → 打新 tag → 推分支与 tag → 打印 `HEAD` 与 `tag→sha`。

- 版本只改三处：`package.json`、`README.md` 当前版本行、`CHANGELOG.md` 首条。
- 不使用 `--force` / `--tags`；tag 指向发布提交。
- 发布后核对：`git rev-parse --short vX.Y.Z` = `HEAD`。

## 6. 脚本

- 一律 `.ts`；禁止手写 `.js` / `.mjs` / `.cjs`（`dist/` 除外）。
- 一次性探针用完删除；可复现的进 `tools/`，当时取证进仓外证据目录。
- 脚本要打印口径（根、排除表、时刻），不只打印结论。

## 7. 引用纪律

- 当前态文档（`README` / `docs/v2` / 未冻结 ADR）**优先符号名**，不写行号。
- 归档层（`CHANGELOG` / 冻结 ADR）不改正文，只加勘误指针。
- 引外部材料写 `<材料>@<sha> + 符号名`；不写裸行号。
- 不做全仓批量刷新行号。

## 8. 文档 ownership

| 文档 | 拥有 | 不拥有 |
|---|---|---|
| `README.md` | 定位、安装、3 个核心工具、最短验证 | 架构、决策理由 |
| `docs/v2/ARCHITECTURE.md` | 分层、数据流、存储布局、并发/失败 | 使用教程 |
| `docs/v2/PARITY.md` | v2 验收基线与硬契约 | 教程与迁移步骤 |
| `docs/v2/CONVENTIONS.md` | 工程规则与本文件 | 产品行为 |
| `docs/v2/MIGRATION.md` | v1→v2 映射、回滚 | 长期设计 |
| `docs/v2/LAB.md` | `shadow_lab` 用法与 51 mode 分组 | 内部实现 |
| `adr/` | 决策与理由 | 状态流水账 |
| `CHANGELOG.md` | 当前版本变更 | 当前状态 |

## 9. 数字与生成物

- 能派生的数字（mode 数、参数数、配置键数、表行数）**不手写**；写命令或生成器。
- 生成物：`docs/gen/modes.md`、`docs/gen/config.md`、`docs/gen/modules.md`；`verify` 检查“重新生成无 diff”。
- 文档预算：`README` ≤12KB、`AGENTS` ≤10KB、`ARCHITECTURE` ≤150 行、`LAB` ≤120 行；超限先删，不加。
- 提交信息用 Conventional Commits；一次提交只做一件事。
