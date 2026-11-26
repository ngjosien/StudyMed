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

/** Replace an exam's unfinished plan with a new one. Finished sessions stay. */
export async function savePlan(exam: Row, items: PlanItem[], o: PlanOptions) {
  await db.removeWhere("todos", { plan_exam_id: exam.id, done: 0 });
  if (!items.length) return;
  await db.insertMany(
    "todos",
    items.map((x, i) => ({
      title: x.title,
      date: x.date,
      est_minutes: o.minutes,
      plan_exam_id: exam.id,
      plan_topic_id: x.topicId,
      plan_kind: x.kind,
      position: i,
      notes_md: `Part of the revision plan for **${exam.name}**.`,
    })),
  );
}

export const clearPlan = (examId: number) => db.removeWhere("todos", { plan_exam_id: examId, done: 0 });
