// dsh-shadow —— observer/state.ts：ObserverState（v0.23，只读取、不自动推断）。
// "此刻观察者处于什么生命状态"——非情绪，是灵魂信号 vs 认知噪声分层的起点。
// 来源：soul.json（state/observerState/observer.state）或 args.state 注入。禁止根据聊天/语言自动推断（会污染 Observer）。
import type { ObserverState } from "../core/types.js";

export const readObserverState = async (fs: any, ws: string, soul: any, argsState?: any): Promise<ObserverState> => {
  const fromSoul = (soul && (soul.state || soul.observerState || soul.observer?.state)) || {};
  const base = fromSoul && typeof fromSoul === "object" ? fromSoul : {};
  const pick = (k: string) => (argsState && argsState[k] !== undefined) ? String(argsState[k]) : (base[k] !== undefined ? String(base[k]) : undefined);
  return {
    energy: pick("energy"),
    focus: pick("focus"),
    goalStage: pick("goalStage"),
    uncertainty: argsState?.uncertainty !== undefined ? Number(argsState.uncertainty) : (base.uncertainty !== undefined ? Number(base.uncertainty) : undefined),
  };
};
