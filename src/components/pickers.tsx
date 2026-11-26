// Date, time and choice controls that replace the browser's rough native ones.
import { useEffect, useState } from "react";
import { CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { addDays, addMonths, fmtDateShort, fmtMonth, fmtTime, parse, startOfMonth, startOfWeek, toDateStr, today } from "../lib/dates";
import { cx } from "../lib/format";
import { IconButton, Input, Popover } from "./ui";

export const controlCls =
  "flex h-11 w-full items-center gap-2.5 rounded-2xl border border-line bg-surface-solid/70 px-3.5 text-left text-sm hover:border-accent/50 hover:bg-surface-solid";

function MonthGrid({ value, onPick }: { value: string | null; onPick: (d: string) => void }) {
  const [month, setMonth] = useState(() => startOfMonth(parse(value) ?? new Date()));
  useEffect(() => setMonth(startOfMonth(parse(value) ?? new Date())), [value]);
  const first = startOfWeek(month);
  const now = today();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
        {/* Jump straight to any month and year (birthdays are decades back). */}
        <span className="flex items-center gap-1 text-sm font-semibold" title={fmtMonth(month)}>
          <select
            aria-label="Month"
            value={month.getMonth()}
            onChange={(e) => setMonth(new Date(month.getFullYear(), Number(e.target.value), 1))}
            className="cursor-pointer rounded-lg bg-transparent px-1 py-0.5 hover:bg-accent-soft"
          >
            {Array.from({ length: 12 }, (_, m) => (
              <option key={m} value={m}>
                {new Date(2000, m, 1).toLocaleDateString(undefined, { month: "long" })}
              </option>
            ))}
          </select>
          <select
            aria-label="Year"
            value={month.getFullYear()}
            onChange={(e) => setMonth(new Date(Number(e.target.value), month.getMonth(), 1))}
            className="tabular cursor-pointer rounded-lg bg-transparent px-1 py-0.5 hover:bg-accent-soft"
          >
            {Array.from({ length: new Date().getFullYear() + 11 - 1920 }, (_, i) => new Date().getFullYear() + 10 - i).map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </span>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <div key={i} className="py-1 text-[10px] text-muted">
            {d}
          </div>
        ))}
        {Array.from({ length: 42 }, (_, i) => addDays(first, i)).map((d) => {
          const key = toDateStr(d);
          return (
            <button
              type="button"
              key={key}
              onClick={() => onPick(key)}
              className={cx(
                "h-8 rounded-full",
                key === value ? "bg-accent text-accent-fg" : "hover:bg-accent-soft",
                key !== value && key === now && "text-accent ring-1 ring-accent",
                key !== value && d.getMonth() !== month.getMonth() && "text-muted/50",
              )}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function DateField({
  value,
  onChange,
  placeholder = "Pick a date",
  clearable = true,
  className,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  const day = value ? value.slice(0, 10) : null;
  const quick = [
    { label: "Today", at: today() },
    { label: "Tomorrow", at: toDateStr(addDays(new Date(), 1)) },
    { label: "Next week", at: toDateStr(addDays(new Date(), 7)) },
  ];
  return (
    <div className={cx("[&>span]:w-full", className)}>
      <Popover
        width={300}
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className={controlCls}>
            <CalendarDays size={16} className="shrink-0 text-accent" />
            <span className={cx("flex-1 truncate", !day && "text-muted")}>{day ? fmtDateShort(day) : placeholder}</span>
          </button>
        )}
      >
        {(close) => {
          const pick = (v: string | null) => {
            onChange(v);
            close();
          };
          return (
            <div className="p-2">
              <div className="mb-2 flex gap-1">
                {quick.map((q) => (
                  <button type="button" key={q.label} onClick={() => pick(q.at)} className="flex-1 rounded-full bg-surface-2 py-1 text-[11px] hover:bg-accent-soft hover:text-accent">
                    {q.label}
                  </button>
                ))}
              </div>
              <MonthGrid value={day} onPick={pick} />
              {clearable && day && (
                <button type="button" onClick={() => pick(null)} className="mt-2 w-full rounded-full py-1 text-xs text-muted hover:bg-surface-2">
                  Clear date
                </button>
              )}
            </div>
          );
        }}
      </Popover>
    </div>
  );
}

const TIMES = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
// Start the list at 7am; the small hours go last.
const TIME_LIST = [...TIMES.slice(14), ...TIMES.slice(0, 14)];

export function TimeField({
  value,
  onChange,
  placeholder = "Time",
  clearable = true,
  className,
}: {
  value?: string | null;
  onChange: (v: string | null) => void;
  placeholder?: string;
  clearable?: boolean;
  className?: string;
}) {
  return (
    <div className={cx("[&>span]:w-full", className)}>
      <Popover
        width={228}
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className={controlCls}>
            <Clock size={16} className="shrink-0 text-accent" />
            <span className={cx("flex-1 truncate", !value && "text-muted")}>{value ? fmtTime(value) : placeholder}</span>
          </button>
        )}
      >
        {(close) => (
          <div className="p-1">
            <Input type="time" value={value ?? ""} onChange={(e) => e.target.value && onChange(e.target.value)} aria-label="Exact time" />
            <div className="mt-2 grid max-h-60 grid-cols-2 gap-1 overflow-y-auto">
              {TIME_LIST.map((t) => (
                <button
                  type="button"
                  key={t}
                  onClick={() => {
                    onChange(t);
                    close();
                  }}
                  className={cx("rounded-full py-1.5 text-xs", t === value ? "bg-accent text-accent-fg" : "hover:bg-accent-soft")}
                >
                  {fmtTime(t)}
                </button>
              ))}
            </div>
            {clearable && value && (
              <button
                type="button"
                onClick={() => {
                  onChange(null);
                  close();
                }}
                className="mt-2 w-full rounded-full py-1 text-xs text-muted hover:bg-surface-2"
              >
                Clear time
              </button>
            )}
          </div>
        )}
      </Popover>
    </div>
  );
}

export function DateTimeField({ value, onChange }: { value?: string | null; onChange: (v: string | null) => void }) {
  const day = value ? value.slice(0, 10) : null;
  const time = value && value.length > 10 ? value.slice(11, 16) : null;
  return (
    <div className="grid grid-cols-[1fr_140px] gap-2">
      <DateField value={day} onChange={(d) => onChange(d ? `${d}T${time ?? "09:00"}` : null)} />
      <TimeField value={time} clearable={false} onChange={(t) => onChange(`${day ?? today()}T${t ?? "09:00"}`)} />
    </div>
  );
}

export interface Choice {
  value: string | number;
  label: string;
  color?: string | null;
}

/** Pills for short lists, a soft dropdown for long ones. */
export function ChoiceField({
  options,
  value,
  onChange,
  clearable,
  placeholder = "Choose",
}: {
  options: Choice[];
  value: unknown;
  onChange: (v: string | number | null) => void;
  clearable?: boolean;
  placeholder?: string;
}) {
  const same = (o: Choice) => value !== null && value !== undefined && String(o.value) === String(value);
  if (!options.length) return <p className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm text-muted">Nothing to choose from yet.</p>;
  if (options.length <= 18) {
    return (
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <button
            type="button"
            key={o.value}
            aria-pressed={same(o)}
            onClick={() => onChange(same(o) && clearable ? null : o.value)}
            className={cx(
              "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[13px]",
              same(o) ? "border-transparent bg-accent text-accent-fg" : "border-line bg-surface-solid/60 hover:border-accent/50",
            )}
          >
            {o.color && <span className="h-2.5 w-2.5 rounded-full ring-1 ring-white/60" style={{ background: o.color }} />}
            {o.label}
          </button>
        ))}
      </div>
    );
  }
  const current = options.find(same);
  return (
    <div className="[&>span]:w-full">
      <Popover
        width={300}
        trigger={({ toggle }) => (
          <button type="button" onClick={toggle} className={controlCls}>
            <span className={cx("flex-1 truncate", !current && "text-muted")}>{current?.label ?? placeholder}</span>
            <ChevronDown size={15} className="text-muted" />
          </button>
        )}
      >
        {(close) => (
          <div className="max-h-72 overflow-y-auto p-1">
            {options.map((o) => (
              <button
                type="button"
                key={o.value}
                onClick={() => {
                  onChange(same(o) && clearable ? null : o.value);
                  close();
                }}
                className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft"
              >
                {o.color && <span className="h-2.5 w-2.5 rounded-full" style={{ background: o.color }} />}
                <span className="flex-1 truncate">{o.label}</span>
                {same(o) && <Check size={14} className="text-accent" />}
              </button>
            ))}
          </div>
        )}
      </Popover>
    </div>
  );
}

export function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label?: string }) {
  return (
    <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className="flex min-h-11 w-full items-center gap-3 rounded-2xl bg-surface-2 px-3.5 text-left text-sm">
      <span className="flex-1">{label}</span>
      <span className={cx("relative h-6 w-10 shrink-0 rounded-full transition-colors duration-300", checked ? "bg-accent" : "bg-line")}>
        <span className={cx("absolute top-1 h-4 w-4 rounded-full bg-white shadow transition-[left] duration-300", checked ? "left-5" : "left-1")} />
      </span>
    </button>
  );
}
