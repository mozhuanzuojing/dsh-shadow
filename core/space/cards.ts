// dsh-shadow —— core/space/cards.ts：Role / Affaire 最小写 API（ADR-0106 · R2/P1/A1）。
// Role = 一等卡；Affaire = 容器卡（成员 = atom 文件名/id 指针，不复制正文）。
import { rolesRel, affairesRel } from "../paths.js";
import { scrubUnsafe } from "../../security/scrub.js";

export interface RoleCard {
  id: string;
  title: string;
  summary?: string;
}

export interface AffaireCard {
  id: string;
  roleId: string;
  title: string;
  /** Atom 文件名（`.shadow/atoms/` 下的 basename），不复制正文。 */
  members: string[];
  summary?: string;
}

const slugId = (s: string) =>
  String(s || "x").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "x";

export const roleRel = (id: string) => `${rolesRel()}/${slugId(id)}.md`;
export const affaireRel = (roleId: string, id: string) => `${affairesRel(slugId(roleId))}/${slugId(id)}.md`;

export const renderRoleCard = (c: RoleCard): string => {
  const id = slugId(c.id);
  const lines = [
    `# Role: ${scrubUnsafe(c.title || id)}`,
    "",
    `> id: ${id}`,
    c.summary ? `> summary: ${scrubUnsafe(c.summary).slice(0, 200)}` : "",
    "",
  ].filter(Boolean);
  return lines.join("\n") + "\n";
};

export const renderAffaireCard = (c: AffaireCard): string => {
  const id = slugId(c.id);
  const roleId = slugId(c.roleId);
  const members = (c.members || []).map((m) => scrubUnsafe(String(m).split("/").pop() || m).trim()).filter(Boolean);
  const lines = [
    `# Affaire: ${scrubUnsafe(c.title || id)}`,
    "",
    `> id: ${id}`,
    `> role: ${roleId}`,
    c.summary ? `> summary: ${scrubUnsafe(c.summary).slice(0, 200)}` : "",
    "> members:",
    ...members.map((m) => `> - ${m}`),
    "",
  ].filter((l) => l !== undefined);
  return lines.join("\n") + "\n";
};

export const writeRoleCard = async (fs: any, ws: string, card: RoleCard): Promise<string> => {
  const rel = roleRel(card.id);
  const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
  await fs.writeText(t, renderRoleCard(card));
  return rel;
};

export const writeAffaireCard = async (fs: any, ws: string, card: AffaireCard): Promise<string> => {
  const rel = affaireRel(card.roleId, card.id);
  const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
  await fs.writeText(t, renderAffaireCard(card));
  return rel;
};
