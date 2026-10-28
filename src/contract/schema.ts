/**
 * v2 contract — JSON Schema 与 mode/tool 描述符。
 *
 * schema 是“生成的”，不是手写的：mode 描述符声明自己的参数，surface 只负责拼工具。
 */

export type JsonSchema =
  | { type: "string"; description?: string; enum?: string[]; pattern?: string; default?: unknown }
  | { type: "number"; description?: string; default?: unknown; minimum?: number; maximum?: number }
  | { type: "boolean"; description?: string; default?: unknown }
  | { type: "array"; description?: string; items?: JsonSchema }
  | { type: "object"; description?: string; properties?: Record<string, JsonSchema>; required?: string[]; additionalProperties?: boolean };

export interface ToolParameters {
  type: "object";
  properties: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties: boolean;
}

export interface ToolSpec {
  name: string;
  description: string;
  parameters: ToolParameters;
}

export const str = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema =>
  ({ type: "string", description, ...extra } as JsonSchema);

export const num = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema =>
  ({ type: "number", description, ...extra } as JsonSchema);

export const bool = (description: string, extra: Partial<JsonSchema> = {}): JsonSchema =>
  ({ type: "boolean", description, ...extra } as JsonSchema);

export const obj = (description: string, properties: Record<string, JsonSchema> = {}): JsonSchema =>
  ({ type: "object", description, properties, additionalProperties: true });

export const params = (properties: Record<string, JsonSchema>, required: string[] = []): ToolParameters => ({
  type: "object",
  properties,
  required,
  additionalProperties: false,
});

/** 供测试断言 schema 成本上限；不参与运行时。 */
export const schemaChars = (spec: ToolSpec): number =>
  JSON.stringify(spec.parameters).length + spec.description.length;
