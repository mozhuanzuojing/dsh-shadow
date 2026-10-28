/**
 * v2 contract — 时间。所有“现在”经 Clock 注入，纯函数可测。
 */

export interface Clock {
  now(): Date;
  today(offsetDays?: number): string;
  stamp(): string;
}

const pad = (n: number): string => String(n).padStart(2, "0");

export const dateOf = (d: Date): string =>
  `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export const timeOf = (d: Date): string =>
  `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

export const stampOf = (d: Date): string =>
  `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;

export const systemClock: Clock = {
  now: () => new Date(),
  today: (offsetDays = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - (Number(offsetDays) || 0));
    return dateOf(d);
  },
  stamp: () => stampOf(new Date()),
};

export const fixedClock = (iso: string): Clock => {
  const base = new Date(iso);
  return {
    now: () => new Date(base),
    today: (offsetDays = 0) => {
      const d = new Date(base);
      d.setDate(d.getDate() - (Number(offsetDays) || 0));
      return dateOf(d);
    },
    stamp: () => stampOf(base),
  };
};

/** `HHMMSS` → `HH:MM:SS`；非法值给 00:00:00（调用方负责判断是否合法）。 */
export const fmtTime = (hhmmss: string): string => {
  const s = String(hhmmss || "").padEnd(6, "0");
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
};

export const ageDays = (date: string, now = new Date()): number => {
  const t = Date.parse(`${String(date).slice(0, 10)}T00:00:00`);
  if (Number.isNaN(t)) return 0;
  const base = new Date(`${dateOf(now)}T00:00:00`).getTime();
  return Math.max(0, Math.round((base - t) / 86400000));
};

export const atOf = (date: string, hhmmss: string): string => `${date} ${fmtTime(hhmmss)}`;
