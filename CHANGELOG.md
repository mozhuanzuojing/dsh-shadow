# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.22] `T2` 结项：B 类 93 条**全部定性**（0 条确证断线）+ 另立 `T25`

**台账与判定面；无产品行为改动**。

### `T2` 结项（这是本会话最大的一条台账项）
第二批取证把 `④` 的剩余字面量一次证完（**`return` / 三元 / 数组 / 映射表都算生产者**）：
- **有生产者（工具的**形态**盲区）**：`expired`（`validate.ts:30` 三元）· `revoked`（`lifecycle-guard.ts:9` return）·
  `metadata`（`episode.ts:122` return）· `L2`（`rank.ts:141` return）· `mem`（`util.ts:38` 默认值）·
  `exists`（`filesystem.ts:40/44` return）· `citation`/`conclusion`（`resource.ts:36-37` **映射表**）·
  `reject`（`proposal.ts:87` **数组**）· `known-at-time`（`observer/core.ts:16` 三元）。
- **外部来源 ⇒ 分支可达**：`aborted`（**模型流** `chunk.reason?.kind`）· `historical`（传播**入参**）。
- **已判定的死支**：`session`（`ADR-0063` 实测「永不可达」）。
- **⚠ 唯一候选真断线 ⇒ 已另立 `T25`**：`status=compared|explored` —— `SimulationStatus` **只有类型与读取、找不到生产者**；
  与台账 **§7.3「`simulation/` 本轮未修」吻合**（互为旁证）。

⇒ **`T2` 的净结论**：B 类 93 条**没有一条确证的产品断线**；`audit-wiring` 的 B 类精度问题集中在
**「按 `字段=字面量` 单行窗口找写入者」这一判据形态** —— 生产者只要写在 `return` / 三元 / 数组 / 映射表 / **别的文件**里，它就看不见。

### 本会话的另一处方法论留痕（写给后来者）
本轮为了判 B 类，我先写了个「找写侧」的探针，**第一版把 `=== "lit"` 的 `=` 当成赋值**、示例行本身就是读 ⇒
修正后才得到上面的结论。**判据错了，读数再多也是假的**（本仓「工具必须先标定再用」的又一实例）。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 脚本语言门；唯一验证入口 `npm run verify`。
- **下一批**：`T25`（simulation 生产者）→ `T6` / `T9` / `T11` / `T13` 后半 / `T17-C` / `T18` / `T21`。
- **仍等你**：`D2` 填可信根（只有人能加）· `6.3 待定语义`（明写「不修，需先拍板」）。
