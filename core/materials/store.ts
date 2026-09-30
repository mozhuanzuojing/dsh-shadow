// dsh-shadow —— core/materials/store.ts：材料卡的落盘（派生层 I/O）。
//
// 落点（adr/0110 §2.1，与 adr/0106 §2.2 对齐 —— **派生件不占 source 位**）：
//   · 当前圈：`.shadow/indexes/materials/<key>-<hash>.md`
//   · 归档圈：`.shadow/indexes/materials/<key>-<hash>.history/<圈号>.md`（**只追加、永不改写**）
//   · 并卡后的旧卡：`.shadow/indexes/materials/_merged/<文件名>`（**证据不删**）
import { indexesRel } from "../paths.js";
import { readRel } from "../../persistence/files.js";
import {
  applyEvidence, emptyCard, materialFileName, mergeCards, normalizeMaterialKey, parseCard, renderCard,
  type EvidenceInput, type MaterialCard,
} from "./card.js";

export { normalizeMaterialKey } from "./card.js";

export const cardRel = (key: string): string => indexesRel(`materials/${materialFileName(key)}`);
export const historyRel = (key: string, ring: number): string =>
  indexesRel(`materials/${materialFileName(key).replace(/\.md$/, "")}.history/${ring}.md`);

export const readCard = async (fs: any, ws: string, key: string, source = key): Promise<{ card: MaterialCard; existed: boolean }> => {
  const text = await readRel(fs, ws, cardRel(key));
  return text ? { card: parseCard(text, key), existed: true } : { card: emptyCard(key, source), existed: false };
};

const write = async (fs: any, ws: string, rel: string, text: string): Promise<void> => {
  const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
  await fs.writeText(t, text);
};

export interface MaterialRecord {
  raw: string;                               // 原始引用写法（首次出现时记为卡的 source）
  input: EvidenceInput;                      // 证据（affaire / atomRel / decisions / contradicts / confirmed）
}

export interface MaterialDeps {
  /** 取「读到的是第几版」（源指纹）：拿不到就返回 `""` ⇒ 卡上显示 `（未记）`（**可见**，不是静默）。 */
  sourceVersionOf?: (raw: string) => Promise<string>;
}

export interface RecordOutcome { key: string; wrote: boolean; reason: string }

/**
 * 把一条记忆的「背景/材料」登记成证据圈（**写侧**调用 —— 与收口同一条判据：资产成长发生在写侧）。
 * 平衡三律的判定在 `applyEvidence`（纯函数）；本函数只负责读卡 → 判定 → 落盘（含归档圈）。
 * **源指纹**（§2.3 第四项）：版本变了但结论没变 ⇒ **只刷新卡的「读到的版本」，不开新圈**（不算新结论）。
 */
export const recordMaterials = async (fs: any, ws: string, items: MaterialRecord[], deps: MaterialDeps = {}): Promise<RecordOutcome[]> => {
  const out: RecordOutcome[] = [];
  for (const it of items) {
    const key = normalizeMaterialKey(it.raw);
    if (!key) continue;
    const { card } = await readCard(fs, ws, key, it.raw);
    const version = deps.sourceVersionOf ? await deps.sourceVersionOf(it.raw).catch(() => "") : "";
    const versionChanged = Boolean(version) && version !== card.version;
    const plan = applyEvidence(card, it.input);
    if (!plan.ok || !plan.changed) {
      // 版本刷新是**独立**的一件事：结论没变但源变了 ⇒ 仍要落到卡上（否则「读到第几版」永远是旧值）
      if (versionChanged) {
        await write(fs, ws, cardRel(key), renderCard({ ...card, version }));
        out.push({ key, wrote: true, reason: `version-refresh：${card.version || "（未记）"} → ${version}` });
      } else {
        out.push({ key, wrote: false, reason: plan.reason });
      }
      continue;
    }
    // 律 3：开新圈前先把**上一圈**整份快照落进归档（只追加、永不改写）
    if (plan.history) {
      const prev = card.rings[card.rings.length - 1];
      await write(fs, ws, historyRel(key, prev.ring), plan.history);
    }
    await write(fs, ws, cardRel(key), renderCard(version ? { ...plan.card, version } : plan.card));
    out.push({ key, wrote: true, reason: plan.reason });
  }
  return out;
};

/*
 * ⚠ **并卡不在产品面**（`adr/0110` §2.0 的代价那段）：它需要人判断「这两张确实是同一份材料」，
 * 天然没有自动触发点；挂在产品面只会被接线门记成「导出但无调用点」（同 `adr/0106` 补记二对
 * `writeRoleCard` 的处置）。⇒ 并卡做成**可用的工具**：`tools/material-card-merge.ts`
 * （读两张卡 → `mergeCards` → 旧卡挪 `indexes/materials/_merged/`，证据不删）。
 */
