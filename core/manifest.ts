// dsh-shadow —— core/manifest.ts：Shadow Manifest（zg `manifest.json` / `status --debug` / observability 思想，ADR-0048 ⑧）。
// 记录索引投影的元数据（版本/构建时间/节点数/来源数）+ 诊断（每文件失败）。系统派生，rm -rf 可重建。
import { SHADOW_ROOT } from "./paths.js";
import type { ShadowNode } from "./node.js";

export interface ShadowManifest {
  version: string;
  builtAt: string;
  nodeCount: number;
  sourceCount: number;
  failures: { path: string; reason: string }[];
}

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

export const readManifest = async (fs: any, ws: string): Promise<ShadowManifest | null> => {
  try { const t = await fs.resolve(`${ws}/${manifestRel()}`, { cwd: ws }); const txt = await fs.readText(t); return txt ? JSON.parse(txt) : null; } catch { return null; }
};

/** 诊断渲染：版本/节点数/来源数/失败项/健康判断。 */
export const renderManifest = (m: ShadowManifest | null): string => {
  if (!m) return "（shadow manifest：尚无（尚未构建投影索引））";
  const failures = (m.failures || []).length;
  const lines = [`# Shadow Manifest · v${m.version}`, `- 构建时间：${m.builtAt}`, `- 节点数：${m.nodeCount} · 来源数：${m.sourceCount}`, `- 失败项：${failures}`];
  if (failures) { lines.push(""); lines.push("## 失败项"); for (const f of m.failures.slice(0, 20)) lines.push(`- ${f.path}：${f.reason}`); }
  lines.push("", "> 只诊断、不增强；System-derived（rm -rf 可重建）。");
  return lines.join("\n");
};
