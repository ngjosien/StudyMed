import { useMemo, useState } from "react";
import { Flame, Plus, ChevronLeft, ChevronRight, Trophy, Pencil, Check } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addDays, addMonths, fmtMonth, parse, startOfMonth, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx, pct } from "../../lib/format";
import { Button, Card, Empty, IconButton, Page, PageHeader } from "../../components/ui";
import { FormModal, useFormState } from "../../components/form";

const GOALS = [
  { value: 7, label: "Daily" },
  { value: 6, label: "6× per week" },
  { value: 5, label: "5× per week" },
  { value: 4, label: "4× per week" },
  { value: 3, label: "3× per week" },
  { value: 2, label: "2× per week" },
  { value: 1, label: "1× per week" },
];
const goalLabel = (g: number) => GOALS.find((x) => x.value === g)?.label ?? `${g}×/wk`;

/** Current and best streak. Daily habits count days; Nx/week habits count weeks that met the goal. */
export function streaks(dates: Set<string>, goal: number) {
  const t = today();
  if (goal >= 7) {
    let cur = 0;
    let d = parse(t)!;
    if (!dates.has(t)) d = addDays(d, -1);
    while (dates.has(toDateStr(d))) {
      cur++;
      d = addDays(d, -1);
    }
    const sorted = [...dates].sort();
    let best = 0;
    let run = 0;
    let prev: string | null = null;
    for (const s of sorted) {
      run = prev && toDateStr(addDays(parse(prev)!, 1)) === s ? run + 1 : 1;
      best = Math.max(best, run);
      prev = s;
    }
    return { cur, best: Math.max(best, cur), unit: "d" };
  }
  const weekCount = new Map<string, number>();
  dates.forEach((s) => {
    const w = toDateStr(startOfWeek(parse(s)!));
    weekCount.set(w, (weekCount.get(w) ?? 0) + 1);
  });
  const met = (w: Date) => (weekCount.get(toDateStr(w)) ?? 0) >= goal;
  let w = startOfWeek(new Date());
  if (!met(w)) w = addDays(w, -7);
  let cur = 0;
  while (met(w)) {
    cur++;
    w = addDays(w, -7);
  }
  const weeks = [...weekCount.keys()].sort();
  let best = 0;
  if (weeks.length) {
    let run = 0;
    for (let x = parse(weeks[0])!; toDateStr(x) <= toDateStr(startOfWeek(new Date())); x = addDays(x, 7)) {
      run = met(x) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  }
  return { cur, best: Math.max(best, cur), unit: "wk" };
}

export default function HabitsPage() {
  const mutate = useMutate();
  const { rows: habits } = useRows("habits", { archived: 0 }, "position, id");
  const { rows: archived } = useRows("habits", { archived: 1 }, "id");
  const { rows: checks } = useRows("habit_checks");
  const form = useFormState();
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [month, setMonth] = useState(() => startOfMonth(new Date()));
  const t = today();

  const byHabit = useMemo(() => {
    const m = new Map<number, Set<string>>();
    checks.forEach((c) => {
      if (!m.has(c.habit_id)) m.set(c.habit_id, new Set());
      m.get(c.habit_id)!.add(c.date);
    });
    return m;
  }, [checks]);

  const days = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
  const monthDays = Array.from({ length: new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate() }, (_, i) => new Date(month.getFullYear(), month.getMonth(), i + 1));

  const toggle = (h: Row, date: string, on: boolean) =>
    mutate(async () => {
      if (on) await db.insert("habit_checks", { habit_id: h.id, date });
      else await db.removeWhere("habit_checks", { habit_id: h.id, date });
    });

  const monthlyPct = (h: Row) => {
    const set = byHabit.get(h.id) ?? new Set<string>();
    const elapsed = monthDays.filter((d) => toDateStr(d) <= t).length;
    if (!elapsed) return null;
    const done = monthDays.filter((d) => set.has(toDateStr(d))).length;
    const expected = Math.max(1, Math.round((h.goal_per_week / 7) * elapsed));
    return Math.min(100, pct(done, expected));
  };

  return (
    <>
      <PageHeader
        title="Habits"
        icon={Flame}
        subtitle="Tick habits off and watch your streaks"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
            New habit
          </Button>
        }
      />
      <Page className="space-y-6">
        {habits.length === 0 ? (
          <Empty icon={Flame} title="No habits yet">
            Add habits with a flexible goal — daily, or a few times a week.
          </Empty>
        ) : (
          <>
            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="flex-1 font-semibold">Weekly tracker</h2>
                <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setWeekStart(addDays(weekStart, -7))} />
                <button type="button" className="w-44 text-center text-sm hover:text-accent" onClick={() => setWeekStart(startOfWeek(new Date()))}>
                  {days[0].toLocaleDateString(undefined, { day: "numeric", month: "short" })} – {days[6].toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                </button>
                <IconButton icon={ChevronRight} label="Next week" onClick={() => setWeekStart(addDays(weekStart, 7))} />
              </div>
              <table className="w-full text-sm">
                <thead className="text-xs text-muted">
                  <tr>
                    <th className="px-4 py-2 text-left font-medium">Habit</th>
                    {days.map((d) => (
                      <th key={d.toISOString()} className={cx("w-14 py-2 font-medium", toDateStr(d) === t && "text-accent")}>
                        <div>{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
                        <div className="text-[11px]">{d.getDate()}</div>
                      </th>
                    ))}
                    <th className="w-20 py-2 font-medium">Week</th>
                    <th className="w-24 py-2 font-medium">Streak</th>
                    <th className="w-24 py-2 font-medium">Best</th>
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {habits.map((h) => {
                    const set = byHabit.get(h.id) ?? new Set<string>();
                    const weekDone = days.filter((d) => set.has(toDateStr(d))).length;
                    const s = streaks(set, h.goal_per_week);
                    const met = weekDone >= h.goal_per_week;
                    return (
                      <tr key={h.id}>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} />
                            <span className="font-medium">{h.name}</span>
                          </div>
                          <div className="pl-[18px] text-xs text-muted">{goalLabel(h.goal_per_week)}</div>
                        </td>
                        {days.map((d) => {
                          const k = toDateStr(d);
                          const on = set.has(k);
                          const future = k > t;
                          return (
                            <td key={k} className="text-center">
                              <button
                                type="button"
                                disabled={future}
                                aria-label={`${h.name} ${k}`}
                                aria-pressed={on}
                                onClick={() => toggle(h, k, !on)}
                                className={cx(
                                  "mx-auto flex h-8 w-8 items-center justify-center rounded-lg border-2 transition-colors disabled:opacity-25",
                                  on ? "border-transparent text-white" : "border-line hover:border-fg/30",
                                )}
                                style={on ? { background: h.color } : undefined}
                              >
                                {on && <Check size={16} strokeWidth={3} />}
                              </button>
                            </td>
                          );
                        })}
                        <td className={cx("text-center tabular-nums", met && "font-semibold text-emerald-500")}>
                          {weekDone}/{h.goal_per_week}
                        </td>
                        <td className="text-center">
                          <span className={cx("inline-flex items-center gap-1", s.cur > 0 && "font-semibold text-orange-500")}>
                            <Flame size={14} /> {s.cur}
                            {s.unit}
                          </span>
                        </td>
                        <td className="text-center text-muted">
                          <span className="inline-flex items-center gap-1">
                            <Trophy size={13} /> {s.best}
                            {s.unit}
                          </span>
                        </td>
                        <td>
                          <IconButton icon={Pencil} label="Edit habit" onClick={() => form.openEdit(h)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Card>

            <Card className="overflow-hidden">
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <h2 className="flex-1 font-semibold">Monthly overview</h2>
                <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
                <button type="button" className="w-36 text-center text-sm hover:text-accent" onClick={() => setMonth(startOfMonth(new Date()))}>
                  {fmtMonth(month)}
                </button>
                <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
              </div>
              <div className="space-y-3 overflow-x-auto p-4">
                <div className="flex items-center gap-3">
                  <div className="w-40 shrink-0" />
                  <div className="flex gap-[3px]">
                    {monthDays.map((d) => (
                      <div key={d.getDate()} className={cx("w-[18px] text-center text-[9px] text-muted", toDateStr(d) === t && "font-bold text-accent")}>
                        {d.getDate()}
                      </div>
                    ))}
                  </div>
                </div>
                {habits.map((h) => {
                  const set = byHabit.get(h.id) ?? new Set<string>();
                  const mp = monthlyPct(h);
                  return (
                    <div key={h.id} className="flex items-center gap-3">
                      <div className="w-40 shrink-0 truncate text-sm">{h.name}</div>
                      <div className="flex gap-[3px]">
                        {monthDays.map((d) => {
                          const k = toDateStr(d);
                          const on = set.has(k);
                          const isWeekStart = d.getDay() === 1;
                          return (
                            <button
                              type="button"
                              key={k}
                              title={`${k}${on ? " (done)" : ""}`}
                              disabled={k > t}
                              onClick={() => toggle(h, k, !on)}
                              className={cx("h-[18px] w-[18px] rounded-[4px] disabled:opacity-30", !on && "bg-surface-2 hover:bg-line", isWeekStart && "ml-1")}
                              style={on ? { background: h.color } : undefined}
                            />
                          );
                        })}
                      </div>
                      <div className="ml-auto w-14 text-right text-sm font-medium tabular-nums">{mp == null ? "—" : `${mp}%`}</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
        {archived.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            Archived:
            {archived.map((h) => (
              <button type="button" key={h.id} onClick={() => form.openEdit(h)} className="rounded-full border border-line px-2.5 py-0.5 hover:text-fg">
                {h.name}
              </button>
            ))}
          </div>
        )}
      </Page>
      <FormModal
        open={form.open}
        onClose={form.close}
        title={form.record ? "Edit habit" : "New habit"}
        table="habits"
        record={form.record}
        defaults={{ color: "#a6e3d0", goal_per_week: 7, archived: 0, position: habits.length }}
        fields={[
          { key: "name", label: "Habit", type: "text", required: true, full: true, placeholder: "Drink 2L water" },
          { key: "goal_per_week", label: "Goal", type: "select", numeric: true, required: true, options: GOALS },
          { key: "archived", label: "Archive", type: "checkbox", placeholder: "Hide this habit", more: true },
          { key: "color", label: "Colour", type: "color", full: true },
        ]}
      />
    </>
  );
}
