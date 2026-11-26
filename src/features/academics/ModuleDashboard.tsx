import { useEffect, type ReactNode } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, Briefcase, CalendarDays, ClipboardList, Clock, FileText, GraduationCap, Link2, ListTodo, Pencil, Percent, Plus, Repeat2 } from "lucide-react";
import { db } from "../../lib/api";
import { useMutate, useRow, useRows } from "../../lib/hooks";
import { fmtDate, fmtDateTime, startOfWeek, toDateStr } from "../../lib/dates";
import { cx, fmtMinutes } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { DEFAULT_CUTOFFS, gradeForMark, neededFor, standing } from "../../lib/grades";
import { Badge, Button, Card, Checkbox, Page, Progress } from "../../components/ui";
import { useFormState } from "../../components/form";
import { MarkdownView } from "../../components/markdown";
import { Connections } from "../../components/connections";
import { LinkChips } from "../../components/linked";
import { STATUS_COLOR } from "./common";
import { ExamForm, HomeworkForm, ModuleForm, PortfolioForm, TopicForm } from "./forms";

function Panel({ title, icon: Icon, action, children }: { title: string; icon: LucideIcon; action?: ReactNode; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center gap-2 px-4 pt-4 pb-1">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={14} />
        </span>
        <h3 className="flex-1 font-semibold">{title}</h3>
        {action}
      </div>
      <div className="p-2">{children}</div>
    </Card>
  );
}
const None = ({ children }: { children: ReactNode }) => <p className="px-2 py-2 text-sm text-muted">{children}</p>;

export default function ModuleDashboard() {
  const id = Number(useParams().id);
  const nav = useNavigate();
  const mq = useRow("modules", id);
  const m = mq.data;
  useEffect(() => {
    if (mq.isError) nav("/academics/modules", { replace: true }); // deleted
  }, [mq.isError, nav]);

  const links = useRows("connections", { from_type: "modules", from_id: id }).rows;
  /** Filed under this module, or linked to it from anywhere. */
  const ids = (type: string) => new Set(links.filter((l) => l.to_type === type).map((l) => l.to_id));
  const pick = (type: string, rows: Record<string, any>[]) => {
    const s = ids(type);
    return rows.filter((r) => s.has(r.id));
  };
  const homework = pick("homework", useRows("homework", undefined, "due_at, id").rows);
  const exams = pick("exams", useRows("exams", undefined, "start_at, id").rows);
  const notes = pick("school_notes", useRows("school_notes", undefined, "week, id").rows);
  const topics = pick("review_topics", useRows("review_topics", undefined, "id").rows);
  const portfolio = pick("portfolio_entries", useRows("portfolio_entries", undefined, "id").rows);
  const checks = useRows("review_checks").rows;
  const comps = useRows("grading_components", { module_id: id }).rows;
  const todos = pick("todos", useRows("todos", { parent_id: null }, "done, date, id").rows);
  const events = pick("events", useRows("events", undefined, "start_at").rows);
  const target = useRows("study_targets", { module_id: id }).rows[0];
  const weekStart = toDateStr(startOfWeek(new Date()));
  const studied = useRows("study_logs", { module_id: id, date: { gte: weekStart } }).rows.reduce((n, l) => n + l.minutes, 0);
  const mutate = useMutate();
  const [cut] = useSetting<Record<string, number>>("grades.cutoffs", DEFAULT_CUTOFFS);

  const moduleForm = useFormState();
  const hwForm = useFormState();
  const examForm = useFormState();
  const topicForm = useFormState();
  const pfForm = useFormState();

  if (!m) return null;
  const s = standing(comps);
  const needed = m.target_grade ? neededFor(s, cut[m.target_grade]) : null;
  const row = "flex items-center gap-2.5 rounded-2xl px-2.5 py-2 text-sm hover:bg-surface-2";

  return (
    <Page className="space-y-4 pt-6">
      <div
        className="anim-item rounded-[22px] p-7"
        style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${m.color} 65%, transparent), color-mix(in srgb, ${m.color} 15%, transparent))` }}
      >
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" icon={ArrowLeft} onClick={() => nav("/academics/modules")}>
            Modules
          </Button>
          <Button size="sm" className="ml-auto" icon={Pencil} onClick={() => moduleForm.openEdit(m)}>
            Edit
          </Button>
        </div>
        <p className="mt-5 text-sm font-semibold">{m.code}</p>
        <h1 className="font-display text-3xl leading-tight font-semibold">{m.name}</h1>
        <p className="mt-2 text-sm opacity-75">{[m.term, m.credits && `${m.credits} credits`, m.lecturer, m.lecturer_contact].filter(Boolean).join(" · ")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <div className="space-y-4 xl:col-span-2">
          <Panel title="Homework" icon={ClipboardList} action={<Button size="sm" icon={Plus} onClick={() => hwForm.openNew({ module_id: id })}>Add</Button>}>
            {!homework.length && <None>No homework under this module yet.</None>}
            {homework.map((h) => (
              <div key={h.id} className="rounded-2xl px-2.5 py-2 text-sm hover:bg-surface-2">
                <Link to={`/academics/homework?id=${h.id}`} className="flex items-center gap-2.5">
                  <span className={cx("flex-1 font-medium", h.status === "Submitted" && "text-muted line-through")}>{h.title}</span>
                  <Badge color={STATUS_COLOR[h.status]}>{h.status}</Badge>
                  <span className="text-xs text-muted">{fmtDateTime(h.due_at)}</span>
                </Link>
                <LinkChips type="homework" id={h.id} skip={["modules"]} />
              </div>
            ))}
          </Panel>
          <Panel title="Exams" icon={GraduationCap} action={<Button size="sm" icon={Plus} onClick={() => examForm.openNew({ module_id: id })}>Add</Button>}>
            {!exams.length && <None>No exams yet.</None>}
            {exams.map((e) => (
              <Link key={e.id} to={`/academics/exams?id=${e.id}`} className={row}>
                <span className="flex-1 font-medium">{e.name}</span>
                <span className="text-xs text-muted">{fmtDateTime(e.start_at)}</span>
                {e.grade && <Badge color="#a6e3d0">{e.grade}</Badge>}
              </Link>
            ))}
          </Panel>
          <Panel title="School notes" icon={FileText} action={<Button size="sm" icon={Plus} onClick={() => nav(`/academics/notes?new=1&module=${id}`)}>Add</Button>}>
            {!notes.length && <None>No notes yet.</None>}
            {notes.map((n) => (
              <Link key={n.id} to={`/academics/notes?id=${n.id}`} className={row}>
                {n.week != null && <span className="text-[11px] text-muted">W{n.week}</span>}
                <span className="flex-1">{n.title}</span>
                <span className="text-xs text-muted">{n.topic}</span>
              </Link>
            ))}
          </Panel>
          <Panel title="Spaced repetition" icon={Repeat2} action={<Button size="sm" icon={Plus} onClick={() => topicForm.openNew({ module_id: id })}>Log topic</Button>}>
            {!topics.length && <None>Nothing logged yet.</None>}
            {topics.map((t) => {
              const done = checks.filter((c) => c.topic_id === t.id).length;
              return (
                <Link key={t.id} to={`/academics/flashcards?topic=${t.id}`} className={row}>
                  <span className="flex-1">{t.title}</span>
                  <span className="w-28">
                    <Progress value={done} max={7} color={m.color} />
                  </span>
                  <span className="text-xs text-muted">{done}/7</span>
                </Link>
              );
            })}
          </Panel>
        </div>

        <div className="space-y-4">
          <Panel title="Grade" icon={Percent} action={<Link to="/academics/grades" className="text-xs text-accent hover:underline">Open tracker</Link>}>
            <div className="grid grid-cols-3 gap-2 p-2 text-center text-xs text-muted">
              <div>
                <div className="text-xl font-semibold text-fg">{m.final_grade ?? (s.average !== null ? gradeForMark(s.average, cut) : "–")}</div>
                {m.final_grade ? "Final" : "So far (est.)"}
              </div>
              <div>
                <div className="text-xl font-semibold text-fg">{m.target_grade ?? "–"}</div>
                Target
              </div>
              <div>
                <div className="text-xl font-semibold text-fg">{needed === null ? "–" : `${Math.max(0, Math.ceil(needed))}%`}</div>
                Needed (est.)
              </div>
            </div>
            {m.syllabus_md && <MarkdownView source={m.syllabus_md} className="p-2 text-sm" />}
          </Panel>
          <Panel title="Study this week" icon={Clock} action={<Link to="/routine?tab=study" className="text-xs text-accent hover:underline">Targets</Link>}>
            {!target?.minutes_per_week ? (
              <None>No weekly target yet.</None>
            ) : (
              <div className="space-y-1.5 p-2">
                <Progress value={studied} max={target.minutes_per_week} color={m.color} />
                <p className="text-xs text-muted">
                  {fmtMinutes(studied) || "0m"} of {fmtMinutes(target.minutes_per_week)} this week
                </p>
              </div>
            )}
          </Panel>
          <Panel title="To-dos" icon={ListTodo} action={<Link to="/todos?new=1" className="text-xs text-accent hover:underline">Add</Link>}>
            {!todos.length && <None>To-dos for this module's homework or exams show here.</None>}
            {todos.map((t) => (
              <div key={t.id} className={cx(row, "items-start")}>
                <Checkbox
                  checked={!!t.done}
                  onChange={(c) => mutate(db.update("todos", t.id, c ? { done: 1, status: "Done", completed_at: new Date().toISOString().slice(0, 19).replace("T", " ") } : { done: 0, status: "Not Started", completed_at: null }))}
                />
                <Link to={`/todos?id=${t.id}`} className="min-w-0 flex-1">
                  <span className={cx("block truncate", t.done && "text-muted line-through")}>{t.title}</span>
                  <LinkChips type="todos" id={t.id} skip={["modules"]} />
                </Link>
                {t.date && <span className="text-xs text-muted">{fmtDate(t.date)}</span>}
              </div>
            ))}
          </Panel>
          {events.length > 0 && (
            <Panel title="Events" icon={CalendarDays}>
              {events.map((e) => (
                <Link key={e.id} to={`/events?id=${e.id}`} className={row}>
                  <span className="flex-1 truncate">{e.name}</span>
                  <span className="text-xs text-muted">{fmtDateTime(e.start_at)}</span>
                </Link>
              ))}
            </Panel>
          )}
          <Panel title="Portfolio" icon={Briefcase} action={<Button size="sm" icon={Plus} onClick={() => pfForm.openNew({ module_id: id })}>Add</Button>}>
            {!portfolio.length && <None>Nothing linked yet.</None>}
            {portfolio.map((p) => (
              <Link key={p.id} to={`/academics/portfolio?id=${p.id}`} className={row}>
                <span className="flex-1">{p.title}</span>
                <span className="text-xs text-muted">{fmtDate(p.start_date)}</span>
              </Link>
            ))}
          </Panel>
          <Panel title="Connected pages" icon={Link2}>
            <div className="p-2">
              <Connections type="modules" id={id} />
            </div>
          </Panel>
        </div>
      </div>
      <ModuleForm state={moduleForm} />
      <HomeworkForm state={hwForm} />
      <ExamForm state={examForm} />
      <TopicForm state={topicForm} />
      <PortfolioForm state={pfForm} />
    </Page>
  );
}
