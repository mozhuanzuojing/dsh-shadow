/**
 * v2 engine/toolset — 用例编排：参数归一 → 巡检 / 预检 / 安装 → 渲染。
 *
 * surface 只做「参数 → engine → 文本」，业务判定（哪些参数互斥、未知值怎么报、
 * 安装门是否放行）都在这里。未知输入**显式失败**（docs/v2/ARCHITECTURE.md §1.4），不落回默认。
 */

import { err, ok, type Outcome } from "../../contract/outcome.js";
import { CATEGORY_ORDER } from "./types.js";
import type { ToolsetDeps, ToolsetRequest } from "./types.js";
import { precheckCapabilities, surveyCapabilities } from "./probe.js";
import { installCapability } from "./install.js";
import { renderInstall, renderPrecheck, renderSurvey } from "./render.js";

const asText = (v: unknown): string => (typeof v === "string" ? v.trim() : v === undefined || v === null ? "" : String(v).trim());

/** 能力预检单次最多 12 条（与 probe 的上限一致；超出部分不静默截断，而是明确拒绝）。 */
const MAX_NEEDS = 12;

/**
 * 归一化工具参数。返回 Outcome 而不是「尽量猜」：
 *   - survey 只接受 "providers"（默认）/ "all"；
 *   - category 必须是已登记分类（否则给可用分类清单）；
 *   - need 接受字符串或字符串数组，最多 12 条（超限显式失败，不静默丢）。
 * 语义优先级（与 v1 一致）：install > need > survey/category。
 */
export const normalizeToolsetRequest = (raw: Record<string, unknown> = {}): Outcome<ToolsetRequest> => {
  const install = asText(raw.install);
  const surveyRaw = asText(raw.survey).toLowerCase();
  if (surveyRaw && surveyRaw !== "providers" && surveyRaw !== "all") {
    return err("INVALID_INPUT", `survey 只接受 "providers"（默认）或 "all"；收到 "${asText(raw.survey)}"。`, { survey: raw.survey });
  }
  const category = asText(raw.category);
  if (category && !CATEGORY_ORDER.includes(category)) {
    return err("INVALID_INPUT", `未知分类 "${category}"；可用分类：${CATEGORY_ORDER.join(" / ")}。`, { category });
  }
  const needRaw = raw.need;
  const needList = Array.isArray(needRaw)
    ? needRaw.map((x) => asText(x)).filter(Boolean)
    : asText(needRaw)
      ? [asText(needRaw)]
      : [];
  if (needList.length > MAX_NEEDS) {
    return err("INVALID_INPUT", `need 一次最多 ${MAX_NEEDS} 条（收到 ${needList.length} 条）；请分批预检，不做静默截断。`, { need: needList.length });
  }
  return ok({
    install: install || undefined,
    need: needList.length ? needList : undefined,
    survey: surveyRaw === "all" ? "all" : "providers",
    category: category || undefined,
  });
};

/**
 * 执行一次工具集请求，返回要显示给用户的文本。
 * 正常业务结果（未命中、审批未授予、安装后仍未检出…）都是 **ok 值**，文本里如实说明；
 * 只有「输入非法」与「内部异常」才是 err（surface 会把它转成可见失败/信号，不静默）。
 */
export const runToolset = async (deps: ToolsetDeps = {}, raw: Record<string, unknown> = {}): Promise<Outcome<string>> => {
  const normalized = normalizeToolsetRequest(raw);
  if (!normalized.ok) return normalized;
  const req = normalized.value;
  try {
    if (req.install) {
      // 安装：探测 → 审批门（懒取 approval）→ 执行 → 重探；详情见 install.ts。
      const outcome = await installCapability(req.install, {
        runner: deps.runner,
        getApproval: deps.getApproval,
        agent: deps.agent,
      });
      return ok(renderInstall(outcome));
    }
    if (req.need && req.need.length) {
      // 能力预检：只读，绝不安装。
      const rows = await precheckCapabilities(req.need, { runner: deps.runner });
      return ok(renderPrecheck(rows, deps.platform));
    }
    const rows = await surveyCapabilities({ survey: req.survey, category: req.category, runner: deps.runner });
    return ok(renderSurvey(rows, req));
  } catch (e) {
    return err("INTERNAL", `工具集台账内部错误：${e instanceof Error ? e.message : String(e)}`);
  }
};
