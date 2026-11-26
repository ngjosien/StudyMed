// Habit garden: every habit is a potted plant. Keeping the habit grows it from a
// seed to a flower; missing days makes it droop and fade, but it never dies,
// and watering it (ticking today) perks it straight back up.
import { useState } from "react";
import { Droplets, Sprout } from "lucide-react";
import { type Row } from "../../lib/api";
import { addDays, parse, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Card } from "../../components/ui";

export const STAGES = ["Seed", "Sprout", "Seedling", "Leafy", "Budding", "In bloom"];
const THRESHOLDS = [0, 1, 3, 7, 14, 25];

/** How grown a habit is. Done days add growth; missed ones take a little away. */
export function growth(dates: Set<string>, goal: number) {
  const t = today();
  const sorted = [...dates].sort();
  if (!sorted.length) return { score: 0, stage: 0, wilting: false, watered: false };
  let score = 0;
  if (goal >= 7) {
    for (let d = parse(sorted[0])!; toDateStr(d) < t; d = addDays(d, 1)) score = dates.has(toDateStr(d)) ? score + 1 : Math.max(1, score - 1.5);
    if (dates.has(t)) score += 1;
  } else {
    const thisWeek = toDateStr(startOfWeek(new Date()));
    for (let w = startOfWeek(parse(sorted[0])!); toDateStr(w) <= thisWeek; w = addDays(w, 7)) {
      const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(w, i)));
      const n = days.filter((d) => dates.has(d)).length;
      score += n;
      if (toDateStr(w) < thisWeek && n < goal) score = Math.max(1, score - (goal - n) * 1.5);
    }
  }
  const stage = THRESHOLDS.reduce((s, th, i) => (score >= th ? i : s), 0);
  const watered = dates.has(t);
  let wilting = false;
  if (!watered) {
    if (goal >= 7) wilting = !dates.has(toDateStr(addDays(parse(t)!, -1)));
    else {
      const last = startOfWeek(addDays(new Date(), -7));
      wilting = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(last, i))).filter((d) => dates.has(d)).length < goal;
    }
  }
  return { score, stage, wilting, watered };
}

/* ------------------------------------------------------------ Drawing */
const STEM = "#5f8f66";
const HEIGHT = [0, 16, 32, 52, 72, 88];

function leafPath(x: number, y: number, ang: number, len: number) {
  const tx = x + Math.cos(ang) * len;
  const ty = y + Math.sin(ang) * len;
  const nx = -Math.sin(ang) * len * 0.32;
  const ny = Math.cos(ang) * len * 0.32;
  const mx = (x + tx) / 2;
  const my = (y + ty) / 2;
  return `M${x} ${y}Q${mx + nx} ${my + ny} ${tx} ${ty}Q${mx - nx} ${my - ny} ${x} ${y}Z`;
}

function Flower({ kind, x, y, color, open }: { kind: number; x: number; y: number; color: string; open: boolean }) {
  const ink = `color-mix(in srgb, ${color} 60%, #3a2330)`;
  if (!open) {
    // A closed bud.
    return <path d={`M${x} ${y + 2}C${x - 6} ${y - 2} ${x - 3} ${y - 11} ${x} ${y - 13}C${x + 3} ${y - 11} ${x + 6} ${y - 2} ${x} ${y + 2}Z`} fill={color} stroke={ink} strokeWidth={0.8} />;
  }
  switch (kind) {
    case 0: // tulip
      return (
        <g stroke={ink} strokeWidth={0.8}>
          <path d={`M${x - 9} ${y - 14}C${x - 10} ${y - 2} ${x - 5} ${y + 3} ${x} ${y + 3}C${x + 5} ${y + 3} ${x + 10} ${y - 2} ${x + 9} ${y - 14}L${x + 4.5} ${y - 8}L${x} ${y - 16}L${x - 4.5} ${y - 8}Z`} fill={color} />
        </g>
      );
    case 1: // daisy
      return (
        <g>
          {Array.from({ length: 12 }, (_, i) => {
            const a = (i / 12) * Math.PI * 2;
            return <ellipse key={i} cx={x + Math.cos(a) * 7} cy={y - 6 + Math.sin(a) * 7} rx={5} ry={2} transform={`rotate(${(a * 180) / Math.PI} ${x + Math.cos(a) * 7} ${y - 6 + Math.sin(a) * 7})`} fill={color} stroke={ink} strokeWidth={0.5} />;
          })}
          <circle cx={x} cy={y - 6} r={3.6} fill="#e9c46a" stroke={ink} strokeWidth={0.6} />
        </g>
      );
    case 2: // lavender spike
      return (
        <g fill={color} stroke={ink} strokeWidth={0.5}>
          {Array.from({ length: 9 }, (_, i) => (
            <ellipse key={i} cx={x + (i % 2 ? 2.4 : -2.4)} cy={y - i * 3.2} rx={2.4} ry={1.8} />
          ))}
        </g>
      );
    case 3: // rose
      return (
        <g stroke={ink} strokeWidth={0.7} fill={color}>
          <circle cx={x} cy={y - 7} r={8.5} />
          <path d={`M${x - 4} ${y - 7}a4 4 0 1 1 4 4a2.5 2.5 0 1 1 -2.5 -3`} fill="none" />
          <path d={`M${x - 8} ${y - 4}q4 4 8 3q4 1 8 -3`} fill="none" />
        </g>
      );
    default: // bellflowers
      return (
        <g stroke={ink} strokeWidth={0.6} fill={color}>
          {[-8, 0, 8].map((dx, i) => (
            <g key={i}>
              <path d={`M${x} ${y - 4}Q${x + dx * 0.6} ${y - 8} ${x + dx} ${y - 2 + (i === 1 ? -4 : 0)}`} fill="none" stroke={STEM} strokeWidth={1} />
              <path d={`M${x + dx - 3.5} ${y + 4 + (i === 1 ? -4 : 0)}Q${x + dx} ${y - 6 + (i === 1 ? -4 : 0)} ${x + dx + 3.5} ${y + 4 + (i === 1 ? -4 : 0)}Z`} />
            </g>
          ))}
        </g>
      );
  }
}

export function Plant({ stage, wilting, color, kind, size = 120 }: { stage: number; wilting: boolean; color: string; kind: number; size?: number }) {
  const base = { x: 60, y: 118 };
  const h = HEIGHT[stage];
  const bend = wilting ? 22 : 4 * Math.sin(kind * 1.7);
  const top = { x: base.x + (wilting ? 16 : bend * 0.4), y: base.y - h * (wilting ? 0.82 : 1) };
  const ctrl = { x: base.x + bend, y: base.y - h * 0.55 };
  const at = (t: number) => ({
    x: (1 - t) * (1 - t) * base.x + 2 * (1 - t) * t * ctrl.x + t * t * top.x,
    y: (1 - t) * (1 - t) * base.y + 2 * (1 - t) * t * ctrl.y + t * t * top.y,
  });
  const leaves = [0, 2, 4, 6, 8, 8][stage];
  return (
    <svg viewBox="0 0 120 160" width={size} height={(size * 160) / 120} aria-hidden className="overflow-visible">
      <g className={cx(!wilting && stage > 0 && "garden-sway")} style={{ transformOrigin: `${base.x}px ${base.y}px`, filter: wilting ? "saturate(0.4) brightness(1.05)" : undefined }}>
        {stage === 0 ? (
          <ellipse cx={base.x} cy={base.y - 2} rx={4} ry={2.6} fill="#9a7552" />
        ) : (
          <>
            <path d={`M${base.x} ${base.y}Q${ctrl.x} ${ctrl.y} ${top.x} ${top.y}`} fill="none" stroke={STEM} strokeWidth={stage > 2 ? 2.4 : 1.8} strokeLinecap="round" />
            {Array.from({ length: leaves }, (_, i) => {
              const t = 0.22 + (i / Math.max(1, leaves)) * 0.66;
              const p = at(t);
              const side = i % 2 ? 1 : -1;
              const droop = wilting ? 0.9 : 0;
              const ang = side > 0 ? -0.55 + droop : Math.PI + 0.55 - droop;
              const len = (stage === 1 ? 9 : 12 + stage * 1.6) * (1 - t * 0.35);
              return <path key={i} d={leafPath(p.x, p.y, ang, len)} fill={STEM} fillOpacity={0.88} stroke="#3f6b47" strokeWidth={0.5} />;
            })}
            {stage === 1 && (
              <>
                <path d={leafPath(top.x, top.y, -0.6, 8)} fill={STEM} />
                <path d={leafPath(top.x, top.y, Math.PI + 0.6, 8)} fill={STEM} />
              </>
            )}
            {stage >= 4 && (
              <g transform={`translate(${top.x} ${top.y}) scale(1.4) translate(${-top.x} ${-top.y})`}>
                <Flower kind={kind} x={top.x} y={top.y} color={color} open={stage === 5} />
              </g>
            )}
          </>
        )}
      </g>
      {/* Pot */}
      <path d="M36 118 L84 118 L79 152 Q60 156 41 152 Z" fill="#c48a6a" />
      <path d="M36 118 L84 118 L79 152 Q60 156 41 152 Z" fill="url(#pot-shade)" />
      <rect x="32" y="112" width="56" height="9" rx="2.5" fill="#b37658" />
      <rect x="38" y="132" width="44" height="2.2" rx="1.1" fill={color} opacity={0.9} />
      <ellipse cx="60" cy="113.5" rx="24" ry="2.6" fill="#6f4b34" />
      <defs>
        <linearGradient id="pot-shade" x1="0" x2="1">
          <stop offset="0" stopColor="#000" stopOpacity="0.12" />
          <stop offset="0.45" stopColor="#fff" stopOpacity="0.1" />
          <stop offset="1" stopColor="#000" stopOpacity="0.18" />
        </linearGradient>
      </defs>
    </svg>
  );
}

/* ------------------------------------------------------------ The garden */
export function Garden({ habits, byHabit, onWater }: { habits: Row[]; byHabit: Map<number, Set<string>>; onWater: (h: Row, on: boolean) => void }) {
  const [splash, setSplash] = useState<number | null>(null);
  const states = habits.map((h) => ({ h, g: growth(byHabit.get(h.id) ?? new Set(), h.goal_per_week) }));
  const thirsty = states.filter((s) => !s.g.watered).length;
  const blooming = states.filter((s) => s.g.stage === 5).length;
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-5 py-3">
        <Sprout size={16} className="text-accent" />
        <h2 className="flex-1 font-semibold">Garden</h2>
        <span className="text-xs text-muted">
          {blooming > 0 && `${blooming} in bloom · `}
          {thirsty ? `${thirsty} to water today` : "Everything is watered today"}
        </span>
      </div>
      <div className="relative px-4 pt-4 pb-3">
        <div className="flex flex-wrap justify-center gap-x-2 gap-y-4">
          {states.map(({ h, g }) => (
            <button
              type="button"
              key={h.id}
              onClick={() => {
                const on = !g.watered;
                onWater(h, on);
                if (on) {
                  setSplash(h.id);
                  setTimeout(() => setSplash((s) => (s === h.id ? null : s)), 1200);
                }
              }}
              title={g.watered ? `Watered today. Click to undo.` : `Water ${h.name} (mark it done for today)`}
              aria-pressed={g.watered}
              aria-label={`${h.name}: ${STAGES[g.stage]}${g.wilting ? ", wilting" : ""}. ${g.watered ? "Done today" : "Not done today"}`}
              className="group relative flex w-[132px] flex-col items-center rounded-2xl px-1 pt-2 pb-2 transition-colors hover:bg-surface-2/70"
            >
              {splash === h.id && (
                <span className="garden-splash pointer-events-none absolute top-1 left-1/2 text-accent">
                  <Droplets size={20} />
                </span>
              )}
              <span className={cx("transition-transform duration-500", splash === h.id && "garden-grow")}>
                <Plant stage={g.stage} wilting={g.wilting} color={h.color} kind={h.id % 5} />
              </span>
              <span className="mt-1 max-w-full truncate text-sm font-medium">{h.name}</span>
              <span className={cx("text-[11px]", g.watered ? "text-accent" : g.wilting ? "text-danger" : "text-muted")}>
                {g.watered ? "Watered today" : g.wilting ? "Wilting · water me" : "Thirsty"}
              </span>
              <span className="text-[10px] tracking-wide text-muted uppercase">{STAGES[g.stage]}</span>
            </button>
          ))}
        </div>
        <div className="mx-auto mt-1 h-1.5 max-w-3xl rounded-full bg-gradient-to-r from-transparent via-line to-transparent" />
        <p className="mt-2 text-center text-[11px] text-muted">
          Tick a habit to water its plant. Keep it up and it grows from a seed to a flower; skip days and it droops, but it never dies.
        </p>
      </div>
    </Card>
  );
}
