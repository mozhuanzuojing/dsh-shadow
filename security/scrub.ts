// dsh-shadow —— security/scrub.ts：安全清洗（密钥打码 / 控制与双向字符 / 系统脚手架标签 / 注入短语）。
// **只改 Presentation，不改 Canonical Evidence**（v0.14 边界）。全部纯函数，从 index.ts 迁出。

export const SECRET_PATTERNS = [/sk-[A-Za-z0-9]{16,}/, /ghp_[A-Za-z0-9]{30,}/, /AKIA[0-9A-Z]{16}/, /AIza[0-9A-Za-z_-]{30,}/, /xox[baprs]-[A-Za-z0-9-]{10,}/, /-----BEGIN [A-Z ]+ PRIVATE KEY-----/];
export const UNSAFE_CONTROL = /[\u0000-\u001f\u007f]|[\u202a-\u202e\u2066-\u2069]/;

export const sanitizeText = (text: unknown) => {
  let s = String(text || "");
  for (const re of SECRET_PATTERNS) s = s.replace(re, "***");
  return s;
};

export const isUnsafe = (line: unknown) => UNSAFE_CONTROL.test(String(line));

// 剔除控制/双向覆盖字符：用于线索头等“正文之外”的文本（正文已由 isUnsafe 过滤整行剔除）。
// 注意：这里连 \t\n\r 一起剔（单行字段用）。整篇文档请用 scrubFinal——它会保留排版换行（v1.12.7 修）。
export const scrubUnsafe = (s: unknown) => String(s || "").replace(/[\u0000-\u001f\u007f]|[\u202a-\u202e\u2066-\u2069]/g, "");

// 整篇文档用的控制字符清洗：保留 \t(09) \n(0A) \r(0D) 排版字符，只剔其余 C0 控制符与双向覆盖符。
// 旧实现整篇套 scrubUnsafe → 把所有换行压成一行（读侧 16 个模块的 Markdown 结构全丢）。
export const UNSAFE_CONTROL_DOC = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]|[\u202a-\u202e\u2066-\u2069]/g;
export const scrubUnsafeDoc = (s: unknown) => String(s || "").replace(UNSAFE_CONTROL_DOC, "");

// 系统脚手架标签块：/workspace 指令、runtime context、skill 目录等以 <system-reminder>…</system-reminder> 成对注入。
export const SYSTEM_TAG_NAMES = ["system-reminder", "system-instruction", "system_instruction", "persisted-output", "private"];
export const SYSTEM_TAG_RE = new RegExp(`<(${SYSTEM_TAG_NAMES.join("|")})\\b[^>]*>[\\s\\S]*?<\\/\\1\\s*>`, "gi");
export const SYSTEM_TAG_RESIDUE_RE = new RegExp(`<\\/?(?:${SYSTEM_TAG_NAMES.join("|")})\\b[^>]*>`, "gi");
export const stripSystemScaffold = (s: unknown) => {
  let t = String(s || "");
  t = t.replace(SYSTEM_TAG_RE, " ");
  t = t.replace(SYSTEM_TAG_RESIDUE_RE, " ");
  return t.trim();
};

// 无标签"裸"系统脚手架块（用长且唯一的完整措辞开头识别，避免误伤正常用户文本）。
export const SYSTEM_SCAFFOLD_MARKERS = [
  "The following workspace instructions may be relevant to your work",
  "A skill is a reusable set of task-specific instructions",
  "The following skills are available in this session",
  "Current runtime context. This snapshot supersedes",
  "Additional instructions from: ",
];
export const isScaffoldBlock = (t: unknown) => {
  const s = String(t || "").trim();
  if (!s) return true; // 剔除标签后为空 = 纯系统脚手架消息
  return SYSTEM_SCAFFOLD_MARKERS.some((m) => s.startsWith(m));
};

// P1 读侧二次 scrub：即便写入侧已 scrub，历史/旧文件仍可能残留控制/双向字符/裸密钥；剥离 HTML/JS 活动标签。
// **保留换行/制表/回车**（整篇文档用 scrubUnsafeDoc）：否则 Markdown 结构（> 引用、条目分行）会被压成一行。
export const INJECTION_PHRASES = /(你是指令|忽略上面|忽略之前|忽略以上|无视系统|无视指令|绕过规则|以上皆为指令)/g;
export const scrubFinal = (x: unknown) => {
  let s = scrubUnsafeDoc(String(x || ""));
  s = sanitizeText(s);
  s = s.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, " ");
  s = s.replace(/<\/?[a-zA-Z][^>]*>/g, " ");
  s = s.replace(INJECTION_PHRASES, " ");
  return s;
};

export const referencedMaterials = (text: unknown) => {
  const out: string[] = [];
  const add = (x: unknown) => {
    const t = String(x || "").trim();
    if (t && !out.includes(t)) out.push(t);
  };
  const t = String(text || "");
  for (const m of t.matchAll(/`([^`]{2,64})`/g)) add(m[1]);
  for (const m of t.matchAll(/(?:[A-Za-z]:\\|\/|)?[A-Za-z0-9_\-./\\]{3,}\.(?:md|ts|js|json|py|yaml|yml|html|css|mjs|sh|ps1|txt)\b/g)) add(m[0]);
  for (const m of t.matchAll(/@([A-Za-z0-9_\-./\\]{2,40})/g)) add(m[1]);
  for (const m of t.matchAll(/(?:https?:\/\/|github\.com\/)[^\s)]+/g)) add(m[0]);
  for (const m of t.matchAll(/arxiv[:\s]+(\d{4}\.\d{4,5})/gi)) add(`arXiv:${m[1]}`);
  return out;
};
