// dsh-shadow —— core/judgment.ts：Judgment（情境→决策→reason）。从 index.ts 迁出。
import { tokenize } from "./util.js";
import { readRel } from "../persistence/files.js";
import { experienceOf } from "./experience.js";
export const judgmentOf = async (fs, ws, memories, topic) => {
    const tokens = tokenize(topic);
    const out = [];
    for (const mm of memories) {
        const text = await readRel(fs, ws, mm.rel);
        if (!text)
            continue;
        const exp = experienceOf(text, mm);
        if (!exp.decision)
            continue;
        const hay = `${exp.situation} ${exp.decision}`.toLowerCase();
        if (tokens.length && !tokens.some((t) => hay.includes(t)))
            continue;
        out.push({ situation: exp.situation, decision: exp.decision, date: mm.date });
    }
    const seen = new Map();
    for (const j of out)
        if (!seen.has(j.situation) || j.date >= seen.get(j.situation).date)
            seen.set(j.situation, j);
    return [...seen.values()].slice(0, 10);
};
export const renderJudgment = (js) => {
    const lines = ["[Judgment]"];
    if (!js.length) {
        lines.push("（暂无判断模式：需要含「决策」的记忆）");
        return lines.join("\n");
    }
    for (const j of js)
        lines.push(`面对 ${j.situation} → 我判断/选择 ${j.decision}`);
    return lines.join("\n");
};
