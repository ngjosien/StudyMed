import { useState } from "react";
import { CalendarRange, GraduationCap, List, Plus, Pencil, MapPin, Clock, Trash2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRow, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { fmtDateTime, fmtTime, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Badge, Button, Card, Checkbox, Drawer, Empty, IconButton, Input, Page, PageHeader, Progress, Segmented } from "../../components/ui";
import { WeeksStrip } from "../../components/weekboard";
import { useSemester } from "./WeeklyContent";
import { useSetting } from "../../stores/ui";
import { useFormState } from "../../components/form";
import { CountdownBadge } from "../../components/shared";
import { MarkdownView } from "../../components/markdown";
import { Connections } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";
import { CONFIDENCE, ModuleChip, useModules } from "./common";
import { ExamForm } from "./forms";
import { CountdownStrip, ExamPlan, PlanModal } from "./RevisionPlan";

const KINDS = ["modules", "school_notes", "homework", "events", "people", "todos", "review_topics"];

function TopicChecklist({ examId, moduleId }: { examId: number; moduleId: number }) {
  const mutate = useMutate();
  const { rows } = useRows("exam_topics", { exam_id: examId }, "position, id");
  const weekly = useRows("module_topics", { module_id: moduleId }, "week, position, id").rows;
  const fresh = weekly.filter((w) => !rows.some((r) => r.title.trim().toLowerCase() === String(w.title).trim().toLowerCase()));
  const [text, setText] = useState("");
  const green = rows.filter((t) => t.confidence === "green").length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <h3 className="text-sm font-semibold">Syllabus / topic checklist</h3>
        {rows.length > 0 && (
          <span className="text-xs text-muted">
            {green}/{rows.length} confident
          </span>
        )}
      </div>
      {rows.length > 0 && (
        <div className="mb-2 flex h-2 overflow-hidden rounded-full bg-surface-2">
          {CONFIDENCE.map((c) => (
            <div key={c.value} style={{ width: `${(rows.filter((t) => t.confidence === c.value).length / rows.length) * 100}%`, background: c.color }} />
          ))}
        </div>
      )}
      <ul className="space-y-1">
        {rows.map((t) => (
          <li key={t.id} className="group flex items-center gap-2 rounded-lg px-2 py-1 hover:bg-surface-2">
            <Checkbox checked={!!t.done} onChange={(c) => mutate(db.update("exam_topics", t.id, { done: c ? 1 : 0 }))} />
            <span className={cx("flex-1 text-sm", t.done && "text-muted line-through")}>{t.title}</span>
            <div className="flex gap-1">
              {CONFIDENCE.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  title={c.label}
                  aria-label={c.label}
                  onClick={() => mutate(db.update("exam_topics", t.id, { confidence: t.confidence === c.value ? null : c.value }))}
                  className={cx("h-4 w-4 rounded-full border-2 transition-opacity", t.confidence === c.value ? "opacity-100" : "opacity-25 hover:opacity-60")}
                  style={{ background: c.color, borderColor: c.color }}
                />
              ))}
            </div>
            <IconButton icon={Trash2} label="Remove topic" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("exam_topics", t.id))} />
          </li>
        ))}
      </ul>
      <form
        className="mt-2 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          const lines = text.split(/\n|;/).map((s) => s.trim()).filter(Boolean);
          if (!lines.length) return;
          await mutate(db.insertMany("exam_topics", lines.map((title, i) => ({ exam_id: examId, title, position: rows.length + i }))));
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add topic (use ; to add several)" />
        <Button type="submit" icon={Plus} disabled={!text.trim()}>
          Add
        </Button>
      </form>
      {fresh.length > 0 && (
        <button
          type="button"
          className="mt-2 text-xs text-accent hover:underline"
          onClick={() => mutate(db.insertMany("exam_topics", fresh.map((w, i) => ({ exam_id: examId, title: w.title, position: rows.length + i }))))}
        >
          Add {fresh.length} topic{fresh.length > 1 ? "s" : ""} from the module's weekly content
        </button>
      )}
    </div>
  );
}

function ExamDetail({ examId, onEdit, onPlan }: { examId: number; onEdit: (r: Row) => void; onPlan: (r: Row) => void }) {
  const { byId } = useModules();
  const e = useRow("exams", examId).data;
  if (!e) return null;
  const m = byId.get(e.module_id);
  return (
    <div className="space-y-6">
      <div>
        <div className="mb-2 flex items-center gap-2">
          <ModuleChip module={m} />
          {e.format && <Badge>{e.format}</Badge>}
          {e.weight_pct != null && <Badge>{e.weight_pct}%</Badge>}
          <CountdownBadge date={e.start_at} done={!!e.grade} />
        </div>
        <div className="space-y-1 text-sm">
          <div className="flex items-center gap-2">
            <Clock size={14} className="text-muted" />
            {fmtDateTime(e.start_at) || "No date yet"}
            {e.duration_min ? ` · ${e.duration_min} min` : ""}
          </div>
          {(e.venue || e.seat) && (
            <div className="flex items-center gap-2">
              <MapPin size={14} className="text-muted" />
              {[e.venue, e.seat && `Seat ${e.seat}`].filter(Boolean).join(" · ")}
            </div>
          )}
        </div>
      </div>

      <TopicChecklist examId={examId} moduleId={e.module_id} />

      <ExamPlan exam={e} onPlan={() => onPlan(e)} />

      <div>
        <h3 className="mb-2 text-sm font-semibold">Connected pages</h3>
        <Connections type="exams" id={examId} />
      </div>
      <div>
        <h3 className="mb-2 text-sm font-semibold">Post-exam</h3>
        {e.grade || e.reflection_md ? (
          <div className="space-y-2">
            {e.grade && <Badge color="#10b981">Grade: {e.grade}</Badge>}
            {e.reflection_md && <MarkdownView source={e.reflection_md} />}
          </div>
        ) : (
          <button type="button" className="text-sm text-accent hover:underline" onClick={() => onEdit(e)}>
            Add grade & reflection
          </button>
        )}
      </div>
    </div>
  );
}

export default function ExamsPage() {
  const { byId } = useModules();
  const [openId, setOpenId] = useState<number | null>(null);
  const form = useFormState();
  useDeepLinkForm("exams", form, undefined, (r) => setOpenId(r.id));
  const { rows } = useRows("exams", undefined, "start_at, id");
  const [view, setView] = useSetting<"week" | "list">("view.exams", "list");
  const sem = useSemester();
  const weekName = (monday: string) => {
    const n = sem.weekOf(monday);
    return n ? `Week ${n}` : null;
  };
  // Always in date order: upcoming from the closest, then past from the most recent.
  const t = today();
  const isPast = (e: Row) => !!e.start_at && String(e.start_at).slice(0, 10) < t;
  const sorted = [
    ...rows.filter((e) => !isPast(e)).sort((a, b) => (a.start_at ? String(a.start_at) : "9999").localeCompare(b.start_at ? String(b.start_at) : "9999")),
    ...rows.filter(isPast).sort((a, b) => String(b.start_at).localeCompare(String(a.start_at))),
  ];
  const topics = useRows("exam_topics").rows;
  const openExam = rows.find((e) => e.id === openId);
  const [planning, setPlanning] = useState<Row | null>(null);

  const renderExam = (e: Row) => {
    const ts = topics.filter((t) => t.exam_id === e.id);
    const green = ts.filter((t) => t.confidence === "green").length;
    const m = byId.get(e.module_id);
    return (
      <Card onClick={() => setOpenId(e.id)} className="h-full p-4">
        <div className="mb-2 flex items-center gap-2">
          <ModuleChip module={m} />
          {e.format && <Badge>{e.format}</Badge>}
          <span className="ml-auto">{e.grade ? <Badge color="#10b981">{e.grade}</Badge> : <CountdownBadge date={e.start_at} />}</span>
        </div>
        <div className="font-semibold">{e.name}</div>
        <div className="mt-0.5 text-sm text-muted">
          {fmtDateTime(e.start_at) || "Date TBC"}
          {e.venue ? ` · ${e.venue}` : ""}
        </div>
        {ts.length > 0 && (
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Progress value={green} max={ts.length} color="#10b981" />
            <span className="shrink-0">
              {green}/{ts.length}
            </span>
          </div>
        )}
        <LinkChips type="exams" id={e.id} />
      </Card>
    );
  };

  return (
    <>
      <PageHeader
        title="Exams"
        icon={GraduationCap}
        actions={
          <>
            <Segmented<"week" | "list">
              value={view}
              onChange={setView}
              options={[
                { value: "week", label: "Week", icon: CalendarRange },
                { value: "list", label: "List", icon: List },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
              New exam
            </Button>
          </>
        }
      />
      <Page className="space-y-6">
        <CountdownStrip exams={rows} byId={byId} onOpen={setOpenId} onPlan={setPlanning} />
        {view === "week" ? (
          <WeeksStrip
            rows={rows}
            dateOf={(e) => e.start_at}
            weekName={weekName}
            onAdd={(date) => form.openNew({ start_at: date + "T09:00" })}
            addLabel="Add exam on"
            noDateLabel="Date TBC"
            render={(e) => {
              const m = byId.get(e.module_id);
              return (
                <Card onClick={() => setOpenId(e.id)} className="relative overflow-hidden p-3 pl-4">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: m?.color }} />
                  <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted">
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: m?.color }} />
                    {m?.code}
                    {e.grade && <span className="ml-auto rounded-full bg-[#10b981]/15 px-1.5 text-[#0f9f6e]">{e.grade}</span>}
                  </div>
                  <div className="line-clamp-2 text-[15px] leading-snug font-medium">{e.name}</div>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                    {!e.grade && <CountdownBadge date={e.start_at} />}
                    {String(e.start_at ?? "").length > 10 ? fmtTime(e.start_at) : ""}
                    {e.venue ? ` · ${e.venue}` : ""}
                  </div>
                </Card>
              );
            }}
          />
        ) : (
          <LinkedSections
            type="exams"
            rows={sorted}
            kinds={KINDS}
            heading={(e) => (isPast(e) ? "Past exams" : "Upcoming exams")}
            grid="grid gap-3 md:grid-cols-2"
            render={renderExam}
            empty={
              <Empty icon={GraduationCap} title="No exams yet">
                Add exams to get countdowns, topic confidence tracking and reminders.
              </Empty>
            }
          />
        )}
      </Page>
      <Drawer
        open={!!openExam}
        onClose={() => setOpenId(null)}
        title={openExam?.name}
        actions={
          openExam && (
            <Button size="sm" icon={Pencil} onClick={() => form.openEdit(openExam)}>
              Edit
            </Button>
          )
        }
      >
        {openId && <ExamDetail examId={openId} onEdit={form.openEdit} onPlan={setPlanning} />}
      </Drawer>
      <ExamForm state={form} />
      {planning && <PlanModal exam={planning} code={byId.get(planning.module_id)?.code ?? ""} onClose={() => setPlanning(null)} />}
    </>
  );
}
