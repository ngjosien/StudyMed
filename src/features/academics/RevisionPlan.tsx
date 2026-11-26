// Exam countdown planner UI: the countdown strip on Exams, the plan inside an exam,
// and the dialog that builds a plan and previews it before anything is saved.
import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { CalendarRange, RefreshCw, Sparkles, Trash2, Wand2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addDays, daysUntil, fmtDateShort, parse, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { buildPlan, clearPlan, defaultPlanOptions, KIND_LABEL, savePlan, type PlanKind, type PlanOptions } from "../../lib/revision";
import { Button, Card, Field, Modal, Progress, Segmented } from "../../components/ui";
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
                    <span>Revision {finished}/{plan.length}</span>
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
                  <Wand2 size={13} /> Plan my revision
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
  const next = plan.filter((p) => !p.done).slice(0, 6);
  const behind = plan.filter((p) => !p.done && p.date < t).length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold">Revision plan</h3>
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
                toast.success("Unfinished revision sessions removed");
              }}
            >
              {armed ? "Sure?" : "Clear"}
            </Button>
          </>
        )}
      </div>
      {!plan.length ? (
        <div className="rounded-2xl bg-surface-2/60 p-4 text-sm">
          <p className="text-muted">Spread revision out from today to the exam, with the topics you're least sure of first. Each session becomes a to-do on its day.</p>
          <Button variant="primary" icon={Wand2} className="mt-3 !rounded-full" onClick={onPlan} disabled={!exam.start_at}>
            Plan my revision
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
export function PlanModal({ exam, code, onClose }: { exam: Row; code: string; onClose: () => void }) {
  const mutate = useMutate();
  const topics = useRows("exam_topics", { exam_id: exam.id }, "position, id").rows;
  const plans = usePlans();
  // In the evening, a plan starting today would already be behind.
  const [o, setO] = useState<PlanOptions>(() => defaultPlanOptions(new Date().getHours() >= 18 ? toDateStr(addDays(new Date(), 1)) : today()));
  const [busy, setBusy] = useState(false);
  const examDay = String(exam.start_at ?? "").slice(0, 10);

  const others = useMemo(() => {
    const m = new Map<string, number>();
    plans.filter((p) => p.plan_exam_id !== exam.id && !p.done).forEach((p) => m.set(p.date, (m.get(p.date) ?? 0) + 1));
    return m;
  }, [plans, exam.id]);
  const items = useMemo(() => buildPlan(exam, code, topics, o, others), [exam, code, topics, o, others]);
  const existing = plans.filter((p) => p.plan_exam_id === exam.id);
  const byDate = useMemo(() => {
    const g = new Map<string, typeof items>();
    items.forEach((x) => g.set(x.date, [...(g.get(x.date) ?? []), x]));
    return [...g.entries()];
  }, [items]);
  const clash = [...new Set(items.map((x) => x.date))].filter((d) => others.has(d)).length;

  const save = async () => {
    setBusy(true);
    try {
      await mutate(savePlan(exam, items, o));
      toast.success(`${items.length} revision sessions added to your to-dos`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Plan revision · ${exam.name}`}
      width="max-w-3xl"
      footer={
        <>
          <span className="mr-auto text-xs text-muted">
            {existing.some((p) => !p.done) ? "Unfinished sessions from the old plan will be replaced. Finished ones stay." : "Each session becomes a to-do on its day."}
          </span>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" icon={Sparkles} disabled={busy || !items.length} onClick={save}>
            Add {items.length} sessions
          </Button>
        </>
      }
    >
      <div className="grid gap-6 pb-3 md:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-4">
          <div className="rounded-2xl bg-surface-2/60 px-4 py-3 text-sm">
            <span className="font-display tabular text-2xl">{daysUntil(exam.start_at) ?? "–"}</span> <span className="text-muted">days to go</span>
            <p className="text-xs text-muted">
              {topics.length ? `${topics.filter((x) => !x.done).length} of ${topics.length} topics still to cover` : "No topics yet. Add them in the exam's checklist for a sharper plan."}
            </p>
          </div>
          <Field label="Start revising on">
            <DateField value={o.from} clearable={false} onChange={(d) => d && setO({ ...o, from: d < examDay ? d : o.from })} />
          </Field>
          <Field label="Days I can study">
            <div className="flex flex-wrap gap-1">
              {DAYS.map((d, i) => {
                const on = o.days.includes(String(i));
                return (
                  <button
                    type="button"
                    key={d}
                    aria-pressed={on}
                    onClick={() => setO({ ...o, days: on ? o.days.replace(String(i), "") : [...o.days, String(i)].sort().join("") })}
                    className={cx("rounded-full px-2.5 py-1 text-xs font-medium", on ? "bg-accent text-accent-fg" : "bg-surface-2 hover:bg-accent-soft")}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </Field>
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
        </div>

        <div className="min-w-0">
          <div className="mb-2 flex items-center gap-3 text-[11px] text-muted">
            {(Object.keys(KIND_LABEL) as PlanKind[]).map((k) => (
              <span key={k} className="inline-flex items-center gap-1">
                <span className="h-2 w-2 rounded-full" style={{ background: KIND_TINT[k] }} />
                {KIND_LABEL[k]}
              </span>
            ))}
          </div>
          {!items.length && <p className="rounded-2xl bg-surface-2/60 p-6 text-center text-sm text-muted">No study days between the start date and the exam.</p>}
          {clash > 0 && <p className="mb-2 text-xs text-muted">{clash} of these days also have revision for another exam, so this plan works around them.</p>}
          <ol className="space-y-1.5">
            {byDate.map(([date, list]) => {
              const d = parse(date)!;
              const gap = date === toDateStr(addDays(parse(examDay)!, -1));
              return (
                <li key={date} className="flex gap-3">
                  <span className={cx("w-12 shrink-0 rounded-xl py-1 text-center leading-tight", gap ? "bg-accent text-accent-fg" : "bg-surface-2")}>
                    <span className="block text-[10px] uppercase opacity-70">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                    <span className="block text-sm font-semibold">{d.getDate()}</span>
                  </span>
                  <span className="min-w-0 flex-1 space-y-1 py-0.5">
                    {list.map((x, i) => (
                      <span key={i} className="flex items-center gap-2 rounded-xl px-2.5 py-1 text-sm" style={{ background: `color-mix(in srgb, ${KIND_TINT[x.kind]} 30%, transparent)` }}>
                        <span className="truncate">{x.title.replace(/^[^·]+· /, "")}</span>
                        {others.get(date) ? <span className="ml-auto shrink-0 text-[10px] text-muted">+{others.get(date)} other</span> : null}
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
