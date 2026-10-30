# ADR-0023: 去掉功能开关——所有功能始终启用

- 状态：**accepted**
- 日期：2026-10-30
- 关联：ADR-0018（auto-recall）、ADR-0020（tree-sitter）、ADR-0021（代码索引）、ADR-0022（内置向量）
- 定位：用户明确要求「功能必然是全部启用的，删除开关；其他类似的也全部启用，不要开关」。

## Context

之前为“渐进上线/省成本”保留了一组 `enabled` 开关：
- `lab.enabled`（默认 false）
- `toolset.enabled`（默认 true）
- `autoRecall.enabled`（默认 false）
- `codeSearch.index.enabled`（默认 true）
- `codeSearch.embedding.enabled`（默认 true）

结果是同一份代码在不同配置下行为不同、文档要写两套、测试要覆盖开关组合，且用户实际希望“能力都开”。

## Decision

1. **删除上述 `enabled` 开关**，功能始终启用：
   - `shadow_lab` 始终注册；
   - `shadow_toolset` 始终注册；
   - auto-recall 始终每步尝试注入（仍受 `autoRecall.limit` 预算约束）；
   - Cursor 式代码索引始终启用（失败自动回退实时扫描，不静默）；
   - 向量检索始终启用（`provider: auto|local|http` 是“用哪种”，不是开关）。
2. **保留的布尔配置不是“功能开关”**：`capture.consent`（隐私同意）、`telemetry.queryLog/hits`（本地遥测）、`recall.lossDisclosure`（披露）——它们控制隐私/展示而非功能可用性。
3. **旧配置兼容**：`toolset/lab/*.enabled` 现在作为**未知配置键告警**（normalizeConfig warnings），但**不能关闭任何功能**；adapter 不再读取它们。
4. 文档/README/STATUS/CHANGELOG 同步：不再出现“默认关/需要开启”。

## Consequences

- 正：行为唯一、无组合状态；用户开箱即得全部能力；测试不再需要开关矩阵。
- 负：lab（1 个工具、51 mode）常驻工具面；auto-recall 每步注入（受 limit 硬预算）；首次 `search_code` 会建代码索引与向量索引（成本可见、可删重建）。
- 回滚方式：删除 `.shadow/indexes` 可重建；如确需临时关闭某能力，只能改代码（不再提供配置开关）。

## 验证

- `test/e2e/toolset-config.test.ts`：默认注册 7 工具（core 6 + lab 1）；旧 `enabled:false` 仍在但不再能关闭功能；旧键只产生未知键 warning；
- `test/e2e/plugin.test.ts`：无 `lab.enabled` 也注册 `shadow_lab`；
- 全量 `npm run verify` 见提交记录。
