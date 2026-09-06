// dsh-shadow —— soul/soul.ts：Soul Kernel（curated 身份/价值观/原则/品味/边界）。从 index.ts 迁出。
export const readSoul = async (fs: any, ws: string) => {
  try {
    const t = await fs.resolve(`${ws}/shadow/soul/soul.json`, { cwd: ws });
    const txt = await fs.readText(t);
    return txt ? (JSON.parse(txt) || null) : null;
  } catch {
    return null;
  }
};

export const soulText = (soul: any) => {
  const lines = ["[Soul Kernel]"];
  if (soul?.identity) lines.push(`身份 ${typeof soul.identity === "string" ? soul.identity : (soul.identity.name || soul.identity.role || JSON.stringify(soul.identity))}`);
  if (Array.isArray(soul?.values) && soul.values.length) lines.push(`价值观 ${soul.values.join("、")}`);
  if (Array.isArray(soul?.principles) && soul.principles.length) lines.push(`原则 ${soul.principles.join("、")}`);
  if (soul?.taste) lines.push(`品味 ${JSON.stringify(soul.taste)}`);
  if (Array.isArray(soul?.boundaries) && soul.boundaries.length) lines.push(`边界 ${soul.boundaries.join("、")}`);
  return lines.join("\n");
};
