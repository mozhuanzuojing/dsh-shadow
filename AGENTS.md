# dsh-shadow 项目约定（在本仓库内工作时适用）

本文件面向在 `dsh-shadow` 仓库内工作（改代码/改文档/改配置）的 agent 与协作者。

## 提交后必须推送

- 任何修改落成 `git commit` 后，**必须推送到 `origin/main`**，禁止只提交、不推送。
- 若本次新建了 tag，一并推送：`git push origin <当前分支> <tag>`（精确指定，避免 `--tags` 误推无关标签）。
- 例外（需说明原因）：用户明确说「先别推 / 只提交」；无 remote / detached HEAD；推送会带来多余副作用。

## 本仓库常用的构建与验证

- 构建：`npm run build`（= `tsc`）。`dist/` 由构建生成，改 `src` 后须重编译并保持 `dist` 与源码同步提交。
- 验证：仓库**没有配置 test runner**；用 `npx tsc --noEmit` + `npm run build`，再用现有 mock 测试兜底：
  `node test/recall-attribution.test.ts`（应输出 `ALL PASS ✅`）。
- 源码入口：`index.ts`（Cordis adapter）→ tsc → `dist/index.js`（DSH 加载编译后 JS）。
