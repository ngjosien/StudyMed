// Repeating tick goals. A tick belongs to one day or one week, so each new
// period starts empty on its own: nothing is ever reset or deleted.
import type { Row } from "./api";
import { addDays, parse, startOfWeek, toDateStr } from "./dates";

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const WEEKDAYS_LONG = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

export const weekOf = (date: string) => toDateStr(startOfWeek(parse(date)!));
export const periodOf = (goal: Row, date: string) => (goal.cadence === "daily" ? date : weekOf(date));

/** The steps to tick: the goal's own steps, or the goal itself (step 0). */
export const stepIds = (goal: Row, steps: Row[]) => {
  const mine = steps.filter((s) => s.goal_id === goal.id).map((s) => s.id as number);
  return mine.length ? mine : [0];
};

export function progress(goal: Row, steps: Row[], ticks: Row[], period: string) {
  const ids = stepIds(goal, steps);
  const done = ids.filter((id) => ticks.some((t) => t.goal_id === goal.id && t.step_id === id && t.period === period)).length;
  return { done, total: ids.length, complete: done === ids.length };
}

/** Completed periods in a row, counting back from the current one (which may still be in progress). */
export function streak(goal: Row, steps: Row[], ticks: Row[], today: string) {
  const step = goal.cadence === "daily" ? 1 : 7;
  let period = periodOf(goal, today);
  if (!progress(goal, steps, ticks, period).complete) period = toDateStr(addDays(parse(period)!, -step));
  let n = 0;
  while (n < 520 && progress(goal, steps, ticks, period).complete) {
    n++;
    period = toDateStr(addDays(parse(period)!, -step));
  }
  return n;
}

/** Due date of a weekly goal in the week starting `monday`. */
export const dueDate = (goal: Row, monday: string) =>
  goal.cadence === "weekly" && goal.due_weekday != null ? toDateStr(addDays(parse(monday)!, Number(goal.due_weekday))) : null;
