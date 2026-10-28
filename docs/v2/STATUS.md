# dsh-shadow v2 · 实施状态

> 更新：2026-10-28 · 分支 `v2` · 基线 `legacy/v1`（e755b32）
> 这是**当前实现**的状态，不是目标态；目标见 `ARCHITECTURE.md` / `PARITY.md` / `../adr/`。

## 已完成

### Phase 0 — 冻结与规格
- `legacy/v1` 分支 + tag `legacy-v1` 冻在 e755b32；v1 文档/ADR 归档到 `docs/v1/`。
- v1 oracle：`fixtures/oracle-v1/`（52 合成语料 + 20 查询 × 10 mode = 200 输出，可重放；v1 pin/sha 记录在 manifest）。
- v1 评审报告：`_reports/dsh-shadow-v1-review.html`；计划：`_reports/dsh-shadow-v2-plan.md`。

### Phase 1 — core 骨架
- `src/contract`（outcome/modes/config/paths/time/schema/types）
- `src/domain`（parse/rank/text/collect/views）
- `src/store`（fs port + memory fs、atoms、SQLite index、index cache）
- `src/engine/read`（10 core mode、budget/envelope、signals）
- `src/engine/write`（事件采集、事务化 flush、audit/consent）
- `src/surface`（4 工具 + schema 生成、workspace 解析）
- `src/index.ts` 薄 Cordis adapter（事件接线 + 工具注册 + systemPrompt）

### Phase 2 — 正确性/性能（部分）
- **宿主 fs**：生产走 `ctx.get("fs")`（HostFs），写入带会话 `sandboxPolicy`；缺 fs 服务显式不挂载，不回退 node:fs。只读会话不打开 SQLite。
- 原子唯一命名（`--uid6`）；同秒两会话不覆盖（测试）。
- flush 失败 pending 保留 + 重试 + Signal；同一 agent 串行、快照按 seq 消费（测试）。
- 写侧工作区：session id ≠ agent id 时按 agent cwd 解析；解析不出工作区拒绝落盘并留 Signal（测试）。
- 读 Outcome：目录/单文件读失败可见；空 ≠ 失败（测试）；修好后 sticky 信号清除（测试）。
- 未知 mode 显式错误 + 最近邻；lab mode 显式重定向（测试）。
- Signal 成功清除；query-log/hits 真实记录（e2e）；telemetry 写失败可见、hits 批量单事务。
- 无参读物化 `indexes/_index.md`（内容变化才写；e2e 断言）；截断段有「未返回」披露；材料卡/纪要/Episode/abstracts 尚未物化。
- 采集质量：goal 落 `> 目标：`；工具名不进材料；摘要确定性兜底（测试）。
- recovery 只核验被选中任务的 memoryRefs；context 有 200 atom 核验上限并披露（测试）。
- DB-first 读路径：SQLite 存 parsed JSON；1k warm 7ms/query 26ms；8k warm 67ms/query 106ms（`tools/corpus-bench.ts`）。
- 新鲜度：默认 token（文件名集合）；`index.verify:"full"` 比 size/mtime（测试）。
- v1 `_meta.json` 一次性导入 SQLite meta（只补缺，不覆盖新 hits）；坏件/读失败可见。
- 真实 v1 语料 dry-run：168 atoms / 0 parse failure / 754 旧日期树文件（`tools/migrate-v1.ts`）。
- topic parity：19 查询平均 Jaccard 0.890（阈值 0.85；偏差登记在 PARITY §4.3）。

### Phase 4/5 — 部分
- v2 当前态 7 份文档 + 12 ADR；`docs-check`/`audit-layers`/`verify` 自包含。
- `tools/migrate-v1.ts`：dry-run/copy(--apply)/in-place（备份 indexes + `_meta.json`，不删任何旧数据）。
- 20/20 测试通过；核心 schema 2,538 字符；`read_shadow` 12 参数。

## 未完成（按优先级）

1. **Phase 3 lab**：`packages/lab` + `shadow_lab({mode,input,write})` + 51 mode 适配（当前只做了重定向提示）。
2. **派生件物化**：材料卡/纪要/Episode/abstracts 的派生与缓存（当前只有 `_index.md` 落盘，其余在读时内存派生）。
3. **retention/forget/compact**：v2 配置已有，行为未接；Forget≠Delete 契约需在 v2 落地。
4. **shadow_toolset 真实台账**：当前显式报 unavailable；需移植目录/探测/审批安装。
5. **perf 门**：`corpus-bench` 目前是手动工具，未进 `verify`；需 1k/8k 预算断言。
6. **真实 DSH E2E**：只在 fake ctx + 真实临时目录跑过；WSL web profile 的 v2 安装/切换/回滚未做。
7. **发版**：`v2.0.0` tag、`npm pack` 内容核对、README/MIGRATION 最终校对。
8. **v1→v2 配置映射**：MIGRATION 写了映射表，`contract/config.ts` 尚未实现 v1 键兼容 warn。

## 关键数字（可重放）

```powershell
npm run verify                 # 20/20 + layers + docs
node tools/corpus-bench.ts 1000
node tools/corpus-bench.ts 8000
node tools/migrate-v1.ts --from fixtures\oracle-v1\corpus --dry-run
node test/parity/topic.test.ts
```

- 核心 schema：`read_shadow` 12 参数；4 工具合计 2,538 字符。
- 测试：20 文件/检查（unit + failure + parity + e2e）。
- 真实语料：168 atoms、0 解析失败（只读 dry-run；未 in-place）。
- 8k 合成：query 106ms（目标 ≤300ms）。

## 已知边界

- DB-first 默认按**文件名集合**判断新鲜度；原地改已有 atom 内容用 `index.verify:"full"`（size/mtime）或删 SQLite 重建。
- 读路径会写 telemetry（query-log/hits，默认开；`telemetry.*` 可关）；atoms 与 curated source 不改。
- 合成 oracle 的 topic 排序有 3 条已知偏差（q02/q07/q10），见 PARITY §4.3。


