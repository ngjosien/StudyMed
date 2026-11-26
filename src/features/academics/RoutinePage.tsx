// A study routine from each module's target. Nothing is placed until the user presses the button and saves.
import { useState } from "react";
import { Check, Clock, Minus, Plus, Wand2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addDays, daysUntil, fmtTime, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx, fmtMinutes } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { DEFAULT_CUTOFFS, standing, studyNeed, TARGETS } from "../../lib/grades";
import { Button, Card, Empty, Field, IconButton, Page, PageHeader, Progress } from "../../components/ui";
import { ChoiceField, TimeField } from "../../components/pickers";
import { FormModal, useFormState } from "../../components/form";
import { toast } from "../../stores/toast";
import { useModules } from "./common";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const BREAK = 10;
const LATEST = 23 * 60 + 30;
const FOCUS = ["Active recall", "Practice questions", "Notes & understanding"];
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

interface Plan {
  days: number[];
  weekday: string;
  weekend: string;
  session: number;
}
interface Need {
  module: Row;
  minutes: number;
  examSoon: boolean;
}

/** Spread sessions evenly over the chosen days, mixing modules. */
export function layOut(needs: Need[], plan: Plan) {
  const queues = needs
    .filter((n) => n.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes)
    .map((n) => ({ ...n, left: n.minutes, count: 0 }));
  const sessions: { module: Row; minutes: number; focus: string }[] = [];
  while (queues.some((q) => q.left > 0)) {
    for (const q of queues) {
      if (q.left <= 0) continue;
      // Don't leave a stub under half an hour.
      const minutes = q.left - plan.session < 30 ? q.left : plan.session;
      q.left -= minutes;
      const focus = q.examSoon && q.count % 2 === 0 ? "Past questions" : FOCUS[q.count % FOCUS.length];
      q.count++;
      sessions.push({ module: q.module, minutes, focus });
    }
  }
  const days = plan.days.map((d) => ({ d, next: toMin(d > 4 ? plan.weekend : plan.weekday), used: 0, has: new Set<number>() }));
  const blocks: Row[] = [];
  let unplaced = 0;
  for (const s of sessions) {
    const open = days
      .filter((d) => d.next + s.minutes <= LATEST)
      .sort((a, b) => Number(a.has.has(s.module.id)) - Number(b.has.has(s.module.id)) || a.used - b.used || a.d - b.d);
    const day = open[0];
    if (!day) {
      unplaced += s.minutes;
      continue;
    }
    blocks.push({ module_id: s.module.id, weekday: day.d, start_time: toTime(day.next), minutes: s.minutes, focus: s.focus });
    day.next += s.minutes + BREAK;
    day.used += s.minutes;
    day.has.add(s.module.id);
  }
  return { blocks, unplaced };
}

export default function RoutinePage() {
  const mutate = useMutate();
  const { byId, options } = useModules();
  const all = useRows("modules", { archived: 0 }, "code").rows;
  const modules = all.filter((m) => !m.final_grade);
  const comps = useRows("grading_components").rows;
  const exams = useRows("exams").rows;
  const saved = useRows("routine_blocks", undefined, "weekday, start_time").rows;
  const monday = startOfWeek(new Date());
  const logs = useRows("study_logs", { date: { gte: toDateStr(monday) } }).rows;
  const [cut] = useSetting<Record<string, number>>("grades.cutoffs", DEFAULT_CUTOFFS);
  const [plan, setPlan] = useSetting<Plan>("routine.plan", { days: [0, 1, 2, 3, 4, 5], weekday: "19:00", weekend: "10:00", session: 60 });
  const [extra, setExtra] = useSetting<Record<string, number>>("routine.adjust", {});
  const [draft, setDraft] = useState<{ blocks: Row[]; unplaced: number } | null>(null);
  const form = useFormState();
  const t = today();

  const rows = modules.map((m) => {
    const upcoming = exams
      .filter((e) => e.module_id === m.id && e.start_at && String(e.start_at).slice(0, 10) >= t)
      .map((e) => daysUntil(e.start_at)!)
      .sort((a, b) => a - b)[0];
    const need = studyNeed(m, standing(comps.filter((c) => c.module_id === m.id)), cut, upcoming ?? null);
    return {
      module: m,
      why: need.why,
      minutes: m.target_grade ? Math.max(0, need.minutes + (extra[m.id] ?? 0)) : 0,
      examSoon: upcoming !== undefined && upcoming <= 21,
    };
  });
  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const blocks = draft?.blocks ?? saved;

  const make = () => {
    if (!plan.days.length) return toast.error("Choose at least one study day");
    setDraft(layOut(rows, plan));
  };
  const save = async () => {
    if (!draft) return;
    await mutate(async () => {
      for (const b of saved) await db.remove("routine_blocks", b.id);
      await db.insertMany("routine_blocks", draft.blocks);
    });
    setDraft(null);
    toast.success("Routine saved");
  };

  return (
    <>
      <PageHeader
        title="Study Routine"
        icon={Clock}
        subtitle="How much to study for the grade you want"
        actions={
          <Button icon={Plus} disabled={!options.length || !!draft} onClick={() => form.openNew()}>
            Add a block
          </Button>
        }
      />
      <Page className="space-y-4">
        {!modules.length && !saved.length ? (
          <Empty icon={Clock} title="Add a module and a target grade">
            Your weekly study time is worked out from there.
          </Empty>
        ) : (
          <>
            <div className="grid items-start gap-4 xl:grid-cols-[3fr_2fr]">
              <Card className="p-5">
                <div className="mb-2 flex items-baseline gap-2">
                  <h2 className="flex-1 font-semibold">How much each week</h2>
                  <span className="font-display text-xl">{fmtMinutes(total) || "0h"}</span>
                </div>
                {rows.map((r) => {
                  const m = r.module;
                  const done = logs.filter((l) => l.module_id === m.id).reduce((s, l) => s + l.minutes, 0);
                  const adjust = (n: number) => setExtra({ ...extra, [m.id]: (extra[m.id] ?? 0) + n });
                  return (
                    <div key={m.id} className="border-b border-line py-3 last:border-0">
                      <div className="flex items-center gap-2 text-sm">
                        <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.color }} />
                        <span className="min-w-0 flex-1 truncate font-medium">{m.name}</span>
                        {m.target_grade && (
                          <>
                            <span className="text-xs text-muted">for {m.target_grade}</span>
                            <IconButton icon={Minus} label="30 minutes less" disabled={r.minutes <= 0} onClick={() => adjust(-30)} />
                            <span className="w-16 text-center font-semibold tabular-nums">{fmtMinutes(r.minutes) || "0m"}</span>
                            <IconButton icon={Plus} label="30 minutes more" onClick={() => adjust(30)} />
                          </>
                        )}
                      </div>
                      {m.target_grade ? (
                        <>
                          <div className="my-1.5 flex items-center gap-2 text-[11px] text-muted">
                            <Progress value={done} max={r.minutes} color={m.color} />
                            <span className="shrink-0">{fmtMinutes(done) || "0m"} studied this week</span>
                          </div>
                          <p className="text-[11px] leading-relaxed text-muted">
                            {r.why.join(", ")}
                            {extra[m.id] ? `, ${extra[m.id] > 0 ? "plus" : "minus"} ${fmtMinutes(Math.abs(extra[m.id]))} by you` : ""}
                          </p>
                        </>
                      ) : (
                        <div className="mt-2">
                          <p className="mb-1.5 text-xs text-muted">What grade do you want?</p>
                          <ChoiceField options={TARGETS.map((g) => ({ value: g, label: g }))} value={null} onChange={(g) => mutate(db.update("modules", m.id, { target_grade: g }))} />
                        </div>
                      )}
                    </div>
                  );
                })}
                <p className="mt-3 text-[11px] leading-relaxed text-muted">
                  This is StudyMed's rule of thumb, not NP guidance. It starts at 45 minutes per credit unit, then scales with your target, how hard the module feels, how far behind you are and how close the exam is.
                </p>
              </Card>

              <Card className="space-y-4 p-5">
                <h2 className="font-semibold">When you can study</h2>
                <div className="flex flex-wrap gap-1.5">
                  {DAYS.map((d, i) => {
                    const on = plan.days.includes(i);
                    return (
                      <button
                        type="button"
                        key={d}
                        aria-pressed={on}
                        onClick={() => setPlan({ ...plan, days: on ? plan.days.filter((x) => x !== i) : [...plan.days, i].sort() })}
                        className={cx("rounded-full px-3 py-1.5 text-xs", on ? "bg-accent text-accent-fg" : "bg-surface-2")}
                      >
                        {d}
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <Field label="Weekdays from">
                    <TimeField value={plan.weekday} clearable={false} onChange={(v) => v && setPlan({ ...plan, weekday: v })} />
                  </Field>
                  <Field label="Weekends from">
                    <TimeField value={plan.weekend} clearable={false} onChange={(v) => v && setPlan({ ...plan, weekend: v })} />
                  </Field>
                </div>
                <Field label="One session">
                  <ChoiceField options={[30, 45, 60, 90].map((n) => ({ value: n, label: fmtMinutes(n) }))} value={plan.session} onChange={(v) => setPlan({ ...plan, session: Number(v) })} />
                </Field>
                <Button variant="primary" icon={Wand2} className="h-11 w-full !rounded-full" disabled={!total} onClick={make}>
                  Make my routine
                </Button>
                {draft && (
                  <div className="anim-item space-y-2 rounded-[16px] bg-accent-soft p-4 text-sm">
                    <p>This is a preview. Saving replaces your current routine.</p>
                    {draft.unplaced > 0 && <p className="text-danger">{fmtMinutes(draft.unplaced)} didn't fit before 11:30pm. Add a day or start earlier.</p>}
                    <div className="flex gap-2">
                      <Button variant="primary" size="sm" onClick={save}>
                        Save routine
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setDraft(null)}>
                        Discard
                      </Button>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            <Card className="overflow-x-auto p-4">
              <h2 className="mb-3 px-1 font-semibold">{draft ? "Preview" : "This week"}</h2>
              <div className="grid min-w-[760px] grid-cols-7 gap-1.5">
                {DAYS.map((d, i) => {
                  const date = toDateStr(addDays(monday, i));
                  return (
                    <div key={d} className={cx("min-h-28 rounded-[16px] p-1.5", date === t ? "bg-accent-soft" : "bg-surface-2/60")}>
                      <div className="py-1 text-center text-xs font-semibold">{d}</div>
                      {blocks
                        .filter((b) => b.weekday === i)
                        .map((b, n) => {
                          const m = byId.get(b.module_id);
                          const log = draft ? undefined : logs.find((l) => l.block_id === b.id && l.date === date);
                          return (
                            <div key={b.id ?? `d${n}`} className="anim-item mt-1.5 rounded-2xl p-2 text-[11px]" style={{ background: `color-mix(in srgb, ${m?.color ?? "#c3a6f4"} ${log ? 75 : 35}%, transparent)` }}>
                              <button type="button" disabled={!!draft} onClick={() => form.openEdit(b)} className="block w-full min-w-0 text-left">
                                <span className="block truncate font-semibold">{m?.code}</span>
                                <span className="block">{fmtTime(b.start_time)}</span>
                                <span className="block opacity-75">{fmtMinutes(b.minutes)}</span>
                                <span className="block truncate opacity-75">{b.focus}</span>
                              </button>
                              {!draft && date <= t && (
                                <button
                                  type="button"
                                  aria-pressed={!!log}
                                  className={cx("mt-1 inline-flex w-full items-center justify-center gap-1 rounded-full py-1", log ? "bg-accent text-accent-fg" : "bg-surface-solid/70")}
                                  onClick={() =>
                                    mutate(async () => {
                                      if (log) await db.remove("study_logs", log.id);
                                      else await db.insert("study_logs", { module_id: b.module_id, block_id: b.id, date, minutes: b.minutes });
                                    })
                                  }
                                >
                                  <Check size={11} /> {log ? "Studied" : "Tick"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  );
                })}
              </div>
            </Card>
          </>
        )}
      </Page>
      <FormModal
        open={form.open}
        onClose={form.close}
        title={form.record ? "Edit study block" : "New study block"}
        table="routine_blocks"
        record={form.record}
        defaults={{ module_id: options[0]?.value, weekday: (new Date().getDay() + 6) % 7, start_time: "19:00", minutes: 60 }}
        fields={[
          { key: "module_id", label: "Module", type: "select", options, numeric: true, required: true, full: true },
          { key: "weekday", label: "Day", type: "select", numeric: true, required: true, options: DAYS.map((d, i) => ({ value: i, label: d })) },
          { key: "start_time", label: "Starts", type: "time", required: true },
          { key: "minutes", label: "Minutes", type: "number", required: true },
          { key: "focus", label: "What you'll do", type: "text", full: true, placeholder: "Active recall" },
        ]}
        transform={(v) => {
          if (!(v.minutes > 0)) throw new Error("A block needs at least a minute");
          return v;
        }}
      />
    </>
  );
}
