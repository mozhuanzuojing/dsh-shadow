// dsh-shadow —— evidence/paths.ts：证据路径候选/路径判定。从 index.ts 迁出。纯函数。
export const evidencePathsOf = (text: string) => {
  const clue = (String(text).match(/^> 证据链：(.+)$/m) || [])[1] || "";
  if (clue) {
    const evM = clue.match(/证据\(([^)]*)\)/);
    if (evM) return evM[1].split(/[、,]/).map((s) => s.trim()).filter(Boolean);
  }
  const mats = (String(text).match(/^> 背景\/材料：(.+)$/m) || [])[1] || "";
  return mats.split(/[、,]/).map((s) => s.trim()).filter(Boolean);
};

export const isPathLike = (p: string) => p && !/^https?:|github\.com|arxiv/i.test(p) && (/[\\\/]/.test(p) || /\.[a-z0-9]{1,6}$/i.test(p) || /^[A-Za-z]:/.test(p));
