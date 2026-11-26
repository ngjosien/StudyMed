// Routine: a set plan for each day of the week, what is coming up (homework, exams,
// unfinished to-dos), and weekly study targets with no fixed time.
import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { BookOpen, CalendarClock, ClipboardList, GraduationCap, ListTodo, Minus, Pencil, Plus, Sunrise, Timer, Trash2, Undo2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useNow, useRows } from "../../lib/hooks";
import { addDays, daysUntil, fmtDateShort, fmtDateTime, fmtTime, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx, fmtMinutes } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { DEFAULT_CUTOFFS, standing, studyNeed } from "../../lib/grades";
import { Button, Card, Field, IconButton, Input, MilestoneBar, Modal, Page, PageHeader, Segmented } from "../../components/ui";
import { TickBox } from "../life/GoalsPage";
import { StudyStats } from "../../components/study-stats";
import { useThisWeeksTopics } from "../academics/WeeklyContent";
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
/** Colour per kind of activity, used on the timeline and the week plan. */
const KIND_TINT: Record<string, string> = {
  "Morning check": "#f4d8a6",
  Study: "#c3a6f4",
  Class: "#a6c8f4",
  Exercise: "#a6e3d0",
  Meal: "#f4b8a6",
  Rest: "#b8c0cc",
  Chores: "#e6d2a0",
  Social: "#f4a6c0",
  Other: "#cfc6e0",
};
const tintOf = (kind: string) => KIND_TINT[kind] ?? KIND_TINT.Other;
const wash = (tint: string) => ({ background: `linear-gradient(100deg, color-mix(in srgb, ${tint} 40%, transparent), color-mix(in srgb, ${tint} 8%, transparent))` });

function Tile({ title, icon: Icon, to, count, children }: { title: string; icon: typeof Sunrise; to?: string; count?: number; children: ReactNode }) {
  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={14} />
        </span>
        <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
        {!!count && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">{count}</span>}
        {to && (
          <Link to={to} className="text-xs text-accent hover:underline">
            Open
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
const Quiet = ({ children }: { children: ReactNode }) => <p className="py-1.5 text-sm text-muted">{children}</p>;
const inDays = (n: number) => (n === 0 ? "today" : n === 1 ? "tomorrow" : `in ${n} days`);

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
        <Link to={`/focus?module=${m.id}`} title={`Start a focus session for ${m.code}`} className="inline-flex h-7 items-center gap-1 rounded-xl px-2 text-xs font-medium text-accent hover:bg-accent-soft">
          <Timer size={13} /> Focus
        </Link>
        <Button size="sm" variant="ghost" onClick={() => log(30)}>
          +30m
        </Button>
        <Button size="sm" variant="ghost" onClick={() => log(60)}>
          +1h
        </Button>
      </div>
      {goal > 0 && <MilestoneBar className="mt-2" value={done} max={goal} color={m.color} label={`${m.code} this week`} />}
    </div>
  );
}

/* ------------------------------------------------------------ Today */
function Today() {
  const mutate = useMutate();
  const now = useNow();
  const t = today();
  const yesterday = toDateStr(addDays(now, -1));
  const weekAgo = toDateStr(addDays(now, -7));
  const in3 = toDateStr(addDays(now, 3));
  const in30 = toDateStr(addDays(now, 30));
  const homework = useRows("homework", { due_at: { lte: `${in3}T23:59` } }, "due_at").rows.filter((h) => h.status !== "Submitted" && String(h.due_at).slice(0, 10) >= t);
  const exams = useRows("exams", { start_at: { gte: t } }, "start_at").rows;
  const soonExams = exams.filter((e) => String(e.start_at).slice(0, 10) <= in30);
  const nextExam = exams[0];
  const plans = useRows("todos", { plan_exam_id: { null: false } }).rows;
  const leftover = useRows("todos", { parent_id: null, done: 0, date: { gte: weekAgo, lte: yesterday } }, "date").rows;
  const modules = useRows("modules").rows;
  const byId = new Map(modules.map((m) => [m.id, m]));
  const weekTopics = useThisWeeksTopics();

  const items = useRows("routine_items", undefined, "start_time").rows;
  const ticks = useRows("routine_ticks", { date: t }).rows;
  const classes = useRows("class_slots", { weekday: weekdayOf(now) }, "start_time").rows.filter((c) => (!c.starts_on || c.starts_on <= t) && (!c.ends_on || c.ends_on >= t));
  const timeline = [
    ...itemsOn(items, t).map((i) => ({ key: `r${i.id}`, time: i.start_time as string, end: i.end_time as string | null, title: i.title as string, kind: i.kind as string, item: i as Row | null, color: tintOf(i.kind) })),
    ...classes.map((c) => {
      const m = byId.get(c.module_id);
      return { key: `c${c.id}`, time: c.start_time as string, end: c.end_time as string | null, title: `${m?.code ?? ""} ${c.kind}`, kind: "Class", item: null as Row | null, color: (m?.color as string) ?? tintOf("Class") };
    }),
  ].sort((a, b) => a.time.localeCompare(b.time));
  const nowHM = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const nowIndex = timeline.findIndex((x) => (x.end ?? x.time) > nowHM);
  const done = timeline.filter((x) => x.item && ticks.some((k) => k.item_id === x.item!.id)).length;
  const tickable = timeline.filter((x) => x.item).length;

  const tickItem = (item: Row, on: boolean) =>
    mutate(async () => {
      if (on) await db.insert("routine_ticks", { item_id: item.id, date: t });
      else await db.removeWhere("routine_ticks", { item_id: item.id, date: t });
    });

  return (
    <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card className="overflow-hidden">
        <div className="flex items-end justify-between gap-4 px-6 pt-6 pb-3">
          <div>
            <p className="eyebrow !text-accent">Today's routine</p>
            <p className="font-display text-2xl">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
          </div>
          <div className="text-right text-sm text-muted">
            {tickable > 0 && (
              <p>
                <span className="font-semibold text-fg">{done}</span> of {tickable} done
              </p>
            )}
            <Link to="/routine?tab=week" className="text-xs text-accent hover:underline">
              Edit week plan
            </Link>
          </div>
        </div>
        <div className="px-4 pb-5">
          {!timeline.length && (
            <p className="px-2 py-10 text-center text-sm text-muted">
              Nothing planned for today. <Link to="/routine?tab=week" className="text-accent hover:underline">Add activities to your week plan</Link>.
            </p>
          )}
          {timeline.map((x, n) => {
            const ticked = !!x.item && ticks.some((k) => k.item_id === x.item!.id);
            const past = (x.end ?? x.time) <= nowHM;
            return (
              <div key={x.key}>
                {n === nowIndex && (
                  <div className="flex items-center gap-4 py-1">
                    <span className="w-16 text-right text-[11px] font-semibold text-danger">{fmtTime(nowHM)}</span>
                    <span className="flex w-4 justify-center">
                      <span className="h-2.5 w-2.5 rounded-full bg-danger shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_25%,transparent)]" />
                    </span>
                    <span className="h-0.5 flex-1 rounded-full bg-danger/60" />
                  </div>
                )}
                <div className={cx("relative flex items-stretch gap-4", past && !ticked && "opacity-80", ticked && "opacity-60")}>
                  <div className="w-16 shrink-0 pt-3 text-right text-xs text-muted tabular-nums">
                    <div className="font-semibold text-fg">{fmtTime(x.time)}</div>
                    {x.end && <div>{fmtTime(x.end)}</div>}
                  </div>
                  <div className="relative flex w-4 shrink-0 justify-center">
                    <span className="absolute inset-y-0 w-0.5 bg-line" />
                    <span className="relative mt-4 h-3 w-3 rounded-full ring-4 ring-surface-solid" style={{ background: x.color }} />
                  </div>
                  <div className="my-1 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5" style={wash(x.color)}>
                    {x.item ? <CalendarClock size={16} className="shrink-0 opacity-70" /> : <GraduationCap size={16} className="shrink-0 opacity-70" />}
                    <span className="min-w-0 flex-1">
                      <span className={cx("block truncate font-medium", ticked && "line-through")}>{x.title}</span>
                      <span className="block text-xs text-muted">{x.kind}</span>
                    </span>
                    {x.item && <TickBox on={ticked} size={24} label={`Done: ${x.title}`} onClick={() => tickItem(x.item!, !ticked)} />}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <div className="space-y-4">
        <Tile title="Homework due in 3 days" icon={ClipboardList} to="/academics/homework" count={homework.length}>
          {!homework.length && <Quiet>Nothing due. Nice.</Quiet>}
          {homework.map((h) => {
            const d = daysUntil(h.due_at) ?? 0;
            return (
              <Link key={h.id} to={`/academics/homework?id=${h.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: byId.get(h.module_id)?.color ?? "var(--accent)" }} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="font-medium">{byId.get(h.module_id)?.code}</span> {h.title}
                  </span>
                  <span className="block text-[11px] text-muted">{fmtDateTime(h.due_at)}</span>
                </span>
                <span className={cx("shrink-0 text-xs font-medium", d <= 1 ? "text-danger" : "text-muted")}>{inDays(d)}</span>
              </Link>
            );
          })}
        </Tile>

        <Tile title="Exams in the next 30 days" icon={GraduationCap} to="/academics/exams" count={soonExams.length}>
          {!soonExams.length && <Quiet>{nextExam ? `Next: ${nextExam.name}, ${inDays(daysUntil(nextExam.start_at) ?? 0)}.` : "No exams coming up."}</Quiet>}
          {soonExams.map((e) => {
            const d = daysUntil(e.start_at) ?? 0;
            const plan = plans.filter((p) => p.plan_exam_id === e.id);
            const planDone = plan.filter((p) => p.done).length;
            return (
              <Link key={e.id} to={`/academics/exams?id=${e.id}`} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm hover:bg-surface-2">
                <span className="w-11 shrink-0 rounded-xl bg-surface-2 py-1 text-center leading-tight">
                  <span className="font-display tabular block text-lg" style={{ color: d <= 7 ? "var(--danger)" : undefined }}>
                    {d}
                  </span>
                  <span className="block text-[9px] text-muted uppercase">{d === 1 ? "day" : "days"}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate">
                    <span className="font-medium">{byId.get(e.module_id)?.code}</span> {e.name}
                  </span>
                  <span className="block text-[11px] text-muted">
                    {fmtDateShort(String(e.start_at).slice(0, 10))}
                    {plan.length > 0 && ` · revision ${planDone}/${plan.length}`}
                  </span>
                </span>
              </Link>
            );
          })}
        </Tile>

        {weekTopics.week && (
          <Tile title={`Week ${weekTopics.week} content`} icon={BookOpen} count={weekTopics.rows.filter((x) => !x.done).length}>
            {!weekTopics.rows.length && <Quiet>Nothing listed for this week. Add topics on each module's page.</Quiet>}
            {weekTopics.rows.map((x) => (
              <div key={x.id} className="flex items-center gap-3 py-1 text-sm">
                <TickBox on={!!x.done} size={22} label={`Covered: ${x.title}`} onClick={() => mutate(db.update("module_topics", x.id, { done: x.done ? 0 : 1 }))} />
                <Link to={`/academics/modules/${x.module_id}`} className={cx("min-w-0 flex-1 truncate hover:underline", x.done && "text-muted line-through")}>
                  <span className="font-medium">{byId.get(x.module_id)?.code}</span> {x.title}
                </Link>
              </div>
            ))}
          </Tile>
        )}

        <Tile title="Unfinished from the past week" icon={ListTodo} to="/todos" count={leftover.length}>
          {!leftover.length && <Quiet>You finished everything.</Quiet>}
          {leftover.map((x) => (
            <div key={x.id} className="flex items-center gap-3 py-1 text-sm">
              <TickBox on={false} size={22} label={`Done: ${x.title}`} onClick={() => mutate(db.update("todos", x.id, doneChange(true)))} />
              <Link to={`/todos?id=${x.id}`} className="min-w-0 flex-1 truncate hover:underline">
                {x.title}
                <span className="block text-[11px] text-muted">{fmtDateShort(x.date)}</span>
              </Link>
              <button type="button" onClick={() => mutate(db.update("todos", x.id, { date: t }))} className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[11px] font-medium hover:text-accent">
                Do today
              </button>
            </div>
          ))}
        </Tile>
      </div>
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
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <p className="flex-1 text-sm text-muted">Your plan for each day. Click an activity to change it; classes come from your timetable.</p>
        <div className="flex flex-wrap gap-1.5">
          {KINDS.filter((k) => k !== "Class").map((k) => (
            <span key={k} className="inline-flex items-center gap-1 text-[11px] text-muted">
              <span className="h-2 w-2 rounded-full" style={{ background: tintOf(k) }} />
              {k}
            </span>
          ))}
        </div>
        <Button variant="primary" icon={Plus} className="!rounded-full" onClick={() => setEditing(null)}>
          Add activity
        </Button>
      </div>
      <div className="overflow-x-auto pb-2">
        <div className="grid min-w-[820px] grid-cols-7 gap-2">
          {DAYS.map((d, i) => {
            const date = toDateStr(addDays(monday, i));
            const list = [
              ...itemsOn(items, date).map((x) => ({ k: `r${x.id}`, time: x.start_time as string, end: x.end_time as string | null, title: x.title as string, sub: x.kind as string, row: x as Row | null, once: !!x.once_on, color: tintOf(x.kind) })),
              ...classes
                .filter((c) => c.weekday === i && (!c.starts_on || c.starts_on <= date) && (!c.ends_on || c.ends_on >= date))
                .map((c) => {
                  const m = byId.get(c.module_id);
                  return { k: `c${c.id}`, time: c.start_time as string, end: c.end_time as string | null, title: `${m?.code ?? ""} ${c.kind}`, sub: "Class", row: null, once: false, color: (m?.color as string) ?? tintOf("Class") };
                }),
            ].sort((a, b) => a.time.localeCompare(b.time));
            const isToday = date === t;
            return (
              <Card key={d} className={cx("min-h-[420px] p-2", isToday && "ring-2 ring-accent/50")}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className={cx("font-display text-lg", isToday && "text-accent")}>{d}</span>
                  <span className="text-xs text-muted">{addDays(monday, i).toLocaleDateString(undefined, { day: "numeric", month: "short" })}</span>
                </div>
                {!list.length && <p className="px-1 py-4 text-center text-xs text-muted">Free day</p>}
                <div className="space-y-1.5">
                  {list.map((x) => {
                    const body = (
                      <>
                        <span className="tabular block text-[11px] text-muted">
                          {fmtTime(x.time)}
                          {x.end ? ` – ${fmtTime(x.end)}` : ""}
                        </span>
                        <span className="block text-[13px] leading-snug font-medium">{x.title}</span>
                        <span className="block text-[11px] text-muted">
                          {x.sub}
                          {x.once && " · once"}
                        </span>
                      </>
                    );
                    return x.row ? (
                      <button
                        key={x.k}
                        type="button"
                        onClick={() => setEditing(x.row)}
                        className="anim-item block w-full rounded-xl border-l-[3px] px-2.5 py-2 text-left transition-transform hover:translate-x-0.5"
                        style={{ ...wash(x.color), borderColor: x.color }}
                      >
                        {body}
                      </button>
                    ) : (
                      <div key={x.k} className="rounded-xl border border-dashed px-2.5 py-2" style={{ borderColor: x.color }}>
                        {body}
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      </div>
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
    <div className="space-y-4">
    <StudyStats />
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
                  <div className="mt-2 flex items-center gap-3 text-[11px] text-muted">
                    <MilestoneBar className="flex-1" value={done} max={goal} color={m.color} label={`${m.code} this week`} />
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
        subtitle="Your plan for every day, and what is coming up"
        actions={
          <Segmented<Tab>
            value={tab}
            onChange={(v) => setParams(v === "today" ? {} : { tab: v }, { replace: true })}
            options={[
              { value: "today", label: "Today", icon: Sunrise },
              { value: "week", label: "Week plan", icon: Pencil },
              { value: "study", label: "Study", icon: ClipboardList },
            ]}
          />
        }
      />
      <Page>{tab === "today" ? <Today /> : tab === "week" ? <Week /> : <Study />}</Page>
    </>
  );
}
