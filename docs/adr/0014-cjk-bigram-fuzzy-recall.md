# ADR-0014: 中文查询的宽松兜底召回（CJK 2-gram / BM25）

- 状态：accepted（v2.2 未发版；随 v2 分支提交）
- 日期：2026-10-30
- 关联：ADR-0002（atoms 权威 + 派生索引）、ADR-0007（预算/信封）、PARITY §4.2/§4.3
- 定位：回答「用户把一句话（如『后端工程入口是 X』）说进记忆后，下次换个说法查询还能不能找回来」。

## Context

- 存储侧已满足：用户原话以 `用户：<全文>` 落在 `.shadow/atoms/*.md` 的正文里（实测 atom 保留全量；助手回复 600 字截断）。
- 检索侧是**字面子串**：`src/domain/text.ts` 的 `tokenize` 只按空白/标点切，中文不分词；`src/domain/rank.ts` 的 `scoreMemory` 用 `body.includes(token)` 打分。
- 后果（实测）：原文「后端工程入口是 src/server/index.ts」，
  - `read_shadow("后端工程入口")` / 路径原样 → 命中；
  - `read_shadow("后端入口在哪")`、`read_shadow("找一下后端服务的入口")` → **score=0、未找到**（因为「后端入口」不是「后端工程入口」的连续子串）。
- 硬约束：本仓明确不引向量库、不跑常驻服务（ADR-0001/0002）。不能靠语义/embedding。

## Decision

1. **atom 级宽松兜底用 BM25**（新增 `src/domain/bm25.ts`）：term = 拉丁词 + 中文连续段 2-gram（去停用 bigram，复用 `rank.ts` 的 `cjkBigrams`/`STOP_BIGRAMS`），`bm25Rank` 按 IDF×TF 排序；命中「≥2 个不同 term」才进候选。中文不分词问题由 2-gram 解决，并用 IDF 压常见 bigram。
2. **task 级兜底用 2-gram 覆盖率**（`domain/views.ts` 的 `rankTasks`：仅当所有任务严格分为 0 时启用）。
3. **只在严格匹配整体零结果时启用**（`engine/read/modes.ts` 的 `topicView`/`queryView` 第二遍）：严格命中路径与排序一字不改 ⇒ parity 的 19 条既有命中不受影响（实测 avg Jaccard 仍 0.890）。
3. 输出**显式标注**：「> 宽松匹配（字形近似，非语义；严格无结果时兜底，引用前先核对原文）」。
   宽松匹配不是语义结论，不得据此宣称「已验证」。

## Consequences

- **正**：中文短/中句改写（「后端入口在哪」「后端服务入口」「找一下后端服务的入口」）现在能找回原 atom；无关查询（「完全不存在主题zzz」）仍「未找到」。
- **负/边界**：这是**字面近似**，不是语义；同义但字面无 2-gram 重叠（如「服务端起点」vs「后端工程入口」）、翻译（`backend entry`）仍可能不中。跨工作区（`.shadow` 按 cwd 解析）仍读不到；仍需 agent 主动调用工具。
- **噪声面**：兜底只放宽召回，可能带回字面相近但语义无关的记忆 —— 已用「宽松匹配」横幅与「非语义」措辞披露，不做静默。

## Non-goals

- 不做向量/embedding 召回，不引任何外部检索依赖。
- 不改写 atoms，不改写既有严格排序，不改变「无命中」语义在**真正无关**查询上的行为。
- 不解决「跨工作区」与「agent 不调用工具」两个缺口（那是 scope 与行为层，另议）。
