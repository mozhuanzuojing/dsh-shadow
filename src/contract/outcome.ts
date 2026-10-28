/**
 * v2 contract — outcome：所有可能失败的 I/O 与解析都返回 Outcome，禁止 catch 成空。
 *
 * 空（NOT_FOUND / 正常空集）与失败（PERMISSION / IO / CORRUPT）必须可区分；
 * 调用方只有看到 ok:false 才有权把它转成可见 Signal。
 */

export type ErrorCode =
  | "NOT_FOUND"
  | "PERMISSION"
  | "IO"
  | "CORRUPT"
  | "BUSY"
  | "CONFLICT"
  | "INVALID"
  | "UNAVAILABLE"
  | "INTERNAL";

export interface ShadowError {
  code: ErrorCode;
  message: string;
  /** 同一操作稍后重试是否可能成功。 */
  retryable?: boolean;
  /** 结构化细节（路径、行号、原因码）；可直接进日志，不得进用户可见的密钥位。 */
  detail?: Record<string, unknown>;
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; error: ShadowError };

export const ok = <T>(value: T): Outcome<T> => ({ ok: true, value });

export const err = <T = never>(
  code: ErrorCode,
  message: string,
  detail?: Record<string, unknown>,
  retryable = false,
): Outcome<T> => ({ ok: false, error: { code, message, detail, retryable } });

export const isOk = <T>(x: Outcome<T>): x is { ok: true; value: T } => x.ok;
export const isErr = <T>(x: Outcome<T>): x is { ok: false; error: ShadowError } => !x.ok;

export const isNotFound = (x: Outcome<unknown>): boolean =>
  !x.ok && x.error.code === "NOT_FOUND";

/** 把未知异常归一成 ShadowError；不要保留可能含密钥的原始消息以外的字段。 */
export const fromError = (e: unknown, fallback: ErrorCode = "INTERNAL"): ShadowError => {
  if (e && typeof e === "object") {
    const any = e as { code?: unknown; message?: unknown };
    const code = typeof any.code === "string" ? (any.code as ErrorCode) : fallback;
    const message = typeof any.message === "string" ? any.message : String(e);
    return { code, message };
  }
  return { code: fallback, message: String(e) };
};

/** 提取值或抛错（只在“调用方已经决定失败即中止”的边界用）。 */
export const unwrap = <T>(x: Outcome<T>): T => {
  if (x.ok) return x.value;
  const e = x.error;
  throw Object.assign(new Error(`${e.code}: ${e.message}`), { code: e.code, detail: e.detail });
};
