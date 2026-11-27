import { CalendarRange, ClipboardList, List, Plus } from "lucide-react";
import { db } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { fmtTime, parse, today } from "../../lib/dates";
import type { Row } from "../../lib/api";
import { cx } from "../../lib/format";
import { Badge, Button, Card, Checkbox, Empty, Page, PageHeader, Segmented } from "../../components/ui";
import { Countdown, WeekBoard } from "../../components/weekboard";
import { useSetting } from "../../stores/ui";
import { useFormState } from "../../components/form";
import { LinkChips, LinkedSections } from "../../components/linked";
import { STATUS_COLOR, useModules } from "./common";
import { HomeworkForm } from "./forms";

const KINDS = ["modules", "exams", "school_notes", "events", "people", "todos"];

/** The due date, big: it's the thing that matters. */
function DueBlock({ due, done }: { due?: string | null; done: boolean }) {
  const d = parse(due);
  if (!d) return <p className="mt-3 text-sm text-muted">No due date</p>;
  return (
    <div className="mt-3 flex items-end gap-3">
      <div className="min-w-0 flex-1">
        <div className="eyebrow !text-[9.5px]">Due</div>
        <div className={cx("font-display text-[22px] leading-tight", done && "text-muted line-through")}>
          {d.toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short" })}
        </div>
        {String(due).length > 10 && <div className="text-sm text-muted">{fmtTime(due)}</div>}
      </div>
      <Countdown date={due} done={done} big />
    </div>
  );
}

export default function HomeworkPage() {
  const mutate = useMutate();
  const { byId } = useModules();
  const form = useFormState();
  useDeepLinkForm("homework", form);
  const { rows } = useRows("homework", undefined, "due_at, id");
  // Always in date order: still to do from the closest (overdue first), then submitted from the most recent.
  const t = today();
  const isDone = (h: Row) => h.status === "Submitted";
  const sorted = [
    ...rows.filter((h) => !isDone(h)).sort((a, b) => (a.due_at ? String(a.due_at) : "9999").localeCompare(b.due_at ? String(b.due_at) : "9999")),
    ...rows.filter(isDone).sort((a, b) => String(b.due_at ?? "").localeCompare(String(a.due_at ?? ""))),
  ];
  const sectionOf = (h: Row) => (isDone(h) ? "Submitted" : h.due_at && String(h.due_at).slice(0, 10) < t ? "Overdue" : "To do");
  const [view, setView] = useSetting<"week" | "list">("view.homework", "week");
  const tick = (h: Row, c: boolean) => mutate(db.update("homework", h.id, { status: c ? "Submitted" : "Not Started" }));

  return (
    <>
      <PageHeader
        title="Homework"
        icon={ClipboardList}
        subtitle="Closest due first"
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
              New homework
            </Button>
          </>
        }
      />
      <Page>
        {view === "week" ? (
          <WeekBoard
            rows={rows}
            dateOf={(h) => h.due_at}
            isOpen={(h) => h.status !== "Submitted"}
            onAdd={(date) => form.openNew({ due_at: date + "T23:59" })}
            addLabel="Add homework due"
            render={(h) => {
              const done = h.status === "Submitted";
              const m = byId.get(h.module_id);
              return (
                <Card onClick={() => form.openEdit(h)} className="relative overflow-hidden p-2.5 pl-3.5">
                  <span className="absolute inset-y-0 left-0 w-1.5" style={{ background: m?.color }} />
                  <div className="flex items-start gap-2">
                    <span className="pt-0.5" onClick={(e) => e.stopPropagation()}>
                      <Checkbox checked={done} onChange={(c) => tick(h, c)} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1 text-[10px] font-semibold tracking-wide text-muted">
                        <span className="h-1.5 w-1.5 rounded-full" style={{ background: m?.color }} />
                        {m?.code}
                      </div>
                      <div className={cx("line-clamp-2 text-[13px] leading-snug font-medium", done && "text-muted line-through")}>{h.title}</div>
                      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                        <Countdown date={h.due_at} done={done} />
                        {String(h.due_at ?? "").length > 10 && <span>{fmtTime(h.due_at)}</span>}
                      </div>
                    </div>
                  </div>
                </Card>
              );
            }}
          />
        ) : (
        <LinkedSections
          type="homework"
          rows={sorted}
          kinds={KINDS}
          heading={sectionOf}
          grid="grid gap-3 md:grid-cols-2"
          empty={
            <Empty icon={ClipboardList} title="No homework yet">
              Add homework under a module and it shows up on that module's page too.
            </Empty>
          }
          render={(h) => {
            const done = h.status === "Submitted";
            return (
              <Card onClick={() => form.openEdit(h)} className="relative flex h-full min-h-44 flex-col overflow-hidden p-5 pl-7">
                <span className="absolute inset-y-0 left-0 w-2" style={{ background: byId.get(h.module_id)?.color }} />
                <div className="flex items-start gap-3">
                  <span className="pt-1" title="Submitted" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={done} onChange={(c) => tick(h, c)} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wide text-muted">
                      <span className="h-2 w-2 rounded-full" style={{ background: byId.get(h.module_id)?.color }} />
                      {byId.get(h.module_id)?.code} · {byId.get(h.module_id)?.name}
                    </div>
                    <div className={cx("text-[15px] leading-snug font-semibold", done && "text-muted line-through")}>{h.title}</div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge>{h.type}</Badge>
                      <Badge color={STATUS_COLOR[h.status]}>{h.status}</Badge>
                      {h.weight_pct != null && <Badge>{h.weight_pct}%</Badge>}
                    </div>
                  </div>
                </div>
                <div className="mt-auto">
                  <DueBlock due={h.due_at} done={done} />
                  <LinkChips type="homework" id={h.id} skip={["modules"]} />
                </div>
              </Card>
            );
          }}
        />
        )}
      </Page>
      <HomeworkForm state={form} />
    </>
  );
}
