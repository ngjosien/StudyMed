import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ChevronLeft, ChevronRight, Plus, Target, Wallet } from "lucide-react";
import { db, type Row } from "../../../lib/api";
import { useMutate, useNamed, useRows } from "../../../lib/hooks";
import { addDays, fmtDateShort, parse, startOfWeek, toDateStr, today } from "../../../lib/dates";
import { cx, fmtMoney, fromCents, toCents } from "../../../lib/format";
import { Button, Card, Empty, IconButton, Input, Modal, Progress } from "../../../components/ui";
import { FormModal, useFormState, type FormState } from "../../../components/form";
import { LinkChips, LinkedSections } from "../../../components/linked";
import { toast } from "../../../stores/toast";

/** The categories the user asked for come first. */
const FIRST = ["Social", "Relationship", "Food"];
const rank = (c: Row) => {
  const i = FIRST.indexOf(c.name);
  return i < 0 ? FIRST.length : i;
};
const byPriority = (list: Row[]) => [...list].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));

const KINDS = ["events", "people", "savings_goals", "modules", "todos"];

export function TxForm({ state, categories, wallets }: { state: FormState; categories: Row[]; wallets: Row[] }) {
  const options = (kind: string) => byPriority(categories.filter((c) => c.kind === kind)).map((c) => ({ value: c.id, label: c.name, color: c.color }));
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit money" : "Log money"}
      table="transactions"
      record={state.record}
      defaults={{ kind: "expense", date: today(), wallet_id: wallets[0]?.id, ...state.defaults }}
      fields={[
        { key: "amount_cents", label: "How much", type: "money", required: true },
        {
          key: "kind",
          label: "Spent or received",
          type: "select",
          required: true,
          options: [
            { value: "expense", label: "Spent" },
            { value: "income", label: "Received" },
          ],
        },
        { key: "category_id", label: "On what", type: "select", numeric: true, full: true, options: options("expense"), showIf: (v) => v.kind !== "income" },
        { key: "category_id", label: "From what", type: "select", numeric: true, full: true, options: options("income"), showIf: (v) => v.kind === "income" },
        { key: "date", label: "When", type: "date", required: true, full: true },
        { key: "notes", label: "What was it", type: "text", full: true, placeholder: "Bubble tea with friends" },
        { key: "wallet_id", label: "Wallet", type: "select", numeric: true, full: true, more: true, options: wallets.map((w) => ({ value: w.id, label: w.name })) },
      ]}
      transform={(v) => {
        if (!v.amount_cents || v.amount_cents <= 0) throw new Error("Enter an amount greater than 0");
        const cat = categories.find((c) => c.id === v.category_id);
        // Left over from switching between spent and received.
        return cat && cat.kind !== v.kind ? { ...v, category_id: null } : v;
      }}
    />
  );
}

function LimitModal({ target, onClose }: { target: { id: number | null; name: string; row?: Row }; onClose: () => void }) {
  const mutate = useMutate();
  const [amount, setAmount] = useState(fromCents(target.row?.cap_cents));
  const save = async () => {
    const cents = toCents(amount);
    if (!cents || cents <= 0) return toast.error("Enter an amount greater than 0");
    await mutate(async () => {
      if (target.row) await db.update("weekly_limits", target.row.id, { cap_cents: cents });
      else await db.insert("weekly_limits", { category_id: target.id, cap_cents: cents });
    });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`Weekly limit: ${target.name}`}
      width="max-w-sm"
      footer={
        <>
          {target.row && (
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                await mutate(db.remove("weekly_limits", target.row!.id));
                onClose();
              }}
            >
              Remove
            </Button>
          )}
          <Button variant="primary" className="!rounded-full px-6" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <Input autoFocus inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} placeholder="$ per week" className="h-14 w-full text-xl" />
    </Modal>
  );
}

export function Week({ categories, wallets }: { categories: Row[]; wallets: Row[] }) {
  const [start, setStart] = useState(() => startOfWeek(new Date()));
  const days = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(start, i)));
  const { rows: fromStart } = useRows("transactions", { date: { gte: days[0] } }, "date desc, id desc");
  const rows = fromStart.filter((r) => r.date <= days[6]);
  const limits = useRows("weekly_limits").rows;
  const balances = useNamed("wallet_balances").rows;
  const form = useFormState();
  const [editing, setEditing] = useState<{ id: number | null; name: string; row?: Row } | null>(null);
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    if (!params.get("new")) return;
    form.openNew();
    const next = new URLSearchParams(params);
    next.delete("new");
    setParams(next, { replace: true });
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps

  const out = rows.filter((r) => r.kind === "expense");
  const sum = (list: Row[]) => list.reduce((s, r) => s + r.amount_cents, 0);
  const spent = sum(out);
  const received = sum(rows.filter((r) => r.kind === "income"));
  const whole = limits.find((l) => l.category_id == null);
  const perDay = days.map((d) => sum(out.filter((r) => r.date === d)));
  const top = Math.max(1, ...perDay);
  const t = today();
  const isThisWeek = days.includes(t);
  const daysLeft = isThisWeek ? 7 - days.indexOf(t) : 0;
  const byId = new Map(categories.map((c) => [c.id, c]));
  const cats = categories.filter((c) => c.kind === "expense");
  const sorted = byPriority(cats);

  return (
    <div className="space-y-4">
      <Card className="overflow-hidden">
        <div className="grid gap-6 p-6 lg:grid-cols-[1fr_1.2fr]" style={{ background: "linear-gradient(130deg, var(--accent-soft), transparent)" }}>
          <div>
            <div className="-ml-2 flex items-center gap-1 text-sm">
              <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setStart(addDays(start, -7))} />
              <button type="button" onClick={() => setStart(startOfWeek(new Date()))} className="hover:text-accent">
                {fmtDateShort(days[0])} to {fmtDateShort(days[6])}
              </button>
              <IconButton icon={ChevronRight} label="Next week" onClick={() => setStart(addDays(start, 7))} />
            </div>
            <p className="font-display mt-3 text-4xl">{fmtMoney(spent)}</p>
            <p className="text-sm text-muted">
              spent{whole ? ` of ${fmtMoney(whole.cap_cents)}` : ""}
              {received > 0 && `, ${fmtMoney(received)} received`}
            </p>
            {whole && (
              <>
                <Progress className="mt-3 !h-3" value={spent} max={whole.cap_cents} color={spent > whole.cap_cents ? "var(--danger)" : undefined} />
                <p className={cx("mt-1.5 text-xs", spent > whole.cap_cents ? "text-danger" : "text-muted")}>
                  {spent > whole.cap_cents
                    ? `${fmtMoney(spent - whole.cap_cents)} over`
                    : `${fmtMoney(whole.cap_cents - spent)} left${daysLeft ? `, about ${fmtMoney(Math.floor((whole.cap_cents - spent) / daysLeft))} a day` : ""}`}
                </p>
              </>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="primary" icon={Plus} className="!rounded-full px-5" onClick={() => form.openNew(isThisWeek ? undefined : { date: days[0] })}>
                Log spending
              </Button>
              <Button icon={Target} className="!rounded-full" onClick={() => setEditing({ id: null, name: "whole week", row: whole })}>
                {whole ? "Change limit" : "Set weekly limit"}
              </Button>
            </div>
          </div>
          <div className="flex items-end gap-2">
            {days.map((d, i) => (
              <button type="button" key={d} title={`${fmtDateShort(d)}: ${fmtMoney(perDay[i])}`} onClick={() => form.openNew({ date: d })} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="text-[10px] text-muted">{perDay[i] ? fmtMoney(perDay[i]) : ""}</span>
                <span className="flex h-32 w-full max-w-10 items-end overflow-hidden rounded-full bg-surface-2">
                  <span className="w-full rounded-full bg-accent transition-[height] duration-500" style={{ height: `${perDay[i] ? Math.max(12, (perDay[i] / top) * 100) : 0}%` }} />
                </span>
                <span className={cx("text-[11px]", d === t ? "font-semibold text-accent" : "text-muted")}>{parse(d)!.toLocaleDateString(undefined, { weekday: "short" })}</span>
              </button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(160px,1fr))]">
        {sorted.map((c) => {
          const value = sum(out.filter((r) => r.category_id === c.id));
          const cap = limits.find((l) => l.category_id === c.id);
          const color = c.color ?? "#b8c0cc";
          return (
            <div key={c.id} className="anim-item rounded-[16px] p-3.5" style={{ background: `color-mix(in srgb, ${color} ${value ? 38 : 16}%, transparent)` }}>
              <button type="button" className="w-full text-left" onClick={() => form.openNew({ category_id: c.id })}>
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} />
                  <span className="truncate">{c.name}</span>
                </span>
                <span className="mt-1 block text-xl font-semibold tabular-nums">{fmtMoney(value)}</span>
              </button>
              {cap && <Progress className="my-1.5" value={value} max={cap.cap_cents} color={value > cap.cap_cents ? "var(--danger)" : color} />}
              <button type="button" className="text-[11px] text-muted hover:text-accent" onClick={() => setEditing({ id: c.id, name: c.name, row: cap })}>
                {cap ? `${value > cap.cap_cents ? "Over" : "Limit"} ${fmtMoney(cap.cap_cents)}` : "Set limit"}
              </button>
            </div>
          );
        })}
      </div>

      <LinkedSections
        type="transactions"
        rows={rows}
        kinds={KINDS}
        heading={(r) => fmtDateShort(r.date)}
        empty={
          <Empty icon={Wallet} title="Nothing logged this week">
            Tap a category to log what you spent on it.
          </Empty>
        }
        render={(r) => {
          const c = byId.get(r.category_id);
          return (
            <Card onClick={() => form.openEdit(r)} className="flex items-center gap-3 px-4 py-2.5">
              <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: c?.color ?? "#b8c0cc" }} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{r.notes || c?.name || (r.kind === "income" ? "Received" : "Spent")}</div>
                <div className="text-xs text-muted">{c?.name}</div>
                <LinkChips type="transactions" id={r.id} />
              </div>
              <span className="font-semibold tabular-nums">{fmtMoney(r.kind === "income" ? r.amount_cents : -r.amount_cents, { sign: true })}</span>
            </Card>
          );
        }}
      />

      <div className="flex flex-wrap gap-2">
        {balances
          .filter((w) => !w.archived)
          .map((w) => (
            <span key={w.id} className="glass rounded-full px-4 py-1.5 text-xs">
              {w.name} <strong className={cx("ml-1", w.balance_cents < 0 && "text-danger")}>{fmtMoney(w.balance_cents)}</strong>
            </span>
          ))}
      </div>

      <TxForm state={form} categories={categories} wallets={wallets} />
      {editing && <LimitModal target={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
