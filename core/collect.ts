// dsh-shadow —— core/collect.ts：采集辅助（消息提取 / 目标文本 / 用户消息分类）。从 index.ts 迁出。纯函数。
import { stripSystemScaffold, isScaffoldBlock } from "../security/scrub.js";

export const extractMessage = (event: any) => {
  if (!event) return null;
  const type = event.type;
  if (type !== "user/message" && type !== "assistant/message") return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const kind = type === "user/message" ? "user" : "assistant";
  const msg = type === "user/message" ? data : data.message;
  if (!msg || typeof msg !== "object") return null;
  const content = Array.isArray(msg.content) ? msg.content : [];
  // 逐内容块处理（而非合并后才剔）：①剔除宿主注入的系统脚手架标签（<system-reminder> 等成对/孤立）；
  // ②剔除「以已知系统提示完整措辞开头」的无标签裸脚手架块；最后合并。纯系统脚手架的消息（过滤后为空）
  // 整体跳过——这些是「系统提示 / 运行时上下文」，不是 agent 的思维/决策线索，不应写入记忆。
  const text = content
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => stripSystemScaffold(b.text))
    .map((b: any) => String(b || "").trim())
    .filter((b: any) => !isScaffoldBlock(b))
    .join("\n")
    .trim();
  if (!text) return null;
  return { kind, text: text.slice(0, 600) };
};

export const goalText = (change: any) => {
  if (!change) return "";
  const obj = change.objective || change.goal?.objective || change.change?.objective || "";
  const act = change.action || change.phase || change.kind || "decision";
  const parts: string[] = [];
  if (obj) parts.push(String(obj).slice(0, 160));
  if (act) parts.push(`〔${act}〕`);
  return parts.join(" ") || "（决策）";
};

export const classifyUser = (text: unknown) => {
  const t = String(text || "").trim();
  // Decision：只有「明确决策语义」才算决策（删除/保留/采用/就按/就这么/不要删 等）。
  // 纯确认（好/可以/行/ok）不再误判为 Decision —— 归入 confirmation。
  if (/(删除|删掉|移除|去掉|保留|采用|选用|沿用|改用|放弃|弃用|排除|剔除|重构|定为|就按|就依|就这么|就这|按这个|按你说的|拍板|批准|同意|否决|不行|不要.*(做|用|删|改|留)|停止|先做|选[^。]{0,8}$|定[^。]{0,8}$|方案.*(选|用|定)|最终.*(定|选)|决定)/.test(t)) return "decision";
  // Confirmation：纯确认（好/可以/行/ok/嗯），不是 Decision，也不是 Reminder。
  if (/^(好的?|可以(的)?|行(吧)?|嗯|没问题|[oO][kK])([,，。!\s]*)$/.test(t)) return "confirmation";
  // Reminder：提醒/纠偏/注意事项。
  if (/(注意|提醒|重点|不要|别|小心|切记|别忘了|另外|补充|但是|错误|不对|错了|反了|前提|前提是|关键是|优先|边界|坑|留[^。]{0,5}(神|意))/.test(t)) return "reminder";
  return "";
};

// ── 明确决策语句 / 明确决策理由（v1.1.1 Decision Capture Boundary）──
// 只抽取「原文明确存在」的表达，绝不用 LLM 补写理由（Evidence≠Interpretation）。
// 决策语句 = 选择类动词 + 宾语（删除/保留/采用/改用 等）；理由 = 原文里「因为/由于/理由是…」的从句。
const SELECTION_VERB = /(?:删除|移除|删掉|保留|采用|沿用|选用|改用|放弃|弃用|排除|剔除|去掉|重构|定为|选择用)/;
const REASON_MARK = /(?:因为|由于|理由是|原因是|原因在于|，因为|。因为)/;

export const extractDecisionStatement = (text: unknown) => {
  const t = String(text || "");
  const out: string[] = [];
  const seen = new Set<string>();
  const re = new RegExp(`(${SELECTION_VERB.source.slice(2, -2)})([^，。；！？\\n]{1,40})`, "g");
  let m: RegExpExecArray | null;
  while ((m = re.exec(t)) && out.length < 3) {
    const s = `${m[1]}${m[2]}`.trim();
    if (s.length >= 2 && !seen.has(s)) { seen.add(s); out.push(s); }
  }
  return out;
};

export const extractReason = (text: unknown) => {
  const m = String(text || "").match(new RegExp(`${REASON_MARK.source}([^。；！？\\n]{2,60})`));
  return m ? m[1].trim() : "";
};
