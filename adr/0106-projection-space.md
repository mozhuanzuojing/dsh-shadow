# ADR-0106: 投影空间绿地切权威（多轴 · Role/Affaire · `.shadow/` 新布局）

- 状态：**已接受** · 随 `v1.21.0` 落地
- 决定日期：2026-09-23
- 关联：**ADR-0003**（Atom = source；投影可重建）· **ADR-0049**（缺件不静默）·
  **ADR-0104**（`subject` / soul curated）· grill-with-docs「投影空间」轮
- 定位：**存储与认知坐标宪法**。回答「投影空间权威落在哪、五轴是什么、Role/Affaire 怎么挂、soul 怎么写」。
- 触发：用户要立体多轴工作面压过日期树心智；旧数据一律不考虑 ⇒ **C2g 绿地**。

## 1. Context

此前权威语料是 `.shadow/<YYYY-MM-DD>/<date>--<HHMMSS>-….md`（日期树）。「投影 / 记忆树」术语把落盘树与认知模型绑死。
投影空间要求：**locus · when · soul · role · intent** 五轴寻址；Role 一等公民；Affaire 为袋；反思螺旋下 soul 写策略为 **H2∥H3gate**。

## 2. Decision

### 2.1 权威与根（C2g + L2）

- **权威** = 投影空间对象 + 五轴坐标；**不是**日期目录树。
- **根名**仍为 `.shadow/`（L2）。旧 `YYYY-MM-DD/` 记忆布局**不迁、不双读、不 shim**。

### 2.2 磁盘布局（D1∥D3）

| 路径 | 性质 |
|------|------|
| `.shadow/roles/<id>.md` | Role 卡（source） |
| `.shadow/atoms/<id>.md` | Memory Atom（source）；五轴在线索头 |
| `.shadow/affaires/<roleId>/<id>.md` | Affaire 容器卡（source）；成员 = atom id 指针（**A1**，不复制正文） |
| `.shadow/indexes/**` | 派生：`_index.md` · `index.sqlite` · `shadow-index/` · `abstracts/` 等 |

平行子树（`soul/` · `taste/` · `dream/` · `temporal/` · `resources/` · mode dump）**不是**投影空间语料权威；本轮不搬进 `atoms/`。

### 2.3 五轴（X2）

每条 Atom 线索头必须含非空：`locus` · `when` · `soul` · `role` · `intent`。缺任一轴 ⇒ **不上投影**（Atom 保留；ADR-0049）。

### 2.4 Role / Affaire（R2 · P1 · A1）

- Role = 一等卡；Affaire 挂在 Role 下。
- Affaire = 容器：列成员 atom id；正文只在 `atoms/`。

### 2.5 Soul 写（H2∥H3gate）

- 派生切片（identity timeline 等）可自动写。
- **核心** `soul.json` 可写，但必须经显式强闸（`writeSoulCore` + gate 令牌）；**普通 identity-advance 不得写核心**。

### 2.6 交付（R2）

新写入与最小可读召回切到上述布局；验证 `npm run verify`。

### 2.7 本版边界（审查后标定，避免因果颠倒）

| 声称 | 本版实际 | 刻意未做 |
|------|----------|----------|
| 缺轴不上投影 | 闸门校验**结构齐全**；flush 对 `soul`/`role` 填 **`"default"`** 等临时值使新 atom 可投影 | 不以「是否存在 Role 卡」否决投影；真实 Role 绑定另开刀 |
| Role/Affaire 一等 | 磁盘位 + 写 API + 源指纹；**0107 起**进小世界 **枚举** | `listMemories` / 召回排序 / sqlite `source` **仍不读**卡（**枚举 ≠ 进排序**）；采集不自动写卡 |
| abstracts「目录级」 | 按 atom 文件名 **when 日期桶** 写 `indexes/abstracts/<date>/` | 不是日期目录树回归 |
| 旧日期树 | 不迁、不双读、不 shim | 真机残留日期树 = **静默不可见死数据**（升级须人知；见 CHANGELOG v1.21.0） |

## 补记（v1.21.0 / ADR-0107）

读侧细节（规避滤 / 便利贴 / F2 / `raw` / hydrate 装载≠生效）→ **只在 ADR-0107**；本节边界表仍有效。

补记二（同日第二轮审查修复）：

- **旧树不检测、不提示 —— 原承诺已撤回（2026-10-06，用户指示）**：本仓**只支持新树**（`.shadow/atoms/`）。
  原「「升级须人知」现在有落地」那两条（`exit 2「迁移未做」` / 并存时显式提示）**删除**，理由与现行实现见文件末尾补记。
- **H3gate / Role / Affaire 卡写 API 本版无生产调用者**（`writeSoulCore` · `writeAffaireCard` 测试引用 0，`writeRoleCard` 仅测试）——
  它们是**已交付的接口**，不是已接通的通路；`README` 的措辞据此校正。闸门令牌用 `Symbol.for(...)`：
  **挡误调用，不挡蓄意绕过**（同进程内任何模块都能再取一次同名符号）。

## 3. Consequences

- `listMemories` / fingerprint / sqlite / flush / `_index` 路径全部改口到 `atoms/` · `indexes/`。
- 依赖日期树路径的测试与粒度门夹具同步改。
- CONTEXT：记忆树 = 根俗称；现行权威 = 投影空间。
- 读侧句柄与「下一步」文案必须指向 `indexes/_index.md`（不得再指根 `_index.md`）。

## 4. Non-goals

- 旧日期树迁移或只读兼容
- 新根名（曾议 L1）或 L3 单库权威
- 把 dream/temporal/全部 mode dump 并进 Affaire
- Role/Affaire 进召回与 sqlite source（另开决策）
- 以 `role !== "default"` 作为投影硬闸（须先有真实 Role 采集）

## 补记（2026-10-06）：撤回 §2「升级须人知」的代码承诺 —— 本仓只支持新树

§2 原写（已删）：「`tools/granularity-audit.ts` 对『有旧日期树但没有 `atoms/`』判 **exit 2『迁移未做』**；
`atoms/` 旁边仍有旧树时，通过报文里也带一行显式提示。」

**该承诺已按用户指示撤回。**本仓**只支持新树**（`.shadow/atoms/`）：

- **不检测**旧日期树、**不在报文里提示**、**不提供迁移或只读兼容** —— 与 §1 三条禁令（不迁 / 不双读 / 不 shim）及 §4 Non-goals 同向；
- **现行实现与之一致**：`tools/granularity-audit.ts` 只判 `.shadow/atoms/`，旧 `.shadow/<date>/` 明写「不扫、不因它报红、也不因它报绿」；
  `persistence/files.ts` 的 `listMemories` 只枚举 `.shadow/atoms/`（`atomsRel()`），目录不存在即空集；候选面同理（`core/candidate/sqlite.ts` 的枚举器只保留 `atoms`）；
- **盘上残留旧树 = 静默不可见死数据**（沿用 §1 原话），只作历史证据保留；删留须另立决定；
- 那批历史语料已在 **v1.19.1** 按 `adr/0097` §5.3 用 `tools/granularity-reclaim.ts --apply` 一次性回收。

⇒ 本次只动 §2 的这一处承诺（删除），§1 / §3 / §4 未动；规范术语见 `CONTEXT.md` 的「**旧日期树（存量）**」行。
