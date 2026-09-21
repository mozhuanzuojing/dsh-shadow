/**
 * dsh-shadow —— tools/eval-root.lib.ts：**语料根解析**（判据收一处）。
 *
 * v1.19.0 从 `tools/retrieval-eval.ts` 抽出：粒度门（`tools/granularity-audit.ts`）要用**同一份**解析 ——
 * 两处各写一份的话，「两个门评的是不是同一个工作区」就没人能保证
 * （本仓已因「同一判据两份实现」返工过两次：`tools/comparison-points.lib.ts`、`core/util.ts:numOr`）。
 *
 * ⚠ 下面两条都是**实测教训**，别在「简化」时删掉：
 *   · v1.15.41 前硬编码 `D:/project/dsh1` ⇒ 换机后那个路径**根本不存在**，
 *     于是基准在**空语料**上跑（`docs=0`，看起来还「跑通了」）。
 *   · v1.15.83 前只往上推**一层**（隐含布局 `<工作区>/dsh-shadow/tools`），而本仓实际是
 *     `<工作区>/vendor/dsh-shadow/tools` ⇒ 推导落到 `<工作区>/vendor`（**没有 `.shadow`**）
 *     ⇒ `npm run verify` 在第 5 步红，**后 3 步（分诊棘轮 / 插件面类型门 / 全部测试）根本不跑**（实测 exit 2）。
 */
import { existsSync } from "node:fs";
import { join } from "node:path";

/**
 * 由近到远的候选根（`<here>/..`、`../..`、`../../..`），取**第一个带 `.shadow` 的**。
 * `SHADOW_EVAL_ROOT` 优先级最高（冻结语料快照走它）；候选全都不存在时返回第一个候选，
 * 由调用方**响亮报错**（绝不默默评空语料）。
 */
export const resolveEvalRoot = (here: string): string => {
  const candidates = [join(here, ".."), join(here, "..", ".."), join(here, "..", "..", "..")];
  return process.env.SHADOW_EVAL_ROOT || candidates.find((r) => existsSync(join(r, ".shadow"))) || candidates[0];
};
