import { ClipboardList, Plus } from "lucide-react";
import { db } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { fmtDateTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Badge, Button, Card, Checkbox, Empty, Page, PageHeader } from "../../components/ui";
import { useFormState } from "../../components/form";
import { LinkChips, LinkedSections } from "../../components/linked";
import { STATUS_COLOR, useModules } from "./common";
import { HomeworkForm } from "./forms";

const KINDS = ["modules", "exams", "school_notes", "events", "people", "todos"];

export default function HomeworkPage() {
  const mutate = useMutate();
  const { byId } = useModules();
  const form = useFormState();
  useDeepLinkForm("homework", form);
  const { rows } = useRows("homework", undefined, "module_id, due_at, id");

  return (
    <>
      <PageHeader
        title="Homework"
        icon={ClipboardList}
        subtitle="Filed under the module it belongs to"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
            New homework
          </Button>
        }
      />
      <Page>
        <LinkedSections
          type="homework"
          rows={rows}
          kinds={KINDS}
          heading={(h) => byId.get(h.module_id)?.name ?? ""}
          grid="grid gap-3 md:grid-cols-2"
          empty={
            <Empty icon={ClipboardList} title="No homework yet">
              Add homework under a module and it shows up on that module's page too.
            </Empty>
          }
          render={(h) => {
            const done = h.status === "Submitted";
            return (
              <Card onClick={() => form.openEdit(h)} className="relative h-full overflow-hidden p-4 pl-6">
                <span className="absolute inset-y-0 left-0 w-2" style={{ background: byId.get(h.module_id)?.color }} />
                <div className="flex items-start gap-3">
                  <span className="pt-0.5" title="Submitted" onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={done} onChange={(c) => mutate(db.update("homework", h.id, { status: c ? "Submitted" : "Not Started" }))} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={cx("font-semibold", done && "text-muted line-through")}>{h.title}</div>
                    {h.due_at && <div className="mt-0.5 text-xs text-muted">Due {fmtDateTime(h.due_at)}</div>}
                    <div className="mt-2 flex flex-wrap gap-1">
                      <Badge>{h.type}</Badge>
                      <Badge color={STATUS_COLOR[h.status]}>{h.status}</Badge>
                      {h.weight_pct != null && <Badge>{h.weight_pct}%</Badge>}
                    </div>
                    <LinkChips type="homework" id={h.id} />
                  </div>
                </div>
              </Card>
            );
          }}
        />
      </Page>
      <HomeworkForm state={form} />
    </>
  );
}
