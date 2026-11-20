/**
 * v3 domain — 用户话语四分类（纯函数、确定性）：decision / confirmation / background / noise。
 *
 * 目的（P1）：把"决策抽取"从"凡命中关键词就算决策"收紧为四分类，修正真实语料暴露的问题：
 * - 噪声（subagent/checkpoint/只读任务 prompt）不得当决策；
 * - 确认（都做/同意/重启完成/要/收尾）不算决策（ADR：Confirmation 不算决策）；
 * - 背景（描述现状/材料/不一致）不是决策；
 * - 「不要X / X不要了 / 不要体现」等**否决**是决策（旧 SELECTION_RE 只认 `不要.*(做|用|删|改|留)` → 系统性漏）。
 * 纪律：仅分类，不生成/补写内容。
 */

export type TurnClass = "decision" | "confirmation" | "background" | "noise" | "";

const NOISE_HEAD = /^(Background subagent|This is an automatically|Current DSH|The available skill|只读任务|只读，不改|只读核验|只读调研|只读（不改|独立代码审查|对一个 DSH|请.{0,10}评审|工作区 `|项目：`)/;
const NOISE_ANY = /(Background subagent|This is an automatically generated|checkpoint condensing|Current runtime context|The following workspace instructions may be relevant|Time sampled while preparing|Browser time zone for this request|Elapsed since the preceding|The user switched|The user changed the approval policy|The user approved|The user declined|Current DSH file policy)/i;

const CONFIRM_RE = /^(都做|同意|可以|好的?|好|行|嗯|收到|明白|了解|收尾|重启(完成|了)?|定稿|就这样|照做|没问题|要$|1$|是的?|对)[，。！!,、\s]*$/;

/** 决策信号：否决 / 采纳 / 替换 / 定标准 / 改。含"不要X"这类否决策略（旧规则系统性漏）。 */
const DECISION_RE = /(不要|别用|不用|否决|取消|停用|去掉|删除|删掉|放弃|改用|改成|改为|换成|保留|采用|选用|沿用|就按|就依|定为|定稿|拍板|批准|直接发|只改|只做|只要|加宽|缩窄|放大|缩小|调大|调小|更喜欢|偏好|最终.{0,6}(定|选)|按这个)/;
const DESCRIPTIVE_RE = /(现状|不一致|背景|材料|路径|日志|报错|版本|状态|目前|已经|当前|因为|由于|节律|等权|混入)/;

export const classifyTurn = (text: unknown): TurnClass => {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (NOISE_HEAD.test(t) || NOISE_ANY.test(t)) return "noise";
  if (CONFIRM_RE.test(t) || /^(好|行|可以|嗯|收到|明白|了解)[，。！!,、\s]/.test(t)) return "confirmation";
  // 长文本（>60）多为背景/说明，避免其中夹带"采纳/否决"被误判为决策。
  if (t.length > 60) return "background";
  if (DECISION_RE.test(t)) return "decision";
  if (DESCRIPTIVE_RE.test(t)) return "background";
  return "";
};

/** 检索去噪：判断一段记忆正文是否为"我方任务 prompt / 脚手架 / 元讨论"，检索时应降噪（不删除存储）。 */
const PROMPT_PHRASES = [
  "只读任务，不要改任何文件",
  "只读，不改文件",
  "只读，不改任何文件",
  "只读核验，不改文件",
  "只读调研，不改文件",
  "独立代码审查一个 DSH",
  "只针对一个 DSH",
  "请审查下面这份",
  "请独立挑坑",
  "请**独立挑坑**",
  "做一次「用 dsh-shadow",
  "目标是挑坑",
];
export const isPromptNoise = (text: unknown): boolean => {
  const s = String(text ?? "").trim();
  if (!s) return false;
  // 判定对象 = 首条"用户："原话（任务 prompt 通常在用户行）；无用户行才看正文开头。
  const firstUser = /^-\s*\[[^\]]*\]\s*\[[^\]]*\]\s*用户：(.+)$/m.exec(s)?.[1]?.trim() ?? "";
  const head = (firstUser || s.slice(0, 300)).slice(0, 400);
  if (NOISE_HEAD.test(head) || NOISE_ANY.test(head)) return true;
  return PROMPT_PHRASES.some((p) => head.includes(p));
};
