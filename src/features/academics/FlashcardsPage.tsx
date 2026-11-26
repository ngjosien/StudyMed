import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Layers, Play, Plus, Settings2, X, PartyPopper, FileText } from "lucide-react";
import { api, type Row } from "../../lib/api";
import { useMutate, useNamed, useRows } from "../../lib/hooks";
import { today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Badge, Button, Card, Empty, IconButton, Kbd, Progress } from "../../components/ui";
import { FormModal, useFormState, type FormState } from "../../components/form";
import { MarkdownView } from "../../components/markdown";
import { ModuleChip, useModules } from "./common";

const RATINGS = [
  { r: 1, label: "Again", cls: "bg-red-500/10 text-red-600 dark:text-red-400 hover:bg-red-500/20" },
  { r: 2, label: "Hard", cls: "bg-amber-500/10 text-amber-600 dark:text-amber-400 hover:bg-amber-500/20" },
  { r: 3, label: "Good", cls: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20" },
  { r: 4, label: "Easy", cls: "bg-sky-500/10 text-sky-600 dark:text-sky-400 hover:bg-sky-500/20" },
];

const ivl = (d: number) => (d <= 0 ? "<1d" : d < 30 ? `${d}d` : d < 365 ? `${Math.round(d / 30)}mo` : `${(d / 365).toFixed(1)}y`);

function Review({ scope, onExit }: { scope: string; onExit: () => void }) {
  const mutate = useMutate();
  const deckId = scope !== "all" ? Number(scope) : null;
  const [queue, setQueue] = useState<Row[] | null>(null);
  const [reveal, setReveal] = useState(false);
  const [done, setDone] = useState(0);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.srsDue(deckId).then(setQueue);
  }, [deckId]);

  const card = queue?.[0];
  const preview = useQuery({
    queryKey: ["srsPreview", card?.id, card?.repetitions, card?.interval_days],
    queryFn: () => api.srsPreview(card!.id),
    enabled: !!card,
  });

  const rate = async (r: number) => {
    if (!card || busy) return;
    setBusy(true);
    try {
      const updated = await mutate(api.srsReview(card.id, r));
      setQueue((q) => {
        const rest = (q ?? []).slice(1);
        return updated.due_date <= today() ? [...rest, updated] : rest;
      });
      setDone((n) => n + 1);
      setReveal(false);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest?.("input, textarea")) return;
      if (e.key === " " || e.key === "Enter") {
        e.preventDefault();
        if (!reveal) setReveal(true);
        else rate(3);
      } else if (reveal && ["1", "2", "3", "4"].includes(e.key)) rate(Number(e.key));
      else if (e.key === "Escape") onExit();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const total = (queue?.length ?? 0) + done;
  return (
    <div className="mx-auto flex min-h-full max-w-3xl flex-col px-8 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Button variant="ghost" icon={X} onClick={onExit}>
          End session
        </Button>
        <Progress value={done} max={Math.max(total, 1)} className="flex-1" />
        <span className="text-sm text-muted tabular-nums">
          {done} reviewed · {queue?.length ?? 0} left
        </span>
      </div>
      {queue === null ? null : !card ? (
        <Card className="mt-10 p-12 text-center">
          <PartyPopper className="mx-auto mb-3 text-accent" size={32} />
          <h2 className="text-lg font-semibold">All caught up!</h2>
          <p className="mt-1 text-sm text-muted">{done ? `You reviewed ${done} card${done === 1 ? "" : "s"}.` : "Nothing is due right now."}</p>
          <Button className="mt-5" onClick={onExit}>
            Back to decks
          </Button>
        </Card>
      ) : (
        <>
          <Card className="flex min-h-[340px] flex-1 flex-col p-8">
            <div className="mb-4 flex items-center gap-2 text-xs text-muted">
              {card.kind === "topic" && <Badge color="#a855f7">Topic review</Badge>}
              {card.repetitions === 0 && <Badge color="#0ea5e9">New</Badge>}
              {card.note_id && (
                <Link to={`/academics/notes?id=${card.note_id}`} className="ml-auto inline-flex items-center gap-1 hover:text-accent">
                  <FileText size={12} /> Source note
                </Link>
              )}
            </div>
            <div className="text-lg">
              <MarkdownView source={card.front_md} className="text-[17px]" />
            </div>
            {reveal && (
              <div className="mt-6 border-t border-line pt-6">
                <MarkdownView source={card.back_md || "_(no answer written)_"} />
              </div>
            )}
          </Card>
          <div className="mt-4">
            {!reveal ? (
              <Button variant="primary" className="h-12 w-full text-base" onClick={() => setReveal(true)}>
                Show answer <Kbd>Space</Kbd>
              </Button>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                {RATINGS.map(({ r, label, cls }) => (
                  <button
                    type="button"
                    key={r}
                    disabled={busy}
                    onClick={() => rate(r)}
                    className={cx("flex h-14 flex-col items-center justify-center rounded-xl font-medium transition-colors", cls)}
                  >
                    {label}
                    <span className="text-xs opacity-70">
                      {preview.data ? ivl(preview.data[r - 1]) : "…"} · {r}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function CardForm({ state, deckId }: { state: ReturnType<typeof useFormState>; deckId: number }) {
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit card" : "New card"}
      table="cards"
      record={state.record}
      defaults={{ deck_id: deckId, kind: "qa", ...state.defaults }}
      fields={[
        {
          key: "kind",
          label: "Type",
          type: "select",
          required: true,
          options: [
            { value: "qa", label: "Question & answer" },
            { value: "topic", label: "Topic review" },
          ],
        },
        { key: "suspended", label: "Suspended", type: "checkbox", placeholder: "Skip in reviews" },
        { key: "front_md", label: "Front", type: "markdown", required: true, placeholder: "Question — paste diagrams directly" },
        { key: "back_md", label: "Back", type: "markdown", placeholder: "Answer" },
      ]}
      transform={(v) => ({ ...v, deck_id: state.record?.deck_id ?? deckId })}
    />
  );
}

function DeckForm({ state }: { state: FormState }) {
  const { options } = useModules();
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit deck" : "New deck"}
      table="decks"
      record={state.record}
      defaults={{ module_id: options[0]?.value, scheduler: "sm2" }}
      fields={[
        { key: "name", label: "Deck name", type: "text", required: true },
        { key: "module_id", label: "Module", type: "select", options, numeric: true, required: true, full: true },
        { key: "description", label: "Description", type: "textarea" },
      ]}
    />
  );
}

function DeckDetail({ deck, onReview }: { deck: Row; onReview: (id: number) => void }) {
  const { byId } = useModules();
  const { rows: cards } = useRows("cards", { deck_id: deck.id }, "id");
  const stats = useNamed("deck_stats").rows.find((s) => s.deck_id === deck.id);
  const cardForm = useFormState();
  const deckForm = useFormState();

  return (
    <div className="space-y-4 px-8 py-6">
      <div className="flex items-center gap-3">
        <ModuleChip module={byId.get(deck.module_id)} />
        <h2 className="font-display flex-1 truncate text-xl font-semibold">{deck.name}</h2>
        <IconButton icon={Settings2} label="Deck settings" onClick={() => deckForm.openEdit(deck)} />
        <Button icon={Plus} onClick={() => cardForm.openNew()}>
          Add card
        </Button>
        <Button variant="primary" icon={Play} disabled={!stats?.due} onClick={() => onReview(deck.id)}>
          Review {stats?.due ? `(${stats.due})` : ""}
        </Button>
      </div>
      <div className="flex items-center gap-3 text-sm text-muted">
        <span>{cards.length} cards</span>·<span>{stats?.due ?? 0} due</span>·<span>{deck.scheduler === "fixed" ? `Fixed ladder ${deck.fixed_intervals}` : "SM-2"}</span>      </div>
      {!cards.length && (
        <Empty icon={Layers} title="No cards">
          Add cards here, or highlight text in a School Note and choose “Flashcard from selection”.
        </Empty>
      )}
      {cards.map((c) => (
        <Card key={c.id} onClick={() => cardForm.openEdit(c)} className={cx("px-4 py-3 text-sm", c.suspended && "opacity-50")}>
          <div className="line-clamp-2 font-medium">{c.front_md}</div>
          <div className="line-clamp-2 text-muted">{c.back_md}</div>
        </Card>
      ))}
      <CardForm state={cardForm} deckId={deck.id} />
      <DeckForm state={deckForm} />
    </div>
  );
}

export default function FlashcardsPage() {
  const [params, setParams] = useSearchParams();
  const { byId } = useModules();
  const { rows: decks } = useRows("decks", undefined, "module_id, name");
  const stats = useNamed("deck_stats").rows;
  const deckForm = useFormState();
  const review = params.get("review");
  const selectedId = params.get("deck") ? Number(params.get("deck")) : (decks[0]?.id ?? null);
  const selected = decks.find((d) => d.id === selectedId);
  const totalDue = stats.reduce((s, x) => s + Number(x.due || 0), 0);
  const stat = (id: number) => stats.find((x) => x.deck_id === id);

  if (review) {
    return <Review scope={review} onExit={() => setParams(selectedId ? { deck: String(selectedId) } : { cards: "1" })} />;
  }

  return (
    <div className="flex h-full gap-3">
      <div className="glass flex w-72 shrink-0 flex-col rounded-[18px]">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <Layers size={16} className="text-accent" />
            <h1 className="flex-1 text-lg font-semibold">Flashcards</h1>
            <IconButton icon={X} label="Back to 1-3-5-7" onClick={() => setParams({})} />
            <IconButton icon={Plus} label="New deck" onClick={() => deckForm.openNew()} />
          </div>
          <Button variant="primary" icon={Play} className="w-full" disabled={!totalDue} onClick={() => setParams({ review: "all" })}>
            Review all due ({totalDue})
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          {!decks.length && <p className="p-4 text-center text-sm text-muted">No decks yet.</p>}
          {decks.map((d) => {
              const s = stat(d.id);
              return (
                <button
                  type="button"
                  key={d.id}
                  onClick={() => setParams({ deck: String(d.id) })}
                  className={cx("flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left text-sm", d.id === selectedId ? "bg-accent-soft text-accent" : "hover:bg-surface-2")}
                >
                  <ModuleChip module={byId.get(d.module_id)} />
                  <span className="flex-1 truncate">{d.name}</span>
                  {s?.due ? <Badge color="#c3a6f4">{s.due}</Badge> : <span className="text-xs text-muted">{s?.total ?? 0}</span>}
                </button>
              );
          })}
        </div>
      </div>
      <div className="glass min-w-0 flex-1 overflow-y-auto rounded-[18px]">
        {selected ? (
          <DeckDetail key={selected.id} deck={selected} onReview={(id) => setParams({ review: String(id), deck: String(id) })} />
        ) : (
          <div className="p-10">
            <Empty icon={Layers} title="Create your first deck">
              Decks belong to a module. Rate each card Again / Hard / Good / Easy and StudyMed schedules the next review.
            </Empty>
          </div>
        )}
      </div>
      <DeckForm state={deckForm} />
    </div>
  );
}
