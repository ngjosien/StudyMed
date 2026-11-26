// Study numbers shared by Home, Routine and the garden: how much was studied each
// day, the weekly targets, and how much is still needed today to stay on track.
import { useMemo } from "react";
import type { Row } from "./api";
import { useRows } from "./hooks";
import { addDays, startOfWeek, toDateStr, today } from "./dates";

export interface ModuleWeek {
  m: Row;
  goal: number; // minutes this week
  done: number;
  left: number;
  perDay: number; // minutes a day still needed, over the days left
}

export function useStudyStats(days = 14) {
  const t = today();
  const weekStart = toDateStr(startOfWeek(new Date()));
  const from = toDateStr(addDays(new Date(), -(days - 1)));
  const since = from < weekStart ? from : weekStart;
  const modules = useRows("modules", { archived: 0 }, "code").rows;
  const targets = useRows("study_targets").rows;
  const logs = useRows("study_logs", { date: { gte: since } }).rows;

  return useMemo(() => {
    const byDay = new Map<string, number>();
    logs.forEach((l) => byDay.set(l.date, (byDay.get(l.date) ?? 0) + Number(l.minutes)));
    const weekday = (new Date().getDay() + 6) % 7; // Monday = 0
    const daysLeft = 7 - weekday; // including today
    const target = new Map(targets.map((x) => [x.module_id, Number(x.minutes_per_week) || 0]));

    const perModule: ModuleWeek[] = modules
      .map((m) => {
        const goal = target.get(m.id) ?? 0;
        const done = logs.filter((l) => l.module_id === m.id && l.date >= weekStart).reduce((s, l) => s + Number(l.minutes), 0);
        const left = Math.max(0, goal - done);
        return { m, goal, done, left, perDay: Math.ceil(left / daysLeft) };
      })
      .filter((x) => x.goal > 0 || x.done > 0);

    const weekGoal = perModule.reduce((s, x) => s + x.goal, 0);
    const weekDone = [...byDay.entries()].filter(([d]) => d >= weekStart).reduce((s, [, n]) => s + n, 0);
    const todayDone = byDay.get(t) ?? 0;
    // What today needs: whatever is left of the week before today, shared over the days left.
    const leftBeforeToday = Math.max(0, weekGoal - (weekDone - todayDone));
    const todayGoal = weekGoal ? Math.ceil(leftBeforeToday / daysLeft) : 0;
    const dailyAverageGoal = weekGoal / 7;

    const series = Array.from({ length: days }, (_, i) => {
      const d = toDateStr(addDays(new Date(), -(days - 1 - i)));
      return { date: d, minutes: byDay.get(d) ?? 0 };
    });
    // Days in a row (up to today) that met the average daily goal; today counts once it's met.
    let streak = 0;
    if (dailyAverageGoal > 0) {
      for (let i = series.length - 1; i >= 0; i--) {
        const met = series[i].minutes >= dailyAverageGoal;
        if (series[i].date === t && !met) continue;
        if (!met) break;
        streak++;
      }
    }
    const last7 = series.slice(-7).reduce((s, x) => s + x.minutes, 0);
    return { t, weekStart, daysLeft, perModule, weekGoal, weekDone, todayDone, todayGoal, dailyAverageGoal, series, streak, avg7: last7 / 7 };
  }, [modules, targets, logs, days, t, weekStart]);
}

/** "25m more today to stay on track" / "40m ahead of today's goal" / "On track". */
export function todayVerdict(done: number, goal: number, fmt: (m: number) => string) {
  if (!goal) return { tone: "muted" as const, text: "Set weekly targets to get a daily goal." };
  const diff = done - goal;
  if (diff < 0) return { tone: "behind" as const, text: `${fmt(-diff)} more today to stay on track` };
  if (diff === 0) return { tone: "ok" as const, text: "Exactly on track for today" };
  return { tone: "ahead" as const, text: `${fmt(diff)} ahead of today's goal` };
}
