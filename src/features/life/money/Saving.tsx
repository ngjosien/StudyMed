import { useState } from "react";
import { Check, Pencil, PiggyBank, Plus, Undo2, X } from "lucide-react";
import { db, type Row } from "../../../lib/api";
import { useMutate, useRows } from "../../../lib/hooks";
import { addDays, daysUntil, fmtDate, parse, toDateStr, today } from "../../../lib/dates";
import { cx, fmtMoney, pct, toCents } from "../../../lib/format";
import { Button, Card, Empty, IconButton, Input, MilestoneBar } from "../../../components/ui";
import { FormModal, useFormState } from "../../../components/form";
import { LinkChips } from "../../../components/linked";

const BUCKETS: Record<string, string> = {
  "Things I want": "#f4a6c0",
  "Trips & future": "#a6c8f4",
  "Med school fund": "#c3a6f4",
  "Gifts for people": "#f4d8a6",
  "Rainy day": "#a6e3d0",
};
const OWN = "__own";

/** Where the user is against the plan they set. */
function pace(g: Row): { text: string; behind?: boolean } {
  const left = g.target_cents - g.saved_cents;
  if (!g.target_cents) return { text: "Add prices or a target to start" };
  if (left <= 0) return { text: "You made it" };
  const days = daysUntil(g.target_date);
  if (days !== null) {
    if (days <= 0) return { text: `The date has passed with ${fmtMoney(left)} to go`, behind: true };
    const perWeek = fmtMoney(Math.ceil(left / Math.max(1, days / 7)));
    const start = g.created_on ? -(daysUntil(g.created_on) ?? 0) : null;
    if (start !== null && start > 0) {
      const expected = (g.target_cents * start) / (start + days);
      if (g.saved_cents < expected) return { text: `${fmtMoney(Math.round(expected - g.saved_cents))} behind. Save ${perWeek} a week to catch up`, behind: true };
      return { text: `On track. Keep to ${perWeek} a week` };
    }
    return { text: `Save ${perWeek} a week to get there by ${fmtDate(g.target_date)}` };
  }
  if (g.weekly_cents > 0) {
    const when = addDays(parse(today())!, Math.ceil(left / g.weekly_cents) * 7);
    return { text: `At ${fmtMoney(g.weekly_cents)} a week you'll have it by ${fmtDate(toDateStr(when))}` };
  }
  return { text: `${fmtMoney(left)} to go` };
}

function GoalCard({ goal: g, color, onEdit }: { goal: Row; color: string; onEdit: () => void }) {
  const mutate = useMutate();
  const items = useRows("goal_items", { goal_id: g.id }, "id").rows;
  const deposits = useRows("goal_deposits", { goal_id: g.id }, "id desc").rows;
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [amount, setAmount] = useState("");
  const [showItems, setShowItems] = useState(false);

  /** With priced items, the target is the total of the ticked ones. */
  const changeItems = (write: () => Promise<unknown>) =>
    mutate(async () => {
      await write();
      const now = await db.list("goal_items", { goal_id: g.id });
      if (now.length) await db.update("savings_goals", g.id, { target_cents: now.filter((i) => i.selected).reduce((s, i) => s + i.price_cents, 0) });
    });

  const move = async (sign: 1 | -1) => {
    const typed = toCents(amount);
    if (!typed || typed <= 0) return;
    const cents = sign === 1 ? typed : -Math.min(typed, g.saved_cents);
    if (!cents) return;
    await mutate(async () => {
      await db.insert("goal_deposits", { goal_id: g.id, amount_cents: cents, date: today() });
      await db.update("savings_goals", g.id, { saved_cents: g.saved_cents + cents });
    });
    setAmount("");
  };
  const last = deposits[0];
  const undo = () =>
    mutate(async () => {
      await db.remove("goal_deposits", last.id);
      await db.update("savings_goals", g.id, { saved_cents: Math.max(0, g.saved_cents - last.amount_cents) });
    });

  const done = pct(g.saved_cents, g.target_cents);
  const status = pace(g);
  const addPrice = toCents(price);

  return (
    <Card className="overflow-hidden">
      <div className="p-5" style={{ background: `linear-gradient(140deg, color-mix(in srgb, ${color} 50%, transparent), color-mix(in srgb, ${color} 10%, transparent))` }}>
        <div className="flex items-start gap-2">
          <h3 className="font-display min-w-0 flex-1 text-xl leading-tight">{g.name}</h3>
          <IconButton icon={Pencil} label="Edit goal" onClick={onEdit} />
        </div>
        <div className="mt-1 flex items-baseline gap-2">
          <span className="text-xl font-semibold tabular-nums">{fmtMoney(g.saved_cents)}</span>
          <span className="text-sm text-muted">of {fmtMoney(g.target_cents)}</span>
          <span className="ml-auto text-lg font-semibold">{done}%</span>
        </div>

        <MilestoneBar className="mt-3" value={g.saved_cents} max={g.target_cents} color={color} label={`${g.name}: ${done}% saved`} />
        <p className={cx("mt-3 text-xs", status.behind ? "text-danger" : "text-muted")}>{status.text}</p>
        <LinkChips type="savings_goals" id={g.id} />
      </div>

      <div className="space-y-3 p-4">
        <div className="flex items-center gap-1.5">
          <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && move(1)} placeholder="$ amount" className="h-9 min-w-0 flex-1" />
          <Button size="sm" variant="primary" className="h-9" disabled={!toCents(amount)} onClick={() => move(1)}>
            Saved it
          </Button>
          <Button size="sm" className="h-9" disabled={!toCents(amount) || !g.saved_cents} onClick={() => move(-1)}>
            Took out
          </Button>
        </div>
        {last && (
          <div className="flex items-center gap-1 text-[11px] text-muted">
            <span className="flex-1">
              Last: {fmtMoney(last.amount_cents, { sign: true })} on {fmtDate(last.date)}
            </span>
            <IconButton icon={Undo2} label="Undo the last one" onClick={undo} />
          </div>
        )}

        <button type="button" className="text-xs text-accent hover:underline" onClick={() => setShowItems(!showItems)}>
          {showItems ? "Hide prices" : items.length ? `${items.filter((i) => i.selected).length} of ${items.length} priced things selected` : "Add things and their prices"}
        </button>
        {showItems && (
          <div className="anim-item space-y-1">
            {items.map((i) => (
              <div key={i.id} className="flex items-center gap-2 rounded-2xl bg-surface-2/70 py-1.5 pr-1 pl-2 text-sm">
                <button
                  type="button"
                  aria-pressed={!!i.selected}
                  aria-label={`Include ${i.name}`}
                  onClick={() => changeItems(() => db.update("goal_items", i.id, { selected: i.selected ? 0 : 1 }))}
                  className={cx("flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2", i.selected ? "border-transparent bg-accent text-accent-fg" : "border-line")}
                >
                  {!!i.selected && <Check size={12} />}
                </button>
                <span className={cx("min-w-0 flex-1 truncate", !i.selected && "text-muted")}>{i.name}</span>
                <span className="tabular-nums">{fmtMoney(i.price_cents)}</span>
                <IconButton icon={X} label="Remove" onClick={() => changeItems(() => db.remove("goal_items", i.id))} />
              </div>
            ))}
            <form
              className="flex items-center gap-1.5 pt-1"
              onSubmit={async (e) => {
                e.preventDefault();
                if (!name.trim() || addPrice === null || addPrice < 0) return;
                await changeItems(() => db.insert("goal_items", { goal_id: g.id, name: name.trim(), price_cents: addPrice }));
                setName("");
                setPrice("");
              }}
            >
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Flights, hotel…" className="h-8 min-w-0 flex-1" />
              <Input inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} placeholder="$" className="h-8 w-20" />
              <IconButton type="submit" icon={Plus} label="Add price" disabled={!name.trim() || addPrice === null} />
            </form>
            <p className="text-[11px] text-muted">The target follows whatever you tick.</p>
          </div>
        )}
      </div>
    </Card>
  );
}

export function Saving() {
  const { rows } = useRows("savings_goals", undefined, "id");
  const items = useRows("goal_items").rows;
  const form = useFormState();
  const buckets = [...new Set([...Object.keys(BUCKETS), ...rows.map((r) => r.bucket as string)])];
  const colorOf = (b: string) => BUCKETS[b] ?? "#f4b8a6";
  const priced = !!form.record && items.some((i) => i.goal_id === form.record!.id);
  const saved = rows.reduce((s, g) => s + g.saved_cents, 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <div>
          <p className="font-display text-3xl">{fmtMoney(saved)}</p>
          <p className="text-sm text-muted">saved altogether</p>
        </div>
        <Button variant="primary" icon={Plus} className="ml-auto !rounded-full px-5" onClick={() => form.openNew()}>
          New goal
        </Button>
      </div>
      {!rows.length && (
        <Empty icon={PiggyBank} title="What are you saving for?">
          Pick a pot, add the prices of what's in it, and tick off savings as you go.
        </Empty>
      )}
      {buckets.map((b) => {
        const list = rows.filter((g) => g.bucket === b);
        return (
          <section key={b}>
            <div className="mb-2.5 flex items-center gap-2 px-1">
              <span className="h-3 w-3 rounded-full" style={{ background: colorOf(b) }} />
              <h2 className="font-display flex-1 text-lg">{b}</h2>
              {list.length > 0 && <span className="text-xs text-muted">{fmtMoney(list.reduce((s, g) => s + g.saved_cents, 0))}</span>}
              <IconButton icon={Plus} label={`Save for ${b}`} onClick={() => form.openNew({ bucket: b })} />
            </div>
            {list.length > 0 && (
              <div className="grid items-start gap-3 [grid-template-columns:repeat(auto-fill,minmax(310px,1fr))]">
                {list.map((g) => (
                  <GoalCard key={g.id} goal={g} color={colorOf(b)} onEdit={() => form.openEdit(g)} />
                ))}
              </div>
            )}
          </section>
        );
      })}
      <FormModal
        open={form.open}
        onClose={form.close}
        title={form.record ? "Edit goal" : "Start saving"}
        table="savings_goals"
        record={form.record}
        defaults={{ bucket: "Things I want", created_on: today(), ...form.defaults }}
        fields={[
          { key: "name", label: "Goal", type: "text", required: true, placeholder: "Japan grad trip" },
          {
            key: "bucket",
            label: "What kind of saving",
            type: "select",
            required: true,
            options: [...buckets.map((b) => ({ value: b, label: b, color: colorOf(b) })), { value: OWN, label: "Make my own" }],
          },
          { key: "own_bucket", label: "Name your own", type: "text", required: true, full: true, showIf: (v) => v.bucket === OWN },
          { key: "target_cents", label: "Price", type: "money", showIf: () => !priced, hint: "or add prices later" },
          { key: "weekly_cents", label: "I can save each week", type: "money" },
          { key: "target_date", label: "I want it by", type: "date", full: true },
          { key: "notes", label: "Notes", type: "text", full: true, more: true },
        ]}
        transform={(v) => {
          const { own_bucket, ...out } = v;
          if (v.bucket === OWN) out.bucket = own_bucket;
          if (priced) delete out.target_cents; // follows the ticked prices
          else out.target_cents = Math.max(0, v.target_cents ?? 0);
          delete out.saved_cents; // only the deposit buttons change this
          return out;
        }}
      />
    </div>
  );
}
