/** 正向标记（两处词表的**并集**）。 */
export declare const POSITIVE_MARKERS: readonly ["成功", "通过", "验收通过", "解决", "优化", "提升", "改进", "稳定", "下降", "成本下降", "维护成本下降", "依赖降低", "improved", "fixed", "passed", "optimized", "stable", "success", "reduced", "solved"];
/** 负向标记（两处词表的**并集**；命中任意一条即**否决**）。 */
export declare const NEGATIVE_MARKERS: readonly ["失败", "瓶颈", "恶化", "故障", "回退", "出错", "复杂", "复杂性增加", "复杂度增加", "超时", "阻塞", "超标", "污染", "积压", "缺陷", "上升", "increased", "increase", "failed", "failure", "complexity", "issue", "bottleneck", "degraded", "regression", "breaking", "unstable"];
/**
 * 结果是否「正面」：命中任一正向标记，**且**不命中任何负向标记。
 *
 * 实现与三处原实现同形（小写化 + 子串包含 + 负向否决），**不引入 LLM、不引入权重**
 * —— 只把「词表 + 否决规则」这**同一条判据**收到一处。
 */
export declare const isPositiveOutcome: (actual: unknown) => boolean;
