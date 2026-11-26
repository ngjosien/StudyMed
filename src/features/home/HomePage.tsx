// Home: today in the middle, everything you tick down the side.
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import type { LucideIcon } from "lucide-react";
import { Cake, CalendarRange, ClipboardList, Clock, Flame, GraduationCap, ListTodo, MapPin, PartyPopper, Plus, Receipt, Repeat2, School, Sun, Target, Wallet } from "lucide-react";
import { api, db, type Row } from "../../lib/api";
import { useMutate, useNow, useRows } from "../../lib/hooks";
import { addDays, fmtTime, parse, startOfWeek, toDateStr } from "../../lib/dates";
import { cx, fmtMinutes, fmtMoney } from "../../lib/format";
import { entityRoute } from "../../lib/nav";
import { periodOf, progress, stepIds } from "../../lib/goals";
import { useSetting } from "../../stores/ui";
import { Card, Page, Progress } from "../../components/ui";
import { TickBox, useTick, useTickGoals } from "../life/GoalsPage";

const ICON: Record<string, LucideIcon> = { event: PartyPopper, todo: ListTodo, homework: ClipboardList, exam: GraduationCap, birthday: Cake, bill: Receipt, class: School, review: Repeat2 };
const TINT: Record<string, string> = { event: "#c3a6f4", todo: "#a6e3d0", homework: "#f4d8a6", exam: "#f4b8a6", birthday: "#f4a6c0", bill: "#a6c8f4", class: "#a6c8f4", review: "#c3a6f4" };

function Tile({ title, icon: Icon, to, count, children, className }: { title: string; icon: LucideIcon; to?: string; count?: number; children: ReactNode; className?: string }) {
  return (
    <Card className={cx("p-4", className)}>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={14} />
        </span>
        <h2 className="flex-1 text-[15px] font-semibold">{title}</h2>
        {!!count && <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold text-accent-fg">{count}</span>}
        {to && (
          <Link to={to} className="text-xs text-accent hover:underline">
            Open
          </Link>
        )}
      </div>
      {children}
    </Card>
  );
}
const Quiet = ({ children }: { children: ReactNode }) => <p className="py-1.5 text-sm text-muted">{children}</p>;

/** The day as a timeline, with a "now" marker between what's done and what's next. */
function TodayPanel({ items, now }: { items: Row[]; now: Date }) {
  const mutate = useMutate();
  const t = toDateStr(now);
  const nowStr = `${t}T${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const allDay = items.filter((i) => String(i.start_at).length <= 10 || i.all_day);
  const timed = items.filter((i) => !allDay.includes(i));
  const nowIndex = timed.findIndex((i) => String(i.end_at ?? i.start_at) > nowStr);
  const next = nowIndex >= 0 ? timed[nowIndex] : null;
  const minsToNext = next ? Math.round((parse(next.start_at)!.getTime() - now.getTime()) / 60000) : null;

  const toggleTodo = (i: Row) =>
    mutate(db.update("todos", i.source_id, i.done ? { done: 0, status: "Not Started", completed_at: null } : { done: 1, status: "Done", completed_at: new Date().toISOString().slice(0, 19).replace("T", " ") }));

  const row = (i: Row, n: number) => {
    const Icon = ICON[i.layer] ?? Sun;
    const tint = i.color ?? TINT[i.layer];
    const past = String(i.end_at ?? i.start_at) <= nowStr;
    const timedRow = !allDay.includes(i);
    return (
      <div key={`${i.source_type}:${i.source_id}:${i.start_at}:${n}`} className={cx("group relative flex items-stretch gap-4", past && timedRow && "opacity-55")}>
        <div className="w-16 shrink-0 pt-3 text-right text-xs text-muted tabular-nums">
          {timedRow ? (
            <>
              <div className="font-semibold text-fg">{fmtTime(i.start_at)}</div>
              {i.end_at && <div>{fmtTime(i.end_at)}</div>}
            </>
          ) : (
            "All day"
          )}
        </div>
        <div className="relative flex w-4 shrink-0 justify-center">
          <span className="absolute inset-y-0 w-0.5 bg-line" />
          <span className="relative mt-4 h-3 w-3 rounded-full ring-4 ring-surface-solid" style={{ background: tint }} />
        </div>
        <Link
          to={entityRoute(i.source_type, i.source_id) ?? "/calendar"}
          className="my-1 flex min-w-0 flex-1 items-center gap-3 rounded-2xl px-3.5 py-2.5 transition-transform hover:translate-x-0.5"
          style={{ background: `linear-gradient(100deg, color-mix(in srgb, ${tint} 38%, transparent), color-mix(in srgb, ${tint} 8%, transparent))` }}
        >
          <Icon size={16} className="shrink-0 opacity-80" />
          <span className="min-w-0 flex-1">
            <span className={cx("block truncate font-medium", i.done && "line-through opacity-60")}>{i.title}</span>
            {i.location && (
              <span className="flex items-center gap-1 truncate text-xs text-muted">
                <MapPin size={11} /> {i.location}
              </span>
            )}
          </span>
          {i.layer === "todo" && (
            <span
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            >
              <TickBox on={!!i.done} label={`Done: ${i.title}`} onClick={() => toggleTodo(i)} size={24} />
            </span>
          )}
        </Link>
      </div>
    );
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-end justify-between gap-4 px-6 pt-6 pb-3">
        <div>
          <p className="eyebrow !text-accent">Today</p>
          <p className="font-display text-2xl">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}</p>
        </div>
        <p className="text-right text-sm text-muted">
          {next && minsToNext !== null && minsToNext > 0 ? (
            <>
              Next: <span className="font-semibold text-fg">{next.title}</span>
              <br />
              in {fmtMinutes(minsToNext)}
            </>
          ) : items.length ? (
            `${items.length} thing${items.length > 1 ? "s" : ""} today`
          ) : null}
        </p>
      </div>
      <div className="px-4 pb-5">
        {!items.length && <p className="px-2 py-10 text-center text-sm text-muted">Nothing on today. Enjoy it.</p>}
        {allDay.map(row)}
        {timed.map((i, n) => (
          <div key={`w${n}`}>
            {n === nowIndex && (
              <div className="flex items-center gap-4 py-1">
                <span className="w-16 text-right text-[11px] font-semibold text-danger">{fmtTime(nowStr)}</span>
                <span className="flex w-4 justify-center">
                  <span className="h-2.5 w-2.5 rounded-full bg-danger shadow-[0_0_0_4px_color-mix(in_srgb,var(--danger)_25%,transparent)]" />
                </span>
                <span className="h-0.5 flex-1 rounded-full bg-danger/60" />
              </div>
            )}
            {row(i, n)}
          </div>
        ))}
      </div>
    </Card>
  );
}

export default function HomePage() {
  const now = useNow();
  const mutate = useMutate();
  const tick = useTick();
  const t = toDateStr(now);
  const weekday = (now.getDay() + 6) % 7;
  const weekStart = toDateStr(startOfWeek(now));
  const horizon = toDateStr(addDays(now, 7));

  const agenda = (useQuery({ queryKey: ["home", "agenda", t], queryFn: () => api.calendarRange(t, horizon) }).data ?? []) as Row[];
  const recalls = useRows("review_schedule", { done_date: { null: true }, due_date: { lte: t } }, "due_date").rows;
  const modules = useRows("modules", undefined, "code").rows;
  const blocks = useRows("routine_blocks", { weekday }, "start_time").rows;
  const logs = useRows("study_logs", { date: t }).rows;
  const habits = useRows("habits", { archived: 0 }, "position, id").rows;
  const habitChecks = useRows("habit_checks", { date: t }).rows;
  const spending = useRows("transactions", { date: { gte: weekStart }, kind: "expense" }).rows;
  const limit = useRows("weekly_limits").rows.find((l) => l.category_id == null);
  const { goals, steps, ticks } = useTickGoals();
  const [why, setWhy] = useSetting<string>("home.why", "");
  const [draft, setDraft] = useState<string | null>(null);

  const byId = new Map(modules.map((m) => [m.id, m]));
  const sorted = agenda.filter((i) => i.layer !== "review").sort((a, b) => String(a.start_at).localeCompare(String(b.start_at)));
  const todayItems = sorted.filter((i) => String(i.start_at).slice(0, 10) <= t && String(i.end_at ?? i.start_at).slice(0, 10) >= t);
  const soon = sorted.filter((i) => String(i.start_at).slice(0, 10) > t && i.layer !== "class").slice(0, 6);
  const spent = spending.reduce((s, x) => s + x.amount_cents, 0);
  const hour = now.getHours();
  const hello = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const goalsLeft = goals.filter((g) => !progress(g, steps, ticks, periodOf(g, t)).complete).length;

  return (
    <Page className="space-y-4 pt-6">
      <header className="anim-item relative overflow-hidden rounded-[22px] px-8 py-7 hero-sheen">
        <img src="/app-icon.svg" alt="" className="pointer-events-none absolute top-1/2 right-8 hidden h-32 w-32 -translate-y-1/2 rounded-[28px] opacity-90 shadow-[0_18px_40px_-18px_rgba(54,16,28,0.7)] lg:block" />
        <p className="eyebrow">{now.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}</p>
        <h1 className="font-display text-[28px] leading-tight">{hello}</h1>
        <input
          value={draft ?? why}
          onFocus={() => setDraft(why)}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft !== null) setWhy(draft.trim());
            setDraft(null);
          }}
          placeholder="Write the reason you want to do medicine. It'll greet you here."
          className="relative mt-1 w-full max-w-2xl bg-transparent text-[15px] outline-none placeholder:text-fg/45"
        />
        <div className="relative mt-4 flex flex-wrap gap-1.5">
          {[
            ["To-do", "/life/todos?new=1"],
            ["Event", "/life/events?new=1"],
            ["Homework", "/academics/homework?new=1"],
            ["Spending", "/life/money?new=1"],
            ["Learned something", "/academics/flashcards?new=1"],
          ].map(([label, to]) => (
            <Link key={label} to={to} className="inline-flex items-center gap-1 rounded-full bg-surface-solid/70 px-3.5 py-1.5 text-xs shadow-sm backdrop-blur hover:bg-surface-solid">
              <Plus size={12} />
              {label}
            </Link>
          ))}
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="space-y-4">
          <TodayPanel items={todayItems} now={now} />
          <Tile title="Next seven days" icon={CalendarRange} to="/calendar">
            {!soon.length && <Quiet>Nothing planned yet.</Quiet>}
            <div className="grid gap-1.5 sm:grid-cols-2">
              {soon.map((i, n) => {
                const Icon = ICON[i.layer] ?? Sun;
                const d = parse(i.start_at)!;
                return (
                  <Link key={n} to={entityRoute(i.source_type, i.source_id) ?? "/calendar"} className="flex items-center gap-3 rounded-2xl px-2 py-1.5 text-sm hover:bg-surface-2">
                    <span className="w-10 shrink-0 rounded-xl bg-surface-2 py-1 text-center leading-tight">
                      <span className="block text-[10px] text-muted uppercase">{d.toLocaleDateString(undefined, { weekday: "short" })}</span>
                      <span className="block font-semibold">{d.getDate()}</span>
                    </span>
                    <Icon size={14} className="shrink-0" style={{ color: `color-mix(in srgb, ${TINT[i.layer]} 70%, var(--fg))` }} />
                    <span className="truncate">{i.title}</span>
                  </Link>
                );
              })}
            </div>
          </Tile>
        </div>

        <div className="space-y-4">
          <Tile title="Active recall" icon={Repeat2} to="/academics/flashcards" count={recalls.length}>
            {!recalls.length && <Quiet>Nothing to recall right now.</Quiet>}
            {recalls.slice(0, 5).map((r) => (
              <div key={`${r.topic_id}:${r.step}`} className="flex items-center gap-3 py-1 text-sm">
                <TickBox on={false} size={22} label={`I recalled ${r.title}`} onClick={() => mutate(db.insert("review_checks", { topic_id: r.topic_id, step: r.step, done_date: t }))} />
                <Link to={`/academics/flashcards?topic=${r.topic_id}`} className="min-w-0 flex-1 truncate hover:underline">
                  {r.title}
                </Link>
                <span className="text-xs text-muted">Day {r.offset_days}</span>
              </div>
            ))}
            {recalls.length > 5 && <p className="text-xs text-muted">+{recalls.length - 5} more</p>}
          </Tile>

          <Tile title="Goals" icon={Target} to="/life/goals" count={goalsLeft}>
            {!goals.length && <Quiet>No goals yet.</Quiet>}
            {goals.map((g) => {
              const period = periodOf(g, t);
              const p = progress(g, steps, ticks, period);
              const ids = stepIds(g, steps);
              const nextStep = ids.find((id) => !ticks.some((x) => x.goal_id === g.id && x.step_id === id && x.period === period));
              return (
                <div key={g.id} className="py-1.5 text-sm">
                  <div className="flex items-center gap-3">
                    <TickBox
                      on={p.complete}
                      size={22}
                      color={g.color}
                      label={p.complete ? `${g.title} is done` : `Tick the next part of ${g.title}`}
                      onClick={() => (p.complete ? undefined : nextStep !== undefined && tick(g, nextStep, period, true))}
                    />
                    <span className={cx("min-w-0 flex-1 truncate", p.complete && "text-muted line-through")}>{g.title}</span>
                    <span className="text-xs text-muted">{g.cadence === "daily" ? "today" : `${p.done}/${p.total}`}</span>
                  </div>
                  {g.cadence === "weekly" && p.total > 1 && <Progress className="mt-1.5 ml-[34px] !h-1.5 !w-auto" value={p.done} max={p.total} color={g.color} />}
                </div>
              );
            })}
          </Tile>

          <Tile title="Study today" icon={Clock} to="/academics/routine">
            {!blocks.length && <Quiet>No study blocks today.</Quiet>}
            {blocks.map((b) => {
              const log = logs.find((l) => l.block_id === b.id);
              return (
                <div key={b.id} className="flex items-center gap-3 py-1 text-sm">
                  <TickBox
                    on={!!log}
                    size={22}
                    color={byId.get(b.module_id)?.color}
                    label="Mark this block as studied"
                    onClick={() =>
                      mutate(async () => {
                        if (log) await db.remove("study_logs", log.id);
                        else await db.insert("study_logs", { module_id: b.module_id, block_id: b.id, date: t, minutes: b.minutes });
                      })
                    }
                  />
                  <span className="min-w-0 flex-1 truncate">
                    {byId.get(b.module_id)?.code} <span className="text-muted">{b.focus}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted">{fmtTime(b.start_time)}</span>
                </div>
              );
            })}
          </Tile>

          <Tile title="Habits" icon={Flame} to="/life/habits">
            {!habits.length && <Quiet>No habits yet.</Quiet>}
            <div className="flex flex-wrap gap-2">
              {habits.map((h) => {
                const on = habitChecks.some((c) => c.habit_id === h.id);
                return (
                  <button
                    type="button"
                    key={h.id}
                    aria-pressed={on}
                    onClick={() =>
                      mutate(async () => {
                        if (on) await db.removeWhere("habit_checks", { habit_id: h.id, date: t });
                        else await db.insert("habit_checks", { habit_id: h.id, date: t });
                      })
                    }
                    className={cx("rounded-full px-3 py-1.5 text-xs", on ? "font-semibold" : "bg-surface-2 hover:bg-accent-soft")}
                    style={on ? { background: h.color, color: "#3a2330" } : undefined}
                  >
                    {on ? "✓ " : ""}
                    {h.name}
                  </button>
                );
              })}
            </div>
          </Tile>

          <Tile title="Spent this week" icon={Wallet} to="/life/money">
            <p className="font-display text-xl">{fmtMoney(spent)}</p>
            {limit && (
              <>
                <Progress className="my-1.5" value={spent} max={limit.cap_cents} color={spent > limit.cap_cents ? "var(--danger)" : undefined} />
                <p className="text-xs text-muted">{spent > limit.cap_cents ? `${fmtMoney(spent - limit.cap_cents)} over` : `${fmtMoney(limit.cap_cents - spent)} left`}</p>
              </>
            )}
          </Tile>
        </div>
      </div>
    </Page>
  );
}
