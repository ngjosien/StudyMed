import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink, Percent, Plus, SlidersHorizontal, X } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { cx } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { DEFAULT_CUTOFFS, GRADES, GRADE_NAMES, gpa, gradeForMark, neededFor, standing, TARGETS } from "../../lib/grades";
import { Button, Card, Empty, Field, IconButton, Input, Modal, Page, PageHeader, Progress } from "../../components/ui";
import { ChoiceField } from "../../components/pickers";
import { useFormState } from "../../components/form";
import { toast } from "../../stores/toast";
import { ModuleForm } from "./forms";

const SOURCE = "https://www.np.edu.sg/admissions-enrolment/academic-matters";

/** A number box that saves when you leave it. */
function NumberCell({ value, label, max = 100, onSave }: { value: number | null | undefined; label: string; max?: number; onSave: (v: number | null) => void }) {
  const [text, setText] = useState(value == null ? "" : String(value));
  useEffect(() => setText(value == null ? "" : String(value)), [value]);
  const commit = () => {
    const n = text === "" ? null : Number(text);
    if (n !== null && (!Number.isFinite(n) || n < 0 || n > max)) {
      toast.error(`${label} must be between 0 and ${max}`);
      return setText(value == null ? "" : String(value));
    }
    if (n !== (value ?? null)) onSave(n);
  };
  return (
    <Input
      type="number"
      aria-label={label}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="–"
      className="h-8 w-20 text-center"
    />
  );
}

function ModuleGrade({ module: m, cut, onEdit }: { module: Row; cut: Record<string, number>; onEdit: () => void }) {
  const mutate = useMutate();
  const comps = useRows("grading_components", { module_id: m.id }, "position, id").rows;
  const exams = useRows("exams", { module_id: m.id }).rows;
  const homework = useRows("homework", { module_id: m.id }).rows;
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");
  const [editing, setEditing] = useState(false);

  const s = standing(comps);
  const estimate = s.average !== null ? gradeForMark(s.average, cut) : null;
  const need = m.target_grade ? neededFor(s, cut[m.target_grade]) : null;
  const addable = [...exams.map((e) => ({ name: e.name, w: e.weight_pct })), ...homework.map((h) => ({ name: h.title, w: h.weight_pct }))].filter(
    (x) => x.w > 0 && !comps.some((c) => c.name === x.name),
  );

  let verdict = "Choose a target grade to see what you need.";
  if (m.final_grade) verdict = `Final grade recorded: ${m.final_grade}.`;
  else if (m.target_grade && need === null) verdict = s.secured >= cut[m.target_grade] ? "Everything is graded and you reached your estimated cut-off." : "Everything is graded and you're under the estimated cut-off.";
  else if (m.target_grade && need! > 100) verdict = `An ${m.target_grade} looks out of reach by these estimated cut-offs. The table below shows what still is.`;
  else if (m.target_grade && need! <= 0) verdict = `You've already earned enough marks for ${m.target_grade}, by the estimated cut-off.`;
  else if (m.target_grade) verdict = `Average about ${Math.ceil(need!)}% on the remaining ${+s.remaining.toFixed(1)}% to reach ${m.target_grade}.`;

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 p-5" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${m.color} 55%, transparent), color-mix(in srgb, ${m.color} 12%, transparent))` }}>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left">
          <div className="text-xs font-semibold">{m.code}</div>
          <div className="font-display truncate text-xl">{m.name}</div>
          <div className="text-xs opacity-75">{m.credits ? `${m.credits} credit units` : "Add credit units to count it in your GPA"}</div>
        </button>
        {[
          ["Now (est.)", estimate],
          ["Target", m.target_grade],
          ["Final", m.final_grade],
        ].map(([label, value]) => (
          <div key={label} className="w-16 shrink-0 rounded-2xl bg-surface-solid/65 py-2 text-center">
            <div className="text-xl font-semibold">{value ?? "–"}</div>
            <div className="text-[10px] text-muted">{label}</div>
          </div>
        ))}
      </div>

      <div className="space-y-4 p-5">
        <p className="rounded-2xl bg-accent-soft px-4 py-3 text-sm">{verdict}</p>
        <button type="button" className="text-xs text-accent hover:underline" onClick={() => setEditing(!editing)}>
          {editing ? "Done choosing" : "Set target or final grade"}
        </button>
        {editing && (
          <div className="anim-item space-y-3">
            <Field label="Target">
              <ChoiceField options={TARGETS.map((g) => ({ value: g, label: g }))} value={m.target_grade} clearable onChange={(g) => mutate(db.update("modules", m.id, { target_grade: g }))} />
            </Field>
            <Field label="Final grade, once NP releases it">
              <ChoiceField options={GRADE_NAMES.map((g) => ({ value: g, label: g }))} value={m.final_grade} clearable onChange={(g) => mutate(db.update("modules", m.id, { final_grade: g }))} />
            </Field>
          </div>
        )}

        <div>
          <div className="grid grid-cols-[1fr_80px_80px_32px] gap-2 px-1 pb-1 text-[11px] text-muted">
            <span>Assessment</span>
            <span className="text-center">Worth %</span>
            <span className="text-center">My score %</span>
          </div>
          {comps.map((c) => (
            <div key={c.id} className="grid grid-cols-[1fr_80px_80px_32px] items-center gap-2 py-1 text-sm">
              <span className="truncate pl-1">{c.name}</span>
              <NumberCell label="Worth" value={c.weight_pct} onSave={(v) => mutate(db.update("grading_components", c.id, { weight_pct: v ?? 0 }))} />
              <NumberCell label="Score" value={c.score} onSave={(v) => mutate(db.update("grading_components", c.id, { score: v }))} />
              <IconButton icon={X} label="Remove assessment" onClick={() => mutate(db.remove("grading_components", c.id))} />
            </div>
          ))}
          <form
            className="mt-1 flex items-center gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              const w = Number(weight);
              if (!name.trim() || !(w > 0 && w <= 100)) return;
              await mutate(db.insert("grading_components", { module_id: m.id, name: name.trim(), weight_pct: w, position: comps.length }));
              setName("");
              setWeight("");
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Class test, report…" className="h-8 flex-1" />
            <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="%" className="h-8 w-20" />
            <Button size="sm" type="submit" icon={Plus} disabled={!name.trim() || !weight}>
              Add
            </Button>
          </form>
          {addable.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              icon={Download}
              className="mt-2"
              onClick={() => mutate(db.insertMany("grading_components", addable.map((x, i) => ({ module_id: m.id, name: x.name, weight_pct: x.w, position: comps.length + i }))))}
            >
              Add {addable.length} from this module's homework & exams
            </Button>
          )}
          <div className="mt-3 flex items-center gap-2 text-xs text-muted">
            <Progress value={s.doneWeight} max={100} color={m.color} />
            <span className="shrink-0">{s.doneWeight}% graded</span>
          </div>
          {s.totalWeight > 0 && Math.abs(s.totalWeight - 100) > 0.01 && (
            <p className="mt-1 text-xs text-danger">The weights add up to {s.totalWeight}%. They need to total 100% for this to be right.</p>
          )}
        </div>

        {!m.final_grade && s.remaining > 0 && (
          <div>
            <p className="mb-1.5 text-xs text-muted">Average needed on what's left (estimate)</p>
            <div className="grid grid-cols-5 gap-1 text-center text-xs">
              {["A+", "A", "B+", "B", "C+"].map((g) => {
                const n = neededFor(s, cut[g])!;
                return (
                  <div key={g} className={cx("rounded-2xl py-1.5", g === m.target_grade ? "bg-accent text-accent-fg" : "bg-surface-2", n > 100 && "opacity-40")}>
                    <div className="font-semibold">{g}</div>
                    {n > 100 ? "No" : `${Math.max(0, Math.ceil(n))}%`}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}

function Cutoffs({ value, onSave, onClose }: { value: Record<string, number>; onSave: (v: Record<string, number>) => void; onClose: () => void }) {
  const [v, setV] = useState(value);
  const save = () => {
    for (let i = 1; i < TARGETS.length; i++) {
      if (!(v[TARGETS[i]] < v[TARGETS[i - 1]])) return toast.error(`${TARGETS[i]} has to be lower than ${TARGETS[i - 1]}`);
    }
    onSave(v);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Estimated cut-offs"
      footer={
        <>
          <Button variant="ghost" className="mr-auto" onClick={() => setV(DEFAULT_CUTOFFS)}>
            Reset
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">
        NP publishes grade points but not mark ranges. These are guesses, so change any your lecturer tells you. AD goes to about the top 5%, so its number is only a study target.
      </p>
      <div className="grid grid-cols-3 gap-3">
        {TARGETS.map((g) => (
          <Field key={g} label={`${g} from`}>
            <Input type="number" value={v[g]} onChange={(e) => setV({ ...v, [g]: Number(e.target.value) })} />
          </Field>
        ))}
      </div>
    </Modal>
  );
}

export default function GradesPage() {
  const modules = useRows("modules", undefined, "term desc, code").rows;
  const comps = useRows("grading_components").rows;
  const [cut, setCut] = useSetting<Record<string, number>>("grades.cutoffs", DEFAULT_CUTOFFS);
  const [cutOpen, setCutOpen] = useState(false);
  const form = useFormState();

  const estimateFor = (m: Row): string | null => {
    if (m.final_grade) return m.final_grade;
    const s = standing(comps.filter((c) => c.module_id === m.id));
    return s.average === null ? null : gradeForMark(s.average, cut);
  };
  const terms = [...new Set(modules.map((m) => (m.term as string | null) ?? ""))];
  const fmt = (v: number | null) => (v === null ? "–" : v.toFixed(2));
  const overall = gpa(modules.map((m) => ({ credits: m.credits, grade: m.final_grade })));

  return (
    <>
      <PageHeader
        title="Grades"
        icon={Percent}
        subtitle="Ngee Ann Polytechnic grade points"
        actions={
          <>
            <Button icon={SlidersHorizontal} onClick={() => setCutOpen(true)}>
              Cut-offs
            </Button>
            <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
              Module
            </Button>
          </>
        }
      />
      <Page className="space-y-6">
        {!modules.length && (
          <Empty icon={Percent} title="Add your modules first">
            Give each one its credit units and the grade you're aiming for.
          </Empty>
        )}
        {terms.map((term) => {
          const list = modules.filter((m) => ((m.term as string | null) ?? "") === term);
          const stats = [
            ["Semester GPA", gpa(list.map((m) => ({ credits: m.credits, grade: m.final_grade }))).value],
            ["Heading for (est.)", gpa(list.map((m) => ({ credits: m.credits, grade: estimateFor(m) }))).value],
            ["If I hit my targets", gpa(list.map((m) => ({ credits: m.credits, grade: m.final_grade ?? m.target_grade }))).value],
          ] as const;
          return (
            <section key={term} className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="font-display mr-auto text-xl">{term || "No semester set"}</h2>
                {stats.map(([label, v]) => (
                  <div key={label} className="glass rounded-[16px] px-4 py-2 text-center">
                    <div className="text-xl font-semibold tabular-nums">{fmt(v)}</div>
                    <div className="text-[11px] text-muted">{label}</div>
                  </div>
                ))}
              </div>
              <div className="grid items-start gap-3 xl:grid-cols-2">
                {list.map((m) => (
                  <ModuleGrade key={m.id} module={m} cut={cut} onEdit={() => form.openEdit(m)} />
                ))}
              </div>
            </section>
          );
        })}

        <Card className="p-5">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="mr-auto font-semibold">How NP grades work</h2>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-accent hover:underline" onClick={() => openUrl(SOURCE).catch((e) => toast.error(String(e)))}>
              <ExternalLink size={12} /> NP academic matters
            </button>
          </div>
          <div className="mt-3 grid grid-cols-6 gap-1.5 text-center text-xs xl:grid-cols-12">
            {GRADES.map((g) => (
              <div key={g.grade} title={g.note} className="rounded-2xl bg-surface-2 py-2">
                <div className="font-semibold">{g.grade}</div>
                {g.point === null ? "no point" : g.point.toFixed(1)}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Semester GPA is the sum of credit units × grade points, divided by graded credit units. PX is left out, and so is PM because it has no grade point. Mark cut-offs and anything marked “est.” are StudyMed's estimates.
            {overall.value !== null && ` Across all recorded semesters the same sum gives ${fmt(overall.value)}. NP doesn't publish its cumulative formula on that page, so treat that as an estimate.`}
          </p>
        </Card>
      </Page>
      <ModuleForm state={form} />
      {cutOpen && <Cutoffs value={cut} onSave={setCut} onClose={() => setCutOpen(false)} />}
    </>
  );
}
