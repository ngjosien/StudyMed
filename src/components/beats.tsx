// Laurels: the reward currency (a laurel wreath, the classical mark of achievement).
// 1 per focused minute, 5 per finished to-do. Stored in the `beats` table.
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { NavLink } from "react-router-dom";
import { useNamed } from "../lib/hooks";
import { startOfWeek, toDateStr, today } from "../lib/dates";
import { cx } from "../lib/format";

export const CURRENCY = { one: "laurel", many: "laurels" } as const;
export const unitOf = (n: number) => (Math.abs(n) === 1 ? CURRENCY.one : CURRENCY.many);

export function useBeats() {
  const weekStart = toDateStr(startOfWeek(new Date()));
  const q = useNamed<{ balance: number; today: number; week: number; lifetime: number }>("beats_summary", [today(), weekStart]);
  const r = q.rows[0];
  return { balance: r?.balance ?? 0, today: r?.today ?? 0, week: r?.week ?? 0, lifetime: r?.lifetime ?? 0, loaded: !!r };
}

/* A small laurel wreath, open at the top, drawn once. */
const WREATH = (() => {
  const leaf = (bx: number, by: number, tx: number, ty: number, w: number) => {
    const mx = (bx + tx) / 2;
    const my = (by + ty) / 2;
    const len = Math.hypot(tx - bx, ty - by);
    const nx = (-(ty - by) / len) * w;
    const ny = ((tx - bx) / len) * w;
    const f = (v: number) => v.toFixed(2);
    return `M${f(bx)} ${f(by)}Q${f(mx + nx)} ${f(my + ny)} ${f(tx)} ${f(ty)}Q${f(mx - nx)} ${f(my - ny)} ${f(bx)} ${f(by)}Z`;
  };
  const cx0 = 12;
  const cy0 = 11.2;
  const R = 7.2;
  const leaves: string[] = [];
  let stem = "";
  for (const side of [-1, 1]) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 5; i++) {
      // From the bottom (90°) round the side to the top (about 235°).
      const a = ((100 + i * 25) * Math.PI) / 180;
      const x = cx0 + Math.cos(a) * R;
      pts.push([side < 0 ? x : 24 - x, cy0 + Math.sin(a) * R]);
    }
    stem += `M${pts.map((p) => p.map((v) => v.toFixed(2)).join(" ")).join("L")}`;
    pts.forEach(([x, y], i) => {
      if (i === 0) return;
      const [px, py] = pts[i - 1];
      const tx = x - px;
      const ty = y - py;
      const tl = Math.hypot(tx, ty);
      const ox = (x - cx0) / R;
      const oy = (y - cy0) / R;
      const size = 4.1 - i * 0.2;
      // Outer leaf, leaning outward and along the branch; a smaller inner one.
      leaves.push(leaf(x, y, x + (tx / tl) * size * 0.6 + ox * size * 0.8, y + (ty / tl) * size * 0.6 + oy * size * 0.8, 2.3));
      if (i < 5) leaves.push(leaf(x, y, x + (tx / tl) * size * 0.75 - ox * size * 0.45, y + (ty / tl) * size * 0.75 - oy * size * 0.45, 1.7));
    });
  }
  return { stem, leaves: leaves.join("") };
})();

export function Laurel({ size = 16, className, style }: { size?: number | string; className?: string; style?: CSSProperties }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={cx("shrink-0", className)} style={style} aria-hidden>
      <path d={WREATH.stem} fill="none" stroke="currentColor" strokeWidth={1.1} strokeLinecap="round" strokeLinejoin="round" />
      <path d={WREATH.leaves} fill="currentColor" />
    </svg>
  );
}

/** The wreath + amount, e.g. "120 laurels". */
export function Beats({ n, className, unit = true, sign }: { n: number; className?: string; unit?: boolean; sign?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-semibold tabular", className)} style={{ color: "var(--beat)" }}>
      <Laurel size="1.15em" />
      {sign && n > 0 ? "+" : ""}
      {n.toLocaleString()}
      {unit && <span className="font-medium opacity-80">{unitOf(n)}</span>}
    </span>
  );
}

/** Sidebar balance. A quiet "+5" rises when laurels come in, wherever they were earned. */
export function BeatsChip({ collapsed }: { collapsed: boolean }) {
  const { balance, loaded } = useBeats();
  const prev = useRef<number | null>(null);
  const [pops, setPops] = useState<{ id: number; n: number }[]>([]);
  useEffect(() => {
    if (!loaded) return;
    if (prev.current != null && balance > prev.current) {
      const id = Date.now() + Math.random();
      const n = balance - prev.current;
      setPops((p) => [...p, { id, n }]);
      setTimeout(() => setPops((p) => p.filter((x) => x.id !== id)), 1700);
    }
    prev.current = balance;
  }, [balance, loaded]);
  return (
    <NavLink
      to="/rewards"
      title="Laurels: 1 per focused minute, 5 per finished to-do. Spend them on rewards."
      className={({ isActive }) =>
        cx(
          "relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] hover:bg-surface-2",
          isActive && "bg-surface-2",
          collapsed && "flex-col gap-0 px-1 text-[10px]",
        )
      }
    >
      <Laurel size={collapsed ? 17 : 16} style={{ color: "var(--beat)" }} />
      <span className="font-semibold tabular">{balance.toLocaleString()}</span>
      {pops.map((p) => (
        <span key={p.id} className="beat-pop pointer-events-none absolute -top-1 left-1/2 text-[11px] font-semibold" style={{ color: "var(--beat)" }}>
          +{p.n}
        </span>
      ))}
    </NavLink>
  );
}
