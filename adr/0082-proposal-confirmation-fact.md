# ADR-0082: Proposal → Confirmation → Fact（**Inference is cheap; facts are expensive.**）

- 状态：**已接受并冻结边界**（2026-09-12，用户明确选 A 并要求升为通用纪律）
- 关联：`adr/0081`（M1 决策→结果→经验，本原语的第一个使用者）· `adr/0037`（Reason 绝不生成）· `adr/0003`（派生件不是 source）· **ADR-0049**（缺件不静默）· **ADR-0059**（不把语义裁决交给 LLM/相似度）· `adr/0080`（阈值不可达的量化证明）
- 定位：**T15 Registry 的第 2 条真契约**，也是**所有 Memory Intelligence 能力的共同架构纪律**（不只 M1）

## 1. Context：这条边界是被一次具体争议逼出来的

M1 讨论「决策的结果从哪里来」时，用户先选了「允许 LLM 判断归属」，我提出异议（四条：不可复现 ⇒ 会打在 V6/V7 刚做可信的验证层；
不可审计；精度上界已被量过 —— `adr/0080` AUROC 0.5926 / precision 上限 0.667；与 `adr/0037`「Reason 绝不生成」冲突 —— **归属比理由更强**，它在断言因果）。
用户接受异议并**把结论推广**：

> **「LLM 可以提高『发现候选』的召回率，但不能提高『事实』的权威性。」**
> **「只有 FACT 可以改变系统的认知统计；CANDIDATE 只能改变『待确认候选』的统计。」**

⇒ 需要一个**通用原语**，而不是 M1 的特殊处理。

## 2. Decision：单一升级路径

```text
                 Inference（廉价、可海量）
                        │
                        ↓
                   Proposal（候选层）
                        │
                   Confirmation（显式确认）
                        │
                        ↓
                     Fact（事实层，受契约保护）
                        │
        ┌───────────────┼───────────────┐
        ↓               ↓               ↓
     Pattern           M5 统计        棘轮/门禁
```

**两条写入路径，只有这两条能产出 Fact：**

1. **显式外部来源**：用户明说 / 工具 / CI 的观察（`source` 必填且**不得**为模型）；
2. **确定性规则**：同入口 + 时间窗这类**不看语义**的规则。

**Proposal 只能走「提议 → 确认」这条路**，且 `model-proposal` **永不直接进 Fact**。

### 2.1 硬禁令（六条，全部写进契约的 `forbidden changes`）

`proposal` **不得**参与：

```text
❌ Pattern count          ❌ influenced_decision        ❌ confidence
❌ ratchet baseline       ❌ knowledge fact             ❌ identity
```

> **汇总成一句（用户原话，作为本 ADR 的核心不变量）**：
> **只有 FACT 可以改变系统的认知统计；CANDIDATE 只能改变「待确认候选」的统计。**

**Proposal 唯一可以参与的统计**（目的＝**评估模型能力**，不是修改世界状态）：

```text
candidate coverage · proposal acceptance rate · proposal rejection rate
```

### 2.2 Proposal 必须自带「基于什么提议」（缺一不得入库）

```yaml
proposal:
  source: model-proposal
  model: <模型标识>
  prompt_version: <提示词版本>
  input_refs:                     # 可审计的输入引用
    - file:line
    - file:line
  proposed_relation: <它提议的关系/归属>
```

**为什么必填**：即使 proposal 本身不是事实，也要能回答「**模型为什么会提出这个候选**」——
没有 `input_refs`，proposal 连**被复核**的资格都没有（与 `audit-wiring` 的「线索必须带 `文件:行号`」同一纪律）。

### 2.3 升级必须留下链（不得 `proposal → fact` 直接跳）

```text
proposal P ──confirmed_by──→ confirmation C ──→ Fact F
```

**完整 lineage**：`原始证据 → LLM proposal → 人工确认 → Fact → Pattern → Future recall`。
三段**都可追溯**：`P` 指向它的输入引用，`C` 指向谁/何时确认，`F` 指向 `C`（**没有 C 的 F 不存在**）。

### 2.4 通用化：同样的原语覆盖五类提议

```text
Proposal ├── subject proposal
         ├── relation proposal
         ├── outcome proposal      ← M1 用这一类
         ├── pattern proposal
         └── knowledge proposal
```
**升级路径永远只有一条**：`Proposal → Confirmation → Fact`。**不得为任何一类开直通口。**

## 3. M1 的两条配套纪律（用户补充，一并冻结）

### 3.1 `subject` = `explicit` + `deterministic-normalized`，**不得演化成语义实体消解**

- **只接受显式提供**；未提供即 `未指定`，**绝不从文本推断**。
- 规范化只允许**确定性规则 + 白名单**（大小写/别名表），**禁止 embedding 相似度**。
- **理由（用户原话的逻辑）**：若用相似度把 A、B「吸」到同一 subject，**Pattern 的统计量会虚假变高**，
  而「Pattern 的质量上限会被 **subject resolution 的错误率**锁死」—— 这是**隐蔽**的污染（数字看起来更好）。
- ⇒ `subject resolution` **不得**成为 semantic entity resolution；本 ADR 明确**关闭**这条演化路径。

### 3.2 `pending` 年龄用于**暴露风险**，**不得**用于替系统改变事实状态

- 不设结算窗口（用户决定）；但读数**必须**印：`pending` 条数 + 年龄分布（<7d / 7–30d / 30–90d / ≥90d）+ **最老一条**。
- 可加一个**轻量派生指标** `pending_age_p90`（derived），用于把 `pending` 分成
  「正常等待 / 长期积压 / 疑似永不结算」三档。
- **硬边界**：**不得**设置自动结算阈值 —— **年龄只暴露风险，不改变状态**（与「不设窗口」自洽）。

## 4. 按 T15 Registry 十字段填写（第 2 条真条目）

| 字段 | 值 |
|---|---|
| **id** | `proposal-confirmation-fact-v1` |
| **surface** | 落盘格式（proposal/confirmation 的 `> ` 行或独立文件段）+ 工具 schema（确认入口）+ 派生视图（候选视图 vs 事实视图） |
| **owner** | **候选层归「产生它的能力」**（M1 归 `observer/`）；**事实层的写入权归 Confirmation 的拥有者**（人 / 工具 / CI）；`dream/` 已有候选先例可复用其不进主路径的机制 |
| **semantic meaning** | 「**模型可以提议任何东西；只有被确认的东西才算事实**」。proposal 的存在**不表示**任何事实成立。 |
| **stability** | `hard`：单一升级路径 + 六条禁令 + `input_refs` 必填；`soft`：字段名与落盘行格式 |
| **allowed changes** | `additive`：新增 proposal 类别；新增确认来源类型（但**不得**新增直通口） |
| **forbidden changes** | ① proposal 参与任何认知统计（六条）；② 跳过 Confirmation 写 Fact；③ proposal 缺 `input_refs` 入库；④ 用相似度/embedding 做 subject 或归属的**消解**；⑤ 用年龄**自动**改变状态 |
| **evidence** | `adr/0037:29-42`（Reason 绝不生成）· `world/guard/relation-guard.ts:18`（world 状态永不 `fact`）· `dream/`（候选不进主路径的现成先例）· `adr/0080`（语义判断精度上界）· `adr/0049`（缺件不静默） |
| **verification**（**待建，含负例**） | ① **负例**：让 proposal 计入 Pattern 计数 ⇒ 必须失败；② **负例**：缺 `input_refs` 的 proposal 入库 ⇒ 必须拒收；③ **负例**：无 `confirmation` 的 `DecisionOutcome` 出现在事实视图 ⇒ 必须失败；④ **正例**：`confirmation` 后 lineage 三段可追（P→C→F）；⑤ `pending_age_p90` 为 derived、**不写回状态** |
| **ratchet** | **待建桶**：`proposal_coverage` / `acceptance_rate` / `rejection_rate`（**这三项可以进棘轮**，因为它们度量的是**模型能力**而非世界状态）；事实层桶沿用现有两道门 |

## 5. 与两条泳道的关系（主干）

```text
Memory → Evidence → Inference → Confirmation → Knowledge
```

- 这是用户指定的 **M1 → M3 → M5 主干**：`Inference` 廉价（模型可海量提议），`Confirmation` 是唯一闸口，`Knowledge` 才可被统计与回召。
- **泳道位置**：本原语属 🧠 Memory Track 的**第 0 项（P1）**，**先于 M1** —— M1 是它的第一个使用者。
- **不新增横向功能**：它**没有**给系统加任何能力，只是**给「什么算事实」定了一条不可绕过的路径**。

## 6. 未决（不脑补）

1. **Confirmation 的载体**：人工确认走哪个既有入口（`read_shadow` 的新 mode？还是一个独立的 confirm 工具？）——**待定**。
2. **`prompt_version` 的记录方式**：手写常量还是从提示词文件哈希派生？——**待定**（倾向前者，简单且可 diff）。
3. **`pending_age_p90` 的窗口**：全部 pending 还是仅近 N 天？——**待定**（实现时给一个可解释默认并走 config）。
4. **proposal 的存储位置**：与记忆同目录（加前缀区分）还是独立区？——**待定**；无论哪种，**都不得进入 `listMemories` 的语料**（否则候选会污染召回 —— 这与 ADR-0075 的 `_` 前缀纪律同族）。
