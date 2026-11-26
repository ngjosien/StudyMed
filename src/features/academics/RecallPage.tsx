// 1-3-5-7 active recall, logged by hand like a habit.
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Check, Layers, Pencil, Plus, Repeat2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { addDays, fmtDate, parse, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Button, Card, Empty, IconButton, Page, PageHeader, Progress } from "../../components/ui";
import { ChoiceField } from "../../components/pickers";
import { useFormState } from "../../components/form";
import { LinkChips } from "../../components/linked";
import { ModuleChip, useModules } from "./common";
import { TopicForm } from "./forms";
import FlashcardsPage from "./FlashcardsPage";

const shortDay = (s: string) => parse(s)!.toLocaleDateString(undefined, { day: "numeric", month: "short" });

function useToggleStep() {
  const mutate = useMutate();
  return (s: Row) =>
    mutate(async () => {
      if (s.done_date) await db.removeWhere("review_checks", { topic_id: s.topic_id, step: s.step });
      else await db.insert("review_checks", { topic_id: s.topic_id, step: s.step, done_date: today() });
    });
}

export function RecallDots({ steps, color }: { steps: Row[]; color?: string }) {
  const toggle = useToggleStep();
  const t = today();
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {steps.map((s) => {
        const due = !s.done_date && s.due_date <= t;
        return (
          <button
            type="button"
            key={s.step}
            aria-pressed={!!s.done_date}
            onClick={() => toggle(s)}
            title={s.done_date ? `Recalled ${fmtDate(s.done_date)}. Click to undo.` : `Recall on ${fmtDate(s.due_date)}`}
            className="group flex min-w-0 flex-col items-center gap-1"
          >
            <span className="text-[10px] font-medium text-muted">Day {s.offset_days}</span>
            <span
              className={cx(
                "flex h-10 w-10 items-center justify-center rounded-full border-2 transition-transform duration-300 group-hover:scale-110",
                due && "border-accent bg-accent-soft",
                !due && !s.done_date && "border-line",
              )}
              style={s.done_date ? { background: color ?? "var(--accent)", borderColor: color ?? "var(--accent)", color: "#3a2330" } : undefined}
            >
              {s.done_date && <Check size={16} />}
            </span>
            <span className={cx("text-[10px]", due ? "font-semibold text-accent" : "text-muted")}>{shortDay(s.due_date)}</span>
          </button>
        );
      })}
    </div>
  );
}

function Tracker() {
  const [params, setParams] = useSearchParams();
  const { byId, options, modules } = useModules();
  const [mod, setMod] = useState<number | null>(null);
  const [day, setDay] = useState(today);
  const topics = useRows("review_topics", undefined, "learned_date desc, id desc").rows;
  const schedule = useRows("review_schedule", undefined, "topic_id, step").rows;
  const decks = useRows("decks").rows;
  const toggle = useToggleStep();
  const form = useFormState();
  useDeepLinkForm("review_topics", form);

  const focus = Number(params.get("topic")) || null;
  const focusRef = useRef<HTMLDivElement>(null);
  useEffect(() => focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), [focus, topics.length]);

  const t = today();
  const shown = topics.filter((x) => !mod || x.module_id === mod);
  const ids = new Set(shown.map((x) => x.id));
  const steps = schedule.filter((s) => ids.has(s.topic_id));
  const week = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(startOfWeek(new Date()), i)));
  const onDay = steps.filter((s) => (day === t ? (!s.done_date && s.due_date <= t) || s.done_date === t : s.due_date === day));
  const grouped = modules.map((m) => ({ m, items: shown.filter((x) => x.module_id === m.id) })).filter((g) => g.items.length);

  return (
    <>
      <PageHeader
        title="Spaced Repetition"
        icon={Repeat2}
        subtitle="Active recall on day 1, 3, 5, 7, then every 7 days three times"
        actions={
          <>
            {decks.length > 0 && (
              <Button icon={Layers} onClick={() => setParams({ cards: "1" })}>
                Flashcards
              </Button>
            )}
            <Button variant="primary" icon={Plus} disabled={!options.length} onClick={() => form.openNew(mod ? { module_id: mod } : undefined)}>
              I learned something
            </Button>
          </>
        }
      />
      <Page className="space-y-5">
        {!options.length && !topics.length ? (
          <Empty icon={Repeat2} title="Add a module first">
            Each topic you learn is tracked under one of your modules.
          </Empty>
        ) : (
          <>
            <Card className="p-5">
              <div className="grid grid-cols-7 gap-2">
                {week.map((d) => {
                  const n = steps.filter((s) => s.due_date === d).length;
                  return (
                    <button type="button" key={d} onClick={() => setDay(d)} className={cx("rounded-[16px] py-2.5 text-center", d === day ? "bg-accent text-accent-fg" : "bg-surface-2/70 hover:bg-accent-soft")}>
                      <div className="text-[11px] opacity-75">{parse(d)!.toLocaleDateString(undefined, { weekday: "short" })}</div>
                      <div className="text-lg font-semibold">{Number(d.slice(8))}</div>
                      <div className="text-[10px] opacity-75">{n ? `${n} recall${n > 1 ? "s" : ""}` : "·"}</div>
                    </button>
                  );
                })}
              </div>
              <div className="mt-4 space-y-1.5">
                {!onDay.length && <p className="py-2 text-center text-sm text-muted">Nothing to recall {day === t ? "today" : "that day"}.</p>}
                {onDay.map((s) => (
                  <div key={`${s.topic_id}:${s.step}`} className="anim-item flex items-center gap-3 rounded-2xl px-3 py-2 hover:bg-surface-2">
                    <ModuleChip module={byId.get(s.module_id)} />
                    <span className={cx("min-w-0 flex-1 truncate text-sm font-medium", s.done_date && "text-muted line-through")}>{s.title}</span>
                    <span className="text-xs text-muted">Day {s.offset_days}</span>
                    <Button size="sm" variant={s.done_date ? "ghost" : "primary"} onClick={() => toggle(s)}>
                      {s.done_date ? "Undo" : "I recalled it"}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>

            {options.length > 0 && (
              <ChoiceField options={[{ value: 0, label: "All modules" }, ...options]} value={mod ?? 0} onChange={(v) => setMod(Number(v) || null)} />
            )}

            {!grouped.length && (
              <Empty icon={Repeat2} title="Nothing logged here yet">
                When you finish learning something, press “I learned something”, then pick the module and topic. Your seven recall days appear straight away.
              </Empty>
            )}
            {grouped.map(({ m, items }) => (
              <section key={m.id} className="space-y-2.5">
                <h2 className="font-display flex items-center gap-2 px-1 text-lg font-semibold">
                  <span className="h-3 w-3 rounded-full" style={{ background: m.color }} />
                  {m.name}
                </h2>
                {items.map((x) => {
                  const mine = schedule.filter((s) => s.topic_id === x.id);
                  const done = mine.filter((s) => s.done_date).length;
                  return (
                    <div key={x.id} ref={x.id === focus ? focusRef : undefined}>
                      <Card className={cx("p-4", x.id === focus && "ring-2 ring-accent")}>
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
                          <div className="min-w-0 lg:w-64 lg:shrink-0">
                            <div className="flex items-center gap-1">
                              <span className="min-w-0 flex-1 truncate font-semibold">{x.title}</span>
                              <IconButton icon={Pencil} label="Edit topic" onClick={() => form.openEdit(x)} />
                            </div>
                            <div className="text-xs text-muted">Learned {fmtDate(x.learned_date)}</div>
                            <div className="mt-2 flex items-center gap-2 text-xs text-muted">
                              <Progress value={done} max={7} color={m.color} />
                              {done}/7
                            </div>
                            <LinkChips type="review_topics" id={x.id} skip={["modules"]} />
                          </div>
                          <div className="min-w-0 flex-1">
                            <RecallDots steps={mine} color={m.color} />
                          </div>
                        </div>
                      </Card>
                    </div>
                  );
                })}
              </section>
            ))}
          </>
        )}
      </Page>
      <TopicForm state={form} />
    </>
  );
}

export default function RecallPage() {
  const [params] = useSearchParams();
  return params.get("cards") || params.get("deck") || params.get("review") ? <FlashcardsPage /> : <Tracker />;
}
