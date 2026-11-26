// Daily and weekly goals made of ticks. Each day or week starts with empty ticks.
import { useRef, useState } from "react";
import { Check, ChevronLeft, ChevronRight, Flame, Pencil, Plus, Target, X } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { addDays, fmtDateShort, parse, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { dueDate, periodOf, progress, streak, WEEKDAYS, WEEKDAYS_LONG } from "../../lib/goals";
import { Button, Card, Empty, IconButton, Input, Page, PageHeader } from "../../components/ui";
import { FormModal, useFormState, type FormState } from "../../components/form";
import { LinkChips } from "../../components/linked";

export function useTickGoals() {
  const goals = useRows("tick_goals", { archived: 0 }, "position, id").rows;
  const steps = useRows("tick_goal_steps", undefined, "position, id").rows;
  const ticks = useRows("tick_goal_ticks").rows;
  return { goals, steps, ticks };
}

export function useTick() {
  const mutate = useMutate();
  return (goal: Row, stepId: number, period: string, on: boolean) =>
    mutate(async () => {
      if (on) await db.insert("tick_goal_ticks", { goal_id: goal.id, step_id: stepId, period });
      else await db.removeWhere("tick_goal_ticks", { goal_id: goal.id, step_id: stepId, period });
    });
}

export function TickBox({ on, onClick, color, label, size = 26 }: { on: boolean; onClick: () => void; color?: string | null; label: string; size?: number }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      title={label}
      onClick={onClick}
      className={cx("flex shrink-0 items-center justify-center rounded-full border-2 transition-all duration-300", on ? "scale-100 border-transparent" : "border-line hover:border-accent")}
      style={{ width: size, height: size, ...(on ? { background: color ?? "var(--accent)", color: "#3a2330", boxShadow: `0 6px 14px -6px ${color ?? "var(--accent)"}` } : {}) }}
    >
      {on && <Check size={size * 0.55} strokeWidth={3} />}
    </button>
  );
}

function Ring({ value, max, color, size = 54 }: { value: number; max: number; color: string; size?: number }) {
  const r = size / 2 - 5;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} className="-rotate-90 shrink-0" aria-hidden>
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={6} />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={6}
        strokeLinecap="round"
        strokeDasharray={c}
        strokeDashoffset={c * (1 - (max ? value / max : 0))}
        className="transition-[stroke-dashoffset] duration-700"
      />
    </svg>
  );
}

function WeeklyCard({ goal, steps, ticks, monday, onEdit }: { goal: Row; steps: Row[]; ticks: Row[]; monday: string; onEdit: () => void }) {
  const mutate = useMutate();
  const tick = useTick();
  const [adding, setAdding] = useState("");
  const color = goal.color ?? "#f4a6c0";
  const mine = steps.filter((s) => s.goal_id === goal.id);
  const p = progress(goal, steps, ticks, monday);
  const due = dueDate(goal, monday);
  const late = !!due && due < today() && !p.complete;
  const isOn = (id: number) => ticks.some((t) => t.goal_id === goal.id && t.step_id === id && t.period === monday);
  const runs = streak(goal, steps, ticks, today());

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-4 p-5" style={{ background: `linear-gradient(120deg, color-mix(in srgb, ${color} 45%, transparent), transparent 85%)` }}>
        <div className="relative">
          <Ring value={p.done} max={p.total} color={color} />
          <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">
            {p.complete ? <Check size={18} strokeWidth={3} /> : `${p.done}/${p.total}`}
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <h3 className={cx("font-display truncate text-xl", p.complete && "opacity-60")}>{goal.title}</h3>
          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs">
            {due && (
              <span className={cx("rounded-full px-2.5 py-0.5", late ? "bg-danger/15 text-danger" : "bg-surface-solid/70")}>
                By {WEEKDAYS_LONG[goal.due_weekday]}, {fmtDateShort(due)}
              </span>
            )}
            {runs > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-surface-solid/70 px-2.5 py-0.5">
                <Flame size={11} /> {runs} week{runs > 1 ? "s" : ""} in a row
              </span>
            )}
          </div>
        </div>
        <IconButton icon={Pencil} label="Edit goal" onClick={onEdit} />
      </div>
      <div className="space-y-1 p-3">
        {!mine.length && (
          <label className="flex items-center gap-3 rounded-2xl px-2 py-2 text-sm hover:bg-surface-2">
            <TickBox on={isOn(0)} color={color} label={`Done: ${goal.title}`} onClick={() => tick(goal, 0, monday, !isOn(0))} />
            <span className={cx(isOn(0) && "text-muted line-through")}>Done this week</span>
          </label>
        )}
        {mine.map((s) => (
          <div key={s.id} className="group flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm hover:bg-surface-2">
            <TickBox on={isOn(s.id)} color={color} label={s.title} onClick={() => tick(goal, s.id, monday, !isOn(s.id))} />
            <span className={cx("flex-1", isOn(s.id) && "text-muted line-through")}>{s.title}</span>
            <IconButton icon={X} label="Remove step" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("tick_goal_steps", s.id))} />
          </div>
        ))}
        <form
          className="flex items-center gap-2 px-2 pt-1"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!adding.trim()) return;
            await mutate(db.insert("tick_goal_steps", { goal_id: goal.id, title: adding.trim(), position: mine.length }));
            setAdding("");
          }}
        >
          <Input value={adding} onChange={(e) => setAdding(e.target.value)} placeholder="Add a step, e.g. HBS week 6 content" className="h-8 flex-1 text-xs" />
          <IconButton type="submit" icon={Plus} label="Add step" disabled={!adding.trim()} />
        </form>
        <div className="px-2">
          <LinkChips type="tick_goals" id={goal.id} />
        </div>
      </div>
    </Card>
  );
}

export function GoalForm({ state }: { state: FormState }) {
  const mutate = useMutate();
  const pendingSteps = useRef<string[]>([]);
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit goal" : "New goal"}
      table="tick_goals"
      record={state.record}
      defaults={{ cadence: "weekly", due_weekday: 1, color: "#f4a6c0", archived: 0, ...state.defaults }}
      fields={[
        { key: "title", label: "Goal", type: "text", required: true, placeholder: "Revise this week's HBS & INP content" },
        {
          key: "cadence",
          label: "Repeats",
          type: "select",
          required: true,
          full: true,
          options: [
            { value: "weekly", label: "Every week" },
            { value: "daily", label: "Every day" },
          ],
        },
        { key: "due_weekday", label: "Done by", type: "select", numeric: true, full: true, options: WEEKDAYS.map((d, i) => ({ value: i, label: d })), showIf: (v) => v.cadence === "weekly" },
        { key: "steps_text", label: "Steps to tick", type: "textarea", full: true, placeholder: "One per line\nHBS\nINP", showIf: (v) => v.cadence === "weekly" && !state.record },
        { key: "color", label: "Colour", type: "color" },
        { key: "notes", label: "Notes", type: "textarea", more: true },
        { key: "archived", label: "Stop this goal", type: "checkbox", placeholder: "Hide it, keep its history", more: true },
      ]}
      transform={(v) => {
        const { steps_text, ...out } = v;
        pendingSteps.current = String(steps_text ?? "")
          .split("\n")
          .map((s) => s.trim())
          .filter(Boolean);
        if (out.cadence === "daily") out.due_weekday = null;
        return out;
      }}
      onSaved={(row) => {
        if (state.record || !pendingSteps.current.length) return;
        void mutate(db.insertMany("tick_goal_steps", pendingSteps.current.map((title, i) => ({ goal_id: row.id, title, position: i })))).catch(() => undefined);
      }}
    />
  );
}

export default function GoalsPage() {
  const { goals, steps, ticks } = useTickGoals();
  const tick = useTick();
  const form = useFormState();
  useDeepLinkForm("tick_goals", form);
  const [monday, setMonday] = useState(() => toDateStr(startOfWeek(new Date())));
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(parse(monday)!, i)));
  const t = today();
  const weekly = goals.filter((g) => g.cadence === "weekly");
  const daily = goals.filter((g) => g.cadence === "daily");
  const thisWeek = monday === toDateStr(startOfWeek(new Date()));

  return (
    <>
      <PageHeader
        title="Goals"
        icon={Target}
        subtitle="Ticks start fresh every day and every week"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
            New goal
          </Button>
        }
      />
      <Page className="space-y-6">
        <div className="flex items-center gap-2">
          <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setMonday(toDateStr(addDays(parse(monday)!, -7)))} />
          <button type="button" className="font-display text-xl hover:text-accent" onClick={() => setMonday(toDateStr(startOfWeek(new Date())))}>
            {thisWeek ? "This week" : `Week of ${fmtDateShort(monday)}`}
          </button>
          <IconButton icon={ChevronRight} label="Next week" onClick={() => setMonday(toDateStr(addDays(parse(monday)!, 7)))} />
        </div>

        {!goals.length && (
          <Empty icon={Target} title="No goals yet">
            Make one like “By Tuesday, revise this week's HBS and INP content”. Tick each part off, and next week starts fresh.
          </Empty>
        )}

        {weekly.length > 0 && (
          <section className="grid items-start gap-4 lg:grid-cols-2">
            {weekly.map((g) => (
              <WeeklyCard key={g.id} goal={g} steps={steps} ticks={ticks} monday={monday} onEdit={() => form.openEdit(g)} />
            ))}
          </section>
        )}

        {daily.length > 0 && (
          <Card className="p-5">
            <h2 className="font-display mb-3 text-xl">Every day</h2>
            <div className="grid grid-cols-[minmax(160px,1fr)_repeat(7,48px)_64px] items-center gap-y-2 text-sm">
              <span />
              {days.map((d, i) => (
                <span key={d} className={cx("text-center text-[11px]", d === t ? "font-semibold text-accent" : "text-muted")}>
                  {WEEKDAYS[i]}
                  <br />
                  {Number(d.slice(8))}
                </span>
              ))}
              <span />
              {daily.map((g) => (
                <div key={g.id} className="contents">
                  <button type="button" onClick={() => form.openEdit(g)} className="flex min-w-0 items-center gap-2 text-left hover:text-accent">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: g.color ?? "#f4a6c0" }} />
                    <span className="truncate">{g.title}</span>
                  </button>
                  {days.map((d) => {
                    const on = progress(g, steps, ticks, periodOf(g, d)).complete;
                    return (
                      <span key={d} className="flex justify-center">
                        <TickBox on={on} color={g.color} label={`${g.title}, ${fmtDateShort(d)}`} onClick={() => d <= t && tick(g, 0, d, !on)} />
                      </span>
                    );
                  })}
                  <span className="inline-flex items-center justify-end gap-1 text-xs text-muted">
                    <Flame size={12} />
                    {streak(g, steps, ticks, t)}d
                  </span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </Page>
      <GoalForm state={form} />
    </>
  );
}
