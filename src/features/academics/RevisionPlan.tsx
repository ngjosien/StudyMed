// Exam study plans: the countdown strip on Exams, the plan inside an exam, and the
// dialog that builds a plan (by week of content or by topic) and previews it day by
// day before anything is saved.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addDays, daysUntil, fmtDateShort, parse, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { buildPlan, buildWeekPlan, clearPlan, defaultPlanOptions, KIND_LABEL, savePlan, type PlanKind, type PlanOptions, type WeekPlanOptions } from "../../lib/revision";
import { TARGETS } from "../../lib/grades";
import { Button, Card, Field, Modal, Progress, Segmented, Select } from "../../components/ui";
import { useSemester } from "./WeeklyContent";
import { DateField, Toggle } from "../../components/pickers";
import { TickBox } from "../life/GoalsPage";
import { toast } from "../../stores/toast";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KIND_TINT: Record<PlanKind, string> = { learn: "#c3a6f4", recap: "#a6c8f4", practice: "#f4b8a6", paper: "#f4d8a6", review: "#a6e3d0" };
const done = (on: boolean): Row =>
  on ? { done: 1, status: "Done", completed_at: new Date().toISOString().slice(0, 19).replace("T", " ") } : { done: 0, status: "Not Started", completed_at: null };

export function usePlans() {
  return useRows("todos", { plan_exam_id: { null: false } }, "date, position, id").rows;
}

/* ------------------------------------------------------------ Countdown strip */
export function CountdownStrip({ exams, byId, onOpen, onPlan }: { exams: Row[]; byId: Map<number, Row>; onOpen: (id: number) => void; onPlan: (e: Row) => void }) {
  const plans = usePlans();
  const t = today();
  const upcoming = exams.filter((e) => e.start_at && String(e.start_at).slice(0, 10) >= t && !e.grade).sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  if (!upcoming.length) return null;
  return (
    <section>
      <h2 className="font-display mb-3 flex items-center gap-2 px-1 text-xl">
        <CalendarRange size={16} className="text-accent" /> Countdown
      </h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {upcoming.slice(0, 6).map((e) => {
          const d = daysUntil(e.start_at) ?? 0;
          const m = byId.get(e.module_id);
          const plan = plans.filter((p) => p.plan_exam_id === e.id);
          const finished = plan.filter((p) => p.done).length;
          const todays = plan.filter((p) => p.date === t && !p.done).length;
          return (
            <Card key={e.id} onClick={() => onOpen(e.id)} className="relative overflow-hidden p-5">
              <span className="absolute inset-y-0 left-0 w-1" style={{ background: m?.color ?? "var(--accent)" }} />
              <div className="flex items-start gap-4">
                <div className="text-center">
                  <div className="font-display tabular text-[44px] leading-none" style={{ color: d <= 7 ? "var(--danger)" : undefined }}>
                    {d}
                  </div>
                  <div className="eyebrow mt-1 !text-[9.5px]">{d === 1 ? "day" : "days"}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="eyebrow !text-[9.5px]">{m?.code}</p>
                  <p className="truncate font-semibold">{e.name}</p>
                  <p className="text-xs text-muted">{parse(e.start_at)!.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}</p>
                </div>
              </div>
              {plan.length ? (
                <div className="mt-4">
                  <div className="mb-1 flex justify-between text-[11px] text-muted">
                    <span>Study plan {finished}/{plan.length}</span>
                    {todays > 0 && <span className="font-medium text-accent">{todays} today</span>}
                  </div>
                  <Progress value={finished} max={plan.length} color={m?.color} />
                </div>
              ) : (
                <button
                  type="button"
                  onClick={(ev) => {
                    ev.stopPropagation();
                    onPlan(e);
                  }}
                  className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent hover:text-accent-fg"
                >
                  <Wand2 size={13} /> Make a study plan
                </button>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------ Inside an exam */
export function ExamPlan({ exam, onPlan }: { exam: Row; onPlan: () => void }) {
  const mutate = useMutate();
  const plan = usePlans().filter((p) => p.plan_exam_id === exam.id);
  const [armed, setArmed] = useState(false);
  const t = today();
  const finished = plan.filter((p) => p.done).length;
  const next = plan.filter((p) => !p.done).slice(0, 7);
  const behind = plan.filter((p) => !p.done && p.date < t).length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold">Study plan</h3>
        {plan.length > 0 && (
          <>
            <Button size="sm" icon={RefreshCw} onClick={onPlan}>
              Re-plan
            </Button>
            <Button
              size="sm"
              variant="ghost"
              icon={Trash2}
              onClick={async () => {
                if (!armed) {
                  setArmed(true);
                  setTimeout(() => setArmed(false), 3000);
                  return;
                }
                await mutate(clearPlan(exam.id));
                toast.success("Unfinished study days removed");
              }}
            >
              {armed ? "Sure?" : "Clear"}
            </Button>
          </>
        )}
      </div>
      {!plan.length ? (
        <div className="rounded-2xl bg-surface-2/60 p-4 text-sm">
          <p className="text-muted">Turn the countdown into a day-by-day plan: which week of content to learn each day, when to recap, and when to do practice papers. Each day becomes a to-do.</p>
          <Button variant="primary" icon={Wand2} className="mt-3 !rounded-full" onClick={onPlan} disabled={!exam.start_at}>
            Make a study plan
          </Button>
          {!exam.start_at && <p className="mt-2 text-xs text-muted">Give the exam a date first.</p>}
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center gap-2 text-xs text-muted">
            <Progress value={finished} max={plan.length} />
            <span className="shrink-0">
              {finished}/{plan.length} done{behind ? ` · ${behind} behind` : ""}
            </span>
          </div>
          <ul className="space-y-1">
            {next.map((p) => (
              <li key={p.id} className="flex items-center gap-2.5 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
                <TickBox on={false} size={20} label={`Done: ${p.title}`} onClick={() => mutate(db.update("todos", p.id, done(true)))} />
                <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: KIND_TINT[p.plan_kind as PlanKind] ?? "var(--accent)" }} />
                <Link to={`/todos?id=${p.id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {String(p.title).replace(/^[^·]+· /, "")}
                </Link>
                <span className={cx("shrink-0 text-xs", p.date < t ? "font-medium text-danger" : "text-muted")}>{p.date === t ? "Today" : fmtDateShort(p.date)}</span>
              </li>
            ))}
          </ul>
          {plan.length - finished > next.length && <p className="mt-1 px-2 text-xs text-muted">+{plan.length - finished - next.length} more in your to-dos</p>}
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Build a plan */
const fmtDays = (n: number) => `${n % 1 ? n.toFixed(1) : n} day${n === 1 ? "" : "s"}`;

export function PlanModal({ exam, code, onClose }: { exam: Row; code: string; onClose: () => void }) {
  const mutate = useMutate();
  const topics = useRows("exam_topics", { exam_id: exam.id }, "position, id").rows;
  const weekly = useRows("module_topics", { module_id: exam.module_id }, "week, position, id").rows;
  const module = useRows("modules", { id: exam.module_id }).rows[0];
  const sem = useSemester();
  const plans = usePlans();
  // In the evening, a plan starting today would already be behind.
  const start = new Date().getHours() >= 18 ? toDateStr(addDays(new Date(), 1)) : today();
  const [mode, setMode] = useState<"weeks" | "topics">("weeks");
  const [o, setO] = useState<PlanOptions>(() => defaultPlanOptions(start));
  const [w, setW] = useState<WeekPlanOptions>(() => ({
    from: start,
    days: "0123456",
    weeksFrom: Number(exam.weeks_from) || 1,
    weeksTo: Number(exam.weeks_to) || Math.max(1, sem.current ?? 8),
    perWeek: 2,
    hours: 3,
    tailDays: 2,
  }));
  const [busy, setBusy] = useState(false);
  const examDay = String(exam.start_at ?? "").slice(0, 10);

  const others = useMemo(() => {
    const m = new Map<string, number>();
    plans.filter((p) => p.plan_exam_id !== exam.id && !p.done).forEach((p) => m.set(p.date, (m.get(p.date) ?? 0) + 1));
    return m;
  }, [plans, exam.id]);
  const weekTopics = useMemo(() => {
    const m = new Map<number, string[]>();
    weekly.forEach((t) => m.set(Number(t.week), [...(m.get(Number(t.week)) ?? []), String(t.title)]));
    return m;
  }, [weekly]);
  const weekPlan = useMemo(() => buildWeekPlan(exam, code, weekTopics, w), [exam, code, weekTopics, w]);
  const topicItems = useMemo(() => buildPlan(exam, code, topics, o, others), [exam, code, topics, o, others]);
  const items = mode === "weeks" ? weekPlan.items : topicItems;
  const existing = plans.filter((p) => p.plan_exam_id === exam.id);
  const byDate = useMemo(() => {
    const g = new Map<string, typeof items>();
    items.forEach((x) => g.set(x.date, [...(g.get(x.date) ?? []), x]));
    return [...g.entries()];
  }, [items]);
  const clash = [...new Set(items.map((x) => x.date))].filter((d) => others.has(d)).length;
  const tested = Math.max(0, w.weeksTo - w.weeksFrom + 1);
  const withContent = [...Array(tested)].filter((_, i) => weekTopics.has(w.weeksFrom + i)).length;
  const weekOptions = [...Array(Math.max(sem.weeks, w.weeksTo, 1))].map((_, i) => ({ value: String(i + 1), label: `Week ${i + 1}` }));

  const save = async () => {
    setBusy(true);
    try {
      await mutate(async () => {
        if (mode === "weeks") await db.update("exams", exam.id, { weeks_from: w.weeksFrom, weeks_to: w.weeksTo });
        await savePlan(exam, items, mode === "weeks" ? w.hours * 60 : o.minutes);
      });
      toast.success(`${items.length} study days added to your to-dos`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const dayChips = (days: string, set: (d: string) => void) => (
    <div className="flex flex-wrap gap-1">
      {DAYS.map((d, i) => {
        const on = days.includes(String(i));
        return (
          <button
            type="button"
            key={d}
            aria-pressed={on}
            onClick={() => set(on ? days.replace(String(i), "") : [...days, String(i)].sort().join(""))}
            className={cx("rounded-full px-2.5 py-1 text-xs font-medium", on ? "bg-accent text-accent-fg" : "bg-surface-2 hover:bg-accent-soft")}
          >
            {d}
          </button>
        );
      })}
    </div>
  );

  return (
    <Modal
      open
      onClose={onClose}
      title={`Study plan · ${exam.name}`}
      width="max-w-4xl"
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            {existing.some((p) => !p.done) ? "Unfinished days from the old plan will be replaced. Finished ones stay." : "Each day becomes a to-do on its date."}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Sparkles} disabled={busy || !items.length} onClick={save}>
            Add {items.length} {mode === "weeks" ? "days" : "sessions"}
          </Button>
        </>
      }
    >
      <div className="grid gap-6 pb-3 md:grid-cols-[290px_minmax(0,1fr)]">
        <div className="space-y-4">
          <Segmented<"weeks" | "topics">
            value={mode}
            onChange={setMode}
            options={[
              { value: "weeks", label: "By week of content" },
              { value: "topics", label: "By topic" },
            ]}
          />
          <div className="rounded-2xl bg-surface-2/60 px-4 py-3 text-sm">
            <span className="font-display tabular text-2xl">{daysUntil(exam.start_at) ?? "–"}</span> <span className="text-muted">days to go</span>
            {mode === "weeks" ? (
              <p className="mt-1 text-xs text-muted">
                {tested} week{tested === 1 ? "" : "s"} of content × {fmtDays(w.perWeek)} = <b className="text-fg">{fmtDays(weekPlan.needDays)}</b> of work. You have{" "}
                <b className="text-fg">{fmtDays(weekPlan.studyDays)}</b> before {w.tailDays ? "papers and review" : "the exam"}.
                {weekPlan.tight ? (
                  <span className="mt-1 block font-medium text-danger">Tight: some weeks get one day. Try 1.5 days a week, more study days, or fewer days for papers.</span>
                ) : weekPlan.studyDays > weekPlan.needDays ? (
                  <span className="mt-1 block">{weekPlan.studyDays - weekPlan.needDays === 1 ? "The spare day becomes a recap." : `The ${fmtDays(weekPlan.studyDays - weekPlan.needDays)} to spare become recaps.`}</span>
                ) : null}
              </p>
            ) : (
              <p className="text-xs text-muted">
                {topics.length ? `${topics.filter((x) => !x.done).length} of ${topics.length} topics still to cover` : "No topics yet. Add them in the exam's checklist for a sharper plan."}
              </p>
            )}
          </div>

          {mode === "weeks" ? (
            <>
              <Field label="What's tested" hint={withContent < tested ? `${tested - withContent} of these weeks have no topics yet; add them in the module's Weekly content.` : undefined}>
                <div className="flex items-center gap-2">
                  <Select className="flex-1" value={String(w.weeksFrom)} onChange={(e) => setW({ ...w, weeksFrom: Number(e.target.value), weeksTo: Math.max(Number(e.target.value), w.weeksTo) })} options={weekOptions} />
                  <span className="text-xs text-muted">to</span>
                  <Select className="flex-1" value={String(w.weeksTo)} onChange={(e) => setW({ ...w, weeksTo: Number(e.target.value), weeksFrom: Math.min(Number(e.target.value), w.weeksFrom) })} options={weekOptions} />
                </div>
              </Field>
              <Field label="Days for each week of content">
                <Segmented value={String(w.perWeek)} onChange={(v) => setW({ ...w, perWeek: Number(v) as 1 | 1.5 | 2 })} options={["1", "1.5", "2"].map((v) => ({ value: v, label: v }))} />
              </Field>
              <Field label="Hours of study a day">
                <Segmented value={String(w.hours)} onChange={(v) => setW({ ...w, hours: Number(v) })} options={["1", "2", "3", "4", "5"].map((v) => ({ value: v, label: `${v}h` }))} />
              </Field>
              <Field label="Start on">
                <DateField value={w.from} clearable={false} onChange={(d) => d && setW({ ...w, from: d < examDay ? d : w.from })} />
              </Field>
              <Field label="Days I can study">{dayChips(w.days, (days) => setW({ ...w, days }))}</Field>
              <Field label="Days kept for papers and review">
                <Segmented value={String(w.tailDays)} onChange={(v) => setW({ ...w, tailDays: Number(v) })} options={["0", "1", "2", "3"].map((v) => ({ value: v, label: v }))} />
              </Field>
            </>
          ) : (
            <>
              <Field label="Start revising on">
                <DateField value={o.from} clearable={false} onChange={(d) => d && setO({ ...o, from: d < examDay ? d : o.from })} />
              </Field>
              <Field label="Days I can study">{dayChips(o.days, (days) => setO({ ...o, days }))}</Field>
              <Field label="Sessions a day, at most" hint="All exams together">
                <Segmented value={String(o.perDay)} onChange={(v) => setO({ ...o, perDay: Number(v) })} options={["1", "2", "3", "4"].map((v) => ({ value: v, label: v }))} />
              </Field>
              <Field label="Session length">
                <Segmented value={String(o.minutes)} onChange={(v) => setO({ ...o, minutes: Number(v) })} options={["30", "45", "60", "90"].map((v) => ({ value: v, label: `${v}m` }))} />
              </Field>
              <Field label="Days kept for papers and review">
                <Segmented value={String(o.tailDays)} onChange={(v) => setO({ ...o, tailDays: Number(v) })} options={["0", "1", "2", "3"].map((v) => ({ value: v, label: v }))} />
              </Field>
              <Toggle checked={o.recap} onChange={(v) => setO({ ...o, recap: v })} label="Recap each topic a few days later" />
            </>
          )}
          {module && (
            <Field label={`Grade I'm aiming for in ${module.code}`}>
              <Select
                value={String(module.target_grade ?? "")}
                onChange={(e) => mutate(db.update("modules", module.id, { target_grade: e.target.value || null }))}
                placeholder="Not set"
                options={TARGETS}
              />
            </Field>
          )}
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-[11px] text-muted">
            {(Object.keys(KIND_LABEL) as PlanKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: KIND_TINT[k] }} />
                {mode === "weeks" && k === "practice" ? "Questions and notes" : KIND_LABEL[k]}
              </span>
            ))}
          </div>
          {!items.length && <p className="rounded-2xl bg-surface-2/60 p-6 text-center text-sm text-muted">No study days between the start date and the exam.</p>}
          {clash > 0 && <p className="mb-2 text-xs text-muted">{clash} of these days also have study for another exam.</p>}
          <ol className="space-y-1.5">
            {byDate.map(([date, list], n) => {
              const d = parse(date)!;
              const eve = date === toDateStr(addDays(parse(examDay)!, -1));
              return (
                <li key={date} className="flex gap-3">
                  <span className={cx("w-12 shrink-0 rounded-xl py-1 text-center leading-tight", eve ? "bg-accent text-accent-fg" : date === today() ? "ring-2 ring-accent" : "bg-surface-2")}>
                    <span className="block text-[10px] uppercase opacity-70">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="block text-sm font-semibold">{d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-1 py-0.5">
                    {list.map((x, i) => (
                      <span key={i} className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-sm" style={{ background: `color-mix(in srgb, ${KIND_TINT[x.kind]} 30%, transparent)` }}>
                        <span className="min-w-0 flex-1">{x.title.replace(/^[^·]+· /, "")}</span>
                        {mode === "weeks" && i === 0 && <span className="shrink-0 text-[10px] text-muted">Day {n + 1}</span>}
                        {others.get(date) ? <span className="shrink-0 text-[10px] text-muted">+{others.get(date)} other</span> : null}
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </Modal>
  );
}
