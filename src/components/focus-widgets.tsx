// Focus pieces that live outside the Focus page: the sidebar mini-timer and the
// "save this session?" dialog (shown wherever you are when you press Stop).
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Coffee, Play, Square, Timer } from "lucide-react";
import { db } from "../lib/api";
import { useMutate, useRows } from "../lib/hooks";
import { toDateTimeStr } from "../lib/dates";
import { cx } from "../lib/format";
import { toast } from "../stores/toast";
import { Button, Checkbox, Field, Input, Modal, Textarea } from "./ui";
import { Beats } from "./beats";
import {
  breakMs,
  clearFocus,
  clock,
  focusMs,
  hm,
  phase,
  resumeFocus,
  stopFocus,
  takeBreak,
  unstopFocus,
  useFocusRun,
  useFocusWatcher,
  useTick,
  type FocusRun,
} from "../lib/focus";

/** Small live timer in the sidebar while a session runs. */
export function FocusPill({ collapsed }: { collapsed: boolean }) {
  useFocusWatcher();
  const run = useFocusRun();
  const now = useTick(!!run && run.endedAt == null);
  const nav = useNavigate();
  const modules = useRows("modules").rows;
  if (!run || run.endedAt != null) return null;
  const m = modules.find((x) => x.id === run.moduleId);
  const p = phase(run);
  const f = focusMs(run, now);
  const plan = run.plannedMin * 60_000;
  const over = f >= plan;
  const big = p === "break" ? clock(breakMs(run, now)) : over ? `+${clock(f - plan)}` : clock(plan - f);
  const name = run.kind === "academic" ? (m?.code ?? "Study") : run.label || "Focus";
  const color = over ? "var(--gold)" : "var(--accent)";

  if (collapsed) {
    return (
      <button type="button" onClick={() => nav("/focus")} title={`${name}: ${big}`} className="flex w-full flex-col items-center rounded-xl bg-accent-soft py-1.5 text-[10px] font-semibold tabular">
        <Timer size={15} className={cx(p === "focus" && "animate-pulse")} style={{ color }} />
        {big.replace(/:\d\d$/, "")}
      </button>
    );
  }
  return (
    <div className="relative overflow-hidden rounded-2xl border border-line bg-surface-solid/60 px-3 py-2">
      <div className="absolute inset-x-0 bottom-0 h-0.5 bg-surface-2">
        <div className="h-full transition-[width] duration-1000 ease-linear" style={{ width: `${Math.min(100, (f / plan) * 100)}%`, background: color }} />
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => nav("/focus")} className="min-w-0 flex-1 text-left" title="Open Focus">
          <div className="flex items-center gap-1.5 text-[11px] text-muted">
            <span className={cx("h-1.5 w-1.5 rounded-full", p === "focus" && "animate-pulse")} style={{ background: p === "break" ? "var(--muted)" : "var(--beat)" }} />
            <span className="truncate">{p === "break" ? `Break · ${name}` : name}</span>
          </div>
          <div className="font-display tabular text-[19px] leading-tight" style={over && p !== "break" ? { color: "var(--gold)" } : undefined}>
            {big}
          </div>
        </button>
        {p === "break" ? (
          <MiniBtn label="Back to focus" onClick={resumeFocus}>
            <Play size={14} />
          </MiniBtn>
        ) : (
          <MiniBtn label="Break" onClick={takeBreak}>
            <Coffee size={14} />
          </MiniBtn>
        )}
        <MiniBtn label="Stop" onClick={stopFocus}>
          <Square size={13} />
        </MiniBtn>
      </div>
    </div>
  );
}

function MiniBtn({ children, label, onClick }: { children: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className="flex h-7 w-7 items-center justify-center rounded-lg text-muted hover:bg-surface-2 hover:text-fg">
      {children}
    </button>
  );
}

/** Shown once Stop is pressed: check the minutes, add a note, save (or discard). */
export function FocusFinish() {
  const run = useFocusRun();
  if (!run || run.endedAt == null) return null;
  return <Finish key={run.startedAt} run={run} />;
}

function Finish({ run }: { run: FocusRun }) {
  const mutate = useMutate();
  const modules = useRows("modules").rows;
  const m = modules.find((x) => x.id === run.moduleId);
  const counted = Math.floor(focusMs(run) / 60_000);
  const [mins, setMins] = useState(String(counted));
  const [note, setNote] = useState("");
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const todo = useRows("todos", { id: run.todoId ?? -1 }, undefined, !!run.todoId).rows[0];
  const [tickTodo, setTickTodo] = useState(true);
  const n = Math.max(0, Math.min(24 * 60, Math.round(Number(mins) || 0)));
  const extra = n - run.plannedMin;

  const save = async () => {
    setBusy(true);
    try {
      const academic = run.kind === "academic" && !!m;
      await mutate(
        db.insert("focus_sessions", {
          kind: academic ? "academic" : "other",
          module_id: academic ? m!.id : null,
          label: run.label || (run.kind === "academic" ? null : "Personal"),
          planned_minutes: run.plannedMin,
          started_at: run.startedAt,
          ended_at: toDateTimeStr(new Date(run.endedAt!)),
          focus_minutes: n,
          break_minutes: Math.round(breakMs(run) / 60_000),
          note: note.trim() || null,
          plant_id: academic ? (run.plantId ?? null) : null,
          todo_id: todo ? todo.id : null,
        }),
      );
      if (todo && tickTodo && !todo.done)
        await mutate(db.update("todos", todo.id, { done: 1, status: "Done", completed_at: new Date().toISOString().slice(0, 19).replace("T", " ") }));
      clearFocus();
      toast.success(`Session saved · +${n} laurels${academic ? ` · ${hm(n)} added to ${m!.code}` : ""}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={unstopFocus}
      title={extra >= 0 ? "Session complete" : "Nice work"}
      width="max-w-md"
      footer={
        <>
          <Button
            variant="danger"
            onClick={() => {
              if (armed) clearFocus();
              else {
                setArmed(true);
                setTimeout(() => setArmed(false), 3000);
              }
            }}
          >
            {armed ? "Click again to discard" : "Discard"}
          </Button>
          <span className="flex-1" />
          <Button onClick={unstopFocus}>Keep going</Button>
          <Button variant="primary" disabled={busy || n < 1} onClick={save}>
            Save session
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <div className="grid grid-cols-3 gap-2 text-center">
          <Box label="Focused" value={hm(counted)} />
          <Box label="Planned" value={hm(run.plannedMin)} />
          <Box label={run.breaks === 1 ? "1 break" : `${run.breaks} breaks`} value={hm(Math.round(breakMs(run) / 60_000))} />
        </div>
        <p className="text-sm">
          {run.kind === "academic" ? (
            <>
              <b>{m?.code ?? "Module"}</b> {run.label && `· ${run.label}`}
            </>
          ) : (
            <b>{run.label || "Non-academic"}</b>
          )}
          {extra > 0 && <span style={{ color: "var(--gold)" }}> · {hm(extra)} past your plan</span>}
        </p>
        <Field label="Minutes to save" hint="Forgot to press Stop? Fix the number here.">
          <Input type="number" min={0} value={mins} onChange={(e) => setMins(e.target.value)} />
        </Field>
        <Field label="What did you get done? (optional)">
          <Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Finished the cardiac cycle notes" />
        </Field>
        <div className="flex items-center justify-between rounded-2xl bg-surface-2/60 px-4 py-3">
          <span className="text-sm text-muted">You'll earn</span>
          <Beats n={n} sign className="text-lg" />
        </div>
        {todo && !todo.done && <Checkbox checked={tickTodo} onChange={setTickTodo} label={`Mark "${todo.title}" done`} />}
        {run.kind === "academic" && m && <p className="text-xs text-muted">The minutes also count toward {m.code}'s study target for this week.</p>}
      </div>
    </Modal>
  );
}

function Box({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-surface-2/60 px-2 py-3">
      <div className="font-display tabular text-xl">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}
