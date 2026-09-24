// dsh-shadow —— subject/soul/write.ts：Soul 核心写入口（ADR-0106 · H2∥H3gate）。
// 派生切片（identity timeline 等）可自动写；**核心** soul.json 必须经本闸门。
// 普通 identity-advance **不得**调用本函数。
import { SHADOW_ROOT } from "../../core/paths.js";

/** 强闸令牌：调用方必须显式传入；禁止用普通字符串字面量绕过（符号隔离）。 */
export const SOUL_CORE_WRITE_GATE = Symbol.for("dsh-shadow.soul-core-write-gate");

export type SoulCoreWriteGate = typeof SOUL_CORE_WRITE_GATE;

export interface SoulCoreWriteOpts {
  /** 必须是 `SOUL_CORE_WRITE_GATE`；其它值一律拒绝。 */
  gate: SoulCoreWriteGate;
  /** 人可读原因（留痕；不得为空）。 */
  reason: string;
}

/**
 * 写入 `.shadow/soul/soul.json`（核心）。
 * @returns `{ ok:true, rel }` 或 `{ ok:false, reason }`（缺闸 / 缺原因 / 写失败）。
 */
export const writeSoulCore = async (
  fs: any,
  ws: string,
  soul: unknown,
  opts: SoulCoreWriteOpts,
): Promise<{ ok: true; rel: string } | { ok: false; reason: string }> => {
  if (!opts || opts.gate !== SOUL_CORE_WRITE_GATE) {
    return { ok: false, reason: "拒绝写 soul 核心：缺少 H3gate 令牌（≠ identity-advance）" };
  }
  const reason = String(opts.reason || "").trim();
  if (!reason) return { ok: false, reason: "拒绝写 soul 核心：reason 为空" };
  if (!fs || !ws) return { ok: false, reason: "拒绝写 soul 核心：fs/ws 缺失" };
  const rel = `${SHADOW_ROOT}/soul/soul.json`;
  try {
    const t = await fs.resolve(`${ws}/${rel}`, { cwd: ws });
    const body = JSON.stringify(soul ?? {}, null, 2) + "\n";
    await fs.writeText(t, body);
    console.log(`[dsh-shadow] soul 核心已写（H3gate）：${reason}`);
    return { ok: true, rel };
  } catch (e: any) {
    return { ok: false, reason: `soul 核心写失败：${(e && e.message) || String(e)}` };
  }
};
