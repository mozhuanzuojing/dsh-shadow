# Changelog

> dsh-shadow 变更历史（Keep a Changelog）。语义化版本。
> **本文件自 v1.21.15 起只保留一份**：**每版覆盖、不追加**；tag **每版只留一个**（删旧建新）—— 口径见 `AGENTS.md`。

## [v1.21.47] 边界收口与测试可移植性：撤回 0106 的旧承诺、修 CRLF 恒红测试

### 1. 补的是什么洞

三处「说了没做到 / 做了却看不到」：

- **`adr/0106` §2 的承诺与实现不一致**：原文称 `tools/granularity-audit.ts` 会对「有旧日期树但没有 `atoms/`」
  判 **exit 2「迁移未做」**，并在 `atoms/` 旁边仍有旧树时于报文里加一行显式提示。实测**两条分支都不会触发** ——
  该门自 **2026-09-24 的用户口径「不考虑历史数据」**起只判 `.shadow/atoms/`，代码注释明写旧树「不扫、不报红、不报绿」。
- **一处测试在真机恒失败**：`test/preset-projection.test.ts` 的 ④b/⑤ 用 `prefix:\s*>-\n` 提取 persona 折叠块，
  而 `presets/projection.patch.yml` 在 **git blob 与工作副本里都是 CRLF**（实测 173/173）⇒ 断言拿到空串而红，
  与具体改动无关（对照实验：临时转 LF 即绿）。
- **`CONTEXT.md` 缺「存量旧树」的规范说法**：「日期树已废」这条只写在 ADR 里，术语层没有落点。

### 2. 做法与边界

| 项 | 处置 | 边界（写清防顺手扩大） |
|---|---|---|
| `adr/0106` §2 | **删除那两条承诺**，口径写死为「**本仓只支持新树**（`.shadow/atoms/`）」；末尾补记记录撤回理由与现行实现（`listMemories` 只枚举 `atoms/`、候选枚举器只留 `atoms`、该门只判 `atoms/`） | §1 三条禁令（不迁 / 不双读 / 不 shim）与 §4 Non-goals **一字未动** |
| `CONTEXT.md` | 新增术语行「**旧日期树（存量）**」：已废除布局 · 不进召回/候选/索引 · 盘上残留 = 静默不可见死数据 | 术语层只此一行；不动任何记忆数据 |
| 测试正则 | `>-\n` → `>-\r?\n`（两处同型：④b 与 ⑤） | **语义不变**：只容忍 CRLF，不是放宽断言；工作副本保持 CRLF，未做转码 |

### 3. 改了哪些文件

| 处 | 文件 | 改动 |
|---|---|---|
| ① | `CONTEXT.md` | 新增「旧日期树（存量）」术语行 |
| ② | `adr/0106-projection-space.md` | §2 删承诺 + 末尾补记 |
| ③ | `test/preset-projection.test.ts` | ④b/⑤ 正则 CRLF 容忍（2 处） |
| ④ | `package.json` · `pnpm-lock.yaml` | `@types/node` `^20.0.0` → `^26.6.3` |

### 4. 验证

| # | 检查项 | 手段 | 结果 |
|---|---|---|---|
| 1 | 全仓闸门 | `SHADOW_EVAL_ROOT=G:\project\dsh1 npm run verify` | **73/73 通过 · ALL PASS**（exit 0） |
| 2 | 该测试单独复验 | `node test/preset-projection.test.ts` | exit 0（工作副本仍 173/173 CRLF） |
| 3 | 文档门 | `npm run audit:docs` | 七项全绿（含「无越界引用」） |
| 4 | 语料根 | `G:\project\dsh1`（`atoms` **117** 条 ≥ 门限 100） | 不再假绿 |

### 5. 诚实标注

- 盘上旧日期树（本机 **4947** 个 `.md`）**仍在原地**：本版只撤回「检测/提示」的承诺，**既未迁移也未删除**；删留须另立决定。
- `core/view/projection-store.ts` 的 `DATE_DIR_NAME` 标着 `@deprecated`「保留符号以免外部误引用编译失败」——本次**未删**（删它会破坏外部 import）。
- CRLF 压力测试只覆盖那 **2 处**同型正则；其余测试未逐一验证 CRLF 容忍度。
- `@types/node` 的升级随本版一并落地；它此前长期以未提交状态留在本地。

### 当前状态
dsh-shadow 是 DSH 记忆插件：读侧 `shadow_query` / `read_shadow` / `recall_shadow`；写侧 `.shadow/atoms` + 保留期 / 失效 / 证据等级；
治理 = ADR 登记册 · 棘轮 · 引用门 · 文档一致性门 · 分层方向门 · 复杂度预算门 · 脚本语言门；唯一验证入口 `npm run verify`；
**发版唯一入口 `npm run release`（闸门在第一步）**；评测口径 = dev 切片（默认）/ 留出切片（报告，`--holdout-only`）。
- **下一批**：`recall_shadow` 是否纳入纪要/材料卡（**待你拍板**）；`T17-C` 默认值前置条件 ①；审计 ref 进 atom lineage。
- **仍等你**：`D2` 填可信根 · `6.3 待定语义` · 一份**冻结语料** · **重启桌面客户端**（重启后 `read_shadow` 等工具才出现、
  记忆采集才从 2026-09-29 17:51 恢复，纪要/材料卡也才会开始长）。
