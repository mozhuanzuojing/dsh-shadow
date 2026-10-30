# dsh-shadow 按日归档：Review（遗漏 / 冗余 / 因果颠倒）+ 竞品复核

- 日期：2026-10-30
- 范围：dsh-shadow `v2.5.0`（HEAD `0261831`），按日归档 + 删热文件 + archive 重建
- 方法：读源码 + **真实工作区执行** + 单元测试 + 官方文档/GitHub/X 复核
- 口径：**事实**＝可复现命令/源码/来源；**判断**＝推断；**未验证**＝未做真实并发/断电实验

## 0. 结论

> **修复状态（v2.6.0 / v2.7.0）**：P0-1/2/3/5/6/7 已修复并有测试；P0-4 路径映射已做 `archiveRel`（`atomDisplay`、decision/episode、DB enrich；`memoryRefs` 仍逻辑 rel）。P1 的 `.trash` 保留期、写路径触发、decision/episode 句柄已落地；真实多进程/断电故障注入与语义 compaction/候选预筛仍未做。

1. 有 **3 个可复现的数据安全缺陷**（P0）：
   - 跳过已归档日期时，会删除**未进入 archive 的迟到 atom**；
   - 同 rel/uid 但内容变了，会删除**新热文件**、archive 仍是旧内容；
   - `loadAllAtoms` 让 **archive 覆盖热文件**（热文件更新时读到旧内容）。
2. 有一个**产品语义断链**（P0）：删热文件后，`read_shadow`/episode/decision 返回的 `rel` 仍指向 `.shadow/atoms/...`，**路径句柄失效**；“可核查”承诺与行为不一致。
3. 有一个**失败放大**（P0）：DB 丢失 + 任一归档 JSONL 损坏 ⇒ `loadAllAtoms` 直接报错，**全部记忆读不出**；不符合“坏件 ≠ 空件、失败可见但不拖垮整体”的既有原则。
4. 有一个**因果/目标错位**（P0）：按日归档减少的是**文件数**，不是 `read_shadow` 的内存/解析量——读仍加载全部 915 条 atoms；如果目标是性能，应做候选预筛/语义 compaction，而不是只打包。
5. 竞品的共同做法是 **root index + 冷区原文保留 + 失效/压缩而非直接删路径**；我们做了“打包+删热文件”，但缺 **内容哈希校验、单条记录校验、路径重映射、失败隔离、原子 manifest**。

---

## 1. 现状与实测

| 项 | 值 |
|---|---|
| 归档前 | 906 atoms（158 @10-15 + 626 @10-16 + 129 @10-30 左右；随后会话新增） |
| 归档 | 2 个 JSONL（226 KB + 854 KB）+ 2 个 MD（19 KB + 90 KB）+ `_index.json`（46 KB） |
| 删除 | 784 个热文件 |
| 归档后 `.shadow/atoms` | **131**（只剩 2026-10-30） |
| 全量重建 | `loadAllAtoms` → **915** 条；第一次 `IndexCache.load` 回 fs 重建，第二次 `source=db` |
| `.shadow` | 1,934 → **1,164 文件**；14.2 → **15.0 MB**（JSONL 带完整字段 + MD） |
| 测试 | `npm run verify` 54/54，但**没有覆盖下面 3 个缺陷** |

---

## 2. 可复现缺陷（事实；以下为修复前输出，v2.6.0 已修复并加回归测试）

> v2.6.0 修复后：迟到 atom 会先补写 archive 再删；内容变化会重写 archive；`loadAllAtoms` 热优先；坏归档返回部分 + Signal。对应断言见 `test/unit/archive.test.ts`。

### P0-1 跳过已归档日期会删掉“迟到 atom”

`archiveDays` 在 manifest 命中时直接 `deletable.set(date, list)`（`src/store/archive.ts:269-281`），最终按**当前热文件列表**删除（`:366`），而不是按 archive 里实际存在的 rel 删除。

复现（MemoryFs）：

```text
先归档 2026-10-29 的 atom A（archive 只有 A）
再放入同日的 atom B（未归档）
archiveDays(..., deleteHot: true)
→ {"deleted":2,"skipped":["2026-10-29"],"archiveCount":1,"lateExists":false}
```

**B 被删除但从未进入 archive**。任何“补录/导入/跨午夜迟到”的旧日期 atom 都会中招。

### P0-2 同 rel/uid 内容变化不校验

跳过分支只信任 manifest；归档分支对已有 JSONL 只比较 **rel+uid 集合**（`archive.ts:301`），不比较 body/逐条 hash。随后删除热文件。

复现：

```text
archive 先写入 body="old"
热文件改成同 rel/uid、body="new"
archiveDays(..., deleteHot: true)
→ {"deleted":1,"skipped":["2026-10-29"],"archiveBody":"old","hotExists":false}
```

**新内容被删，archive 仍是旧内容**。memsearch 用 SHA-256 跳过未变内容（[README](https://github.com/zilliztech/memsearch)）；我们缺这个校验。

### P0-3 `loadAllAtoms` 归档覆盖热文件

`src/store/archive.ts:176-188`：先放热文件，再放归档，`byRel.set` 让 **archive 覆盖 hot**。

复现：热文件 `body="hot-new"`，archive `body="archive-old"` → `loadAllAtoms` 返回 `archive-old`。

### P0-4 删热文件后路径句柄失效

输出里大量 `rel` 直接来自 atom（`src/domain/views.ts:46-67`；`:160` 还渲染最后两段路径），删热文件后这些 `.shadow/atoms/...` 路径不存在。`read_shadow`/episode/decision 的“路径句柄 + 证据指针”承诺与磁盘事实不符；没有 `archiveRel`/虚拟路径映射。

### P0-5 单个坏归档阻断全部读

DB 丢失时 `loadAllAtoms` 对任一坏 JSONL 直接返回 `CORRUPT`（`archive.ts:176-188`），`IndexCache` 回退也返回该错误（`index-cache.ts:89`），`runRead` 直接返回错误。**一条冷归档损坏 = 全部记忆不可读**；与“坏件 ≠ 空件、失败可见但不拖垮整体”的既有原则冲突。

### P0-6 锁/ manifest 并发不安全（判断 + 源码）

- 锁按“日期”获取（`:284`），但 manifest 是**全局 read-modify-write**，锁外写（`:359`）；两个进程归档不同日期会丢 manifest 更新。
- 释放锁无条件 `unlink`（`:355`），没有 owner token；可能删掉别人刚写的锁。
- manifest 直接 `writeText`（`:359`），没有 temp+rename；POSIX `rename` 是原子替换（[POSIX rename](https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html)），但这里没用。
- Node 文档明确：`fs/promises` 的并发修改**不同步/非线程安全**，同一文件并发写可能损坏（[Node fs](https://nodejs.org/api/fs.html)）。

### P0-7 pinned/status 被忽略

`archiveDays` 只接收 `atoms`，不接收 meta；`AtomMeta.pinned` 存在，但归档/删除不检查。被用户 pin 的记忆仍会被删热文件（archive 保留，但“pin 不参与遗忘”的语义被绕过）。

### P0-8 只有无参 `read_shadow` 触发

`src/engine/read/route.ts:129-130` 仅在 `mode === "index"` 且 `deps.index` 时归档。只写不读的会话、只调 `shadow_query`/`search_code` 的会话不会触发，“只保留当日文件”不是硬保证。

---

## 3. 竞品/项目复核（摘要）

| 产品/项目 | 冷区/淘汰 | 索引/限制 | 对本次的启示 |
|---|---|---|---|
| **Claude Code auto memory** | `MEMORY.md` + topic 文件持久保留；session cleanup 不清 memory | `MEMORY.md` 只加载**前 200 行/25 KB**；topic 按需读；`CLAUDE.md` 单文件 **4 MiB** | 先索引后正文；不要把所有 atom 拉进每次读 |
| **agent-memory** | `archive/` append-only，**默认不在检索面**；`MEMORY.md` 一行一条常驻；sleep-time consolidation 带 cap/proposal | 文件是 truth，SQLite 可删重建；删除只以 proposal 出现 | 冷区保留但退出检索面；删除要谨慎/可审 |
| **memsearch** | `memsearch compact` 做 LLM 摘要；Milvus 可重建 shadow index | 3 层召回；**SHA-256 跳过未变内容**；Markdown source | 逐条内容哈希；分层检索 |
| **Graphiti / Zep** | 事实带 validity window；**失效但不删除**；episodes 保留 provenance | 语义+BM25+graph | 旧记忆应标失效/归档，不是直接断路径 |
| **GitHub Copilot Memory** | 默认 **90 天过期**（可配 7–180），upvote 才续期；downvote 后停用再删除 | 不是所有记忆都发送；citations 校验 | 过期/续期策略；不要“日切即删” |
| **A-MEM** | Zettelkasten 链接 + memory evolution | 新记忆更新旧记忆属性 | “整合”应是语义合并，不是拼 JSONL |
| **X / Karpathy** | context engineering：compacting 是手段；**too much/irrelevant → 成本升、性能降** | — | 支持“语义压缩/按需”而非“打包+全量读” |

来源：Claude Code <https://code.claude.com/docs/en/memory>；agent-memory <https://github.com/tigerless-labs/agent-memory>；memsearch <https://github.com/zilliztech/memsearch>；Graphiti <https://github.com/getzep/graphiti>；Copilot Memory <https://docs.github.com/en/copilot/concepts/prompting-and-context/copilot-memory>；A-MEM <https://arxiv.org/abs/2502.12110>；X <https://x.com/karpathy/status/1937902205765607626>；POSIX rename <https://pubs.opengroup.org/onlinepubs/9699919799/functions/rename.html>；SQLite WAL <https://sqlite.org/wal.html>；Node fs <https://nodejs.org/api/fs.html>。

---

## 4. 差异：我们做了什么、缺什么

| 维度 | 竞品 | dsh-shadow v2.5.0 | 差距 |
|---|---|---|---|
| 冷区原文 | 保留（archive/append-only） | 保留 JSONL | 方向对 |
| 索引先行 | MEMORY.md/topic 按需 | 仍 `loadAllAtoms` 全量进内存 | **缺候选预筛** |
| 删除策略 | 过期/投票/提案/失效 | **日切即删热文件** | 过于激进；缺 pin/状态 |
| 内容校验 | SHA-256/逐条引用 | 只比 rel+uid，整文件 hash | **缺逐条 hash** |
| 路径句柄 | 稳定存储/索引 | `rel` 指向已删文件 | **缺映射** |
| 失败隔离 | 单条坏件不影响整体 | 单坏归档阻断全部 | **缺降级** |
| 并发/原子 | WAL/rename/锁 | 按日期锁 + 直接写 manifest | **缺全局锁/原子替换** |
| “整合”语义 | compaction/merge/摘要 | **只是打包**（JSONL+导航 MD） | 若用户要“整合”，未实现 |
| 文件数 | — | 906→131 | 达成 |
| 磁盘 | — | 14.2→15.0 MB | 变差（JSONL+MD 复制） |

---

## 5. 遗漏 / 冗余 / 因果颠倒清单

### 遗漏（按严重度）

1. **P0-1 迟到 atom 被删**（复现见 §2）。
2. **P0-2 内容变化被旧 archive 覆盖**（复现见 §2）。
3. **P0-3 热/归档优先级反了**（复现见 §2）。
4. **P0-4 路径句柄断链**（`rel` 仍指 atoms；无 archive 映射）。
5. **P0-5 单坏归档阻断全读**。
6. **P0-6 锁/manifest 并发与原子性**（全局 manifest 在锁外写；锁无 owner；无 temp+rename/fsync）。
7. **P0-7 pinned/status 未参与归档**。
8. **P0-8 仅无参读触发**，写/查询路径不归档。
9. **IndexCache full 校验只查热文件**（`index-cache.ts:53-68`），不校验归档 body；DB 可为旧内容。
10. **Manifest `rels` 与 JSONL 实际内容无逐条校验**；`archivedIndex` 信任 manifest。
11. **无 `.trash`/恢复审计**；archive 是唯一冷副本，archive 损坏/误删即不可恢复。
12. **归档 MD 不是检索入口**（仅导航），未像 Claude `MEMORY.md` 参与召回。
13. **无单日大小上限**：626 atoms 已 854 KB；超活跃日可能数十 MB，JSONL 全量读重建会变慢。
14. **测试缺口**：迟到 atom、同 uid 内容变化、pin、坏归档部分失败、并发 manifest、断电/重启。
15. **`read_shadow`/`episode`/`decision` 的 `rel` 输出没有 archive 版本**；外部工具按路径读会失败。

### 冗余

1. **`forget.maxActive=2000` 与日归档重叠**：归档已删旧热文件，cap 仍按 DB 全部 atoms 计算并标 status；两套“移出活跃集”机制没有协调，cap 对文件数几乎无影响。
2. **三份存储**：atoms（归档前）/ JSONL / SQLite body；加 MD 摘要。磁盘 15 MB > 原 14.2 MB。
3. **`archivedIndex` 与 `loadAllAtoms` 都解析 archive**；可合并成一份索引/一次读取。
4. **MD 与 JSONL 摘要重复**；MD 可只存链接/标题，或按需生成。
5. **按日期锁 + 全局 manifest**：锁粒度与共享状态不匹配；要么全局锁，要么 manifest 分片（按日期文件）。
6. **删除后 `rel` 仍保留旧路径**：等于保留一个无法解析的句柄，属于“半迁移状态”。

### 因果颠倒

1. **“可核查/路径句柄” → 删文件**：路径承诺被删除打破；应改为 archive-aware 的 `rel` 或 `archiveRel`。
2. **“只保留当日文件” → 读仍全量 915 条**：文件数是降了，但 `read_shadow` 的内存/解析量没降；若目标是性能，因果链不成立，应做候选预筛/compaction。
3. **“整合存储” → 只是打包**：JSONL 是拼接，不是语义合并/摘要；若用户期望“整合”，当前实现未达成。
4. **“失败不阻塞读” → 单坏归档阻断全部**：错误处理与原则相反。
5. **“maxActive 控制体量” → 被归档删除抢先**：cap 主要变成 DB 状态标记，实际文件治理靠 archive；默认值 2000 的收益未验证。
6. **“IndexCache DB-first” → 归档内容不参与 full 校验**：DB 可能是旧归档内容而仍被当作权威。

---

## 6. 建议（按优先级）

### P0（先修，数据安全）

1. **删除只按 archive 实际 rel，并逐条 hash 校验**
   - 删除前：`archiveRels = manifest/JSONL 的 rel→sha256`；当前热 rel 必须全部在 archive 且 hash 相同；有额外热 rel ⇒ **不删**，先重新归档（或写 Signal）。
   - 同 rel/uid 内容变化：比较逐条 `sha256(JSON.stringify(atom))`，不一致就重写 archive，再删。
2. **`loadAllAtoms` 热优先**：先 archive 后 hot 覆盖，或显式 `if (!byRel.has(rel)) set`（热优先）。
3. **路径映射**：输出加 `archiveRel`/虚拟 `rel`；`read_shadow` 的 entry/路径解析支持 archive；`readAtom` 对归档 rel 回退 JSONL。
4. **失败隔离**：`loadAllAtoms` 收集坏归档为 `errors`，返回热+好归档，不整体失败；`read_shadow` 显示 partial Signal。
5. **锁/原子**：全局 run lock（owner token）；manifest 在锁内写；`writeText(tmp)` + `rename` 原子替换；必要时 fsync；释放只删自己的锁。
6. **pin/status**：归档前过滤 `meta.pinned`；`archived`/`compacted` 可归档，`pinned` 不删。

### P1

7. **触发点**：capture flush 后/跨日时也归档；不仅无参读。
8. **`.trash` 或保留期**：删除前移入 `.trash/<date>/`，N 天后再清；或至少保留一个可恢复窗口。
9. **archive 逐条 hash 存入 manifest**；`IndexCache` full 校验覆盖 archive。
10. **单日上限/压缩**：单日 JSONL 超阈值时 gzip 或分段；MD 可选。
11. **测试补齐**：上述 3 个复现 + pin + 坏归档 partial + 并发 manifest + 重启恢复。

### P2

12. **语义 compaction**（如果“整合”指融合）：按时间/主题聚类 → episode/abstract；原 atom 标 `compacted`，保留 provenance。
13. **候选预筛**：用索引列先选候选，再读正文；避免每次全量 915 条。
14. **月度 rollup**：按日 JSONL → 月归档，进一步减少文件数；保留日边界审计。

---

## 7. 未验证

- 真实多进程并发归档（本 review 用源码+单进程复现；未做双进程 race）。
- 断电/崩溃窗口（manifest 写、删除中途）未做故障注入。
- `.shadow` 15 MB 下的实际召回延迟未 benchmark；不能仅凭文件数下降宣称性能提升。
- archive JSONL 的逐条 hash 方案未实现，修复后需补测试。

## 8. 参考

见 §3 链接；另见 [RESEARCH-MEMORY-VOLUME-20261030.md](./RESEARCH-MEMORY-VOLUME-20261030.md)。
