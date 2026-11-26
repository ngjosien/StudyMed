export const fmtMoney = (cents: number | null | undefined, opts: { sign?: boolean } = {}) => {
  const v = (cents ?? 0) / 100;
  const s = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", currencyDisplay: "narrowSymbol" }).format(
    Math.abs(v),
  );
  if (opts.sign) return (v < 0 ? "−" : "+") + s;
  return v < 0 ? "−" + s : s;
};

export const toCents = (dollars: string | number | null | undefined) => {
  if (dollars === null || dollars === undefined || dollars === "") return null;
  const n = typeof dollars === "number" ? dollars : parseFloat(String(dollars).replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
};

export const fromCents = (cents: number | null | undefined) =>
  cents === null || cents === undefined ? "" : (cents / 100).toFixed(2);

export const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);

export const fmtMinutes = (m?: number | null) => {
  if (!m) return "";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  const r = m % 60;
  return r ? `${h}h ${r}m` : `${h}h`;
};

export const cx = (...c: (string | false | null | undefined | 0)[]) => c.filter(Boolean).join(" ");

export const truthy = (v: unknown) => v === true || v === 1 || v === "1";
