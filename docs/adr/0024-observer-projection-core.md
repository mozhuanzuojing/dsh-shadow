# ADR-0024: Observer 为中心的投影核心（路 B）——从「检索点」到「整全→面→点」

- 状态：accepted（2026-11-17；依据用户「路 B 激进」的持续指令把投影核升为核心读能力。本条 supersede ADR-0001/0006/0050 中「`project` 移入 lab」的部分，以及 PARITY `B5` 的对应条目）
- 日期：2026-11-17
- 关联：ADR-0002（存储决策保留、措辞需重述）、ADR-0005（部分 supersede：最小 Observer 核回 core）、ADR-0007（信封/预算沿用）、ADR-0004（Outcome/可见降级沿用）、CONTRACT C1–C7
- 定位：回答「dsh-shadow 的中心是什么」——不是 atom 存储、不是检索，而是「Observer 观察到的整全 → 投影出面 → 落到点」。本条决定把 v1 的 Observer/投影链的**最小核**从 lab 提回 core，并纠正 v2「文件即权威、能记下即可」的定位错位。

## Context

可复核的事实：

1. **v2 现核心读路径是「检索」，不是「投影」**：`engine/read/route.ts` 的流程是「载入全部 atoms → 按 mode 分派到 `engine/read/modes.ts` 的各个 view → 预算/信封」。没有任何 Observer / lens / distortion 参与。
2. **Observer / 投影链全在 lab**：`lab/run.ts` 的 51 个 mode 分派到 `lab/vendor/query/observer-kernel.ts`、`reality-model.ts`、`federation.ts` 等 vendored v1 实现；核心 `engine/`、`domain/`、`store/` 里没有 Observer。
3. **坐标是空壳**：atom 的坐标 `axes.soul / role / intent` 在写侧恒填 `default`（`engine/write/atom-text.ts`），读侧也不消费——「五轴投影」目前只是一个字符串标签。
4. **可保留的资产**：`CONTRACT.md` 的 C1–C6 已把 v1 的「可核查 / 完整线索 / 不越权」翻成可验收条款，与「灵魂」不冲突，是路 B 的地基而非包袱。
5. **用户本体（2026-11-17）**：人做事是一团无边的意识（整全）；做事只是其中一个面；dsh 里的交流只是几个点。系统要能**从点还原出那个面，并诚实标出它看不到的整全（盲区）**。

问题：v2 把「文件即权威 / atoms 是唯一权威 / 能记下即可」当卖点，把 v1 那句「**Memory 不是中心，Observer 才是中心**」读反了——把**投影面**当成了权威，产品从「投影记忆」退化成「检索日志」。

## Decision

**本体（MUST 采用三层）**

```
整全  Observer 的视角 + 它看不到的部分（distortion / blind spot）
  ↑
  面  Projection：把若干点组装成「这件事」（episode / task / affaire / 材料卡）
  ↑
  点  Atom：不可变的最小记忆（证据）
```

- 系统产出的一等公民是**面**（投影）与**盲区披露**，不是「点列表」。
- **Observer 是中心，Memory 是器官**：读取时先有「谁在看、为谁看、看什么、不看什么」（lens），再决定把哪些点组装成哪个面、并声明漏了什么。

**证据权威不变（MUST）**：atom 仍是不可变证据源（ADR-0002 的存储/重建决策保留）。但「唯一权威」**只对证据成立，不对产品成立**——产品是投影。README / ARCHITECTURE 里「atoms 是唯一权威」的措辞 MUST 重述为：「证据在 atom；产品是投影；中心是 Observer」。

**新增核心 seam（MUST）**：`engine/project`（在现 `engine/read` 内重构/扩展，保留 `engine/read` 的 Outcome / Signal / 信封 / 预算）：
`Observe(lens) → 候选点 → assemble 面 → distortion/盲区 → 信封`。旧「检索」降为这条管线里的一种朴素投影（无 lens 时 = 现状行为）。

**最小 Observer 核回核心（MUST，且只提最小核）**：把 lab 里的 `observer-context`（lens：`what_matters` / `what_to_ignore`）与 `distortion` 作为 core 能力；**不**整体搬运 231 条 invariant 运行时（federation / world / agency / simulation 等仍留 lab）。判据：只把「整全→面→点」这条本体**必需的接缝**提回核心，其余未真机验证的研究面保持隔离。

**坐标落地（SHOULD）**：写侧 `axes.soul / role / intent` 从 session / role / soul 填充，不再恒 `default`；`soul.json` 恢复写侧（`writeSoulCore` + 显式门），读侧 lens 真正消费它。

**契约扩展（MUST）**：C1–C6 一字不改；新增 **C7「投影忠实度与盲区披露」**——任何投影 MUST 声明「纳入了什么、排除了什么、为什么」，缺失与盲区 MUST 可见（承接「缺件不静默」）。

**兼容（MUST）**：`read_shadow` / `recall_shadow` / `shadow_query` 等外部工具名与 10 个核心 mode 保持稳定；新能力以 mode / 透镜**增量**出现，不炸工具 schema。

## 落地分刀（每刀独立过 `npm run verify`）

- **A｜哲学/契约（本 ADR）**：本 ADR + README/ARCHITECTURE 定位重述 + 新增 C7 + ADR 索引。无代码。
- **B｜最小投影 seam**：新增 `engine/project`（lens + assemble + distortion，纯派生、只读 atoms 不改），`read_shadow` 暴露投影入口（新增 mode 或 `project` 透镜）；补 unit / failure / parity 测试；C7 盲测 1 例。
- **C｜坐标与灵魂**：写侧填 `axes`；`soul.json` 写侧 + 门 + 读侧 lens 生效；测试。
- **D｜提核**：把 `observer-context` / `distortion` 从 `lab/vendor` 摘为 core（lab 其余保留）；`audit:layers` 与层依赖门通过。
- **E｜收口**：README / ARCHITECTURE / STATUS 重述，`npm run verify` 全绿，parity 不降。

## Consequences

- 正：产品从「检索日志」回到「投影记忆」；「灵魂是中心」落到可验收的 seam 与 C7，而不只是口号。
- 正：C1–C6 与真机验收资产保留；lab 研究面不被整体拖进核心，避免把未验证的 231 invariant 直接生产化。
- 负：`engine/read` 重构为投影管线，需改 `route` / `modes` / `types`；parity oracle 需扩「投影口径」；预算/性能需重测。
- 边界：**不承诺「看见整全」**，只承诺「忠实投影 + 盲区披露」。这是本条与「假装全知」的分界线。

## Non-goals

- 不把 231 invariant / federation / world / agency / simulation / long-horizon 等未真机验证的研究面整体搬进 core（留在 lab）。
- 不把 atom 降格为可改写；不改 C1（atom = 不可变 source）。
- 不引向量库 / RAG / 常驻服务；不改外部工具名去炸 schema。
- 不在本条实现完成前声称「全绿」；不虚构验收。
