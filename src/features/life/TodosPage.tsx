import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { CalendarRange, List, ListTodo, Plus, Timer, X } from "lucide-react";
import { api, db, type Row } from "../../lib/api";
import { useMutate, useRows, useTagsBy } from "../../lib/hooks";
import { cx, fmtMinutes } from "../../lib/format";
import { fmtDateShort, fmtTime, today } from "../../lib/dates";
import { Button, Card, Checkbox, ConfirmDelete, Drawer, DurationSlider, Empty, Field, IconButton, Input, Page, PageHeader, Segmented } from "../../components/ui";
import { TodosToday } from "../../components/study-stats";
import { FormModal, useFormState, type FormState } from "../../components/form";
import { Countdown, WeekBoard } from "../../components/weekboard";
import { useSetting } from "../../stores/ui";
import { MarkdownEditor } from "../../components/markdown";
import { ReminderPicker, TagInput } from "../../components/shared";
import { ChoiceField, DateField, TimeField } from "../../components/pickers";
import { Connections } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";

const KINDS = ["events", "people", "homework", "exams", "modules", "tick_goals", "portfolio_entries", "savings_goals"];
const PRIORITIES = ["Low", "Medium", "High"];

const doneChange = (done: boolean): Row =>
  done
    ? { done: 1, status: "Done", completed_at: new Date().toISOString().slice(0, 19).replace("T", " ") }
    : { done: 0, status: "Not Started", completed_at: null };

/* --------------------------------------------------------------- Side panel */
function TodoPanel({ todo, allTags, onClose }: { todo: Row; allTags: string[]; onClose: () => void }) {
  const mutate = useMutate();
  const [v, setV] = useState<Row>(todo);
  const [tags, setTags] = useState<string[]>([]);
  const [rems, setRems] = useState<string[]>([]);
  const [sub, setSub] = useState("");
  const subtasks = useRows("todos", { parent_id: todo.id }, "position, id").rows;
  const nav = useNavigate();
  const focused = useRows("focus_sessions", { todo_id: todo.id }).rows.reduce((n, f) => n + Number(f.focus_minutes), 0);
  const [est, setEst] = useState<number | null>(todo.est_minutes ?? null);
  useEffect(() => setEst(todo.est_minutes ?? null), [todo.est_minutes]);
  const notesTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => setV(todo), [todo]);
  useEffect(() => {
    db.tagsFor("todos", "todo_category").then((r) => setTags(r.filter((t) => t.entity_id === todo.id).map((t) => t.name)));
    api.remindersFor("todos", todo.id).then((r) => setRems(r.map((x) => String(x.remind_at))));
  }, [todo.id]);

  const save = (patch: Row) => {
    setV((p) => ({ ...p, ...patch }));
    return mutate(db.update("todos", todo.id, patch));
  };
  const saveReminders = (list: string[]) => {
    setRems(list);
    mutate(api.remindersSync("todos", todo.id, list.map((at) => ({ remindAt: at, title: `To-do: ${v.title}` }))));
  };
  const base = v.date ? (v.time ? `${v.date}T${v.time}` : v.date) : null;

  return (
    <Drawer open onClose={onClose} title="To-do" width="w-[580px]">
      <div className="space-y-5">
        <div className="flex items-start gap-3">
          <Checkbox checked={!!v.done} onChange={(c) => save(doneChange(c))} />
          <input
            value={v.title}
            onChange={(e) => setV({ ...v, title: e.target.value })}
            onBlur={() => v.title.trim() && v.title !== todo.title && save({ title: v.title.trim() })}
            className={cx("font-display -mt-1 flex-1 bg-transparent text-xl font-semibold outline-none", v.done && "text-muted line-through")}
          />
        </div>
        <Field label="Linked to">
          <Connections type="todos" id={todo.id} />
        </Field>
        <div className="grid grid-cols-[1fr_150px] gap-3">
          <Field label="Date">
            <DateField value={v.date} onChange={(d) => save({ date: d })} />
          </Field>
          <Field label="Time">
            <TimeField value={v.time} onChange={(t) => save({ time: t })} />
          </Field>
        </div>
        <Field label="Priority">
          <ChoiceField options={PRIORITIES.map((p) => ({ value: p, label: p }))} value={v.priority} onChange={(p) => save({ priority: p })} />
        </Field>
        <Field label="Time to finish it in" hint={focused ? `Focused ${fmtMinutes(focused)} so far` : undefined}>
          {est == null ? (
            <Button size="sm" onClick={() => save({ est_minutes: 30 })}>
              Set a time
            </Button>
          ) : (
            <div className="flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm font-semibold tabular-nums">{fmtMinutes(est)}</span>
              <DurationSlider value={est} onChange={setEst} onCommit={(m) => save({ est_minutes: m })} label="Time to finish it in" />
              <IconButton icon={X} label="No time" onClick={() => save({ est_minutes: null })} />
            </div>
          )}
        </Field>
        {!v.done && (
          <Button variant="primary" icon={Timer} className="!rounded-full" onClick={() => nav(`/focus?todo=${todo.id}`)}>
            Focus on this{est ? ` for ${fmtMinutes(est)}` : ""}
          </Button>
        )}
        <Field label="Category">
          <TagInput
            value={tags}
            suggestions={allTags}
            placeholder="Errands, Admin…"
            onChange={(t) => {
              setTags(t);
              mutate(db.tagsSet("todos", todo.id, "todo_category", t));
            }}
          />
        </Field>
        <Field label="Remind me">
          <ReminderPicker base={base} value={rems} onChange={saveReminders} />
        </Field>
        <div>
          <div className="mb-1.5 text-xs font-medium text-muted">Smaller steps</div>
          <ul className="space-y-1">
            {subtasks.map((s) => (
              <li key={s.id} className="anim-item group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-2">
                <Checkbox checked={!!s.done} onChange={(c) => mutate(db.update("todos", s.id, doneChange(c)))} />
                <span className={cx("flex-1 text-sm", s.done && "text-muted line-through")}>{s.title}</span>
                <IconButton icon={X} label="Delete step" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("todos", s.id))} />
              </li>
            ))}
          </ul>
          <form
            className="mt-1 flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!sub.trim()) return;
              await mutate(db.insert("todos", { title: sub.trim(), parent_id: todo.id, position: subtasks.length }));
              setSub("");
            }}
          >
            <Input value={sub} onChange={(e) => setSub(e.target.value)} placeholder="Add a step…" className="h-8 flex-1" />
            <Button size="sm" type="submit" icon={Plus} disabled={!sub.trim()}>
              Add
            </Button>
          </form>
        </div>
        <Field label="Notes">
          <MarkdownEditor
            value={v.notes_md ?? ""}
            minHeight={160}
            subdir="todos"
            onChange={(t) => {
              setV((p) => ({ ...p, notes_md: t }));
              clearTimeout(notesTimer.current);
              notesTimer.current = setTimeout(() => mutate(db.update("todos", todo.id, { notes_md: t })), 700);
            }}
          />
        </Field>
        <div className="flex justify-end">
          <ConfirmDelete
            label="Delete to-do"
            onConfirm={async () => {
              await mutate(db.remove("todos", todo.id));
              onClose();
            }}
          />
        </div>
      </div>
    </Drawer>
  );
}

/* --------------------------------------------------------------- New to-do: every setting up front */
const PRIORITY_COLOR: Record<string, string> = { Low: "#a6c8f4", Medium: "#f4d8a6", High: "#f4a6a6" };
function TodoForm({ state }: { state: FormState }) {
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit to-do" : "New to-do"}
      table="todos"
      record={state.record}
      defaults={{ priority: "Medium", ...state.defaults }}
      fields={[
        { key: "title", label: "To-do", type: "text", required: true, placeholder: "What do you need to do?" },
        { key: "date", label: "Do it on", type: "date" },
        { key: "time", label: "At", type: "time" },
        { key: "priority", label: "Priority", type: "select", options: PRIORITIES.map((p) => ({ value: p, label: p, color: PRIORITY_COLOR[p] })), required: true, full: true },
        { key: "est_minutes", label: "Time to finish it in", type: "duration", full: true },
        { key: "notes_md", label: "Notes", type: "markdown", more: true },
      ]}
      reminders={{
        entityType: "todos",
        base: (v) => (v.date ? (v.time ? v.date + "T" + v.time : v.date) : null),
        title: (v) => "To-do: " + v.title,
      }}
    />
  );
}

function TodoCard({ t, onOpen, compact }: { t: Row; onOpen: () => void; compact?: boolean }) {
  const mutate = useMutate();
  const nav = useNavigate();
  return (
    <Card onClick={onOpen} className={cx("flex items-start gap-2.5", compact ? "p-2.5" : "px-4 py-3")}>
      <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
        <Checkbox checked={!!t.done} onChange={(c) => mutate(db.update("todos", t.id, doneChange(c)))} />
      </span>
      <div className="min-w-0 flex-1">
        <div className={cx("font-medium", compact ? "line-clamp-2 text-[13px] leading-snug" : "line-clamp-2 leading-snug", t.done && "text-muted line-through")}>{t.title}</div>
        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
          {!t.done && <Countdown date={t.date} />}
          {!compact && t.date && <span>{fmtDateShort(t.date)}</span>}
          {t.time && <span>{fmtTime(t.time)}</span>}
          {t.priority && t.priority !== "Medium" && (
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: PRIORITY_COLOR[t.priority] }} />
              {t.priority}
            </span>
          )}
          {t.est_minutes ? <span>{fmtMinutes(t.est_minutes)}</span> : null}
        </div>
        <LinkChips type="todos" id={t.id} />
      </div>
      {!t.done && (
        <button
          type="button"
          title={`Focus on this${t.est_minutes ? ` for ${fmtMinutes(t.est_minutes)}` : ""}`}
          aria-label="Focus on this"
          onClick={(e) => {
            e.stopPropagation();
            nav(`/focus?todo=${t.id}`);
          }}
          className="shrink-0 rounded-full p-1.5 text-muted hover:bg-accent-soft hover:text-accent"
        >
          <Timer size={compact ? 14 : 16} />
        </button>
      )}
    </Card>
  );
}

/* --------------------------------------------------------------- Page */
export default function TodosPage() {
  const [params, setParams] = useSearchParams();
  const { rows } = useRows("todos", { parent_id: null }, "id");
  const tags = useTagsBy("todos", "todo_category");
  const [quick, setQuick] = useState("");
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);
  const [view, setView] = useSetting<"week" | "list">("view.todos", "week");
  const form = useFormState();

  useEffect(() => {
    const id = params.get("id");
    const isNew = params.get("new");
    if (id) setOpenId(Number(id));
    if (id || isNew) {
      setParams({}, { replace: true });
      if (isNew) form.openNew({ date: today() });
    }
  }, [params, setParams]);

  const openTodo = rows.find((t) => t.id === openId) ?? null;

  // Typing a title then Add opens the full form, so the date, priority, reminders and
  // what it's for can all be chosen before saving.
  const add = () => {
    form.openNew({ title: quick.trim() || undefined, date: today() });
    setQuick("");
  };

  return (
    <>
      <PageHeader
        title="To-Dos"
        icon={ListTodo}
        subtitle={view === "week" ? "Your week, day by day" : "Sorted by what each one is for"}
        actions={
          <>
            <Segmented<"week" | "list">
              value={view}
              onChange={setView}
              options={[
                { value: "week", label: "Week", icon: CalendarRange },
                { value: "list", label: "By page", icon: List },
              ]}
            />
            <Button variant="primary" icon={Plus} className="!rounded-full" onClick={() => form.openNew({ date: today() })}>
              New to-do
            </Button>
          </>
        }
      />
      <Page className="space-y-5">
        <TodosToday className="glass rounded-[18px] px-5 py-4" done={rows.filter((x) => x.date === today() && x.done).length} total={rows.filter((x) => x.date === today()).length} />
        <form
          className="glass space-y-2.5 rounded-[18px] p-4"
          onSubmit={(e) => {
            e.preventDefault();
            void add();
          }}
        >
          <div className="flex items-center gap-2">
            <input
              id="todo-quick-add"
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              placeholder="What do you need to do?"
              className="h-11 min-w-0 flex-1 bg-transparent px-2 text-lg font-semibold outline-none placeholder:text-muted/50"
            />
            <Button type="submit" variant="primary" icon={Plus} className="h-11 !rounded-full px-6">
              Add
            </Button>
          </div>
          <p className="px-2 text-xs text-muted">Add opens the details: when, priority, how long, what it's for and reminders.</p>
        </form>
        {view === "week" ? (
          <WeekBoard
            rows={rows}
            dateOf={(t) => t.date}
            isOpen={(t) => !t.done}
            onAdd={(date) => form.openNew({ date })}
            addLabel="Add a to-do"
            render={(t) => <TodoCard t={t} onOpen={() => setOpenId(t.id)} />}
          />
        ) : (
        <LinkedSections
          type="todos"
          rows={rows}
          kinds={KINDS}
          tab={tab}
          onTab={(t) => {
            setTab(t);
          }}
          empty={
            <Empty icon={ListTodo} title="No to-dos yet">
              Add one above and connect it to the event, person, homework or exam it's for.
            </Empty>
          }
          render={(t) => <TodoCard t={t} onOpen={() => setOpenId(t.id)} />}
        />
        )}
      </Page>
      <TodoForm state={form} />
      {openTodo && <TodoPanel key={openTodo.id} todo={openTodo} allTags={tags.names} onClose={() => setOpenId(null)} />}
    </>
  );
}
