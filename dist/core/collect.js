// dsh-shadow —— core/collect.ts：采集辅助（消息提取 / 目标文本 / 用户消息分类）。从 index.ts 迁出。纯函数。
import { stripSystemScaffold, isScaffoldBlock } from "../security/scrub.js";
export const extractMessage = (event) => {
    if (!event)
        return null;
    const type = event.type;
    if (type !== "user/message" && type !== "assistant/message")
        return null;
    const data = event.data;
    if (!data || typeof data !== "object")
        return null;
    const kind = type === "user/message" ? "user" : "assistant";
    const msg = type === "user/message" ? data : data.message;
    if (!msg || typeof msg !== "object")
        return null;
    const content = Array.isArray(msg.content) ? msg.content : [];
    // 逐内容块处理（而非合并后才剔）：①剔除宿主注入的系统脚手架标签（<system-reminder> 等成对/孤立）；
    // ②剔除「以已知系统提示完整措辞开头」的无标签裸脚手架块；最后合并。纯系统脚手架的消息（过滤后为空）
    // 整体跳过——这些是「系统提示 / 运行时上下文」，不是 agent 的思维/决策线索，不应写入记忆。
    const text = content
        .filter((b) => b && b.type === "text" && typeof b.text === "string")
        .map((b) => stripSystemScaffold(b.text))
        .map((b) => String(b || "").trim())
        .filter((b) => !isScaffoldBlock(b))
        .join("\n")
        .trim();
    if (!text)
        return null;
    // **截断必须留痕**（v1.15.55）：旧版 `slice(0, 600)` 让长消息的尾部**从未落盘**，
    // 而读的人以为这就是全文（「缺件不静默」ADR-0049）。这里显式标出丢了多少字。
    const CAP = 600;
    if (text.length <= CAP)
        return { kind, text };
    return { kind, text: `${text.slice(0, CAP)}…（**已截断**：原文 ${text.length} 字，此处保留前 ${CAP} 字）` };
};
export const goalText = (change) => {
    if (!change)
        return "";
    // 只读宿主 `GoalChanged = { operation, ref, goal? }` 的真字段 —— `0.1.0-rc.7` → `0.1.5-rc.1` 四个版本的
    // declaration 逐字相同，且与运行时 Inspect 一致。
    // **不留旧名兜底**：`change.objective` / `change.action` / `change.phase` / `change.kind` /
    // `change.change?.objective` 在任何版本都不存在（`phase` 只存在于 `change.goal.phase`）；
    // 留着它们只会把「字段读错」掩盖成静默回退 —— 与本仓 ADR-0050「正名硬切、不留兼容别名」同一口径。
    const obj = change.goal?.objective || "";
    // operation 缺失时不编造标签（不留静默兜底，避免把「字段缺失」伪装成正常标签）；
    // 与 obj 皆空时，由末尾的「（决策）」兜住。
    const act = change.operation || "";
    const parts = [];
    if (obj)
        parts.push(String(obj).slice(0, 160));
    if (act)
        parts.push(`〔${act}〕`);
    return parts.join(" ") || "（决策）";
};
const SELECTION_RE = /删除|删掉|移除|去掉|保留|采用|选用|沿用|改用|放弃|弃用|排除|剔除|重构|定为|就按|就依|就这么|就这|按这个|按你说的|拍板|批准|同意|否决|不行|不要.*(做|用|删|改|留)|停止|先做|选[^。]{0,8}$|定[^。]{0,8}$|方案.*(选|用|定)|最终.*(定|选)|决定/;
// 锚点：X 是 …「工作区/目录/路径/环境/位置/仓库/分支/版本/模块/服务/接口/根/库」（事实基准/身份定位）
const ANCHOR_RE = /是.{0,30}(工作区|目录|路径|环境|位置|仓库|分支|版本|模块|服务|接口|根|库)/;
// 非聚焦的"请求/疑问/普通陈述"开头动词：表示"想了解/想看"，不是"决定聚焦 X"
const NON_FOCUS = /^(了解|读|看|查看|查|帮|请|能否|能不能|为什么|怎么|如何|什么|哪里|建议|麻烦|需要|要做|给我|先看|看看|介绍一下|讲解|说说|解释|说明|当|我|我们|你|如果|然后|以及|还有|要不|顺便|想|让我|请问|报错|报的|发生了|遇到|出现|为什么|是不是)/;
// 纯确认/收到类：不是范围决策
const NO_FOCUS = /^(收到|嗯|好的?|好|行|可以|没问题|[oO][kK]|知道|明白|了解|对|是|回|继续|嗯嗯|好嘞|行吧|可以的?)[，。！!,、\s]*$/;
export const decisionClass = (text) => {
    const t = String(text || "").trim();
    if (!t)
        return "";
    if (SELECTION_RE.test(t))
        return "selection";
    if (ANCHOR_RE.test(t))
        return "anchor";
    // 范围/聚焦：短促、名词性、无请求/疑问/确认语义；对"聚焦/重点/集中/接下来/继续"引导词优先。
    const short = t.length <= 12 && /[\u4e00-\u9fff]/.test(t) && !/[？?]/.test(t) && !NON_FOCUS.test(t) && !NO_FOCUS.test(t);
    const focusLead = /^(聚焦|重点|集中|接下来|继续|主攻|主做|着手|专注)/.test(t);
    if ((short && !/\s/.test(t)) || (short && focusLead))
        return "scope";
    return "";
};
export const classifyUser = (text) => {
    const t = String(text || "").trim();
    // Decision：明确决策语义（选择/范围聚焦/锚点定位）→ 决策。纯确认（好/可以/行/ok）不误判为决策。
    if (decisionClass(t))
        return "decision";
    // Confirmation：纯确认（好/可以/行/ok/嗯），不是 Decision，也不是 Reminder。
    if (/^(好的?|可以(的)?|行(吧)?|嗯|没问题|[oO][kK])([,，。!\s]*)$/.test(t))
        return "confirmation";
    // Reminder：提醒/纠偏/注意事项。
    if (/(注意|提醒|重点|不要|别|小心|切记|别忘了|另外|补充|但是|错误|不对|错了|反了|前提|前提是|关键是|优先|边界|坑|留[^。]{0,5}(神|意))/.test(t))
        return "reminder";
    return "";
};
// ── 明确决策语句 / 明确决策理由（v1.1.1 Decision Capture Boundary）──
// 只抽取「原文明确存在」的表达，绝不用 LLM 补写理由（Evidence≠Interpretation）。
// 决策语句 = 选择类动词 + 宾语（删除/保留/采用/改用 等）；理由 = 原文里「因为/由于/理由是…」的从句。
const SELECTION_VERB = /(?:删除|移除|删掉|保留|采用|沿用|选用|改用|放弃|弃用|排除|剔除|去掉|重构|定为|选择用)/;
const REASON_MARK = /(?:因为|由于|理由是|原因是|原因在于|，因为|。因为)/;
export const extractDecisionStatement = (text) => {
    const t = String(text || "");
    const out = [];
    const seen = new Set();
    const re = new RegExp(`(${SELECTION_VERB.source.slice(2, -2)})([^，。；！？\\n]{1,40})`, "g");
    let m;
    while ((m = re.exec(t)) && out.length < 3) {
        const s = `${m[1]}${m[2]}`.trim();
        if (s.length >= 2 && !seen.has(s)) {
            seen.add(s);
            out.push(s);
        }
    }
    return out;
};
export const extractReason = (text) => {
    const m = String(text || "").match(new RegExp(`${REASON_MARK.source}([^。；！？\\n]{2,60})`));
    return m ? m[1].trim() : "";
};
