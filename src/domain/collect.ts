/**
 * v2 domain — 采集分类（纯函数）：消息抽取 / 用户分类 / 目标文本 / 理由抽取。
 *
 * 只抽「原文明确存在」的决策与理由；不补写。
 */

export const SYSTEM_TAG_NAMES = ["system-reminder", "system-instruction", "system_instruction", "persisted-output", "private"];
const SYSTEM_TAG_RE = new RegExp(`<(${SYSTEM_TAG_NAMES.join("|")})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
const SYSTEM_TAG_RESIDUE_RE = new RegExp(`<\\/?(?:${SYSTEM_TAG_NAMES.join("|")})\\b[^>]*>`, "gi");
const SCAFFOLD_MARKERS = [
  "The following workspace instructions may be relevant to your work",
  "A skill is a reusable set of task-specific instructions",
  "The following skills are available in this session",
  "Current runtime context. This snapshot supersedes",
  "Additional instructions from: ",
];

export const stripSystemScaffold = (s: unknown): string => {
  let t = String(s ?? "");
  t = t.replace(SYSTEM_TAG_RE, " ");
  t = t.replace(SYSTEM_TAG_RESIDUE_RE, " ");
  return t.trim();
};

export const isScaffoldBlock = (t: unknown): boolean => {
  const s = String(t ?? "").trim();
  if (!s) return true;
  return SCAFFOLD_MARKERS.some((m) => s.startsWith(m));
};

export interface ExtractedMessage {
  kind: "user" | "assistant";
  text: string;
}

export const extractMessage = (event: any): ExtractedMessage | null => {
  if (!event) return null;
  const type = event.type;
  if (type !== "user/message" && type !== "assistant/message") return null;
  const data = event.data;
  if (!data || typeof data !== "object") return null;
  const kind: ExtractedMessage["kind"] = type === "user/message" ? "user" : "assistant";
  const msg = type === "user/message" ? data : data.message;
  if (!msg || typeof msg !== "object") return null;
  const content = Array.isArray(msg.content) ? msg.content : [];
  const text = content
    .filter((b: any) => b && b.type === "text" && typeof b.text === "string")
    .map((b: any) => stripSystemScaffold(b.text))
    .map((b: any) => String(b ?? "").trim())
    .filter((b: any) => !isScaffoldBlock(b))
    .join("\n")
    .trim();
  if (!text) return null;
  const CAP = 600;
  return text.length <= CAP
    ? { kind, text }
    : { kind, text: `${text.slice(0, CAP)}…（**已截断**：原文 ${text.length} 字，此处保留前 ${CAP} 字）` };
};

export const goalText = (change: any): string => {
  if (!change) return "";
  const obj = change.goal?.objective || "";
  const act = change.operation || "";
  const parts: string[] = [];
  if (obj) parts.push(String(obj).slice(0, 160));
  if (act) parts.push(`〔${act}〕`);
  return parts.join(" ") || "（决策）";
};

const SELECTION_RE = /删除|删掉|移除|去掉|保留|采用|选用|沿用|改用|改成|改为|换成|放弃|弃用|排除|剔除|重构|定为|就按|就依|就这么|就这|按这个|按你说的|拍板|批准|同意|否决|不行|不要.*(做|用|删|改|留)|停止|先做|选[^。]{0,8}$|定[^。]{0,8}$|方案.*(选|用|定)|最终.*(定|选)|决定/;
const ANCHOR_RE = /是.{0,30}(工作区|目录|路径|环境|位置|仓库|分支|版本|模块|服务|接口|根|库)/;
const NON_FOCUS = /^(了解|读|看|查看|查|帮|请|能否|能不能|为什么|怎么|如何|什么|哪里|建议|麻烦|需要|要做|给我|先看|看看|介绍一下|讲解|说说|解释|说明|当|我|我们|你|如果|然后|以及|还有|要不|顺便|想|让我|请问|报错|报的|发生了|遇到|出现|是不是)/;
const NO_FOCUS = /^(收到|嗯|好的?|好|行|可以|没问题|[oO][kK]|知道|明白|了解|对|是|回|继续|嗯嗯|好嘞|行吧|可以的?)[，。！!,、\s]*$/;

export type DecisionKind = "selection" | "scope" | "anchor" | "";

export const decisionClass = (text: unknown): DecisionKind => {
  const t = String(text ?? "").trim();
  if (!t) return "";
  if (SELECTION_RE.test(t)) return "selection";
  if (ANCHOR_RE.test(t)) return "anchor";
  const short = t.length <= 12 && /[\u4e00-\u9fff]/.test(t) && !/[？?]/.test(t) && !NON_FOCUS.test(t) && !NO_FOCUS.test(t);
  const focusLead = /^(聚焦|重点|集中|接下来|继续|主攻|主做|着手|专注)/.test(t);
  if ((short && !/\s/.test(t)) || (short && focusLead)) return "scope";
  return "";
};

export const classifyUser = (text: unknown): "decision" | "reminder" | "confirmation" | "" => {
  const t = String(text ?? "").trim();
  if (decisionClass(t)) return "decision";
  if (NO_FOCUS.test(t)) return "confirmation";
  if (/(注意|提醒|重点|不要|别|小心|切记|别忘了|另外|补充|但是|错误|不对|错了|反了|前提|前提是|关键是|优先|边界|坑|留[^。]{0,5}(神|意))/.test(t)) return "reminder";
  return "";
};

const REASON_MARK = /(?:因为|由于|理由是|原因是|原因在于|，因为|。因为)/;

export const extractReason = (text: unknown): string => {
  const m = String(text ?? "").match(new RegExp(`${REASON_MARK.source}([^。；！？\\n]{2,60})`));
  return m ? m[1]!.trim() : "";
};

export const isExplicitRemember = (text: unknown): boolean =>
  /(记住|记一下|记下来|remember)/i.test(String(text ?? ""));
