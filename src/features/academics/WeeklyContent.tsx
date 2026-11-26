// Weekly content: the topics a module covers in each week of the semester. Tick a
// topic once it's covered; send it to spaced repetition with one click. Week numbers
// come from the semester's first Monday, set once and shared by every module.
import { useState } from "react";
import { CalendarRange, Plus, Repeat2, Trash2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addDays, parse, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { Button, Card, Checkbox, IconButton, Input } from "../../components/ui";
import { DateField } from "../../components/pickers";
import { toast } from "../../stores/toast";

/** The semester's week number for a date (1-based), or null before the start / without one. */
export function useSemester() {
  const [start, setStart] = useSetting<string>("semester.start", "");
  const [weeks, setWeeks] = useSetting<number>("semester.weeks", 18);
  const weekOf = (date: string) => {
    if (!start) return null;
    const s = startOfWeek(parse(start)!);
    const d = parse(date)!;
    const n = Math.floor((d.getTime() - s.getTime()) / (7 * 86_400_000)) + 1;
    return n >= 1 && n <= weeks ? n : null;
  };
  const mondayOf = (week: number) => (start ? toDateStr(addDays(startOfWeek(parse(start)!), (week - 1) * 7)) : null);
  return { start, setStart, weeks, setWeeks, weekOf, mondayOf, current: weekOf(today()) };
}

function WeekCard({ moduleId, week, topics, current, monday }: { moduleId: number; week: number; topics: Row[]; current: boolean; monday: string | null }) {
  const mutate = useMutate();
  const [text, setText] = useState("");
  const add = async () => {
    const lines = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
    if (!lines.length) return;
    await mutate(db.insertMany("module_topics", lines.map((title, i) => ({ module_id: moduleId, week, title, position: topics.length + i }))));
    setText("");
  };
  const covered = topics.filter((t) => t.done).length;
  return (
    <div className={cx("rounded-2xl border p-3", current ? "border-accent/50 bg-accent-soft" : "border-line bg-surface-solid/30")}>
      <div className="mb-1.5 flex items-baseline gap-2">
        <span className="font-display text-base">Week {week}</span>
        {current && <span className="rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-fg">This week</span>}
        <span className="ml-auto text-[11px] text-muted">
          {monday ? parse(monday)!.toLocaleDateString(undefined, { day: "numeric", month: "short" }) : ""}
          {topics.length ? ` · ${covered}/${topics.length}` : ""}
        </span>
      </div>
      <ul className="space-y-0.5">
        {topics.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 text-sm hover:bg-surface-2">
            <Checkbox checked={!!t.done} onChange={(c) => mutate(db.update("module_topics", t.id, { done: c ? 1 : 0 }))} />
            <span className={cx("min-w-0 flex-1", t.done && "text-muted line-through")}>{t.title}</span>
            <IconButton
              icon={Repeat2}
              label="Add to spaced repetition (learned today)"
              className="opacity-0 group-hover:opacity-100"
              onClick={async () => {
                await mutate(db.insert("review_topics", { module_id: moduleId, title: t.title, learned_date: today() }));
                toast.success(`"${t.title}" added to spaced repetition`);
              }}
            />
            <IconButton icon={Trash2} label="Remove topic" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("module_topics", t.id))} />
          </li>
        ))}
      </ul>
      <form
        className="mt-1.5 flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void add();
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add topic (; for several)" className="h-8 min-w-0 flex-1 text-sm" />
        <IconButton icon={Plus} label="Add topic" onClick={() => void add()} />
      </form>
    </div>
  );
}

export function WeeklyContent({ moduleId }: { moduleId: number }) {
  const sem = useSemester();
  const topics = useRows("module_topics", { module_id: moduleId }, "week, position, id").rows;
  const [all, setAll] = useState(false);
  const withTopics = new Set(topics.map((t) => t.week as number));
  const weeks = Array.from({ length: sem.weeks }, (_, i) => i + 1);
  // By default: weeks that have topics, this week and next, and the first empty week to fill.
  const firstEmpty = weeks.find((w) => !withTopics.has(w));
  const shown = all ? weeks : weeks.filter((w) => withTopics.has(w) || w === sem.current || (sem.current && w === sem.current + 1) || w === firstEmpty);
  const covered = topics.filter((t) => t.done).length;

  return (
    <Card className="p-4">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
          <CalendarRange size={14} />
        </span>
        <h3 className="font-semibold">Weekly content</h3>
        {topics.length > 0 && (
          <span className="text-xs text-muted">
            {covered}/{topics.length} topics covered
          </span>
        )}
        <span className="ml-auto flex items-center gap-2 text-xs text-muted">
          Week 1 starts
          <span className="w-40">
            <DateField value={sem.start || null} placeholder="Pick a Monday" onChange={(d) => sem.setStart(d ?? "")} />
          </span>
          <Input
            type="number"
            min={1}
            max={40}
            value={sem.weeks}
            onChange={(e) => sem.setWeeks(Math.max(1, Math.min(40, Number(e.target.value) || 18)))}
            className="h-8 w-16 text-center"
            title="Weeks in the semester"
          />
          weeks
        </span>
      </div>
      <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((w) => (
          <WeekCard key={w} moduleId={moduleId} week={w} topics={topics.filter((t) => t.week === w)} current={w === sem.current} monday={sem.mondayOf(w)} />
        ))}
      </div>
      {!all && shown.length < weeks.length && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(true)}>
          Show all {sem.weeks} weeks
        </Button>
      )}
      {all && (
        <Button size="sm" variant="ghost" className="mt-2" onClick={() => setAll(false)}>
          Show fewer weeks
        </Button>
      )}
    </Card>
  );
}

/** This week's topics across every module (for Routine). */
export function useThisWeeksTopics() {
  const sem = useSemester();
  const rows = useRows("module_topics", sem.current ? { week: sem.current } : { week: -1 }, "module_id, position, id").rows;
  return { week: sem.current, rows };
}
