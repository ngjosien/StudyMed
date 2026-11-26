import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ListTodo, Plus, X } from "lucide-react";
import { api, db, type Row } from "../../lib/api";
import { useMutate, useRows, useTagsBy } from "../../lib/hooks";
import { cx, fmtMinutes } from "../../lib/format";
import { fmtDateShort, fmtTime } from "../../lib/dates";
import { RECORDS } from "../../lib/records";
import { Button, Card, Checkbox, ConfirmDelete, Drawer, Empty, Field, IconButton, Input, Page, PageHeader } from "../../components/ui";
import { MarkdownEditor } from "../../components/markdown";
import { ReminderPicker, TagInput } from "../../components/shared";
import { ChoiceField, DateField, TimeField } from "../../components/pickers";
import { Connections, saveLinks, type Ref } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";

const KINDS = ["events", "people", "homework", "exams", "modules", "tick_goals", "portfolio_entries", "savings_goals"];
const PRIORITIES = ["Low", "Medium", "High"];
const DURATIONS = [5, 10, 15, 30, 45, 60, 90, 120, 180];

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
        <Field label="Takes about">
          <ChoiceField options={DURATIONS.map((m) => ({ value: m, label: fmtMinutes(m) }))} value={v.est_minutes} clearable onChange={(m) => save({ est_minutes: m })} />
        </Field>
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

/* --------------------------------------------------------------- Page */
export default function TodosPage() {
  const mutate = useMutate();
  const [params, setParams] = useSearchParams();
  const { rows } = useRows("todos", { parent_id: null }, "id");
  const tags = useTagsBy("todos", "todo_category");
  const [quick, setQuick] = useState("");
  const [pending, setPending] = useState<Ref[]>([]);
  const [tab, setTab] = useState("all");
  const [openId, setOpenId] = useState<number | null>(null);

  useEffect(() => {
    const id = params.get("id");
    const isNew = params.get("new");
    if (id) setOpenId(Number(id));
    if (id || isNew) {
      setParams({}, { replace: true });
      if (isNew) setTimeout(() => document.getElementById("todo-quick-add")?.focus(), 50);
    }
  }, [params, setParams]);

  const openTodo = rows.find((t) => t.id === openId) ?? null;
  // On a linked tab, a new to-do has to say which record it belongs to.
  const needsLink = tab !== "all" && !pending.some((p) => p.type === tab);

  const add = async () => {
    const title = quick.trim();
    if (!title || needsLink) return;
    await mutate(async () => {
      const t = await db.insert("todos", { title });
      await saveLinks("todos", t.id, pending);
    });
    setQuick("");
    if (tab === "all") setPending([]);
  };

  return (
    <>
      <PageHeader title="To-Dos" icon={ListTodo} subtitle="Sorted by what each one is for" />
      <Page className="space-y-5">
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
            <Button type="submit" variant="primary" icon={Plus} className="h-11 !rounded-full px-6" disabled={!quick.trim() || needsLink}>
              Add
            </Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 px-1">
            <Connections key={tab} type="todos" pending={pending} setPending={setPending} only={tab === "all" ? KINDS : [tab, ...KINDS.filter((k) => k !== tab)]} />
            {needsLink && <span className="text-xs text-muted">Pick which of your {RECORDS[tab].label.toLowerCase()} it's for.</span>}
          </div>
        </form>
        <LinkedSections
          type="todos"
          rows={rows}
          kinds={KINDS}
          tab={tab}
          onTab={(t) => {
            setTab(t);
            setPending([]);
          }}
          empty={
            <Empty icon={ListTodo} title="No to-dos yet">
              Add one above and connect it to the event, person, homework or exam it's for.
            </Empty>
          }
          render={(t) => (
            <Card onClick={() => setOpenId(t.id)} className="flex items-start gap-3 px-4 py-3">
              <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                <Checkbox checked={!!t.done} onChange={(c) => mutate(db.update("todos", t.id, doneChange(c)))} />
              </span>
              <div className="min-w-0 flex-1">
                <div className={cx("truncate font-medium", t.done && "text-muted line-through")}>{t.title}</div>
                <LinkChips type="todos" id={t.id} />
              </div>
              {t.date && (
                <span className="shrink-0 text-xs text-muted">
                  {fmtDateShort(t.date)}
                  {t.time && `, ${fmtTime(t.time)}`}
                </span>
              )}
            </Card>
          )}
        />
      </Page>
      {openTodo && <TodoPanel key={openTodo.id} todo={openTodo} allTags={tags.names} onClose={() => setOpenId(null)} />}
    </>
  );
}
