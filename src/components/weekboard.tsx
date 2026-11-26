// A week laid out as seven day columns (Mon–Sun), used by To-Dos, Homework and Events.
// Overdue items sit in a strip above the week, undated ones in a strip below.
import { useState, type ReactNode } from "react";
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
