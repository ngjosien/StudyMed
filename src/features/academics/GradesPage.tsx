import { useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink, Percent, Plus, SlidersHorizontal, X } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { cx } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { DEFAULT_CUTOFFS, fmtPct, GRADES, GRADE_NAMES, gpa, gradeForMark, neededFor, parseScore, standing, TARGETS } from "../../lib/grades";
import { Button, Card, Empty, Field, IconButton, Input, Modal, Page, PageHeader, Progress, Segmented, Select } from "../../components/ui";
import { parse } from "../../lib/dates";
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

/** A score as written on the script: "20/30", "78%", "78" or a letter. Saves when you leave it. */
function ScoreCell({ comp, cut, onSave }: { comp: Row; cut: Record<string, number>; onSave: (patch: Row) => void }) {
  const shown = comp.score_text ?? (comp.score == null ? "" : String(+Number(comp.score).toFixed(1)));
  const [text, setText] = useState(shown);
  useEffect(() => setText(shown), [shown]);
  const commit = () => {
    if (text.trim() === shown) return;
    const { pct, error } = parseScore(text, cut);
    if (error) {
      toast.error(error);
      return setText(shown);
    }
    onSave({ score_text: text.trim() || null, score: pct });
  };
  return (
    <Input
      aria-label="Score"
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      placeholder="20/30, 78%, B+"
      className="h-8 w-full text-center"
    />
  );
}

function ModuleGrade({ module: m, cut, onEdit }: { module: Row; cut: Record<string, number>; onEdit: () => void }) {
  const mutate = useMutate();
  // Earliest assessment first; undated ones at the end in the order they were added.
  const comps = [...useRows("grading_components", { module_id: m.id }, "position, id").rows].sort((a, b) => (a.due_date ? String(a.due_date) : "9999").localeCompare(b.due_date ? String(b.due_date) : "9999"));
  const homework = useRows("homework", { module_id: m.id }).rows;
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [weight, setWeight] = useState("");

  // Exam results written as a letter ("B+") become a mark here; the database only reads numbers.
  useEffect(() => {
    for (const c of comps) {
      if (c.score != null || !c.score_text) continue;
      const { pct } = parseScore(String(c.score_text), cut);
      if (pct != null) void mutate(db.update("grading_components", c.id, { score: pct }));
    }
  }, [comps, cut, mutate]);

  const s = standing(comps);
  const estimate = s.average !== null ? gradeForMark(s.average, cut) : null;
  const need = m.target_grade ? neededFor(s, cut[m.target_grade]) : null;
  const addable = homework.map((h) => ({ name: h.title, w: h.weight_pct })).filter((x) => x.w > 0 && !comps.some((c) => c.name === x.name));

  let verdict = "Set an aim to see what you need.";
  if (m.final_grade) verdict = `Final grade: ${m.final_grade}.`;
  else if (!comps.length) verdict = "Add the module's assessments. Exams you add under Exams appear here by themselves.";
  else if (m.target_grade && need === null) verdict = s.secured >= cut[m.target_grade] ? `Everything is graded and you reached ${m.target_grade}.` : `Everything is graded, under the ${m.target_grade} cut-off.`;
  else if (m.target_grade && need! > 100) verdict = `${m.target_grade} looks out of reach by these cut-offs. The grades below are still possible.`;
  else if (m.target_grade && need! <= 0) verdict = `You've already banked enough for ${m.target_grade}.`;
  else if (m.target_grade) verdict = `Average about ${Math.ceil(need!)}% on the remaining ${+s.remaining.toFixed(1)}% for ${m.target_grade}.`;

  const shortDate = (d: string) => parse(d)?.toLocaleDateString(undefined, { day: "numeric", month: "short" }) ?? "";
  const COLS = "grid grid-cols-[minmax(0,1fr)_64px_108px_70px_28px] items-center gap-2";

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 px-5 pt-5 pb-4" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${m.color} 50%, transparent), color-mix(in srgb, ${m.color} 10%, transparent))` }}>
        <button type="button" onClick={onEdit} className="min-w-0 flex-1 text-left" title="Edit module">
          <div className="text-[11px] font-semibold opacity-80">
            {m.code} · {m.credits ? `${m.credits} credit units` : "no credit units yet"}
          </div>
          <div className="font-display truncate text-xl leading-tight">{m.name}</div>
        </button>
        <div className="flex shrink-0 divide-x divide-line overflow-hidden rounded-2xl bg-surface-solid/70 text-center">
          {[
            ["Now", estimate],
            ["Aim", m.target_grade],
            ["Final", m.final_grade],
          ].map(([label, value]) => (
            <div key={label} className="w-14 py-1.5">
              <div className="text-lg leading-tight font-semibold">{value ?? "–"}</div>
              <div className="text-[10px] text-muted">{label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="space-y-4 px-5 pt-4 pb-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <p className="min-w-0 flex-1 text-sm">{verdict}</p>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Aim
            <Select className="!h-8 !w-20" value={String(m.target_grade ?? "")} placeholder="–" options={TARGETS} onChange={(e) => mutate(db.update("modules", m.id, { target_grade: e.target.value || null }))} />
          </label>
          <label className="flex items-center gap-1.5 text-xs text-muted">
            Final
            <Select className="!h-8 !w-20" value={String(m.final_grade ?? "")} placeholder="–" options={GRADE_NAMES} onChange={(e) => mutate(db.update("modules", m.id, { final_grade: e.target.value || null }))} />
          </label>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-line">
          <div className="min-w-[420px]">
            <div className={cx(COLS, "border-b border-line px-3 py-2 text-[11px] text-muted")}>
              <span>Assessment</span>
              <span className="text-center">Worth %</span>
              <span className="text-center">Score</span>
              <span className="text-center">Counts</span>
              <span />
            </div>
            {comps.map((c) => {
              const has = c.score != null;
              const earned = has ? (Number(c.weight_pct) * Number(c.score)) / 100 : null;
              return (
                <div key={c.id} className={cx(COLS, "border-b border-line/60 px-3 py-1.5 text-sm last:border-b-0")}>
                  <span className="min-w-0">
                    <span className="block truncate">{c.name}</span>
                    <span className="flex flex-wrap items-center gap-1.5 text-[11px] text-muted">
                      {c.exam_id && <span className="rounded-full bg-accent-soft px-1.5 font-medium text-accent">Exam{c.due_date ? ` · ${shortDate(String(c.due_date))}` : ""}</span>}
                      {has && c.score_text && !/%$|^\d+(\.\d+)?$/.test(String(c.score_text)) && <span>= {fmtPct(Number(c.score))}</span>}
                      {c.exam_id && !Number(c.weight_pct) && <span className="text-danger">set its worth</span>}
                    </span>
                  </span>
                  <NumberCell label="Worth" value={c.weight_pct} onSave={(v) => mutate(db.update("grading_components", c.id, { weight_pct: v ?? 0 }))} />
                  <ScoreCell comp={c} cut={cut} onSave={(patch) => mutate(db.update("grading_components", c.id, patch))} />
                  <span className="tabular text-center text-xs">{earned == null ? <span className="text-muted">–</span> : <strong>{+earned.toFixed(1)}</strong>}</span>
                  <IconButton icon={X} label={c.exam_id ? "Remove from grades (the exam stays)" : "Remove assessment"} onClick={() => mutate(db.remove("grading_components", c.id))} />
                </div>
              );
            })}
            {adding ? (
              <form
                className="flex items-center gap-2 px-3 py-2"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const w = Number(weight);
                  if (!name.trim() || !(w > 0 && w <= 100)) return;
                  await mutate(db.insert("grading_components", { module_id: m.id, name: name.trim(), weight_pct: w, position: comps.length }));
                  setName("");
                  setWeight("");
                  setAdding(false);
                }}
              >
                <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Report, presentation…" className="h-8 flex-1" />
                <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} placeholder="%" className="h-8 w-20" />
                <Button size="sm" type="submit" disabled={!name.trim() || !weight}>
                  Add
                </Button>
                <IconButton icon={X} label="Cancel" onClick={() => setAdding(false)} />
              </form>
            ) : (
              <div className="flex flex-wrap items-center gap-1 px-2 py-1.5">
                <Button size="sm" variant="ghost" icon={Plus} onClick={() => setAdding(true)}>
                  Add assessment
                </Button>
                {addable.length > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Download}
                    onClick={() => mutate(db.insertMany("grading_components", addable.map((x, i) => ({ module_id: m.id, name: x.name, weight_pct: x.w, position: comps.length + i }))))}
                  >
                    Add {addable.length} from homework
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 text-xs text-muted">
          <Progress value={s.doneWeight} max={100} color={m.color} />
          <span className="shrink-0">
            {+s.doneWeight.toFixed(1)}% graded
            {s.average !== null && ` · average ${fmtPct(s.average)} (${estimate})`}
            {s.doneWeight > 0 && ` · ${+s.secured.toFixed(1)} of 100 banked`}
          </span>
        </div>
        {s.totalWeight > 0 && Math.abs(s.totalWeight - 100) > 0.01 && <p className="-mt-2 text-xs text-danger">The worths add up to {+s.totalWeight.toFixed(1)}%; they should total 100%.</p>}

        {!m.final_grade && s.remaining > 0 && comps.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            <span className="mr-1 text-muted">Needed on the rest</span>
            {["A+", "A", "B+", "B", "C+"].map((g) => {
              const n = neededFor(s, cut[g])!;
              return (
                <span key={g} className={cx("rounded-full px-2.5 py-1", g === m.target_grade ? "bg-accent text-accent-fg" : "bg-surface-2", n > 100 && "opacity-40")}>
                  <b>{g}</b> {n > 100 ? "no" : `${Math.max(0, Math.ceil(n))}%`}
                </span>
              );
            })}
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
  // Shared with the Modules page: A to Z, or biggest credit units first.
  const [sort, setSort] = useSetting<"code" | "credits">("modules.sort", "code");
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
            <Segmented<"code" | "credits">
              value={sort}
              onChange={setSort}
              options={[
                { value: "code", label: "A to Z" },
                { value: "credits", label: "Credit units" },
              ]}
            />
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
          const inTerm = modules.filter((m) => ((m.term as string | null) ?? "") === term);
          const list = sort === "credits" ? [...inTerm].sort((a, b) => (Number(b.credits) || -1) - (Number(a.credits) || -1) || String(a.code).localeCompare(String(b.code))) : inTerm;
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
