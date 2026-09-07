// dsh-shadow —— soul/identity.ts：Identity（主体锚，v0.20）。长期实体：你是谁、看重什么、怎么决策。
// 从 soul.json 读出主体（identity/principles/boundaries + 新增 anti_patterns/decision_style/observerLens）。
// Identity 是实体，`ObserverContext.identityRef` 指向它，不嵌套进一次观察事件。
import type { Identity } from "../core/types.js";
import { readSoul } from "./soul.js";

export const readIdentity = async (fs: any, ws: string, fallbackId?: string): Promise<Identity> => {
  const soul = await readSoul(fs, ws);
  const ident = soul?.identity;
  const id = (typeof ident === "string" ? ident : ident?.name || ident?.role) || fallbackId || "unknown";
  const ob = soul?.observer;
  const lens = soul?.observerLens || (ob ? { preferred: ob.what_matters, avoided: ob.what_to_ignore } : undefined);
  return {
    id,
    name: typeof ident === "string" ? undefined : (ident?.name || undefined),
    role: typeof ident === "string" ? undefined : (ident?.role || undefined),
    principles: Array.isArray(soul?.principles) ? soul.principles : [],
    antiPatterns: Array.isArray(soul?.anti_patterns) ? soul.anti_patterns : (Array.isArray(soul?.antiPatterns) ? soul.antiPatterns : undefined),
    decisionStyle: Array.isArray(soul?.decision_style) ? soul.decision_style : (Array.isArray(soul?.decisionStyle) ? soul.decisionStyle : undefined),
    observerLens: lens,
    values: Array.isArray(soul?.values) ? soul.values : undefined,
    boundaries: Array.isArray(soul?.boundaries) ? soul.boundaries : undefined,
  };
};

export const renderIdentity = (i: Identity) => {
  const lines = ["[Identity]"];
  lines.push(`id ${i.id}${i.name ? ` · ${i.name}` : ""}${i.role ? ` · ${i.role}` : ""}`);
  if (i.values?.length) lines.push(`价值观 ${i.values.join("、")}`);
  if (i.principles.length) lines.push(`原则 ${i.principles.join("、")}`);
  if (i.antiPatterns?.length) lines.push(`反模式 ${i.antiPatterns.join("、")}`);
  if (i.decisionStyle?.length) lines.push(`决策风格 ${i.decisionStyle.join("、")}`);
  if (i.boundaries?.length) lines.push(`边界 ${i.boundaries.join("、")}`);
  if (i.observerLens) lines.push(`Observer Lens ${JSON.stringify(i.observerLens)}`);
  if (!i.values?.length && !i.principles.length && !i.antiPatterns?.length && !i.decisionStyle?.length && !i.boundaries?.length) {
    lines.push("（无 Identity 配置：可在 .shadow/soul/soul.json 定义 identity/principles/anti_patterns/decision_style）");
  }
  return lines.join("\n");
};
