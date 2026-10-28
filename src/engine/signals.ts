/**
 * v2 engine — 可见降级信号。active 才渲染；成功时 clear；不 sticky。
 */

import type { Signal } from "../contract/types.js";

export class SignalStore {
  private map = new Map<string, Signal>();

  note(capability: string, code: string, message: string, effect: string, now = Date.now()): void {
    const prev = this.map.get(capability);
    if (prev && prev.active) {
      prev.lastAt = now;
      prev.count += 1;
      prev.code = code;
      prev.message = message;
      prev.effect = effect;
      return;
    }
    this.map.set(capability, {
      capability,
      code,
      message,
      effect,
      firstAt: now,
      lastAt: now,
      count: 1,
      active: true,
    });
  }

  clear(capability: string): void {
    this.map.delete(capability);
  }

  active(): Signal[] {
    return [...this.map.values()].filter((s) => s.active).sort((a, b) => a.capability.localeCompare(b.capability));
  }

  render(): string {
    const list = this.active();
    if (!list.length) return "";
    return list
      .map((s) => `\n\n> ⚠ shadow **能力降级** · ${s.capability}（${new Date(s.lastAt).toISOString()}）\n> **原因**：${s.message}\n> **后果**：${s.effect}`)
      .join("");
  }

  snapshot(): Signal[] {
    return [...this.map.values()].map((s) => ({ ...s }));
  }
}
