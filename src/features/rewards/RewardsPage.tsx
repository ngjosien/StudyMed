import { useState } from "react";
import { Link } from "react-router-dom";
import { Gift, HeartPulse, ListTodo, Pencil, Plus, Timer, Undo2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { fmtDateShort, fmtTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { toast } from "../../stores/toast";
import { Button, Card, ConfirmDelete, Field, IconButton, Input, Modal, Page, PageHeader, Progress } from "../../components/ui";
import { Beats, useBeats } from "../../components/beats";
import { BEATS_PER_TODO } from "../../lib/focus";

const EMOJIS = ["🧋", "🍰", "🎮", "📺", "😴", "🛍️", "🍜", "🎬", "🏸", "📚", "💅", "☕", "🍦", "🎧", "🌸", "🎁"];
const STARTERS = [
  { emoji: "📺", name: "One episode of a show", cost: 60 },
  { emoji: "🎮", name: "An hour of games", cost: 90 },
  { emoji: "🍰", name: "Dessert", cost: 100 },
  { emoji: "🧋", name: "Bubble tea", cost: 120 },
  { emoji: "😴", name: "Sleep in", cost: 150 },
  { emoji: "🛍️", name: "Small shopping treat", cost: 400 },
];

export default function RewardsPage() {
  const mutate = useMutate();
  const { balance, today, week, lifetime } = useBeats();
  const rewards = useRows("rewards", undefined, "cost, id").rows;
  const ledger = useRows("beats", undefined, "id desc").rows.slice(0, 60);
  const [edit, setEdit] = useState<Row | "new" | null>(null);

  const redeem = async (r: Row) => {
    await mutate(db.insert("beats", { amount: -r.cost, reason: `Treat · ${r.name}`, source_type: "rewards", source_id: r.id }));
    toast.success(`Enjoy your ${r.name.toLowerCase()} ${r.emoji ?? "🎁"}`);
  };

  return (
    <>
      <PageHeader
        title="Rewards"
        icon={Gift}
        subtitle="Earn beats by focusing and finishing to-dos, then spend them on treats you choose."
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
                <HeartPulse size={40} strokeWidth={2} className="focus-heart" />
                {balance.toLocaleString()}
              </div>
              <p className="mt-2 text-sm text-muted">beats to spend</p>
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
                <b>1 beat</b> for every minute you focus
              </span>
              <span className="text-xs text-accent">Start a session →</span>
            </Link>
            <Link to="/todos" className="flex items-center gap-3 bg-surface-solid/60 px-7 py-4 hover:bg-surface-solid">
              <ListTodo size={18} className="text-accent" />
              <span className="flex-1 text-sm">
                <b>{BEATS_PER_TODO} beats</b> for every to-do you finish
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
              <p className="mt-1 text-sm text-muted">An hour of focus earns 60 beats. Price treats so they feel earned.</p>
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
                    <div className="text-4xl">{r.emoji || "🎁"}</div>
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
                    <IconButton icon={Undo2} label="Undo (give the beats back)" onClick={() => mutate(db.remove("beats", b.id))} />
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
  const [emoji, setEmoji] = useState<string>(row?.emoji ?? "🎁");
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
            {EMOJIS.map((e) => (
              <button key={e} type="button" onClick={() => setEmoji(e)} className={cx("h-9 w-9 rounded-xl text-xl hover:bg-surface-2", emoji === e && "bg-accent-soft ring-1 ring-accent")}>
                {e}
              </button>
            ))}
          </div>
        </Field>
        <Field label="Treat">
          <Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bubble tea" />
        </Field>
        <Field label="Cost in beats" hint={c > 0 ? `About ${c >= 60 ? `${Math.round((c / 60) * 10) / 10} hours` : `${c} minutes`} of focus, or ${Math.ceil(c / BEATS_PER_TODO)} to-dos.` : undefined}>
          <Input type="number" min={1} value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
