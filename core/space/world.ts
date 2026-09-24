// dsh-shadow —— core/space/world.ts：投影空间小世界 hydrate + 缓存（ADR-0107）。
// 磁盘 = 档案；本对象可扔可重建。缓存键：`projectionSpace.cache`（默认开，≠ projectionStore）。
import { SHADOW_ROOT, atomsRel, rolesRel, affairesRel } from "../paths.js";
import { onByDefault } from "../util.js";
import { shadowSourcesFingerprint } from "../view/projection-store.js";
import { readSoul } from "../../subject/soul/soul.js";
import { listMemories, readRel } from "../../persistence/files.js";
import type { RoleCard, AffaireCard } from "./cards.js";

export interface ProjectionSpaceWorld {
  ws: string;
  soul: any | null;
  missingSoul: boolean;
  roles: RoleCard[];
  affaires: AffaireCard[];
  /** 原子 rel 列表（不内嵌全文，避免缓存暴胀）。 */
  atomRels: string[];
  sourceFp: string;
  soulToken: string;
}

type CacheEntry = { fp: string; world: ProjectionSpaceWorld };
const cacheByWs = new Map<string, CacheEntry>();

const parseRoleCard = (id: string, text: string): RoleCard => {
  const title = (text.match(/^#\s*Role:\s*(.+)$/m) || [])[1]?.trim() || id;
  const summary = (text.match(/^>\s*summary:\s*(.+)$/m) || [])[1]?.trim();
  return { id, title, summary };
};

const parseAffaireCard = (roleId: string, id: string, text: string): AffaireCard => {
  const title = (text.match(/^#\s*Affaire:\s*(.+)$/m) || [])[1]?.trim() || id;
  const summary = (text.match(/^>\s*summary:\s*(.+)$/m) || [])[1]?.trim();
  const members: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^>\s*-\s*(.+)$/);
    if (m) members.push(m[1].trim());
  }
  return { id, roleId, title, members, summary };
};

/** soul.json 的令牌（size:version）；读不到 ⇒ `missing`。 */
export const soulTokenOf = async (fs: any, ws: string): Promise<string> => {
  try {
    const dir = await fs.resolve(`${ws}/${SHADOW_ROOT}/soul`, { cwd: ws });
    const files = (await fs.listDir(dir)) || [];
    const f = files.find((x: any) => x?.type === "file" && String(x.name) === "soul.json");
    if (!f) return "missing";
    return `soul.json:${f.size ?? "?"}:${f.version ?? "?"}`;
  } catch {
    return "missing";
  }
};

const listRoleCards = async (fs: any, ws: string): Promise<RoleCard[]> => {
  const out: RoleCard[] = [];
  try {
    const root = await fs.resolve(`${ws}/${rolesRel()}`, { cwd: ws });
    for (const f of (await fs.listDir(root)) || []) {
      if (f?.type !== "file" || !String(f.name).endsWith(".md")) continue;
      const id = String(f.name).replace(/\.md$/i, "");
      const text = await readRel(fs, ws, `${rolesRel()}/${f.name}`);
      if (text) out.push(parseRoleCard(id, text));
    }
  } catch { /* 无 roles 目录 */ }
  return out;
};

const listAffaireCards = async (fs: any, ws: string): Promise<AffaireCard[]> => {
  const out: AffaireCard[] = [];
  try {
    const root = await fs.resolve(`${ws}/${affairesRel()}`, { cwd: ws });
    for (const roleDir of (await fs.listDir(root)) || []) {
      if (roleDir?.type !== "directory") continue;
      const roleId = String(roleDir.name);
      const files = (await fs.listDir(roleDir.target)) || [];
      for (const f of files) {
        if (f?.type !== "file" || !String(f.name).endsWith(".md")) continue;
        const id = String(f.name).replace(/\.md$/i, "");
        const text = await readRel(fs, ws, `${affairesRel(roleId)}/${f.name}`);
        if (text) out.push(parseAffaireCard(roleId, id, text));
      }
    }
  } catch { /* 无 affaires */ }
  return out;
};

const hydrateFresh = async (fs: any, ws: string, sourceFp: string, soulToken: string): Promise<ProjectionSpaceWorld> => {
  const soul = await readSoul(fs, ws);
  const mems = await listMemories(fs, ws);
  return {
    ws,
    soul,
    missingSoul: !soul,
    roles: await listRoleCards(fs, ws),
    affaires: await listAffaireCards(fs, ws),
    atomRels: mems.map((m: any) => m.rel),
    sourceFp,
    soulToken,
  };
};

/**
 * 取得投影空间小世界。`projectionSpace.cache !== false`（默认开）时按指纹复用。
 */
export const loadProjectionSpace = async (
  fs: any,
  ws: string,
  config?: { projectionSpace?: { cache?: boolean } },
): Promise<ProjectionSpaceWorld> => {
  const sourceFp = (await shadowSourcesFingerprint(fs, ws)) ?? "";
  const soulToken = await soulTokenOf(fs, ws);
  const fp = `${sourceFp}\n#soul:${soulToken}`;
  const useCache = onByDefault(config?.projectionSpace?.cache);
  if (useCache) {
    const hit = cacheByWs.get(ws);
    if (hit && hit.fp === fp) return hit.world;
  }
  const world = await hydrateFresh(fs, ws, sourceFp || "?", soulToken);
  if (useCache) cacheByWs.set(ws, { fp, world });
  return world;
};

/** 测试 / 写后主动丢弃。 */
export const invalidateProjectionSpace = (ws?: string): void => {
  if (ws) cacheByWs.delete(ws);
  else cacheByWs.clear();
};

/** 原子文件令牌（供便利贴新鲜度）；listDir 级，读不到 ⇒ `?:?`。 */
export const atomTokenOf = async (fs: any, ws: string, atomName: string): Promise<string> => {
  try {
    const root = await fs.resolve(`${ws}/${atomsRel()}`, { cwd: ws });
    const files = (await fs.listDir(root)) || [];
    const f = files.find((x: any) => x?.type === "file" && String(x.name) === atomName);
    if (!f) return "?:?";
    return `${f.size ?? "?"}:${f.version ?? "?"}`;
  } catch {
    return "?:?";
  }
};
