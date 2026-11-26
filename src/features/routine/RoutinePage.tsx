// Routine: a set plan for each day of the week, a morning check-in that walks through
// what's due, today's to-dos and study, and weekly study targets with no fixed time.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ArrowRight, BookOpen, CalendarClock, Check, ClipboardList, GraduationCap, ListTodo, Minus, Pencil, Plus, Sunrise, Trash2, Undo2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useNow, useRows } from "../../lib/hooks";
import { addDays, daysUntil, fmtDateShort, fmtDateTime, fmtTime, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx, fmtMinutes } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { DEFAULT_CUTOFFS, standing, studyNeed } from "../../lib/grades";
import { Button, Card, Checkbox, Field, IconButton, Input, Modal, Page, PageHeader, Progress, Segmented } from "../../components/ui";
import { ChoiceField, DateField, TimeField } from "../../components/pickers";
import { toast } from "../../stores/toast";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const KINDS = ["Morning check", "Study", "Class", "Exercise", "Meal", "Rest", "Chores", "Social", "Other"];
const REPEATS = [
  { value: "daily", label: "Every day", days: "0123456" },
  { value: "weekdays", label: "Weekdays", days: "01234" },
  { value: "weekends", label: "Weekends", days: "56" },
  { value: "custom", label: "Some days", days: "" },
  { value: "once", label: "Just once", days: "" },
];
const weekdayOf = (d: Date) => (d.getDay() + 6) % 7;
const doneChange = (done: boolean): Row =>
  done
    ? { done: 1, status: "Done", completed_at: new Date().toISOString().slice(0, 19).replace("T", " ") }
    : { done: 0, status: "Not Started", completed_at: null };

/** Routine items that happen on a given date. */
const itemsOn = (items: Row[], date: string) => {
  const wd = weekdayOf(new Date(`${date}T12:00`));
  return items.filter((i) => (i.once_on ? i.once_on === date : String(i.days).includes(String(wd))));
};

/* ------------------------------------------------------------ Add / edit item */
function ItemModal({ item, onClose }: { item: Row | null; onClose: () => void }) {
  const mutate = useMutate();
  const initialRepeat = item?.once_on ? "once" : (REPEATS.find((r) => r.days && r.days === item?.days)?.value ?? (item ? "custom" : "daily"));
  const [v, setV] = useState({
    title: item?.title ?? "",
    kind: item?.kind ?? "Other",
    start_time: item?.start_time ?? "07:00",
    end_time: (item?.end_time as string | null) ?? null,
    repeat: initialRepeat,
    days: String(item?.days ?? "0123456"),
    once_on: (item?.once_on as string | null) ?? today(),
  });
  const save = async () => {
    if (!v.title.trim()) return toast.error("Give it a name");
    if (v.end_time && v.end_time <= v.start_time) return toast.error("It has to end after it starts");
    const preset = REPEATS.find((r) => r.value === v.repeat)!;
    const days = v.repeat === "custom" ? v.days : preset.days || "0123456";
    if (v.repeat === "custom" && !days) return toast.error("Pick at least one day");
    const row = { title: v.title.trim(), kind: v.kind, start_time: v.start_time, end_time: v.end_time, days, once_on: v.repeat === "once" ? v.once_on : null };
    await mutate(item ? db.update("routine_items", item.id, row) : db.insert("routine_items", row));
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item ? "Edit activity" : "New activity"}
      footer={
        <>
          {item && (
            <Button
              variant="danger"
              icon={Trash2}
              className="mr-auto"
              onClick={async () => {
                await mutate(db.remove("routine_items", item.id));
                onClose();
              }}
            >
              Delete
            </Button>
          )}
          <Button variant="primary" className="!rounded-full px-6" onClick={save}>
            {item ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Input autoFocus value={v.title} onChange={(e) => setV({ ...v, title: e.target.value })} placeholder="e.g. Check homework & exams" className="h-12 w-full text-lg" />
        <Field label="Kind">
          <ChoiceField options={KINDS.map((k) => ({ value: k, label: k }))} value={v.kind} onChange={(k) => setV({ ...v, kind: String(k ?? "Other") })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From">
            <TimeField value={v.start_time} clearable={false} onChange={(t) => t && setV({ ...v, start_time: t })} />
          </Field>
          <Field label="Until (optional)">
            <TimeField value={v.end_time} onChange={(t) => setV({ ...v, end_time: t })} />
          </Field>
        </div>
        <Field label="Repeats">
          <ChoiceField options={REPEATS.map((r) => ({ value: r.value, label: r.label }))} value={v.repeat} onChange={(r) => setV({ ...v, repeat: String(r ?? "daily") })} />
        </Field>
        {v.repeat === "custom" && (
          <div className="flex flex-wrap gap-1.5">
            {DAYS.map((d, i) => {
              const on = v.days.includes(String(i));
              return (
                <button
                  type="button"
                  key={d}
                  aria-pressed={on}
                  onClick={() => setV({ ...v, days: on ? v.days.replace(String(i), "") : [...v.days, String(i)].sort().join("") })}
                  className={cx("rounded-full px-3.5 py-1.5 text-xs font-medium", on ? "bg-accent text-accent-fg" : "bg-surface-2 hover:bg-accent-soft")}
                >
                  {d}
                </button>
              );
            })}
          </div>
        )}
        {v.repeat === "once" && (
          <Field label="On">
            <DateField value={v.once_on} clearable={false} onChange={(d) => d && setV({ ...v, once_on: d })} />
          </Field>
        )}
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Shared bits */
function Step({ n, title, icon: Icon, done, onDone, children }: { n: number; title: string; icon: typeof Sunrise; done: boolean; onDone: () => void; children: ReactNode }) {
  return (
    <Card className={cx("overflow-hidden transition-opacity", done && "opacity-80")}>
      <div className="flex items-center gap-3 border-b border-line px-5 py-3.5">
        <span className={cx("font-display flex h-8 w-8 items-center justify-center rounded-full text-sm", done ? "bg-accent text-accent-fg" : "border border-accent/40 text-accent")}>
          {done ? <Check size={15} /> : n}
        </span>
        <Icon size={15} className="text-accent" />
        <h2 className="flex-1 font-semibold">{title}</h2>
        <Button size="sm" variant={done ? "ghost" : "primary"} className="!rounded-full" icon={done ? Undo2 : Check} onClick={onDone}>
          {done ? "Undo" : "Done"}
        </Button>
      </div>
      {!done && <div className="p-4">{children}</div>}
    </Card>
  );
}
const Sub = ({ title, count, children }: { title: string; count?: number; children: ReactNode }) => (
  <div className="rounded-[14px] bg-surface-2/60 p-3">
    <div className="mb-1.5 flex items-center gap-2">
      <span className="eyebrow !text-[9.5px]">{title}</span>
      {count !== undefined && <span className="text-[11px] text-muted">{count}</span>}
    </div>
    {children}
  </div>
);
const Quiet = ({ children }: { children: ReactNode }) => <p className="py-1 text-sm text-muted">{children}</p>;

function useStudy() {
  const weekStart = toDateStr(startOfWeek(new Date()));
  const modules = useRows("modules", { archived: 0 }, "code").rows;
  const targets = useRows("study_targets").rows;
  const logs = useRows("study_logs", { date: { gte: weekStart } }).rows;
  return useMemo(() => {
    const target = new Map(targets.map((t) => [t.module_id, t]));
    const done = (id: number) => logs.filter((l) => l.module_id === id).reduce((s, l) => s + l.minutes, 0);
    const rows = modules.map((m) => ({ m, target: target.get(m.id) as Row | undefined, done: done(m.id) }));
    return { rows, logs, weekStart };
  }, [modules, targets, logs, weekStart]);
}

function StudyRow({ m, target, done, compact }: { m: Row; target?: Row; done: number; compact?: boolean }) {
  const mutate = useMutate();
  const goal = target?.minutes_per_week ?? 0;
  const log = (minutes: number) => mutate(db.insert("study_logs", { module_id: m.id, date: today(), minutes }));
  return (
    <div className="py-2">
      <div className="flex items-center gap-2 text-sm">
        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: m.color }} />
        <span className="min-w-0 flex-1 truncate font-medium">
          {m.code} <span className="font-normal text-muted">{!compact && m.name}</span>
        </span>
        <span className="tabular text-xs text-muted">
          {fmtMinutes(done) || "0m"}
          {goal ? ` / ${fmtMinutes(goal)}` : ""}
        </span>
        <Button size="sm" variant="ghost" onClick={() => log(30)}>
          +30m
        </Button>
        <Button size="sm" variant="ghost" onClick={() => log(60)}>
          +1h
        </Button>
      </div>
      {goal > 0 && <Progress className="mt-1.5" value={done} max={goal} color={done >= goal ? "var(--accent)" : m.color} />}
    </div>
  );
}

/* ------------------------------------------------------------ Today */
function Today() {
  const mutate = useMutate();
  const now = useNow();
  const t = today();
  const yesterday = toDateStr(addDays(now, -1));
  const in3 = toDateStr(addDays(now, 3));
  const homework = useRows("homework", { due_at: { lte: `${in3} 23:59` } }, "due_at").rows.filter((h) => h.status !== "Submitted" && String(h.due_at).slice(0, 10) >= t);
  const exams = useRows("exams", { start_at: { gte: t } }, "start_at").rows;
  const soonExams = exams.filter((e) => (daysUntil(e.start_at) ?? 99) <= 30);
  const nextExam = exams[0];
  const leftover = useRows("todos", { parent_id: null, done: 0, date: { lte: yesterday } }, "date").rows;
  const todayTodos = useRows("todos", { parent_id: null, date: t }, "done, time, id").rows;
  const modules = useRows("modules").rows;
  const byId = new Map(modules.map((m) => [m.id, m]));
  const study = useStudy();
  const [state, setState] = useSetting<{ date: string; steps: number[] }>("routine.morning", { date: "", steps: [] });
  const steps = state.date === t ? state.steps : [];
  const toggleStep = (n: number) => setState({ date: t, steps: steps.includes(n) ? steps.filter((s) => s !== n) : [...steps, n] });
  const [quick, setQuick] = useState("");

  const items = useRows("routine_items", undefined, "start_time").rows;
  const ticks = useRows("routine_ticks", { date: t }).rows;
  const classes = useRows("class_slots", { weekday: weekdayOf(now) }, "start_time").rows.filter((c) => (!c.starts_on || c.starts_on <= t) && (!c.ends_on || c.ends_on >= t));
  const timeline = [
    ...itemsOn(items, t).map((i) => ({ key: `r${i.id}`, time: i.start_time as string, end: i.end_time as string | null, title: i.title as string, kind: i.kind as string, item: i })),
    ...classes.map((c) => ({ key: `c${c.id}`, time: c.start_time as string, end: c.end_time as string, title: `${byId.get(c.module_id)?.code ?? ""} ${c.kind}`, kind: "Class", item: null as Row | null })),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const weekGoal = study.rows.reduce((s, r) => s + (r.target?.minutes_per_week ?? 0), 0);
  const weekDone = study.rows.reduce((s, r) => s + (r.target ? Math.min(r.done, r.target.minutes_per_week) : 0), 0);

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="space-y-4">
        <Step n={1} title="First thing: check what's coming" icon={Sunrise} done={steps.includes(1)} onDone={() => toggleStep(1)}>
          <div className="grid gap-3 lg:grid-cols-3">
            <Sub title="Homework due in 3 days" count={homework.length}>
              {!homework.length && <Quiet>Nothing due. Nice.</Quiet>}
              {homework.map((h) => (
                <Link key={h.id} to={`/academics/homework?id=${h.id}`} className="block rounded-lg px-1 py-1 text-sm hover:bg-surface-2">
                  <span className="font-medium">{byId.get(h.module_id)?.code}</span> {h.title}
                  <span className="block text-[11px] text-muted">
                    {fmtDateTime(h.due_at)} · {daysUntil(h.due_at) === 0 ? "today" : `in ${daysUntil(h.due_at)} day${daysUntil(h.due_at) === 1 ? "" : "s"}`}
                  </span>
                </Link>
              ))}
            </Sub>
            <Sub title="Exams in the next 30 days" count={soonExams.length}>
              {!soonExams.length && <Quiet>{nextExam ? `Next: ${nextExam.name} in ${daysUntil(nextExam.start_at)} days.` : "No exams coming up."}</Quiet>}
              {soonExams.map((e) => {
                const d = daysUntil(e.start_at)!;
                return (
                  <Link key={e.id} to={`/academics/exams?id=${e.id}`} className="flex items-center gap-2 rounded-lg px-1 py-1 text-sm hover:bg-surface-2">
                    <span className="font-display tabular w-10 shrink-0 text-center text-lg leading-none" style={{ color: d <= 7 ? "var(--danger)" : undefined }}>
                      {d}
                      <span className="block text-[9px] text-muted">days</span>
                    </span>
                    <span className="min-w-0">
                      <span className="font-medium">{byId.get(e.module_id)?.code}</span> {e.name}
                      <span className="block text-[11px] text-muted">{fmtDateShort(String(e.start_at).slice(0, 10))}</span>
                    </span>
                  </Link>
                );
              })}
            </Sub>
            <Sub title="Left over from before" count={leftover.length}>
              {!leftover.length && <Quiet>You finished everything.</Quiet>}
              {leftover.map((x) => (
                <div key={x.id} className="flex items-center gap-2 py-0.5 text-sm">
                  <Checkbox checked={false} onChange={() => mutate(db.update("todos", x.id, doneChange(true)))} />
                  <span className="min-w-0 flex-1 truncate">{x.title}</span>
                  <button type="button" onClick={() => mutate(db.update("todos", x.id, { date: t }))} className="shrink-0 rounded-full bg-surface-solid/70 px-2 py-0.5 text-[11px] hover:text-accent">
                    Do today
                  </button>
                </div>
              ))}
            </Sub>
          </div>
        </Step>

        <Step n={2} title="Write today's to-dos" icon={ListTodo} done={steps.includes(2)} onDone={() => toggleStep(2)}>
          <form
            className="mb-2 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!quick.trim()) return;
              await mutate(db.insert("todos", { title: quick.trim(), date: t }));
              setQuick("");
            }}
          >
            <Input value={quick} onChange={(e) => setQuick(e.target.value)} placeholder="Add a to-do for today…" className="h-10 flex-1" />
            <Button type="submit" variant="primary" icon={Plus} disabled={!quick.trim()} className="!rounded-full">
              Add
            </Button>
          </form>
          {!todayTodos.length && <Quiet>Nothing planned for today yet.</Quiet>}
          {todayTodos.map((x) => (
            <div key={x.id} className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-sm hover:bg-surface-2">
              <Checkbox checked={!!x.done} onChange={(c) => mutate(db.update("todos", x.id, doneChange(c)))} />
              <Link to={`/todos?id=${x.id}`} className={cx("flex-1 truncate", x.done && "text-muted line-through")}>
                {x.title}
              </Link>
              {x.time && <span className="text-xs text-muted">{fmtTime(x.time)}</span>}
            </div>
          ))}
          <Link to="/todos" className="mt-1 inline-flex items-center gap-1 text-xs text-accent hover:underline">
            All to-dos <ArrowRight size={12} />
          </Link>
        </Step>

        <Step n={3} title="Start studying" icon={BookOpen} done={steps.includes(3)} onDone={() => toggleStep(3)}>
          {weekGoal > 0 && (
            <div className="mb-2 rounded-[14px] bg-surface-2/60 p-3">
              <div className="flex items-baseline justify-between text-sm">
                <span className="eyebrow !text-[9.5px]">This week</span>
                <span className="tabular text-xs text-muted">
                  {fmtMinutes(weekDone) || "0m"} of {fmtMinutes(weekGoal)}
                </span>
              </div>
              <Progress className="mt-1.5 !h-2.5" value={weekDone} max={weekGoal} />
            </div>
          )}
          {!study.rows.length && <Quiet>Add your modules first.</Quiet>}
          {study.rows.filter((r) => r.target?.minutes_per_week).length === 0 && study.rows.length > 0 && (
            <Quiet>
              No weekly targets yet. <Link to="/routine?tab=study" className="text-accent hover:underline">Set them</Link>, then study whenever suits you this week.
            </Quiet>
          )}
          <div className="divide-y divide-line">
            {study.rows
              .filter((r) => r.target?.minutes_per_week)
              .map((r) => (
                <StudyRow key={r.m.id} m={r.m} target={r.target} done={r.done} />
              ))}
          </div>
        </Step>
      </div>

      <Card className="p-4">
        <div className="mb-2 flex items-center gap-2">
          <CalendarClock size={15} className="text-accent" />
          <h2 className="flex-1 font-semibold">Today's routine</h2>
          <Link to="/routine?tab=week" className="text-xs text-accent hover:underline">
            Edit week
          </Link>
        </div>
        {!timeline.length && <Quiet>No routine for today. Add activities under Week plan.</Quiet>}
        <ol className="relative space-y-1 border-l border-line pl-4">
          {timeline.map((x, i) => {
            const ticked = x.item && ticks.some((k) => k.item_id === x.item!.id);
            const past = (x.end ?? x.time) < nowHM;
            const current = x.time <= nowHM && (x.end ? nowHM < x.end : (timeline[i + 1]?.time ?? "24:00") > nowHM);
            return (
              <li key={x.key} className={cx("relative rounded-lg py-1.5 pr-1 pl-1 text-sm", current && "bg-accent-soft")}>
                <span className={cx("absolute top-3 -left-[21px] h-2.5 w-2.5 rounded-full border-2 border-[var(--bg)]", current ? "bg-accent" : "bg-line")} />
                <div className="flex items-center gap-2">
                  <span className="tabular w-16 shrink-0 text-xs text-muted">{fmtTime(x.time)}</span>
                  <span className={cx("min-w-0 flex-1 truncate", ticked && "text-muted line-through", past && !ticked && x.item && "opacity-70")}>{x.title}</span>
                  {x.item ? (
                    <Checkbox
                      checked={!!ticked}
                      onChange={(c) =>
                        mutate(async () => {
                          if (c) await db.insert("routine_ticks", { item_id: x.item!.id, date: t });
                          else await db.removeWhere("routine_ticks", { item_id: x.item!.id, date: t });
                        })
                      }
                    />
                  ) : (
                    <GraduationCap size={13} className="text-muted" />
                  )}
                </div>
                <span className="block pl-[72px] text-[10px] text-muted">{x.kind}</span>
              </li>
            );
          })}
        </ol>
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Week plan */
function Week() {
  const items = useRows("routine_items", undefined, "start_time").rows;
  const classes = useRows("class_slots", undefined, "start_time").rows;
  const modules = useRows("modules").rows;
  const byId = new Map(modules.map((m) => [m.id, m]));
  const [editing, setEditing] = useState<Row | null | undefined>(undefined);
  const monday = startOfWeek(new Date());
  const t = today();
  return (
    <>
      <div className="mb-3 flex items-center gap-3">
        <p className="flex-1 text-sm text-muted">Your plan for each day of the week. Classes from your timetable show in grey.</p>
        <Button variant="primary" icon={Plus} className="!rounded-full" onClick={() => setEditing(null)}>
          Add activity
        </Button>
      </div>
      <Card className="overflow-x-auto p-3">
        <div className="grid min-w-[900px] grid-cols-7 gap-1.5">
          {DAYS.map((d, i) => {
            const date = toDateStr(addDays(monday, i));
            const list = [
              ...itemsOn(items, date).map((x) => ({ k: `r${x.id}`, time: x.start_time as string, title: x.title as string, sub: x.kind as string, row: x as Row | null, once: !!x.once_on })),
              ...classes
                .filter((c) => c.weekday === i && (!c.starts_on || c.starts_on <= date) && (!c.ends_on || c.ends_on >= date))
                .map((c) => ({ k: `c${c.id}`, time: c.start_time as string, title: `${byId.get(c.module_id)?.code ?? ""} ${c.kind}`, sub: "Class", row: null, once: false })),
            ].sort((a, b) => a.time.localeCompare(b.time));
            return (
              <div key={d} className={cx("min-h-40 rounded-[14px] p-1.5", date === t ? "bg-accent-soft" : "bg-surface-2/50")}>
                <div className="py-1 text-center">
                  <span className="text-xs font-semibold">{d}</span> <span className="text-[10px] text-muted">{fmtDateShort(date)}</span>
                </div>
                {list.map((x) =>
                  x.row ? (
                    <button key={x.k} type="button" onClick={() => setEditing(x.row)} className="anim-item mt-1 block w-full rounded-xl bg-surface-solid/80 p-2 text-left text-[11px] hover:ring-1 hover:ring-accent/40">
                      <span className="tabular block text-muted">{fmtTime(x.time)}</span>
                      <span className="block font-medium">{x.title}</span>
                      <span className="block text-[10px] text-muted">
                        {x.sub}
                        {x.once && " · once"}
                      </span>
                    </button>
                  ) : (
                    <div key={x.k} className="mt-1 rounded-xl border border-dashed border-line p-2 text-[11px] text-muted">
                      <span className="tabular block">{fmtTime(x.time)}</span>
                      <span className="block">{x.title}</span>
                    </div>
                  ),
                )}
              </div>
            );
          })}
        </div>
      </Card>
      {editing !== undefined && <ItemModal item={editing} onClose={() => setEditing(undefined)} />}
    </>
  );
}

/* ------------------------------------------------------------ Study targets */
function Study() {
  const mutate = useMutate();
  const study = useStudy();
  const comps = useRows("grading_components").rows;
  const exams = useRows("exams").rows;
  const [cut] = useSetting<Record<string, number>>("grades.cutoffs", DEFAULT_CUTOFFS);
  const t = today();
  const setTarget = (m: Row, target: Row | undefined, minutes: number) =>
    mutate(target ? db.update("study_targets", target.id, { minutes_per_week: Math.max(0, minutes) }) : db.insert("study_targets", { module_id: m.id, minutes_per_week: Math.max(0, minutes) }));
  const todays = study.logs.filter((l) => l.date === t);
  const byId = new Map(study.rows.map((r) => [r.m.id, r.m]));
  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <Card className="p-5">
        <h2 className="font-semibold">Weekly study targets</h2>
        <p className="mb-3 text-sm text-muted">Set how long each module needs a week. There's no set time: study whenever suits you, log it, and finish by Sunday.</p>
        {!study.rows.length && <Quiet>Add your modules first.</Quiet>}
        <div className="divide-y divide-line">
          {study.rows.map(({ m, target, done }) => {
            const upcoming = exams
              .filter((e) => e.module_id === m.id && e.start_at && String(e.start_at).slice(0, 10) >= t)
              .map((e) => daysUntil(e.start_at)!)
              .sort((a, b) => a - b)[0];
            const need = studyNeed(m, standing(comps.filter((c) => c.module_id === m.id)), cut, upcoming ?? null);
            const goal = target?.minutes_per_week ?? 0;
            return (
              <div key={m.id} className="py-3">
                <div className="flex items-center gap-2 text-sm">
                  <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: m.color }} />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {m.code} <span className="font-normal text-muted">{m.name}</span>
                  </span>
                  <IconButton icon={Minus} label="30 minutes less" disabled={goal <= 0} onClick={() => setTarget(m, target, goal - 30)} />
                  <span className="tabular w-16 text-center font-semibold">{goal ? fmtMinutes(goal) : "None"}</span>
                  <IconButton icon={Plus} label="30 minutes more" onClick={() => setTarget(m, target, goal + 30)} />
                </div>
                {goal > 0 && (
                  <div className="mt-1.5 flex items-center gap-2 text-[11px] text-muted">
                    <Progress value={done} max={goal} color={m.color} />
                    <span className="shrink-0">
                      {fmtMinutes(done) || "0m"} done{done >= goal ? " ✓" : `, ${fmtMinutes(goal - done)} to go`}
                    </span>
                  </div>
                )}
                {m.target_grade && need.minutes > 0 && need.minutes !== goal && (
                  <button type="button" onClick={() => setTarget(m, target, need.minutes)} className="mt-1 text-[11px] text-accent hover:underline">
                    Suggested {fmtMinutes(need.minutes)} for {m.target_grade} ({need.why.slice(1).join(", ") || "from your credits"}). Use this
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </Card>
      <Card className="p-5">
        <h2 className="mb-1 font-semibold">Log study</h2>
        <p className="mb-2 text-sm text-muted">Tap after a session; it counts towards this week.</p>
        <div className="divide-y divide-line">
          {study.rows.map((r) => (
            <StudyRow key={r.m.id} m={r.m} target={r.target} done={r.done} compact />
          ))}
        </div>
        {todays.length > 0 && (
          <div className="mt-3 border-t border-line pt-2">
            <span className="eyebrow !text-[9.5px]">Logged today</span>
            {todays.map((l) => (
              <div key={l.id} className="flex items-center gap-2 py-0.5 text-sm">
                <span className="flex-1">
                  {byId.get(l.module_id)?.code} · {fmtMinutes(l.minutes)}
                </span>
                <IconButton icon={Undo2} label="Remove" onClick={() => mutate(db.remove("study_logs", l.id))} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ------------------------------------------------------------ Page */
type Tab = "today" | "week" | "study";
export default function RoutinePage() {
  const [params, setParams] = useSearchParams();
  const tab = (["today", "week", "study"].includes(params.get("tab") ?? "") ? params.get("tab") : "today") as Tab;
  return (
    <>
      <PageHeader
        title="Routine"
        icon={Sunrise}
        subtitle="A plan for every day, and the order to start it in"
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={(v) => setParams(v === "today" ? {} : { tab: v }, { replace: true })}
            options={[
              { value: "today", label: "Today", icon: Sunrise },
              { value: "week", label: "Week plan", icon: Pencil },
              { value: "study", label: "Study targets", icon: ClipboardList },
            ]}
          />
        }
      />
      <Page>{tab === "today" ? <Today /> : tab === "week" ? <Week /> : <Study />}</Page>
    </>
  );
}
