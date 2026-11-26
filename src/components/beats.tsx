// "Beats": the reward currency. 1 per focused minute, 5 per finished to-do.
import { useEffect, useRef, useState } from "react";
import { NavLink } from "react-router-dom";
import { HeartPulse } from "lucide-react";
import { useNamed } from "../lib/hooks";
import { startOfWeek, toDateStr, today } from "../lib/dates";
import { cx } from "../lib/format";

export function useBeats() {
  const weekStart = toDateStr(startOfWeek(new Date()));
  const q = useNamed<{ balance: number; today: number; week: number; lifetime: number }>("beats_summary", [today(), weekStart]);
  const r = q.rows[0];
  return { balance: r?.balance ?? 0, today: r?.today ?? 0, week: r?.week ?? 0, lifetime: r?.lifetime ?? 0, loaded: !!r };
}

/** The heart icon + amount, e.g. "♥ 120 beats". */
export function Beats({ n, className, unit = true, sign }: { n: number; className?: string; unit?: boolean; sign?: boolean }) {
  return (
    <span className={cx("inline-flex items-center gap-1 font-semibold tabular", className)} style={{ color: "var(--beat)" }}>
      <HeartPulse size="1.05em" strokeWidth={2.2} />
      {sign && n > 0 ? "+" : ""}
      {n.toLocaleString()}
      {unit && <span className="font-medium opacity-80">{Math.abs(n) === 1 ? "beat" : "beats"}</span>}
    </span>
  );
}

/** Sidebar balance. Floats a "+5" when beats come in, wherever they were earned. */
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
      title="Beats: 1 per focused minute, 5 per finished to-do. Spend them on treats."
      className={({ isActive }) =>
        cx(
          "relative flex items-center gap-1.5 rounded-xl px-2.5 py-1.5 text-[13px] hover:bg-surface-2",
          isActive && "bg-surface-2",
          collapsed && "flex-col gap-0 px-1 text-[10px]",
        )
      }
    >
      <HeartPulse size={collapsed ? 16 : 15} strokeWidth={2.2} style={{ color: "var(--beat)" }} className={cx(pops.length > 0 && "beat-thump")} />
      <span className="font-semibold tabular">{balance.toLocaleString()}</span>
      {pops.map((p) => (
        <span key={p.id} className="beat-pop pointer-events-none absolute -top-1 left-1/2 text-xs font-bold" style={{ color: "var(--beat)" }}>
          +{p.n}
        </span>
      ))}
    </NavLink>
  );
}
