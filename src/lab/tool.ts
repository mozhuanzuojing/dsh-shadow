/**
 * v2 lab — `shadow_lab` 工具面。默认只读；写型 mode 必须显式 write:true。
 */

import { params, str, bool, obj, type ToolSpec } from "../contract/schema.js";
import { RECALL_PREFIX } from "../domain/text.js";
import { runLab } from "./run.js";
import { LAB_GROUPS, LAB_WRITE_MODES } from "./registry.js";
import type { DepsFactory, RegisteredTool } from "../surface/tools.js";

const renderText = (_args: unknown, value: string): { type: "text"; text: string }[] => [{ type: "text", text: value }];

const description = (): string => {
  const groups = LAB_GROUPS.map((g) => `${g.name}：${g.modes.join(" / ")}`).join("；");
  return `研究/边界能力统一入口，51 个 mode（默认只读；写型 31 个必须 write:true）。${groups}。` +
    "index 是只读诊断，重建走 ops。input 按该 mode 的 JSON Schema 校验：未知字段/类型/枚举/缺必填 → INVALID_INPUT，错误列出该 mode 允许字段。";
};

export const makeLabTools = (depsFactory: DepsFactory): RegisteredTool[] => [
  {
    name: "shadow_lab",
    description: description(),
    parameters: params(
      {
        mode: str("51 个 lab mode 之一（如 federation / temporal / index）；未知值返回 UNKNOWN_MODE + 最近邻。"),
        input: obj("mode 专属字段；按该 mode 的 per-mode schema 校验（未知字段/类型/枚举/缺必填 → INVALID_INPUT，错误列出允许字段）。"),
        write: bool("默认 false；写型 mode 必须显式 true；只读 mode 带 true 返回 WRITE_DENIED。"),
      },
      ["mode"],
    ),
    output: { schema: { type: "string" }, render: renderText },
    execute: async (args: Record<string, unknown>, exec: any): Promise<string> => {
      try {
        const d = await depsFactory(exec);
        if (!d.ok) return `${RECALL_PREFIX}${JSON.stringify({ ok: false, mode: args.mode, error: { code: d.error.code, message: d.error.message } }, null, 2)}`;
        const r = await runLab(
          { fs: d.value.fs, ws: d.value.ws, config: d.value.config, signals: d.value.signals, agent: exec?.agent },
          { mode: args.mode, input: args.input, write: args.write },
        );
        if (!r.ok) {
          return `${RECALL_PREFIX}${JSON.stringify({ ok: false, mode: args.mode, error: { code: r.error.code, message: r.error.message } }, null, 2)}`;
        }
        return `${RECALL_PREFIX}${JSON.stringify({ ok: true, ...r.value, writeModes: LAB_WRITE_MODES.size }, null, 2)}`;
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        return `${RECALL_PREFIX}${JSON.stringify({ ok: false, mode: args.mode, error: { code: "INTERNAL", message } }, null, 2)}`;
      }
    },
  },
];

/** 供测试断言 schema 成本（lab 是可选工具，不应挤占 core schema）。 */
export const labSchemaChars = (tools: RegisteredTool[]): number =>
  tools.reduce((n, t) => n + JSON.stringify(t.parameters).length + t.description.length, 0);
