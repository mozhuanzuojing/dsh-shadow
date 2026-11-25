# dsh-shadow v2 仓库约定

> 面向在本仓工作的 agent / 维护者。v1 的完整约定在 `docs/v1/AGENTS.md`（已冻结，不再适用）。

## 分支与版本

- `main` / `v2`：v2 重写；`legacy/v1` + tag `legacy-v1`：v1 冻结基线（`e755b32`）。
- 提交后推 `origin`；发版走 `npm run verify:release`（verify + release 门 + check:pack 安装形态门），
  再打 tag `v3.x.y` 指向发布提交、push，最后发 npm。ADR-0012 写的是「只发 git tag」，
  2026-11-25 起已实际发布到 npm（`dsh-shadow@3.0.13`），以本文件与 STATUS 为准。
- **npm 发布是 staged publishing**：`npm stage publish` 只是暂存，必须在 npmjs.com 上批准
  （2FA proof-of-presence）才上线；本机 token 只能暂存、`npm publish` 会报 `E_STAGE_REQUIRED`，
  `npm stage approve` 会报 `EOTP`（需要人）。首次发布会在 registry 留 `0.0.0-stage` 占位版本。
- 不修改 `legacy/v1` 分支；不删除 v1 归档。

## 构建与验证

- Node ≥ 26；TypeScript strict。运行时依赖只有三项，且都是**动态 import、缺件即降级**（不静默）：
  `web-tree-sitter@0.20.8` + `tree-sitter-wasms`（符号，ADR-0020）、`@huggingface/transformers`（本地神经向量，ADR-0022）。
  安装体积约 0.5 GB 主要来自 `onnxruntime-*`，属设计代价，不在发布时压缩。
- 构建：`npm run build`（clean + tsc，产物 `dist/`，不进 git）。
- 验证：`npm run verify`（自包含：typecheck + tools/tests 类型门 + 测试 + 结构门 + 文档门）。
- 语料基准：`npm run verify:corpus`（需要 `SHADOW_CORPUS`，Phase 2 落地）。
- 任何改源码后的下一步：`npm run verify`。

## 代码边界

```
src/contract/  ← 无依赖
src/domain/    ← contract
src/store/     ← contract, domain
src/engine/    ← contract, domain, store
src/surface/   ← 全部内层
src/index.ts   ← 组合根
```

- `contract` 不得 import 其他层；`domain` 不得 import store/engine/surface；`store` 不得 import engine/surface；`engine` 不得 import surface；任何层不得 import `index.ts`。
- `tools/audit-layers.ts` 是门；`test/unit/imports.test.ts` 守无环。

## 测试

- `test/unit/*.test.ts`：纯函数 / store / mode。
- `test/failure/*.test.ts`：失败注入（读失败、写失败）必须显式可见。
- `test/parity/*.test.ts`（Phase 2）：对 `fixtures/oracle-v1` 做 v1 parity。
- 跑单个：`node test/unit/read.test.ts`（先 `npm run build`；测试 import `dist/`）。

## 文档

- 当前态：`README.md` + `docs/v2/*.md`。v1 文档/ADR 在 `docs/v1/`，**只读冻结**。
- 能派生的数字写命令，不手写；当前态文档不写事故史。
- 引用源码优先符号名；必须写行号时标注版本。

## 脚本

- 一次性脚本一律 `.ts`，`node x.ts` 直跑；可复现的放 `tools/`，取证放仓外。
- 不提交真实个人 `.shadow` 语料；测试夹具只用合成/匿名数据。
