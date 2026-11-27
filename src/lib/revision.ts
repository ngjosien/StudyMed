// Exam countdown planner: spreads revision backwards from an exam date.
// Topics you are least sure of come first; each one gets a first pass and a
// spaced recap, and the last days are kept for practice papers and a final review.
// Days that already hold revision for other exams count as busy, so two close
// exams get spread out instead of crammed.
import { db, type Row } from "./api";
import { addDays, parse, toDateStr } from "./dates";

export type PlanKind = "learn" | "recap" | "practice" | "paper" | "review";
export interface PlanOptions {
  from: string; // first day of revision, 'YYYY-MM-DD'
  days: string; // weekdays to study on, Monday = 0, e.g. "0123456"
  perDay: number; // most sessions on one day (all exams together)
  tailDays: number; // days just before the exam kept for papers and review
  recap: boolean; // a second, spaced pass over each topic
  minutes: number; // length of each session
}
export interface PlanItem {
  date: string;
  title: string;
  kind: PlanKind;
  topicId: number | null;
}

export const KIND_LABEL: Record<PlanKind, string> = { learn: "Learn", recap: "Recap", practice: "Questions", paper: "Practice paper", review: "Final review" };
const RANK: Record<string, number> = { red: 0, "": 1, yellow: 2, green: 3 };
const weekday = (d: Date) => (d.getDay() + 6) % 7;

export const defaultPlanOptions = (from: string): PlanOptions => ({ from, days: "0123456", perDay: 2, tailDays: 2, recap: true, minutes: 45 });

export function buildPlan(exam: Row, code: string, topics: Row[], o: PlanOptions, busy: Map<string, number>): PlanItem[] {
  const examDay = String(exam.start_at ?? "").slice(0, 10);
  if (!examDay || o.from >= examDay) return [];
  const all: string[] = [];
  for (let d = parse(o.from)!; toDateStr(d) < examDay; d = addDays(d, 1)) if (o.days.includes(String(weekday(d)))) all.push(toDateStr(d));
  if (!all.length) return [];

  const tailN = Math.min(o.tailDays, Math.floor(all.length / 3));
  const main = all.slice(0, all.length - tailN);
  const tail = all.slice(all.length - tailN);
  const load = new Map(busy);
  const out: PlanItem[] = [];
  const name = `${code ? `${code} · ` : ""}`;

  /** Put an item on the day nearest `ideal` (within lo..hi) that still has room. */
  const place = (days: string[], ideal: number, lo: number, hi: number, item: Omit<PlanItem, "date">, optional = false) => {
    let best = -1;
    let bestScore = Infinity;
    for (let i = lo; i <= hi; i++) {
      const l = load.get(days[i]) ?? 0;
      const score = (l >= o.perDay ? 1000 + l * 10 : l * 2) + Math.abs(i - ideal);
      if (score < bestScore) {
        bestScore = score;
        best = i;
      }
    }
    if (best < 0 || (optional && (load.get(days[best]) ?? 0) >= o.perDay)) return -1;
    load.set(days[best], (load.get(days[best]) ?? 0) + 1);
    out.push({ ...item, date: days[best] });
    return best;
  };

  const pending = topics
    .filter((t) => !t.done)
    .sort((a, b) => (RANK[a.confidence ?? ""] ?? 1) - (RANK[b.confidence ?? ""] ?? 1) || a.position - b.position || a.id - b.id);
  const days = main.length ? main : tail;

  if (!topics.length) {
    // No topic list yet: one general session per study day.
    days.forEach((_, i) => place(days, i, i, i, { title: `${name}Revise for ${exam.name}`, kind: "learn", topicId: null }));
  } else if (pending.length) {
    const span = o.recap && days.length >= 4 ? Math.max(1, Math.ceil(days.length * 0.65)) : days.length;
    const learnedOn = new Map<number, number>();
    pending.forEach((t, i) => {
      const ideal = Math.floor((i * span) / pending.length);
      const at = place(days, ideal, 0, span - 1, { title: `${name}Learn: ${t.title}`, kind: "learn", topicId: t.id });
      learnedOn.set(t.id, at);
    });
    if (o.recap) {
      // Recap once the memory has had time to fade a little; least-sure topics first.
      const recapped = [...pending, ...topics.filter((t) => t.done && t.confidence !== "green")];
      const recapOn = new Map<number, number>();
      recapped.forEach((t) => {
        const from = learnedOn.has(t.id) ? learnedOn.get(t.id)! + 2 : 0;
        if (from > days.length - 1) return;
        const ideal = Math.min(days.length - 1, from + Math.round((days.length - 1 - from) * 0.4));
        const at = place(days, ideal, from, days.length - 1, { title: `${name}Recap: ${t.title}`, kind: "recap", topicId: t.id }, true);
        if (at >= 0) recapOn.set(t.id, at);
      });
      // With time to spare, the shakiest topics get past-paper questions near the end.
      if (days.length >= pending.length * 2.5) {
        pending
          .filter((t) => t.confidence !== "green" && recapOn.has(t.id))
          .forEach((t, k) => {
            const from = recapOn.get(t.id)! + 2;
            if (from > days.length - 1) return;
            const ideal = Math.max(from, days.length - 1 - k);
            place(days, ideal, from, days.length - 1, { title: `${name}Questions: ${t.title}`, kind: "practice", topicId: t.id }, true);
          });
      }
    }
  }

  // The last days: practice papers, then a calm final review the day before.
  tail.forEach((_, i) => {
    const last = i === tail.length - 1;
    place(tail, i, i, i, { title: `${name}${last ? `Final review: ${exam.name}` : `Practice paper: ${exam.name}`}`, kind: last ? "review" : "paper", topicId: null });
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------ By week of content */
export interface WeekPlanOptions {
  from: string; // first study day
  days: string; // weekdays to study on, Monday = 0
  weeksFrom: number; // first week of content the exam tests
  weeksTo: number; // last week it tests
  perWeek: 1 | 1.5 | 2; // study days each week of content needs
  hours: number; // study hours on each plan day
  tailDays: number; // days just before the exam for papers and review
}
export interface WeekPlan {
  items: PlanItem[];
  studyDays: number; // days available for learning (before papers and review)
  needDays: number; // days the content needs at the chosen pace
  tight: boolean; // fewer days than needed: some days double up
}

const topicList = (titles: string[] | undefined) => {
  if (!titles?.length) return "";
  const shown = titles.slice(0, 3).join(", ");
  return titles.length > 3 ? `${shown} +${titles.length - 3} more` : shown;
};
const weekLabel = (a: number, b: number) => (a === b ? `Week ${a}` : `Weeks ${a}–${b}`);

/**
 * A day-by-day plan that works through the tested weeks in order. Each week gets a
 * day to learn it and (at 1.5 or 2 days a week) a day for questions and notes; spare
 * days become spaced recaps of the weeks so far; the last days are practice papers
 * and a final review. With too few days, weeks share days and the plan says so.
 */
export function buildWeekPlan(exam: Row, code: string, weekTopics: Map<number, string[]>, o: WeekPlanOptions): WeekPlan {
  const examDay = String(exam.start_at ?? "").slice(0, 10);
  const empty = { items: [], studyDays: 0, needDays: 0, tight: false };
  if (!examDay || o.from >= examDay || o.weeksTo < o.weeksFrom) return empty;
  const all: string[] = [];
  for (let d = parse(o.from)!; toDateStr(d) < examDay; d = addDays(d, 1)) if (o.days.includes(String(weekday(d)))) all.push(toDateStr(d));
  if (!all.length) return empty;

  const weeks: number[] = [];
  for (let w = o.weeksFrom; w <= o.weeksTo; w++) weeks.push(w);
  const tailN = Math.min(o.tailDays, Math.floor(all.length / 4));
  const main = all.slice(0, all.length - tailN);
  const tail = all.slice(all.length - tailN);
  const name = code ? `${code} · ` : "";
  const W = weeks.length;

  // Days each week gets at the chosen pace (1.5 alternates 2 and 1).
  let alloc = weeks.map((_, i) => (o.perWeek === 1.5 ? (i % 2 === 0 ? 2 : 1) : o.perWeek));
  const needDays = alloc.reduce((a, b) => a + b, 0);
  const tight = needDays > main.length;
  type Task = Omit<PlanItem, "date">;
  const seq: Task[] = [];

  if (main.length < W) {
    // Fewer days than weeks: each day covers a run of weeks.
    const per = Math.ceil(W / Math.max(1, main.length));
    for (let i = 0; i < W; i += per) {
      const a = weeks[i];
      const b = weeks[Math.min(W - 1, i + per - 1)];
      seq.push({ title: `${name}Learn ${weekLabel(a, b)}`, kind: "learn", topicId: null });
    }
  } else {
    if (tight) {
      // One day per week, then second days for the earliest weeks while days last.
      let spare = main.length - W;
      alloc = weeks.map(() => 1);
      for (let i = 0; i < W && spare > 0; i++) if ((o.perWeek === 1.5 ? (i % 2 === 0 ? 2 : 1) : o.perWeek) > 1) {
        alloc[i] = 2;
        spare--;
      }
    }
    let recaps = Math.max(0, main.length - alloc.reduce((a, b) => a + b, 0));
    // Recaps spread through the plan: one after every few weeks, each covering the weeks since the last.
    const every = recaps > 0 ? Math.max(1, Math.ceil(W / recaps)) : Infinity;
    let since = 0;
    weeks.forEach((w, i) => {
      const topics = topicList(weekTopics.get(w));
      for (let d = 0; d < alloc[i]; d++) {
        if (d === 0) seq.push({ title: `${name}Learn Week ${w}${topics ? `: ${topics}` : ""}`, kind: "learn", topicId: null });
        else seq.push({ title: `${name}Week ${w} questions and notes${topics ? `: ${topics}` : ""}`, kind: "practice", topicId: null });
      }
      if (recaps > 0 && (i + 1) % every === 0 && i < W - 1) {
        seq.push({ title: `${name}Recap ${weekLabel(weeks[since], w)}`, kind: "recap", topicId: null });
        since = i + 1;
        recaps--;
      }
    });
    // Any spare days left go just before the papers: recap the rest, then mixed questions on everything.
    let k = 0;
    while (recaps > 0) {
      if (k === 0 && since < W) seq.push({ title: `${name}Recap ${weekLabel(weeks[since], weeks[W - 1])}`, kind: "recap", topicId: null });
      else seq.push({ title: `${name}Mixed questions: ${weekLabel(weeks[0], weeks[W - 1])}`, kind: "practice", topicId: null });
      recaps--;
      k++;
    }
  }

  const items: PlanItem[] = seq.map((t, i) => ({ ...t, date: main[Math.min(i, main.length - 1)] }));
  tail.forEach((d, i) => {
    const last = i === tail.length - 1;
    items.push({ date: d, title: `${name}${last ? `Final review: ${exam.name}` : `Practice paper: ${exam.name}`}`, kind: last ? "review" : "paper", topicId: null });
  });
  return { items: items.sort((a, b) => a.date.localeCompare(b.date)), studyDays: main.length, needDays, tight };
}

/** Replace an exam's unfinished plan with a new one. Finished sessions stay. */
export async function savePlan(exam: Row, items: PlanItem[], minutes: number) {
  await db.removeWhere("todos", { plan_exam_id: exam.id, done: 0 });
  if (!items.length) return;
  await db.insertMany(
    "todos",
    items.map((x, i) => ({
      title: x.title,
      date: x.date,
      est_minutes: minutes,
      plan_exam_id: exam.id,
      plan_topic_id: x.topicId,
      plan_kind: x.kind,
      position: i,
      notes_md: `Part of the study plan for **${exam.name}**.`,
    })),
  );
}

export const clearPlan = (examId: number) => db.removeWhere("todos", { plan_exam_id: examId, done: 0 });
