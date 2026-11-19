# ADR-0031 · 方向/问询加固：topic 严格采样 · 样本不足 fast-fail · 最近会话去噪 · 基准门

- 状态：accepted
- 日期：2026-11-19
- 关联：ADR-0029/0030；C4/C6

## 背景
ADR-0029/0030 上线后真实语料暴露：①问询曾把全量决策灌入被截断（已修：topic 过滤+限流+剔脚手架）；②词法候选排序在聚焦 topic 上会误导（如把"向量记忆库"排第一）；③跨会话/跨主题噪声污染方向假设（如 deepbreath 的"更喜欢B"混入）；④缺可复现的纠偏/性能基准。

## 决策（最小改动）
1. **topic 严格采样**：给定 topic 时只取 body 含 topic 的原子；`read_shadow({direction|inquiry, topic})` 生效。
2. **样本不足 fast-fail**：`buildDirection(utts,{minSamples})`；topic 场景 minSamples=3、无 topic=2；不足即 `undecidable`（不出排序、提示勿猜），不包装完美判断。
3. **最近会话去噪**：无 topic 时仅取**最近会话**的点（按句柄 session-id）；有 topic 时以 topic 为锚可跨会话。
4. **基准门**：`test/unit/direction-baseline.test.ts` —— 标注场景纠偏准确率必须 100%；`buildDirection(2000)<2000ms`、`rank(200)<500ms` 性能门；样本不足 fast-fail 断言。并入 `npm run verify`。

## 后果
- ＋ 可复现基准、降噪、不可判显式；与 C4「不替用户裁决」一致。
- － 最近会话去噪会牺牲跨会话历史（有 topic 时可找回）；基准为合成/小规模，非大语料统计（待 corpus-bench 扩展）。
