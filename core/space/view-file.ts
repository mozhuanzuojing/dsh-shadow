// dsh-shadow —— core/space/view-file.ts：投影视图便利贴（ADR-0107 · P1/T1/W3）。
// 路径：`.shadow/indexes/projections/<原子文件名>`；原文 atoms 说了算，本文件可重建。
// 新鲜度 = `atomToken` + `soulToken`（宿主 listDir 的 size/version，可能残缺）**且** `bodyHash`
// （正文内容哈希，见 ADR-0107 §2.5）：令牌只能当廉价前置闸，**正确性锚点是哈希** ——
// 后端不给 version 时「同尺寸原地改内容」不换令牌，只靠令牌会把旧正文顶替刚读到的原文。
import { createHash } from "node:crypto";
import { indexesRel } from "../paths.js";
import { applySoftLens, ignoreTermsOf } from "./soft-lens.js";

export const projectionViewRel = (atomFileName: string): string =>
  indexesRel("projections", String(atomFileName || "").replace(/[/\\]/g, "_") || "_");

/** 正文内容哈希（sha256 前 16 位十六进制）—— 便利贴新鲜度的**正确性锚点**。 */
export const bodyHashOf = (body: string): string =>
  createHash("sha256").update(String(body ?? ""), "utf8").digest("hex").slice(0, 16);

export interface ViewTokens {
  atomToken: string;
  soulToken: string;
  /** 写入时正文的哈希；读侧必须与**刚读到的正文**一致才认这份便利贴。 */
  bodyHash?: string;
  context?: string;
}

export const formatViewFile = (opts: {
  atomRel: string;
  atomName: string;
  tokens: ViewTokens;
  visible: string;
  hidden: string[];
}): string => {
  const lines = [
    `# Projection view · ${opts.atomName}`,
    "",
    `> atom: ${opts.atomRel}`,
    `> atomToken: ${opts.tokens.atomToken}`,
    `> soulToken: ${opts.tokens.soulToken}`,
    opts.tokens.bodyHash ? `> bodyHash: ${opts.tokens.bodyHash}` : "",
    opts.tokens.context ? `> context: ${opts.tokens.context.slice(0, 120)}` : "",
    "",
    "## visible",
    opts.visible.trim() || "（空）",
    "",
  ].filter((l) => l !== "");
  if (opts.hidden.length) {
    lines.push("## hidden", ...opts.hidden.slice(0, 40), "");
  }
  return lines.join("\n") + "\n";
};

export const parseViewTokens = (text: string): ViewTokens | null => {
  const atomToken = (String(text).match(/^> atomToken:\s*(.+)$/m) || [])[1]?.trim();
  const soulToken = (String(text).match(/^> soulToken:\s*(.+)$/m) || [])[1]?.trim();
  if (!atomToken || !soulToken) return null;
  const bodyHash = (String(text).match(/^> bodyHash:\s*(.+)$/m) || [])[1]?.trim();
  const context = (String(text).match(/^> context:\s*(.+)$/m) || [])[1]?.trim();
  return { atomToken, soulToken, bodyHash, context };
};

/**
 * 取 `## visible` 段的**全部**行（直到 `## hidden` 或文件末尾）。
 *
 * ⚠ 不用「前瞻到下一个 `## `」那种写法：① `/m` 下 `\n*$` 在**每个行尾**都成立，
 * 懒惰量词会在第一行就收尾（v1.21.0 实测：多行正文只读回第一行，而调用方拿它直接顶替原文）；
 * ② 正文自己就可能含 `## ` 行 ⇒ 只认 `## hidden` 这个**本文件写的**分段标记。
 */
export const parseViewVisible = (text: string): string => {
  const lines = String(text ?? "").split(/\r?\n/);
  const start = lines.findIndex((l) => l.trim() === "## visible");
  if (start < 0) return "";
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((l) => l.trim() === "## hidden");
  return (end < 0 ? rest : rest.slice(0, end)).join("\n").trim();
};

/** 为原子正文生成便利贴内容（写路径 / 懒更新共用）。`bodyHash` 缺省时由传进来的 `body` 现算。 */
export const buildProjectionView = (
  atomRel: string,
  atomName: string,
  body: string,
  soul: any,
  tokens: ViewTokens,
): string => {
  const lens = applySoftLens(body, soul);
  return formatViewFile({
    atomRel,
    atomName,
    tokens: {
      ...tokens,
      bodyHash: tokens.bodyHash || bodyHashOf(body),
      context: tokens.context || (ignoreTermsOf(soul).length ? `ignore×${ignoreTermsOf(soul).length}` : "empty-lens"),
    },
    visible: lens.text,
    hidden: lens.hidden,
  });
};

export const writeProjectionView = async (
  fs: any,
  ws: string,
  atomRel: string,
  body: string,
  soul: any,
  tokens: ViewTokens,
): Promise<{ ok: boolean; rel: string; reason?: string }> => {
  const atomName = String(atomRel).split("/").pop() || "atom.md";
  const rel = projectionViewRel(atomName);
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    await fs.writeText(t, buildProjectionView(atomRel, atomName, body, soul, tokens));
    return { ok: true, rel };
  } catch (e: any) {
    return { ok: false, rel, reason: (e && e.message) || String(e) };
  }
};

/**
 * 读回便利贴的 `visible` —— **只有令牌与正文哈希都对得上才回**。
 *
 * - 令牌（`atomToken` + `soulToken`）：廉价前置闸，后端不给 `version` 时可能「假新鲜」。
 * - `bodyHash`：正确性锚点 —— 调用方把**刚读到的正文**的哈希传进来，不一致 ⇒ 这份便利贴作废
 *   （旧格式便利贴没有该行 ⇒ 同样作废，读侧会重滤并写回）。
 * 返回 `null` = 不可用（调用方必须现滤），**不是**「内容为空」。
 */
export const readProjectionViewIfFresh = async (
  fs: any,
  ws: string,
  atomName: string,
  want: ViewTokens,
): Promise<string | null> => {
  const rel = projectionViewRel(atomName);
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    const txt = await fs.readText(t);
    if (!txt) return null;
    const got = parseViewTokens(txt);
    if (!got || got.atomToken !== want.atomToken || got.soulToken !== want.soulToken) return null;
    if (want.bodyHash && got.bodyHash !== want.bodyHash) return null;
    const visible = parseViewVisible(txt);
    return visible || null;
  } catch {
    return null;
  }
};
