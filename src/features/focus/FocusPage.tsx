import { useMemo, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Coffee, GraduationCap, Minus, Play, Plus, Sparkles, Square, Timer, Trophy } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addMinutes, fmtDateShort, fmtTime, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Button, Card, ConfirmDelete, Input, Page, PageHeader, Progress, Segmented } from "../../components/ui";
import { Beats, Laurel, useBeats } from "../../components/beats";
import { useSetting } from "../../stores/ui";
import {
  BEATS_PER_TODO,
  LAST_KEY,
  breakMs,
  clock,
  focusMs,
  hm,
  phase,
  resumeFocus,
  startFocus,
  stopFocus,
  takeBreak,
  useFocusRun,
  useTick,
  type FocusRun,
  type FocusSetup,
} from "../../lib/focus";

const PRESETS = [25, 45, 60, 90, 120, 180];
const OTHER_IDEAS = ["Reading", "Red Cross", "Badminton prep", "Volunteering", "Journalling", "Admin & emails"];

export default function FocusPage() {
  const run = useFocusRun();
  const { balance } = useBeats();
  return (
    <>
      <PageHeader
        title="Focus"
        icon={Timer}
        subtitle="Plan your time, then keep going as long as you like. Every focused minute earns a laurel."
        actions={
          <Link to="/rewards" className="glass flex items-center gap-2 rounded-2xl px-3.5 py-2 text-sm hover:-translate-y-px">
            <Beats n={balance} />
            <span className="text-muted">· Rewards</span>
          </Link>
        }
      />
      <Page className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0 space-y-4">
          {run ? <LiveTimer run={run} /> : <Setup />}
          <History />
        </div>
        <aside className="space-y-4">
          <TodayPanel />
          <WeekPanel />
        </aside>
      </Page>
    </>
  );
}

/* ------------------------------------------------------------ Setup */
function Setup() {
  const [params] = useSearchParams();
  const [last] = useSetting<FocusSetup | null>(LAST_KEY, null);
  const modules = useRows("modules", { archived: 0 }, "code").rows;
  const fromLink = Number(params.get("module")) || null;
  const [s, setS] = useState<FocusSetup>(() =>
    fromLink
      ? { kind: "academic", moduleId: fromLink, label: "", plannedMin: last?.plannedMin ?? 60 }
      : (last ?? { kind: "academic", moduleId: null, label: "", plannedMin: 60 }),
  );
  const set = (p: Partial<FocusSetup>) => setS((o) => ({ ...o, ...p }));
  const module = modules.find((m) => m.id === s.moduleId);
  const ok = s.plannedMin >= 5 && (s.kind === "other" ? s.label.trim() !== "" : !!module);
  const step = (d: number) => set({ plannedMin: Math.min(12 * 60, Math.max(5, s.plannedMin + d)) });
  const ends = addMinutes(new Date(), s.plannedMin);

  return (
    <Card className="overflow-hidden p-0">
      <div className="bg-gradient-to-br from-accent-soft to-transparent px-7 pt-6 pb-5">
        <p className="eyebrow">New session</p>
        <h2 className="font-display text-2xl">What are we focusing on?</h2>
      </div>
      <div className="space-y-6 px-7 pt-2 pb-7">
        {/* Time */}
        <section>
          <Heading n={1}>How long do you plan to focus?</Heading>
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex items-center gap-2">
              <RoundBtn label="15 minutes less" onClick={() => step(s.plannedMin > 15 ? -15 : -5)}>
                <Minus size={16} />
              </RoundBtn>
              <div className="min-w-36 text-center">
                <div className="font-display tabular text-[40px] leading-none">{hm(s.plannedMin)}</div>
                <div className="mt-1 text-xs text-muted">ends about {fmtTime(toLocal(ends))} without breaks</div>
              </div>
              <RoundBtn label="15 minutes more" onClick={() => step(s.plannedMin < 15 ? 5 : 15)}>
                <Plus size={16} />
              </RoundBtn>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Chip key={p} active={s.plannedMin === p} onClick={() => set({ plannedMin: p })}>
                  {hm(p)}
                </Chip>
              ))}
            </div>
          </div>
          <p className="mt-3 text-xs text-muted">When the plan is up the timer keeps counting, so you never lose a minute. It only stops when you press Break or Stop.</p>
        </section>

        {/* Kind */}
        <section>
          <Heading n={2}>What kind of session?</Heading>
          <Segmented<FocusSetup["kind"]>
            value={s.kind}
            onChange={(kind) => set({ kind, label: "" })}
            options={[
              { value: "academic", label: "Academic", icon: GraduationCap },
              { value: "other", label: "Non-academic", icon: Sparkles },
            ]}
          />
          {s.kind === "academic" ? (
            <div className="mt-4 space-y-3">
              <div className="flex flex-wrap gap-1.5">
                {modules.map((m) => (
                  <Chip key={m.id} active={m.id === s.moduleId} onClick={() => set({ moduleId: m.id })} color={m.color}>
                    <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
                    <span className="font-semibold">{m.code}</span>
                    <span className="hidden text-muted sm:inline">{m.name}</span>
                  </Chip>
                ))}
                {modules.length === 0 && (
                  <p className="text-sm text-muted">
                    No modules yet. <Link to="/academics/modules" className="text-accent underline">Add one</Link> first.
                  </p>
                )}
              </div>
              {module && <ModuleWeek m={module} />}
              <Input value={s.label} onChange={(e) => set({ label: e.target.value })} placeholder="Topic (optional), e.g. Cardiac cycle" />
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              <Input value={s.label} onChange={(e) => set({ label: e.target.value })} placeholder="What is it? e.g. Reading" />
              <div className="flex flex-wrap gap-1.5">
                {OTHER_IDEAS.map((i) => (
                  <Chip key={i} active={s.label === i} onClick={() => set({ label: i })}>
                    {i}
                  </Chip>
                ))}
              </div>
            </div>
          )}
        </section>

        <div className="flex flex-wrap items-center gap-3 pt-1">
          <Button variant="primary" icon={Play} disabled={!ok} onClick={() => startFocus({ ...s, label: s.label.trim() })} className="!h-11 !rounded-2xl !px-6 !text-base">
            Start focusing
          </Button>
          <span className="text-sm text-muted">
            You'll earn <Beats n={s.plannedMin} className="text-sm" /> for the plan, plus 1 for every extra minute.
          </span>
        </div>
      </div>
    </Card>
  );
}

const toLocal = (d: Date) => `${toDateStr(d)}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

function Heading({ n, children }: { n: number; children: ReactNode }) {
  return (
    <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent text-[11px] text-accent-fg">{n}</span>
      {children}
    </h3>
  );
}

function RoundBtn({ children, label, onClick }: { children: ReactNode; label: string; onClick: () => void }) {
  return (
    <button type="button" aria-label={label} title={label} onClick={onClick} className="flex h-10 w-10 items-center justify-center rounded-full border border-line bg-surface-solid/70 hover:border-accent hover:text-accent">
      {children}
    </button>
  );
}

function Chip({ children, active, onClick, color }: { children: ReactNode; active?: boolean; onClick: () => void; color?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cx(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] transition-colors",
        active ? "border-accent bg-accent-soft text-fg" : "border-line bg-surface-solid/50 hover:border-accent/50",
      )}
      style={active && color ? { borderColor: color, background: `color-mix(in srgb, ${color} 18%, transparent)` } : undefined}
    >
      {children}
    </button>
  );
}

/** This week's study for one module, against its weekly target. */
function ModuleWeek({ m }: { m: Row }) {
  const weekStart = toDateStr(startOfWeek(new Date()));
  const done = useRows("study_logs", { module_id: m.id, date: { gte: weekStart } }).rows.reduce((n, l) => n + l.minutes, 0);
  const goal = useRows("study_targets", { module_id: m.id }).rows[0]?.minutes_per_week ?? 0;
  return (
    <div className="rounded-2xl bg-surface-2/60 px-4 py-3 text-sm">
      <div className="flex items-baseline gap-2">
        <span className="font-medium">{m.code} this week</span>
        <span className="flex-1" />
        <span className="tabular text-muted">
          {hm(done)}
          {goal ? ` of ${hm(goal)}` : ""}
        </span>
      </div>
      {goal > 0 ? (
        <>
          <Progress className="mt-2" value={done} max={goal} color={m.color} />
          <p className="mt-1.5 text-xs text-muted">{done >= goal ? "Target met for this week ✨" : `${hm(goal - done)} to go`}</p>
        </>
      ) : (
        <p className="mt-1 text-xs text-muted">
          No weekly target. <Link to="/routine?tab=study" className="text-accent underline">Set one</Link>
        </p>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ Live timer */
function LiveTimer({ run }: { run: FocusRun }) {
  const now = useTick(run.endedAt == null);
  const modules = useRows("modules").rows;
  const m = modules.find((x) => x.id === run.moduleId);
  const p = phase(run);
  const f = focusMs(run, now);
  const b = breakMs(run, now);
  const plan = run.plannedMin * 60_000;
  const over = f >= plan;
  const color = m?.color ?? "var(--accent)";

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-wrap items-center gap-2 px-7 pt-6">
        <span className={cx("h-2.5 w-2.5 rounded-full", p === "focus" && "animate-pulse")} style={{ background: p === "break" ? "var(--muted)" : "var(--beat)" }} />
        <span className="eyebrow">{p === "break" ? "On a break" : over ? "Past your plan, still counting" : "Focusing"}</span>
        <span className="flex-1" />
        {run.kind === "academic" ? (
          <span className="inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px]" style={{ background: `color-mix(in srgb, ${color} 18%, transparent)` }}>
            <span className="h-2 w-2 rounded-full" style={{ background: color }} />
            <b>{m?.code ?? "Module"}</b> {m?.name}
          </span>
        ) : (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-2 px-3 py-1 text-[13px]">
            <Sparkles size={13} /> Non-academic
          </span>
        )}
      </div>

      <div className="flex flex-col items-center px-7 pt-4 pb-7">
        <Ring progress={Math.min(1, f / plan)} over={over} onBreak={p === "break"} color={over ? "var(--gold)" : "var(--accent)"}>
          {p === "break" ? (
            <>
              <Coffee size={22} className="mb-1 text-muted" />
              <div className="font-display tabular text-[52px] leading-none">{clock(b)}</div>
              <div className="mt-2 text-sm text-muted">break · {clock(f)} focused</div>
            </>
          ) : over ? (
            <>
              <div className="text-sm font-semibold" style={{ color: "var(--gold)" }}>
                <Trophy size={14} className="mr-1 inline" />
                Plan done
              </div>
              <div className="font-display tabular text-[56px] leading-none" style={{ color: "var(--gold)" }}>
                +{clock(f - plan)}
              </div>
              <div className="mt-2 text-sm text-muted">{clock(f)} focused in total</div>
            </>
          ) : (
            <>
              <div className="text-sm text-muted">left of {hm(run.plannedMin)}</div>
              <div className="font-display tabular text-[60px] leading-none">{clock(plan - f)}</div>
              <div className="mt-2 text-sm text-muted">{clock(f)} focused</div>
            </>
          )}
        </Ring>

        {run.label && <p className="font-display mt-4 text-lg italic">“{run.label}”</p>}

        <div className="mt-3 flex items-center gap-2 text-sm">
          <Laurel size={17} style={{ color: "var(--beat)" }} />
          <span>
            <b className="tabular" style={{ color: "var(--beat)" }}>
              {Math.floor(f / 60_000)}
            </b>{" "}
            laurels earned so far
          </span>
          {run.breaks > 0 && (
            <span className="text-muted">
              · {run.breaks} break{run.breaks > 1 ? "s" : ""} ({hm(Math.round(b / 60_000))})
            </span>
          )}
        </div>

        <div className="mt-6 flex gap-3">
          {p === "break" ? (
            <Button variant="primary" icon={Play} onClick={resumeFocus} className="!h-11 !rounded-2xl !px-6 !text-base">
              Back to focus
            </Button>
          ) : (
            <Button icon={Coffee} onClick={takeBreak} className="!h-11 !rounded-2xl !px-6 !text-base">
              Break
            </Button>
          )}
          <Button icon={Square} onClick={stopFocus} className="!h-11 !rounded-2xl !px-6 !text-base">
            Stop
          </Button>
        </div>
        <p className="mt-3 text-xs text-muted">Started {fmtTime(run.startedAt)}. Breaks don't earn laurels; the clock carries on if you switch pages or close the window.</p>
      </div>
    </Card>
  );
}

function Ring({ progress, over, onBreak, color, children }: { progress: number; over: boolean; onBreak: boolean; color: string; children: ReactNode }) {
  const size = 300;
  const r = 132;
  const c = 2 * Math.PI * r;
  // 60 tick marks like a watch face; the ones already passed light up.
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div className={cx("relative", onBreak && "focus-breathe", over && !onBreak && "focus-over")} style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="absolute inset-0 -rotate-90">
        {ticks.map((i) => {
          const a = (i / 60) * Math.PI * 2;
          const r1 = 146;
          const r2 = i % 5 === 0 ? 139 : 142;
          const lit = i / 60 < progress;
          return (
            <line
              key={i}
              x1={size / 2 + Math.cos(a) * r1}
              y1={size / 2 + Math.sin(a) * r1}
              x2={size / 2 + Math.cos(a) * r2}
              y2={size / 2 + Math.sin(a) * r2}
              stroke={lit ? color : "var(--line)"}
              strokeWidth={i % 5 === 0 ? 2 : 1}
              strokeLinecap="round"
            />
          );
        })}
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={10} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={onBreak ? "var(--muted)" : color}
          strokeOpacity={onBreak ? 0.45 : 1}
          strokeWidth={10}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - progress)}
          style={{ transition: "stroke-dashoffset 1s linear, stroke 0.6s" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">{children}</div>
    </div>
  );
}

/* ------------------------------------------------------------ Side panels */
function TodayPanel() {
  const t = today();
  const sessions = useRows("focus_sessions", { started_at: { gte: t } }).rows.filter((s) => String(s.started_at).startsWith(t));
  const todos = useRows("beats", { source_type: "todos", created_at: { gte: t } }).rows;
  const { today: earned } = useBeats();
  const minutes = sessions.reduce((n, s) => n + s.focus_minutes, 0);
  return (
    <Card className="p-5">
      <p className="eyebrow">Today</p>
      <div className="mt-2 grid grid-cols-2 gap-3">
        <Stat label="Focused" value={minutes ? hm(minutes) : "0m"} />
        <Stat label="Sessions" value={String(sessions.length)} />
        <Stat label="To-dos done" value={String(todos.length)} />
        <Stat label="Laurels earned" value={<Beats n={earned} unit={false} />} />
      </div>
      <div className="rule-fine my-4" />
      <p className="text-xs leading-relaxed text-muted">
        <Laurel size={13} className="mr-1 inline align-[-2px]" style={{ color: "var(--beat)" }} />1 laurel per focused minute · {BEATS_PER_TODO} laurels per finished to-do. Spend them in{" "}
        <Link to="/rewards" className="text-accent underline">
          Rewards
        </Link>
        .
      </p>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <div className="font-display tabular text-2xl leading-tight">{value}</div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function WeekPanel() {
  const weekStart = toDateStr(startOfWeek(new Date()));
  const modules = useRows("modules", { archived: 0 }, "code").rows;
  const targets = useRows("study_targets").rows;
  const logs = useRows("study_logs", { date: { gte: weekStart } }).rows;
  const rows = useMemo(
    () =>
      modules.map((m) => ({
        m,
        goal: targets.find((t) => t.module_id === m.id)?.minutes_per_week ?? 0,
        done: logs.filter((l) => l.module_id === m.id).reduce((n, l) => n + l.minutes, 0),
      })),
    [modules, targets, logs],
  );
  if (!rows.length) return null;
  return (
    <Card className="p-5">
      <p className="eyebrow mb-2">Study this week</p>
      <div className="space-y-3">
        {rows.map(({ m, goal, done }) => (
          <div key={m.id}>
            <div className="flex items-center gap-2 text-sm">
              <span className="h-2 w-2 rounded-full" style={{ background: m.color }} />
              <span className="flex-1 font-medium">{m.code}</span>
              <span className="tabular text-xs text-muted">
                {hm(done)}
                {goal ? ` / ${hm(goal)}` : ""}
              </span>
            </div>
            {goal > 0 && <Progress className="mt-1" value={done} max={goal} color={done >= goal ? "var(--accent)" : m.color} />}
          </div>
        ))}
      </div>
    </Card>
  );
}

/* ------------------------------------------------------------ History */
function History() {
  const mutate = useMutate();
  const sessions = useRows("focus_sessions", undefined, "started_at desc, id desc").rows.slice(0, 30);
  const modules = useRows("modules").rows;
  const byId = new Map(modules.map((m) => [m.id, m]));
  if (!sessions.length) return null;
  return (
    <Card className="p-5">
      <p className="eyebrow mb-2">Recent sessions</p>
      <div className="divide-y divide-line">
        {sessions.map((s) => {
          const m = byId.get(s.module_id);
          const extra = s.focus_minutes - s.planned_minutes;
          return (
            <div key={s.id} className="flex items-center gap-3 py-2.5 text-sm">
              <div className="w-16 shrink-0 text-xs text-muted">
                <div>{fmtDateShort(s.started_at)}</div>
                <div>{fmtTime(s.started_at)}</div>
              </div>
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: m?.color ?? "var(--line)" }} />
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">
                  {s.kind === "academic" ? (m?.code ?? "Module") : (s.label ?? "Personal")}
                  {s.kind === "academic" && s.label && <span className="font-normal text-muted"> · {s.label}</span>}
                </div>
                <div className="text-xs text-muted">
                  {hm(s.focus_minutes)} focused of {hm(s.planned_minutes)} planned
                  {extra > 0 && <span style={{ color: "var(--gold)" }}> · +{hm(extra)} extra</span>}
                  {s.break_minutes > 0 && ` · ${hm(s.break_minutes)} break`}
                  {s.note && ` · ${s.note}`}
                </div>
              </div>
              <Beats n={s.focus_minutes} sign unit={false} className="text-sm" />
              <ConfirmDelete iconOnly label="Delete session (removes its laurels and study minutes)" onConfirm={() => mutate(db.remove("focus_sessions", s.id))} />
            </div>
          );
        })}
      </div>
    </Card>
  );
}
