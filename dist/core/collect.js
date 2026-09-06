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
    return { kind, text: text.slice(0, 600) };
};
export const goalText = (change) => {
    if (!change)
        return "";
    const obj = change.objective || change.goal?.objective || change.change?.objective || "";
    const act = change.action || change.phase || change.kind || "decision";
    const parts = [];
    if (obj)
        parts.push(String(obj).slice(0, 160));
    if (act)
        parts.push(`〔${act}〕`);
    return parts.join(" ") || "（决策）";
};
export const classifyUser = (text) => {
    const t = String(text || "");
    if (/(决定|就这么|就这样|按这个|按你说的|按.*(做|来|改|办)|拍板|选[^。]{0,6}$|就[^。]{0,6}(吧|好)|同意|批准|不行|不要.*(做|用)|停止|先[^。]{0,8}再[^。]{0,8}|先做|定[^。]{0,8}$|可以|结论|方案.*(选|用)|最终.*(定|选)|行[,，。]?$|好[,，。]?$)/.test(t))
        return "decision";
    if (/(注意|提醒|重点|不要|别|小心|切记|别忘了|另外|补充|但是|错误|不对|错了|反了|前提|前提是|关键是|优先|边界|坑|留[^。]{0,5}(神|意))/.test(t))
        return "reminder";
    return "";
};
