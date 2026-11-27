// A week laid out as seven day columns (Mon–Sun), used by To-Dos and Events; and
// WeeksStrip, one column per week, used by Homework and Exams.
// Overdue items sit in a strip above the week, undated ones in a strip below.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import type { Row } from "../lib/api";
import { addDays, fmtDateShort, startOfWeek, toDateStr, today } from "../lib/dates";
import { cx } from "../lib/format";
import { Button, IconButton } from "./ui";

export function WeekBoard({
  rows,
  dateOf,
  render,
  onAdd,
  isOpen,
  addLabel = "Add",
  noDateLabel = "No date",
}: {
  rows: Row[];
  /** 'YYYY-MM-DD…' or null. */
  dateOf: (r: Row) => string | null | undefined;
  render: (r: Row) => ReactNode;
  /** Adds something on a given day (column "+"). */
  onAdd?: (date: string) => void;
  /** Still to do? Open items from before this week show as overdue. */
  isOpen?: (r: Row) => boolean;
  addLabel?: string;
  noDateLabel?: string;
}) {
  const [start, setStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i)));
  const t = today();
  const thisWeek = days.includes(t);
  const day = (r: Row) => {
    const d = dateOf(r);
    return d ? String(d).slice(0, 10) : null;
  };
  const overdue = thisWeek && isOpen ? rows.filter((r) => isOpen(r) && day(r) && day(r)! < days[0]) : [];
  const undated = rows.filter((r) => !day(r) && (!isOpen || isOpen(r)));

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setStart(addDays(start, -7))} />
        <button type="button" onClick={() => setStart(startOfWeek(new Date()))} className="font-display px-1 text-lg hover:text-accent">
          {fmtDateShort(days[0])} – {fmtDateShort(days[6])}
        </button>
        <IconButton icon={ChevronRight} label="Next week" onClick={() => setStart(addDays(start, 7))} />
        {!thisWeek && (
          <Button size="sm" variant="ghost" onClick={() => setStart(startOfWeek(new Date()))}>
            This week
          </Button>
        )}
      </div>

      {overdue.length > 0 && (
        <div className="rounded-[16px] border border-danger/30 bg-danger/5 p-2.5">
          <div className="eyebrow mb-1.5 !text-[10px] !text-danger">Overdue · {overdue.length}</div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {overdue.map((r) => (
              <div key={r.id}>{render(r)}</div>
            ))}
          </div>
        </div>
      )}

      <div className="overflow-x-auto pb-1">
        <div className="grid min-w-[820px] grid-cols-7 gap-1.5">
          {days.map((d) => {
            const items = rows.filter((r) => day(r) === d);
            const isToday = d === t;
            const date = new Date(`${d}T12:00`);
            return (
              <section key={d} className={cx("flex min-h-56 flex-col rounded-[16px] p-1.5", isToday ? "bg-accent-soft ring-1 ring-accent/30" : "bg-surface-2/50", d < t && "opacity-80")}>
                <header className="flex items-baseline gap-1.5 px-1.5 pt-1 pb-2">
                  <span className={cx("eyebrow !text-[10px]", isToday && "!text-accent")}>{date.toLocaleDateString(undefined, { weekday: "short" })}</span>
                  <span className={cx("font-display tabular text-xl leading-none", isToday && "text-accent")}>{date.getDate()}</span>
                  <span className="flex-1" />
                  {items.length > 0 && <span className="text-[10px] text-muted">{items.length}</span>}
                  {onAdd && <IconButton icon={Plus} label={`${addLabel} on ${fmtDateShort(d)}`} onClick={() => onAdd(d)} className="!h-6 !w-6" />}
                </header>
                <div className="flex flex-1 flex-col gap-1.5">
                  {items.map((r) => (
                    <div key={r.id}>{render(r)}</div>
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-[16px] bg-surface-2/50 p-2.5">
          <div className="eyebrow mb-1.5 !text-[10px]">
            {noDateLabel} · {undated.length}
          </div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
            {undated.map((r) => (
              <div key={r.id}>{render(r)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Weeks side by side: one wide column per week holding everything dated that week,
 * scrolled sideways. Opens on this week; arrows move a week at a time. Used by
 * Homework and Exams, where what matters is what's in each week.
 */
export function WeeksStrip({
  rows,
  dateOf,
  render,
  onAdd,
  isOpen,
  weekName,
  addLabel = "Add",
  noDateLabel = "No date",
}: {
  rows: Row[];
  dateOf: (r: Row) => string | null | undefined;
  render: (r: Row) => ReactNode;
  /** Adds something in a week (given its first day, or today for this week). */
  onAdd?: (date: string) => void;
  /** Still to do? Open items from before this week show as overdue above the weeks. */
  isOpen?: (r: Row) => boolean;
  /** A name for a week, such as the semester week ("Week 8"), from its Monday. */
  weekName?: (monday: string) => string | null;
  addLabel?: string;
  noDateLabel?: string;
}) {
  const strip = useRef<HTMLDivElement>(null);
  const t = today();
  const thisMonday = startOfWeek(new Date());
  const day = (r: Row) => {
    const d = dateOf(r);
    return d ? String(d).slice(0, 10) : null;
  };
  const dated = rows.map(day).filter(Boolean) as string[];
  const weeksFrom = (d: string) => Math.round((startOfWeek(new Date(`${d}T12:00`)).getTime() - thisMonday.getTime()) / (7 * 86_400_000));
  const first = Math.max(-26, Math.min(-2, ...dated.map(weeksFrom)));
  const last = Math.min(52, Math.max(12, ...dated.map(weeksFrom)));
  const weeks = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const overdue = isOpen ? rows.filter((r) => isOpen(r) && day(r) && day(r)! < toDateStr(thisMonday)) : [];
  const undated = rows.filter((r) => !day(r) && (!isOpen || isOpen(r)));

  const toThisWeek = (smooth: boolean) => {
    const el = strip.current?.querySelector<HTMLElement>("[data-this-week]");
    if (el && strip.current) strip.current.scrollTo({ left: el.offsetLeft - strip.current.offsetLeft - 8, behavior: smooth ? "smooth" : "auto" });
  };
  useEffect(() => toThisWeek(false), []);
  const nudge = (dir: number) => {
    const col = strip.current?.querySelector<HTMLElement>("[data-week]");
    if (strip.current && col) strip.current.scrollBy({ left: dir * (col.offsetWidth + 12), behavior: "smooth" });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-1">
        <IconButton icon={ChevronLeft} label="Earlier weeks" onClick={() => nudge(-1)} />
        <IconButton icon={ChevronRight} label="Later weeks" onClick={() => nudge(1)} />
        <Button size="sm" variant="ghost" onClick={() => toThisWeek(true)}>
          This week
        </Button>
      </div>

      {overdue.length > 0 && (
        <div className="rounded-[16px] border border-danger/30 bg-danger/5 p-2.5">
          <div className="eyebrow mb-1.5 !text-[10px] !text-danger">Overdue · {overdue.length}</div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {overdue.map((r) => (
              <div key={r.id}>{render(r)}</div>
            ))}
          </div>
        </div>
      )}

      <div ref={strip} className="snap-x snap-mandatory overflow-x-auto scroll-smooth pb-3">
        <div className="flex gap-3">
          {weeks.map((w) => {
            const monday = toDateStr(addDays(thisMonday, w * 7));
            const sunday = toDateStr(addDays(thisMonday, w * 7 + 6));
            const items = rows.filter((r) => day(r) && day(r)! >= monday && day(r)! <= sunday).sort((a, b) => String(dateOf(a)).localeCompare(String(dateOf(b))));
            const byDay = new Map<string, Row[]>();
            items.forEach((r) => byDay.set(day(r)!, [...(byDay.get(day(r)!) ?? []), r]));
            const label = w === 0 ? "This week" : w === 1 ? "Next week" : w === -1 ? "Last week" : null;
            const named = weekName?.(monday);
            return (
              <section
                key={w}
                data-week=""
                {...(w === 0 ? { "data-this-week": "" } : {})}
                className={cx("flex min-h-[520px] w-[300px] shrink-0 snap-start flex-col rounded-[18px] p-3 sm:w-[330px]", w === 0 ? "bg-accent-soft ring-2 ring-accent/40" : "bg-surface-2/50", w < 0 && "opacity-80")}
              >
                <header className="mb-3 flex items-start gap-2 px-1">
                  <div className="min-w-0 flex-1">
                    <div className={cx("font-display text-2xl leading-tight", w === 0 && "text-accent")}>{named ?? label ?? `Week of ${fmtDateShort(monday)}`}</div>
                    <div className="text-sm text-muted">
                      {named && label ? `${label} · ` : ""}
                      {fmtDateShort(monday)} – {fmtDateShort(sunday)}
                    </div>
                  </div>
                  {items.length > 0 && <span className="mt-1 rounded-full bg-surface-solid/70 px-2 py-0.5 text-xs font-semibold">{items.length}</span>}
                  {onAdd && <IconButton icon={Plus} label={`${addLabel} in the week of ${fmtDateShort(monday)}`} onClick={() => onAdd(w === 0 ? t : monday)} />}
                </header>
                {!items.length && <p className="px-1 py-6 text-center text-sm text-muted">Nothing this week</p>}
                <div className="space-y-3">
                  {[...byDay.entries()].map(([d, list]) => {
                    const date = new Date(`${d}T12:00`);
                    return (
                      <div key={d}>
                        <div className={cx("mb-1.5 px-1 text-xs font-semibold tracking-wide uppercase", d === t ? "text-accent" : "text-muted")}>
                          {d === t ? "Today · " : ""}
                          {date.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
                        </div>
                        <div className="space-y-2">
                          {list.map((r) => (
                            <div key={r.id}>{render(r)}</div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      </div>

      {undated.length > 0 && (
        <div className="rounded-[16px] bg-surface-2/50 p-2.5">
          <div className="eyebrow mb-1.5 !text-[10px]">
            {noDateLabel} · {undated.length}
          </div>
          <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
            {undated.map((r) => (
              <div key={r.id}>{render(r)}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Days until a date, as words and a colour (overdue red, soon amber). */
export function countdown(date?: string | null, done?: boolean) {
  if (!date) return null;
  const d = new Date(`${String(date).slice(0, 10)}T00:00`);
  const now = new Date();
  const days = Math.round((d.getTime() - new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()) / 86_400_000);
  const text = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days > 0 ? `in ${days} days` : days === -1 ? "Yesterday" : `${-days} days ago`;
  const tone = done ? "muted" : days < 0 ? "danger" : days <= 2 ? "soon" : "calm";
  return { days, text, tone };
}

export function Countdown({ date, done, big }: { date?: string | null; done?: boolean; big?: boolean }) {
  const c = countdown(date, done);
  if (!c) return null;
  const color = c.tone === "danger" ? "var(--danger)" : c.tone === "soon" ? "#d97706" : c.tone === "muted" ? "var(--muted)" : "var(--accent)";
  return (
    <span className={cx("inline-flex items-center rounded-full font-semibold whitespace-nowrap", big ? "px-2.5 py-1 text-xs" : "px-2 py-0.5 text-[10.5px]")} style={{ color, background: `color-mix(in srgb, ${color} 14%, transparent)` }}>
      {c.days < 0 && !done ? `Overdue · ${c.text}` : c.text}
    </span>
  );
}
