# ADR-0038: npm 发布（staged publishing）与 DSH 兼容口径

- 状态：**已接受**
- 日期：2026-11-25
- 关联：ADR-0012（发版与版本策略，部分被本 ADR 取代）、`package.json` 的 `engines` / `dsh` 字段、`tools/release-check.ts`、`tools/check-pack-loadable.ts`
- 定位：回答两件事——「包到底怎么发上 npm」「插件声明支持哪个 DSH 版本才算数」。

## Context

- `dsh-shadow@3.0.13` 于 2026-11-25 首次发布到 npm（`latest`），但过程中暴露两处口径问题：
  1. **发布路径不是 `npm publish`**。本机 token 只能暂存：`npm publish` 报 `E_STAGE_REQUIRED`，
     `npm stage publish` 成功，`npm stage approve` 报 `EOTP`——必须在 npmjs.com 完成 2FA proof-of-presence
     才真正上线（实测：暂存 01:47、网页批准后 01:56 上线）。首次发布会留下 `0.0.0-stage` 占位版本。
  2. **兼容声明不可信**。`package.json` 写 `engines.dsh: ">=0.2.2-rc.2"`，本机 DSH 实际是 `0.2.2-rc.5`；
     同时 `dsh-remote-wsl` 声明了 `dsh.compatibility.dshReleases`，但该字段在安装态里**没有任何代码读它**。

## 证据

| 事实 | 取证方式 |
|---|---|
| 本机 DSH = 0.2.2-rc.5 | `resources/app.asar/dsh/package.json` 的 `version` 与全部 `@deepseek-ai/dsh-*` 依赖 |
| `engines.dsh` 会被校验 | 安装态 `app.asar` 内 `engines.dsh` 命中 2 处；`plugin_manager` 的返回 schema 明确有 `incompatible-version`，说明文字为「Only the requirements the running version does not satisfy, keyed `engines.dsh` or by DSH peer package name」 |
| `dsh.compatibility` / `dshReleases` **不生效** | 安装态 `app.asar` 内 `dsh.compatibility` 命中 **0**、`dshReleases` 命中 **0** |
| 发布必须人工批准 | `npm publish` → `E_STAGE_REQUIRED`；`npm stage approve` → `EOTP`；registry `time` 显示暂存 01:47:46、正式版 01:56:51 |

## Decision

1. **兼容口径以 `engines.dsh` 为准**，取**实际验证过的 DSH 版本**作为下限：当前 `>=0.2.2-rc.5`。
   不声明 `dsh.compatibility.dshReleases`——它是无效字段，写了只会让人误以为有额外保障。
2. **发版顺序固定为**：改版本 + 写 CHANGELOG 小节 → `npm run verify:release`（verify + release 门 +
   `check:pack` 安装形态）→ 提交 → `git tag vX.Y.Z` 指向发布提交 → push → `npm stage publish` →
   在 npmjs.com 批准 → 验证（`npm view` 直查 registry + 从 registry 装一次并 `import`）。
3. **发布证据必须落盘**：至少记录 tarball `shasum`（与过门产物一致）、registry `time`、装后 `import` 结果。
4. **CHANGELOG 是发版的一部分**：每个版本一节；漏掉的版本按 tag 间提交主题回溯补齐，并标注「账本非验收证据」。

## Consequences

- 正：兼容声明与实际一致，宿主不会在低版本上装出一个「看起来能用」的插件；发布路径与证据固定，换人或换机器可复现。
- 负 / 边界：
  - 每次发版都需要**人在 npmjs.com 做一次 2FA**，没有 CI 自动发布；
  - npm 的 semver 对预发布版本有陷阱：`>=0.2.2-rc.5` 能匹配 `0.2.2-rc.6`，但**不匹配** `0.2.3-rc.1`
    这类不同 `major.minor.patch` 的预发布版——DSH 一旦跳版，必须同步抬 `engines.dsh`，否则会被判 `incompatible-version`；
  - 首次发布留下的 `0.0.0-stage` 占位版本无法删除（npm 不允许删版本），只能忽略。

## Non-goals

- 不在未绑定 npm 包设置的情况下写死 `.github/workflows/publish.yml`（OIDC Trusted Publishing 需要包侧配置，
  未验证前不放进仓库冒充「已自动化」）。
- 不为了变瘦而拆运行时依赖（那是 ADR-0013 / ADR-0022 的取舍，本 ADR 不涉及）。
