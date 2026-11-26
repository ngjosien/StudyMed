// All dates are local. Storage formats: 'YYYY-MM-DD' and 'YYYY-MM-DDTHH:MM'.

const pad = (n: number) => String(n).padStart(2, "0");

export const toDateStr = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const toDateTimeStr = (d: Date) => `${toDateStr(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const today = () => toDateStr(new Date());
export const nowDT = () => toDateTimeStr(new Date());

/** Parse 'YYYY-MM-DD' or 'YYYY-MM-DDTHH:MM' as a local date. */
export function parse(s: string | null | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 0, m[5] ? +m[5] : 0);
}

export const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};
export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1);
export const addMinutes = (d: Date, n: number) => new Date(d.getTime() + n * 60_000);

/** Monday-based week start. */
export function startOfWeek(d: Date) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7;
  return addDays(x, -dow);
}
export const startOfMonth = (d: Date) => new Date(d.getFullYear(), d.getMonth(), 1);
export const sameDay = (a: Date, b: Date) => toDateStr(a) === toDateStr(b);
export const monthKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
export const fmtDate = (s?: string | null) => {
  const d = parse(s);
  return d ? fmt({ day: "numeric", month: "short", year: "numeric" }).format(d) : "";
};
export const fmtDateShort = (s?: string | null) => {
  const d = parse(s);
  return d ? fmt({ weekday: "short", day: "numeric", month: "short" }).format(d) : "";
};
export const fmtTime = (s?: string | null) => {
  if (!s) return "";
  const t = s.length > 5 ? s.slice(11, 16) : s;
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return fmt({ hour: "numeric", minute: "2-digit" }).format(new Date(2000, 0, 1, h, m));
};
export const fmtDateTime = (s?: string | null) => {
  if (!s) return "";
  return s.length > 10 ? `${fmtDateShort(s)}, ${fmtTime(s)}` : fmtDateShort(s);
};
export const fmtMonth = (d: Date) => fmt({ month: "long", year: "numeric" }).format(d);
export const weekdayLong = (d: Date) => fmt({ weekday: "long" }).format(d);

/** Days from today to the given date (negative = past). */
export function daysUntil(s?: string | null): number | null {
  const d = parse(s);
  if (!d) return null;
  const t = parse(today())!;
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.round((day.getTime() - t.getTime()) / 86_400_000);
}

export function countdown(s?: string | null): string {
  const n = daysUntil(s);
  if (n === null) return "";
  if (n === 0) return "Today";
  if (n === 1) return "Tomorrow";
  if (n === -1) return "Yesterday";
  return n > 0 ? `In ${n} days` : `${-n} days ago`;
}
