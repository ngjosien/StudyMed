import { useNavigate } from "react-router-dom";
import { Library, Plus } from "lucide-react";
import { useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { Button, Card, Empty, Page, PageHeader } from "../../components/ui";
import { useFormState } from "../../components/form";
import { LinkedSections } from "../../components/linked";
import { ModuleForm } from "./forms";

const KINDS = ["homework", "exams", "school_notes", "review_topics", "tick_goals", "events", "people", "portfolio_entries", "todos"];

export default function ModulesPage() {
  const nav = useNavigate();
  const { rows } = useRows("modules", undefined, "archived, term desc, code");
  const links = useRows("connections", { from_type: "modules" }).rows;
  const form = useFormState();
  useDeepLinkForm("modules", form);
  const count = (id: number, type: string) => new Set(links.filter((l) => l.from_id === id && l.to_type === type).map((l) => l.to_id)).size;

  return (
    <>
      <PageHeader
        title="Modules"
        icon={Library}
        subtitle="Everything filed under a module shows up inside it"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
            New module
          </Button>
        }
      />
      <Page>
        <LinkedSections
          type="modules"
          rows={rows}
          kinds={KINDS}
          heading={(m) => (m.archived ? "Finished" : m.term || "")}
          grid="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]"
          empty={
            <Empty icon={Library} title="No modules yet">
              Add your first module to start connecting homework, notes, exams and recall topics.
            </Empty>
          }
          render={(m) => (
            <Card onClick={() => nav(`/academics/modules/${m.id}`)} className="h-full overflow-hidden">
              <div className="flex h-32 flex-col justify-between p-4" style={{ background: `linear-gradient(135deg, color-mix(in srgb, ${m.color} 70%, transparent), color-mix(in srgb, ${m.color} 18%, transparent))` }}>
                <div className="flex justify-between gap-2 text-xs font-semibold">
                  <span className="truncate">{m.code}</span>
                  {(m.final_grade || m.target_grade) && (
                    <span className="shrink-0 rounded-full bg-surface-solid/75 px-2.5 py-0.5">{m.final_grade ?? `Aim ${m.target_grade}`}</span>
                  )}
                </div>
                <div className="font-display line-clamp-2 text-xl leading-tight font-semibold">{m.name}</div>
              </div>
              <div className="grid grid-cols-3 gap-1 p-3 text-center text-[11px] text-muted">
                {[
                  ["homework", "Homework"],
                  ["exams", "Exams"],
                  ["school_notes", "Notes"],
                ].map(([type, label]) => (
                  <div key={type}>
                    <div className="text-base font-semibold text-fg">{count(m.id, type)}</div>
                    {label}
                  </div>
                ))}
              </div>
            </Card>
          )}
        />
      </Page>
      <ModuleForm state={form} />
    </>
  );
}
