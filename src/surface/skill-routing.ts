/**
 * v3 surface — 内置 bundled skill provider：`dsh-shadow-routing`（ADR-0035）。
 *
 * 随插件包提供 skill 正文（`skills/dsh-shadow-routing/SKILL.md`），向 `ctx.skills.registerProvider`
 * 注册为一个 `source:'bundled'`、`rank=600` 的不可变 provider（范式同 @deepseek-ai/dsh-skill-badge）。
 * 为保持零新增依赖，**不 import** `@deepseek-ai/dsh-skill` 的类型，采用 duck-type 结构。
 * `get()` 每次加载都重读包内文件（body 可改，无需版本化）。
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const PROVIDER_NAME = "dsh-shadow-routing";
/** 与 @deepseek-ai/dsh-skill 的 BUNDLED_SKILL_RANK 对齐（600）。 */
const BUNDLED_SKILL_RANK = 600;
const SKILL_DIR_URL = new URL("../../skills/dsh-shadow-routing/", import.meta.url);
const BODY_URL = new URL("SKILL.md", SKILL_DIR_URL);
const RESOURCE_BASE = { kind: "directory", path: fileURLToPath(SKILL_DIR_URL) } as const;
const INVOCATION = { modelInvocable: true, userInvocable: true } as const;
const DESCRIPTION =
  "使用 dsh-shadow 记忆时如何路由：何时查 shadow（recall_shadow / read_shadow{taste|direction|soul} / shadow_query / recall_similar）、何时直接读文件核真值、何时只用自身上下文；并记住自动召回『首轮必空/换词不命中/只给任务卡』等坑。";

const CANDIDATE = {
  name: PROVIDER_NAME,
  description: DESCRIPTION,
  invocation: INVOCATION,
  provider: PROVIDER_NAME,
  source: "bundled",
  resourceBase: RESOURCE_BASE,
  rank: BUNDLED_SKILL_RANK,
  locator: BODY_URL,
} as const;

/** 供 index.ts 注册的不可变 provider（结构兼容 SkillProvider）。 */
export const routingProvider = {
  name: PROVIDER_NAME,
  list: async (): Promise<unknown[]> => [CANDIDATE],
  async get(): Promise<Record<string, unknown>> {
    return {
      name: CANDIDATE.name,
      description: CANDIDATE.description,
      invocation: CANDIDATE.invocation,
      provider: PROVIDER_NAME,
      source: "bundled",
      resourceBase: RESOURCE_BASE,
      content: await readFile(BODY_URL, "utf8"),
    };
  },
};

/** skill 名（供测试/诊断）。 */
export const ROUTING_SKILL_NAME = PROVIDER_NAME;
