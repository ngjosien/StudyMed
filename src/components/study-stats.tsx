// Study stats: today against today's goal, the week against its target, a 14-day
// chart with the daily goal line, and what each module still needs.
import { useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Timer } from "lucide-react";
import { fmtMinutes } from "../lib/format";
import { parse } from "../lib/dates";
import { todayVerdict, useStudyStats } from "../lib/study";
import { Card, MilestoneBar } from "./ui";
import { cx } from "../lib/format";

const m = (n: number) => fmtMinutes(Math.round(n)) || "0m";

/** Single-series bar chart: minutes per day, with the average daily goal as a dashed line. */
function DailyChart({ series, goal, today }: { series: { date: string; minutes: number }[]; goal: number; today: string }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 1000;
  const H = 210;
  const pad = { l: 40, r: 8, t: 14, b: 26 };
  const max = Math.max(60, goal * 1.25, ...series.map((s) => s.minutes));
  const top = Math.ceil(max / 60) * 60;
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / top);
  const bw = (W - pad.l - pad.r) / series.length;
  const ticks = [0, top / 2, top];
  const h = hover != null ? series[hover] : null;
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full max-h-[240px]" role="img" aria-label="Minutes studied each day for the last 14 days">
        {ticks.map((v) => (
          <g key={v}>
            <line x1={pad.l} x2={W - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth={1} />
            <text x={pad.l - 8} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
              {v ? `${v / 60}h` : "0"}
            </text>
          </g>
        ))}
        {series.map((s, i) => {
          const x = pad.l + i * bw + 1;
          const w = bw - 2;
          const bh = Math.max(0, y(0) - y(s.minutes));
          const met = goal > 0 && s.minutes >= goal;
          return (
            <g key={s.date} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" />
              {bh > 0 && (
                <path
                  d={`M${x} ${y(0)}V${y(s.minutes) + Math.min(4, bh)}q0 -${Math.min(4, bh)} ${Math.min(4, w / 2)} -${Math.min(4, bh)}H${x + w - Math.min(4, w / 2)}q${Math.min(4, w / 2)} 0 ${Math.min(4, w / 2)} ${Math.min(4, bh)}V${y(0)}Z`}
                  fill="var(--accent)"
                  opacity={hover === i ? 1 : met ? 0.9 : 0.5}
                />
              )}
              <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={12} fill={s.date === today ? "var(--fg)" : "var(--muted)"} fontWeight={s.date === today ? 700 : 400}>
                {parse(s.date)!.toLocaleDateString(undefined, { weekday: "narrow" })}
              </text>
            </g>
          );
        })}
        {goal > 0 && (
          <g pointerEvents="none">
            <line x1={pad.l} x2={W - pad.r} y1={y(goal)} y2={y(goal)} stroke="var(--fg)" strokeOpacity={0.55} strokeWidth={1.5} strokeDasharray="5 4" />
            <text x={W - pad.r} y={y(goal) - 5} textAnchor="end" fontSize={12} fill="var(--muted)">
              average daily goal {m(goal)}
            </text>
          </g>
        )}
      </svg>
      {h && (
        <div
          className="pointer-events-none absolute -top-2 rounded-xl border border-line bg-surface-solid px-2.5 py-1.5 text-xs shadow-lg"
          style={{ left: `${((pad.l + (hover! + 0.5) * bw) / W) * 100}%`, transform: "translate(-50%, -100%)" }}
        >
          <div className="font-semibold">{parse(h.date)!.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</div>
          <div className="tabular">
            {m(h.minutes)}
            {goal > 0 && <span className="text-muted"> · {h.minutes >= goal ? "goal met" : `${m(goal - h.minutes)} short`}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

export function StudyStats() {
  const s = useStudyStats(14);
  const v = todayVerdict(s.todayDone, s.todayGoal, m);
  const weekLeft = Math.max(0, s.weekGoal - s.weekDone);
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 className="flex-1 text-[15px] font-semibold">Study stats</h2>
        {s.streak > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-1 text-xs font-medium text-accent">
            <Flame size={13} /> {s.streak}-day streak
          </span>
        )}
        <Link to="/focus" className="inline-flex items-center gap-1 rounded-full bg-accent px-3 py-1 text-xs font-medium text-accent-fg">
          <Timer size={13} /> Focus
        </Link>
      </div>
      <div className="grid gap-5 md:grid-cols-2">
        <div>
          <p className="eyebrow !text-[9.5px]">Today</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-display tabular text-[32px] leading-none">{m(s.todayDone)}</span>
            {s.todayGoal > 0 && <span className="text-sm text-muted">of {m(s.todayGoal)}</span>}
          </p>
          {s.todayGoal > 0 && <MilestoneBar className="mt-3" value={s.todayDone} max={s.todayGoal} label="Today's study goal" />}
          <p className={cx("mt-3 text-sm", v.tone === "behind" ? "font-medium text-danger" : v.tone === "muted" ? "text-muted" : "font-medium text-accent")}>{v.text}</p>
        </div>
        <div>
          <p className="eyebrow !text-[9.5px]">This week</p>
          <p className="mt-1 flex items-baseline gap-2">
            <span className="font-display tabular text-[32px] leading-none">{m(s.weekDone)}</span>
            {s.weekGoal > 0 && <span className="text-sm text-muted">of {m(s.weekGoal)}</span>}
          </p>
          {s.weekGoal > 0 && <MilestoneBar className="mt-3" value={s.weekDone} max={s.weekGoal} label="This week's study target" />}
          <p className="mt-3 text-sm text-muted">
            {!s.weekGoal
              ? "No weekly targets yet."
              : weekLeft
                ? `${m(weekLeft)} left over ${s.daysLeft} day${s.daysLeft > 1 ? "s" : ""}: about ${m(weekLeft / s.daysLeft)} a day`
                : `Week's target reached, ${m(s.weekDone - s.weekGoal)} over`}
          </p>
        </div>
      </div>

      <div className="mt-6">
        <div className="mb-1 flex items-baseline justify-between text-xs text-muted">
          <span className="eyebrow !text-[9.5px]">Last 14 days</span>
          <span>average {m(s.avg7)} a day this past week</span>
        </div>
        <DailyChart series={s.series} goal={s.dailyAverageGoal} today={s.t} />
      </div>

      {s.perModule.length > 0 && (
        <div className="mt-5 space-y-3">
          <p className="eyebrow !text-[9.5px]">By module this week</p>
          {s.perModule.map((x) => (
            <div key={x.m.id}>
              <div className="mb-1.5 flex items-baseline gap-2 text-sm">
                <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: x.m.color }} />
                <span className="font-medium">{x.m.code}</span>
                <span className="min-w-0 flex-1 truncate text-muted">{x.m.name}</span>
                <span className="tabular text-xs">
                  {m(x.done)}
                  {x.goal ? ` / ${m(x.goal)}` : ""}
                </span>
              </div>
              {x.goal > 0 && <MilestoneBar value={x.done} max={x.goal} color={x.m.color} label={`${x.m.code} this week`} />}
              {x.goal > 0 && (
                <p className="mt-1.5 text-[11px] text-muted">
                  {x.left ? `${m(x.left)} to go · about ${m(x.perDay)} a day` : x.done > x.goal ? `Target met, ${m(x.done - x.goal)} extra` : "Target met"}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

/** Compact version for Home: today against today's goal, then each module's week. */
export function StudyMini() {
  const s = useStudyStats(7);
  const v = todayVerdict(s.todayDone, s.todayGoal, m);
  if (!s.weekGoal && !s.todayDone) return <p className="py-1.5 text-sm text-muted">No weekly study targets yet.</p>;
  return (
    <div className="space-y-3">
      <div>
        <div className="mb-1.5 flex items-baseline justify-between text-sm">
          <span className="font-medium">Today</span>
          <span className="tabular text-xs text-muted">
            {m(s.todayDone)}
            {s.todayGoal ? ` / ${m(s.todayGoal)}` : ""}
          </span>
        </div>
        {s.todayGoal > 0 && <MilestoneBar value={s.todayDone} max={s.todayGoal} label="Today's study goal" />}
        <p className={cx("mt-1.5 text-[11px]", v.tone === "behind" ? "text-danger" : "text-muted")}>{v.text}</p>
      </div>
      {s.perModule
        .filter((x) => x.goal > 0)
        .map((x) => (
          <div key={x.m.id}>
            <div className="mb-1.5 flex items-baseline gap-2 text-sm">
              <span className="font-medium">{x.m.code}</span>
              <span className="min-w-0 flex-1 truncate text-muted">{x.m.name}</span>
              <span className="tabular shrink-0 text-xs text-muted">
                {m(x.done)} / {m(x.goal)}
              </span>
            </div>
            <MilestoneBar value={x.done} max={x.goal} color={x.m.color} label={`${x.m.code} this week`} />
          </div>
        ))}
    </div>
  );
}

/** Today's to-dos as a savings-style bar. */
export function TodosToday({ done, total, className }: { done: number; total: number; className?: string }) {
  if (!total) return null;
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-baseline justify-between text-xs">
        <span className="font-medium">Today's to-dos</span>
        <span className="tabular text-muted">
          {done} of {total} done{done === total ? " · all done" : ""}
        </span>
      </div>
      <MilestoneBar value={done} max={total} label="Today's to-dos done" />
    </div>
  );
}
