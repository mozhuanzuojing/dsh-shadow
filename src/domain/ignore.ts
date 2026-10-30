/**
 * v2 domain — 简化版 .gitignore 匹配 + 目录排除（纯函数，无依赖）。
 *
 * 支持：注释/空行、`!` 取反、尾部 `/` 目录、前导 `/` 锚定、`*` `**` `?` 通配。
 * 语义按"整条相对路径"测试：目录规则也能命中其下路径（walker 在目录层就跳过）。
 * 不是 git 的完整实现（如嵌套 .gitignore、字符组），但覆盖绝大多数常见模式；够用且可测。
 */

export interface IgnoreRule {
  negated: boolean;
  dirOnly: boolean;
  regex: RegExp;
}

const esc = (c: string): boolean => ".+^${}()|[]\\".includes(c);

const globToRegex = (glob: string): string => {
  let out = "";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i]!;
    if (c === "*") {
      if (glob[i + 1] === "*") {
        if (glob[i + 2] === "/") {
          out += "(?:.*/)?";
          i += 2;
        } else {
          out += ".*";
          i += 1;
        }
      } else {
        out += "[^/]*";
      }
    } else if (c === "?") {
      out += "[^/]";
    } else if (esc(c)) {
      out += `\\${c}`;
    } else {
      out += c;
    }
  }
  return out;
};

export const compileGitignore = (text: string): IgnoreRule[] => {
  const rules: IgnoreRule[] = [];
  for (const raw of String(text ?? "").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    let negated = false;
    if (line.startsWith("!")) {
      negated = true;
      line = line.slice(1).trim();
    }
    if (!line) continue;
    let dirOnly = false;
    if (line.endsWith("/")) {
      dirOnly = true;
      line = line.slice(0, -1);
    }
    const anchored = line.startsWith("/");
    if (anchored) line = line.slice(1);
    const body = globToRegex(line);
    const re = !anchored && !line.includes("/") ? `(?:^|/)${body}(?:$|/)` : `^${body}(?:$|/)`;
    rules.push({ negated, dirOnly, regex: new RegExp(re) });
  }
  return rules;
};

/** 组合 .gitignore 文本 + 显式 exclude（目录名或相对前缀）。 */
export const makeIgnore = (gitignoreText: string, exclude: string[] = []): ((rel: string, isDir: boolean) => boolean) => {
  const rules = compileGitignore(gitignoreText);
  const ex = exclude
    .map((s) => String(s).replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "").trim())
    .filter(Boolean);
  return (rel: string, isDir: boolean): boolean => {
    const p = String(rel ?? "").replace(/\\/g, "/").replace(/^\.?\//, "");
    if (!p) return false;
    for (const e of ex) {
      if (p === e || p.startsWith(`${e}/`) || p.split("/").includes(e)) return true;
    }
    let ignored = false;
    for (const r of rules) {
      if (r.dirOnly && !isDir) continue;
      if (r.regex.test(p)) ignored = !r.negated;
    }
    return ignored;
  };
};
