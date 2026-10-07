// dsh-shadow —— core/manifest.ts：Shadow Manifest（zg `manifest.json` / `status --debug` / observability 思想，ADR-0048 ⑧）。
// 记录索引投影的元数据（版本/构建时间/节点数/来源数）+ 诊断（每文件失败）。系统派生，rm -rf 可重建。
import { SHADOW_ROOT } from "./paths.js";
import { errText, isNotFound } from "./util.js";
import type { ShadowNode } from "./view/node.js";

export interface ShadowManifest {
  version: string;
  builtAt: string;
  nodeCount: number;
  sourceCount: number;
  failures: { path: string; reason: string }[];
}

/**
 * 「坏件」态（A15）—— 与 `epistemic/validation/history.ts` 的 `{ corrupt: true }` **同形**。
 * 为什么要有它：原先 `readManifest` 把「没有 manifest」与「读到但解析不了」压成同一个 `null`，
 * 于是一份被截断的 `shadow-manifest.json` 会被渲染成「尚无（尚未构建投影索引）」——
 * **把损坏说成「还没建」**（ADR-0049：缺件不静默）。
 */
export interface ManifestCorrupt {
  corrupt: true;
  reason: string;
}

/** 读 manifest 的**三态**：正常 / 真的没有（`null`）/ 坏件。 */
export type ManifestRead = ShadowManifest | ManifestCorrupt | null;

/** 判据（**唯一一份**）：`{ corrupt: true }` 才算坏件。 */
export const isManifestCorrupt = (m: ManifestRead): m is ManifestCorrupt => !!(m as any)?.corrupt;

export const manifestRel = () => `${SHADOW_ROOT}/shadow-manifest.json`;

export const buildManifest = (version: string, nodes: ShadowNode[], failures: { path: string; reason: string }[] = []): ShadowManifest => ({
  version,
  builtAt: new Date().toISOString(),
  nodeCount: (nodes || []).length,
  sourceCount: new Set((nodes || []).map((n) => n.source)).size,
  failures,
});

export const writeManifest = async (fs: any, ws: string, m: ShadowManifest): Promise<void> => {
  if (!fs || !ws) return;
  try { const t = await fs.resolve(`${ws}/${manifestRel()}`, { cwd: ws }); await fs.writeText(t, JSON.stringify(m)); } catch { /* best-effort */ }
};

export const readManifest = async (fs: any, ws: string): Promise<ManifestRead> => {
  let txt: any;
  try {
    const t = await fs.resolve(`${ws}/${manifestRel()}`, { cwd: ws });
    txt = await fs.readText(t);
  } catch (e: any) {
    // 只有「**确认**不存在」才算「还没有 manifest」（第一次运行 / 尚未构建）；其余读失败 = 坏件。
    // 判据收一处：`isNotFound`（core/util.ts）—— 写失败也用同一个宿主错误码，故不能只看码。
    return isNotFound(e) ? null : { corrupt: true, reason: errText(e) };
  }
  if (!txt) return null; // 空件 = 尚未构建（写侧只在构建成功后落盘）
  let parsed: any;
  try {
    parsed = JSON.parse(txt);
  } catch (e: any) {
    return { corrupt: true, reason: errText(e) };
  }
  // 形状不符同样是坏件：截断/写坏的文件常常**仍是合法 JSON**（如 `[]`）；不查形状就会把
  // 「vundefined · 节点数：undefined」当一份正常诊断渲染出去（那比报错更难发现）。
  if (!parsed || typeof parsed !== "object" || typeof parsed.nodeCount !== "number") return { corrupt: true, reason: "形状不符（缺 nodeCount）" };
  return parsed as ShadowManifest;
};

/** 诊断渲染：版本/节点数/来源数/失败项/健康判断。**三态各渲染各的**（坏件不得混成「尚无」）。 */
export const renderManifest = (m: ManifestRead): string => {
  if (!m) return "（shadow manifest：尚无（尚未构建投影索引））";
  if (isManifestCorrupt(m)) {
    return `（shadow manifest：**坏件** —— 文件在，但读不出可用内容（${m.reason}）。`
      + `这与「尚未构建」**不是**同一件事：删掉该文件后重新构建投影索引即可修复。）`;
  }
  const failures = (m.failures || []).length;
  const lines = [`# Shadow Manifest · v${m.version}`, `- 构建时间：${m.builtAt}`, `- 节点数：${m.nodeCount} · 来源数：${m.sourceCount}`, `- 失败项：${failures}`];
  if (failures) { lines.push(""); lines.push("## 失败项"); for (const f of m.failures.slice(0, 20)) lines.push(`- ${f.path}：${f.reason}`); }
  lines.push("", "> 只诊断、不增强；System-derived（rm -rf 可重建）。");
  return lines.join("\n");
};
