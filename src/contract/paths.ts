/**
 * v2 contract — 路径与文件名。
 *
 * 权威命名：atoms/<YYYY-MM-DD>--<HHMMSS>-<slug>--<uid6>.md
 * v1 兼容：atoms/<YYYY-MM-DD>--<HHMMSS>-<slug>.md（uid 缺省）。
 */

export const SHADOW_DIR = ".shadow";
export const ATOMS_DIR = `${SHADOW_DIR}/atoms`;
export const INDEXES_DIR = `${SHADOW_DIR}/indexes`;
export const INDEX_DB = `${INDEXES_DIR}/index.sqlite`;
export const INDEX_MD = `${INDEXES_DIR}/_index.md`;
export const MATERIALS_DIR = `${INDEXES_DIR}/materials`;
export const AFFAIRES_DIR = `${INDEXES_DIR}/affaires`;
export const EPISODES_DIR = `${INDEXES_DIR}/episodes`;
/** 每 atom 的 abstract（派生、可重建；v2 新增物化目标）。 */
export const ABSTRACTS_DIR = `${INDEXES_DIR}/abstracts`;
export const AUDIT_DIR = `${SHADOW_DIR}/audit`;
export const SOUL_DIR = `${SHADOW_DIR}/soul`;
export const SOUL_FILE = `${SOUL_DIR}/soul.json`;
export const TASTE_FILE = `${SHADOW_DIR}/taste/taste.json`;
export const RESOURCES_DIR = `${SHADOW_DIR}/resources`;
export const LAB_DIR = `${SHADOW_DIR}/lab`;

export const posix = (p: string): string => String(p || "").replace(/\\/g, "/");

export const normalizeRel = (p: string): string => {
  const s = posix(p).replace(/^\.\//, "").replace(/\/+/g, "/");
  return s.endsWith("/") && s.length > 1 ? s.slice(0, -1) : s;
};

export const joinRel = (...parts: string[]): string =>
  parts.map(normalizeRel).filter(Boolean).join("/").replace(/\/+/g, "/");

export const atomRel = (ws: string, name: string): string => {
  const base = posix(ws).replace(/\/+$/, "");
  return `${base}/${ATOMS_DIR}/${name}`;
};

const pad = (n: number): string => String(n).padStart(2, "0");

export const dateOf = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeOf = (d: Date): string => `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

/** 6 位 base36 唯一后缀；调用方可注入随机源以便测试。 */
export const newUid = (rand: () => number = Math.random): string => {
  let n = Math.floor(rand() * 36 ** 6);
  const chars = "0123456789abcdefghijklmnopqrstuvwxyz";
  let out = "";
  for (let i = 0; i < 6; i++) {
    out = chars[n % 36] + out;
    n = Math.floor(n / 36);
  }
  return out;
};

export const atomFileName = (date: string, hhmmss: string, slug: string, uid: string): string =>
  `${date}--${hhmmss}-${slug}--${uid}.md`;

export interface AtomNameParts {
  date: string;
  time: string;
  slug: string;
  uid?: string;
}

const ATOM_RE = /^(\d{4}-\d{2}-\d{2})--(\d{6})-(.+)\.md$/;

export const parseAtomName = (name: string): AtomNameParts | null => {
  const m = ATOM_RE.exec(String(name || ""));
  if (!m) return null;
  const rawSlug = m[3]!;
  const u = /^(.*)--([a-z0-9]{6})$/.exec(rawSlug);
  return {
    date: m[1]!,
    time: m[2]!,
    slug: u ? u[1]! : rawSlug,
    uid: u ? u[2]! : undefined,
  };
};

export const isAtomName = (name: string): boolean => parseAtomName(name) !== null;

/** `.shadow/atoms/...` 相对路径 → 文件名。 */
export const baseName = (rel: string): string => normalizeRel(rel).split("/").pop() || "";
