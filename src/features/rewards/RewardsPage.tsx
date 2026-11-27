import { useState } from "react";
import { Link } from "react-router-dom";
import { BookOpen, Cake, Clapperboard, Coffee, CupSoda, Flower2, Gamepad2, Gift, Headphones, IceCreamCone, ListTodo, Moon, Pencil, Plus, ShoppingBag, Soup, Sparkles, Timer, Trophy, Tv, Undo2, type LucideIcon } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { fmtDateShort, fmtTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { toast } from "../../stores/toast";
import { Button, Card, ConfirmDelete, Field, IconButton, Input, Modal, Page, PageHeader, Progress } from "../../components/ui";
import { Beats, Laurel, useBeats } from "../../components/beats";
import { BEATS_PER_TODO } from "../../lib/focus";

/** Treat icons. The `emoji` column now stores one of these names. */
const ICONS: Record<string, LucideIcon> = {
  drink: CupSoda,
  cake: Cake,
  games: Gamepad2,
  tv: Tv,
  sleep: Moon,
  shopping: ShoppingBag,
  noodles: Soup,
  film: Clapperboard,
  sport: Trophy,
  book: BookOpen,
  pamper: Sparkles,
  coffee: Coffee,
  icecream: IceCreamCone,
  music: Headphones,
  flower: Flower2,
  gift: Gift,
};
/** Treats saved before icons replaced emoji. */
const FROM_EMOJI: Record<string, string> = {
  "\u{1F9CB}": "drink",
  "\u{1F370}": "cake",
  "\u{1F3AE}": "games",
  "\u{1F4FA}": "tv",
  "\u{1F634}": "sleep",
  "\u{1F6CD}\u{FE0F}": "shopping",
  "\u{1F6CD}": "shopping",
  "\u{1F35C}": "noodles",
  "\u{1F3AC}": "film",
  "\u{1F3F8}": "sport",
  "\u{1F4DA}": "book",
  "\u{1F485}": "pamper",
  "\u{2615}": "coffee",
  "\u{1F366}": "icecream",
  "\u{1F3A7}": "music",
  "\u{1F338}": "flower",
  "\u{1F381}": "gift",
};
const iconKey = (v: unknown) => {
  const s = String(v ?? "");
  return ICONS[s] ? s : (FROM_EMOJI[s] ?? "gift");
};
function TreatIcon({ name, size = 22 }: { name: unknown; size?: number }) {
  const Icon = ICONS[iconKey(name)];
  return <Icon size={size} strokeWidth={1.6} />;
}
const STARTERS = [
  { emoji: "tv", name: "One episode of a show", cost: 60 },
  { emoji: "games", name: "An hour of games", cost: 90 },
  { emoji: "cake", name: "Dessert", cost: 100 },
  { emoji: "drink", name: "Bubble tea", cost: 120 },
  { emoji: "sleep", name: "Sleep in", cost: 150 },
  { emoji: "shopping", name: "Small shopping treat", cost: 400 },
];

export default function RewardsPage() {
  const mutate = useMutate();
  const { balance, today, week, lifetime } = useBeats();
  const rewards = useRows("rewards", undefined, "cost, id").rows;
  const ledger = useRows("beats", undefined, "id desc").rows.slice(0, 60);
  const [edit, setEdit] = useState<Row | "new" | null>(null);

  const redeem = async (r: Row) => {
    await mutate(db.insert("beats", { amount: -r.cost, reason: `Treat · ${r.name}`, source_type: "rewards", source_id: r.id }));
    toast.success(`Enjoy your ${r.name.toLowerCase()}`);
  };

  return (
    <>
      <PageHeader
        title="Rewards"
        icon={Gift}
        subtitle="Earn laurels by focusing and finishing to-dos, then spend them on treats you choose."
        actions={
          <Button variant="primary" icon={Plus} onClick={() => setEdit("new")}>
            New treat
          </Button>
        }
      />
      <Page className="space-y-4">
        {/* Balance */}
        <Card className="overflow-hidden p-0">
          <div className="grid gap-6 bg-gradient-to-br from-[color-mix(in_srgb,var(--beat)_14%,transparent)] to-transparent px-7 py-6 md:grid-cols-[auto_1fr]">
            <div>
              <p className="eyebrow">Your balance</p>
              <div className="font-display tabular mt-1 flex items-center gap-2 text-[52px] leading-none" style={{ color: "var(--beat)" }}>
                <Laurel size={46} />
                {balance.toLocaleString()}
              </div>
              <p className="mt-2 text-sm text-muted">laurels to spend</p>
            </div>
            <div className="grid grid-cols-3 gap-3 self-center md:justify-self-end">
              <Mini label="Today" n={today} />
              <Mini label="This week" n={week} />
              <Mini label="All time" n={lifetime} />
            </div>
          </div>
          <div className="grid gap-px border-t border-line bg-line sm:grid-cols-2">
            <Link to="/focus" className="flex items-center gap-3 bg-surface-solid/60 px-7 py-4 hover:bg-surface-solid">
              <Timer size={18} className="text-accent" />
              <span className="flex-1 text-sm">
                <b>1 laurel</b> for every minute you focus
              </span>
              <span className="text-xs text-accent">Start a session →</span>
            </Link>
            <Link to="/todos" className="flex items-center gap-3 bg-surface-solid/60 px-7 py-4 hover:bg-surface-solid">
              <ListTodo size={18} className="text-accent" />
              <span className="flex-1 text-sm">
                <b>{BEATS_PER_TODO} laurels</b> for every to-do you finish
              </span>
              <span className="text-xs text-accent">Open to-dos →</span>
            </Link>
          </div>
        </Card>

        {/* Treats */}
        <div>
          <p className="eyebrow mb-2">Treats</p>
          {rewards.length === 0 ? (
            <Card className="p-6 text-center">
              <p className="font-display text-lg">Set up treats worth working for</p>
              <p className="mt-1 text-sm text-muted">An hour of focus earns 60 laurels. Price treats so they feel earned.</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <Button variant="primary" onClick={() => mutate(db.insertMany("rewards", STARTERS))}>
                  Add some starter treats
                </Button>
                <Button icon={Plus} onClick={() => setEdit("new")}>
                  Make my own
                </Button>
              </div>
            </Card>
          ) : (
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]">
              {rewards.map((r) => {
                const can = balance >= r.cost;
                return (
                  <Card key={r.id} className={cx("group relative flex flex-col p-5", can && "ring-1 ring-[color-mix(in_srgb,var(--beat)_40%,transparent)]")}>
                    <IconButton icon={Pencil} label="Edit treat" onClick={() => setEdit(r)} className="absolute top-2 right-2 opacity-0 group-hover:opacity-100" />
                    <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
                      <TreatIcon name={r.emoji} size={24} />
                    </div>
                    <div className="mt-2 font-medium">{r.name}</div>
                    <Beats n={r.cost} className="mt-0.5 text-sm" />
                    <div className="mt-auto pt-4">
                      {can ? (
                        <Button variant="primary" className="w-full" onClick={() => redeem(r)}>
                          Treat myself
                        </Button>
                      ) : (
                        <>
                          <Progress value={balance} max={r.cost} color="var(--beat)" />
                          <p className="mt-1.5 text-xs text-muted">
                            {r.cost - balance} more to go · about {Math.ceil((r.cost - balance) / 60) > 1 ? `${Math.ceil((r.cost - balance) / 60)} hours` : "an hour"} of focus
                          </p>
                        </>
                      )}
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* History */}
        {ledger.length > 0 && (
          <Card className="p-5">
            <p className="eyebrow mb-2">History</p>
            <div className="divide-y divide-line">
              {ledger.map((b) => (
                <div key={b.id} className="flex items-center gap-3 py-2 text-sm">
                  <span className="w-20 shrink-0 text-xs text-muted">
                    {fmtDateShort(b.created_at)} {fmtTime(String(b.created_at).replace(" ", "T"))}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{b.reason}</span>
                  <span className={cx("tabular font-semibold", b.amount < 0 && "text-muted")} style={b.amount > 0 ? { color: "var(--beat)" } : undefined}>
                    {b.amount > 0 ? `+${b.amount}` : b.amount}
                  </span>
                  {b.source_type === "rewards" ? (
                    <IconButton icon={Undo2} label="Undo (give the laurels back)" onClick={() => mutate(db.remove("beats", b.id))} />
                  ) : (
                    <span className="w-8" />
                  )}
                </div>
              ))}
            </div>
          </Card>
        )}
      </Page>
      {edit && <TreatModal row={edit === "new" ? null : edit} onClose={() => setEdit(null)} />}
    </>
  );
}

function Mini({ label, n }: { label: string; n: number }) {
  return (
    <div className="rounded-2xl bg-surface-solid/60 px-4 py-3 text-center">
      <div className="font-display tabular text-2xl" style={{ color: "var(--beat)" }}>
        +{n.toLocaleString()}
      </div>
      <div className="text-[11px] text-muted">{label}</div>
    </div>
  );
}

function TreatModal({ row, onClose }: { row: Row | null; onClose: () => void }) {
  const mutate = useMutate();
  const [emoji, setEmoji] = useState<string>(iconKey(row?.emoji));
  const [name, setName] = useState<string>(row?.name ?? "");
  const [cost, setCost] = useState<string>(String(row?.cost ?? 60));
  const c = Math.round(Number(cost) || 0);
  const ok = name.trim() !== "" && c > 0;
  const save = async () => {
    const v = { emoji, name: name.trim(), cost: c };
    await mutate(row ? db.update("rewards", row.id, v) : db.insert("rewards", v));
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={row ? "Edit treat" : "New treat"}
      width="max-w-md"
      footer={
        <>
          {row && (
            <ConfirmDelete
              onConfirm={async () => {
                await mutate(db.remove("rewards", row.id));
                onClose();
              }}
            />
          )}
          <span className="flex-1" />
          <Button onClick={onClose}>Cancel</Button>
          <Button variant="primary" disabled={!ok} onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-4 pb-2">
        <Field label="Icon">
          <div className="flex flex-wrap gap-1">
            {Object.keys(ICONS).map((e) => (
              <button
                key={e}
                type="button"
                title={e}
                aria-label={e}
                onClick={() => setEmoji(e)}
                className={cx("flex h-9 w-9 items-center justify-center rounded-xl hover:bg-surface-2", emoji === e ? "bg-accent-soft text-accent ring-1 ring-accent" : "text-muted")}
              >
                <TreatIcon name={e} size={18} />
              </button>
            ))}
          </div>
        </Field>
        <Field label="Treat">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bubble tea" />
        </Field>
        <Field label="Cost in laurels" hint={c > 0 ? `About ${c >= 60 ? `${Math.round((c / 60) * 10) / 10} hours` : `${c} minutes`} of focus, or ${Math.ceil(c / BEATS_PER_TODO)} to-dos.` : undefined}>
          <Input type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
