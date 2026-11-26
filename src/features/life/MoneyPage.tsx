import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Wallet, Plus, ChevronLeft, ChevronRight, Receipt, PieChart, PiggyBank, CalendarRange, Settings2, Bell, CheckCircle2, X } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useNamed, useRows } from "../../lib/hooks";
import { addMonths, fmtDate, fmtDateShort, monthKey, parse, today, toDateStr, countdown } from "../../lib/dates";
import { cx, fmtMoney, fromCents, pct, toCents } from "../../lib/format";
import { Badge, Button, Card, ConfirmDelete, Empty, Field, IconButton, Input, Modal, Page, PageHeader, Progress, Select, SWATCHES, Tabs } from "../../components/ui";
import { ChoiceField } from "../../components/pickers";
import { FormModal, useFormState } from "../../components/form";
import { LinkChips } from "../../components/linked";
import { toast } from "../../stores/toast";
import { Week } from "./money/Week";
import { Saving } from "./money/Saving";

type Tab = "week" | "saving" | "bills" | "month";

function MonthNav({ month, setMonth }: { month: Date; setMonth: (d: Date) => void }) {
  return (
    <div className="flex items-center gap-1">
      <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
      <span className="w-36 text-center text-sm font-medium">{month.toLocaleDateString(undefined, { month: "long", year: "numeric" })}</span>
      <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
    </div>
  );
}

export function nextBillDue(b: Row, from = today()): string | null {
  const anchor = parse(b.anchor_date);
  if (!anchor) return null;
  const n = Math.max(1, Number(b.every_n) || 1);
  for (let k = 0; k < 5000; k++) {
    let d: Date;
    if (b.freq === "weekly") d = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate() + 7 * n * k);
    else {
      const months = (b.freq === "yearly" ? 12 : 1) * n * k;
      const target = new Date(anchor.getFullYear(), anchor.getMonth() + months, 1);
      const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
      d = new Date(target.getFullYear(), target.getMonth(), Math.min(anchor.getDate(), last));
    }
    const s = toDateStr(d);
    if (s >= from) return s;
  }
  return null;
}

/* ------------------------------------------------------------- Budgets */
function Budgets({ month }: { month: Date }) {
  const mutate = useMutate();
  const mk = monthKey(month);
  const { rows } = useNamed("budgets_for_month", [mk]);
  const [edit, setEdit] = useState<{ category_id: number; name: string; amount: string; scope: "month" | "default" } | null>(null);
  const total = rows.reduce((s, r) => s + (r.month_cap_cents ?? r.default_cap_cents ?? 0), 0);
  const spent = rows.reduce((s, r) => s + r.spent_cents, 0);
  return (
    <div className="space-y-4">
      {total > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex justify-between text-sm">
            <span className="font-medium">Total budget</span>
            <span className="tabular-nums">
              {fmtMoney(spent)} / {fmtMoney(total)}
            </span>
          </div>
          <Progress value={spent} max={total} color={spent > total ? "#ef4444" : undefined} />
        </Card>
      )}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {rows.map((r) => {
          const cap = r.month_cap_cents ?? r.default_cap_cents;
          const over = cap != null && r.spent_cents > cap;
          return (
            <Card key={r.category_id} className="p-4">
              <div className="mb-2 flex items-center gap-2 text-sm">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: r.color }} />
                <span className="flex-1 font-medium">{r.name}</span>
                <span className={cx("tabular-nums", over && "font-semibold text-danger")}>
                  {fmtMoney(r.spent_cents)}
                  {cap != null && ` / ${fmtMoney(cap)}`}
                </span>
                <button
                  type="button"
                  className="text-xs text-accent hover:underline"
                  onClick={() => setEdit({ category_id: r.category_id, name: r.name, amount: fromCents(cap), scope: r.month_cap_cents != null ? "month" : "default" })}
                >
                  {cap != null ? "Edit cap" : "Set cap"}
                </button>
              </div>
              {cap != null ? (
                <>
                  <Progress value={r.spent_cents} max={cap} color={over ? "#ef4444" : pct(r.spent_cents, cap) > 80 ? "#f59e0b" : r.color} />
                  <div className="mt-1 text-xs text-muted">
                    {over ? `${fmtMoney(r.spent_cents - cap)} over` : `${fmtMoney(cap - r.spent_cents)} left`}
                    {r.month_cap_cents != null ? " · this month only" : " · every month"}
                  </div>
                </>
              ) : (
                <div className="text-xs text-muted">No cap set</div>
              )}
            </Card>
          );
        })}
      </div>
      <Modal
        open={!!edit}
        onClose={() => setEdit(null)}
        title={`Budget cap · ${edit?.name ?? ""}`}
        footer={
          <>
            <Button
              variant="danger"
              className="mr-auto"
              onClick={async () => {
                if (!edit) return;
                await mutate(db.removeWhere("budgets", edit.scope === "month" ? { category_id: edit.category_id, month: mk } : { category_id: edit.category_id, month: null }));
                setEdit(null);
              }}
            >
              Remove cap
            </Button>
            <Button variant="ghost" onClick={() => setEdit(null)}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={async () => {
                if (!edit) return;
                const cents = toCents(edit.amount);
                if (!cents || cents <= 0) return toast.error("Enter an amount greater than 0");
                const monthVal = edit.scope === "month" ? mk : null;
                await mutate(async () => {
                  await db.removeWhere("budgets", { category_id: edit.category_id, month: monthVal });
                  await db.insert("budgets", { category_id: edit.category_id, month: monthVal, cap_cents: cents });
                });
                setEdit(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        {edit && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Monthly cap">
              <Input inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} placeholder="0.00" autoFocus />
            </Field>
            <Field label="Applies to">
              <ChoiceField
                value={edit.scope}
                onChange={(v) => setEdit({ ...edit, scope: v as "month" | "default" })}
                options={[
                  { value: "default", label: "Every month" },
                  { value: "month", label: "This month only" },
                ]}
              />
            </Field>
          </div>
        )}
      </Modal>
    </div>
  );
}

/* ------------------------------------------------------------- Bills */
function Bills({ categories, wallets }: { categories: Row[]; wallets: Row[] }) {
  const mutate = useMutate();
  const { rows } = useRows("bills", undefined, "id");
  const form = useFormState();
  const [params, setParams] = useSearchParams();
  useEffect(() => {
    const id = params.get("id");
    if (id) {
      db.get("bills", Number(id)).then(form.openEdit).catch(() => undefined);
      params.delete("id");
      setParams(params, { replace: true });
    }
  }, [params]); // eslint-disable-line react-hooks/exhaustive-deps
  const sorted = [...rows].sort((a, b) => String(a.name).localeCompare(String(b.name)));
  const monthly = rows
    .filter((b) => b.active)
    .reduce((s, b) => s + (b.freq === "weekly" ? (b.amount_cents * 52) / 12 / b.every_n : b.freq === "yearly" ? b.amount_cents / 12 / b.every_n : b.amount_cents / b.every_n), 0);
  const logPayment = async (b: Row, due: string | null) => {
    await mutate(
      db.insert("transactions", {
        kind: "expense",
        amount_cents: b.amount_cents,
        date: today(),
        category_id: b.category_id,
        wallet_id: b.wallet_id,
        bill_id: b.id,
        notes: `${b.name}${due ? ` (due ${fmtDate(due)})` : ""}`,
      }),
    );
    toast.success(`Logged ${fmtMoney(b.amount_cents)} payment for ${b.name}`);
  };
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <span className="text-sm text-muted">
          ≈ <strong className="text-fg">{fmtMoney(Math.round(monthly))}</strong> per month in active bills & subscriptions
        </span>
        <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => form.openNew()}>
          Bill / subscription
        </Button>
      </div>
      {!rows.length && (
        <Empty icon={Receipt} title="No recurring bills">
          Track phone plans, subscriptions and fees. They appear on the calendar with optional reminders before renewal.
        </Empty>
      )}
      {sorted.map((b) => {
          const due = b.active ? nextBillDue(b) : null;
          return (
            <Card key={b.id} className={cx("flex items-center gap-4 p-4", !b.active && "opacity-50")}>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => form.openEdit(b)}>
                <div className="font-medium">{b.name}</div>
                <LinkChips type="bills" id={b.id} />
                <div className="text-sm text-muted">
                  {fmtMoney(b.amount_cents)} · every {b.every_n > 1 ? `${b.every_n} ` : ""}
                  {b.freq === "weekly" ? "week" : b.freq === "monthly" ? "month" : "year"}
                  {b.every_n > 1 ? "s" : ""}
                  {b.remind_days_before != null && (
                    <span className="ml-2 inline-flex items-center gap-0.5">
                      <Bell size={11} /> {b.remind_days_before}d before
                    </span>
                  )}
                </div>
              </div>
              {due ? (
                <div className="text-right text-sm">
                  <div>{fmtDateShort(due)}</div>
                  <div className="text-xs text-muted">{countdown(due)}</div>
                </div>
              ) : (
                <Badge>Paused</Badge>
              )}
              {b.active ? (
                <Button size="sm" icon={CheckCircle2} onClick={() => logPayment(b, due)}>
                  Log payment
                </Button>
              ) : null}
            </Card>
          );
      })}
      <FormModal
        open={form.open}
        onClose={form.close}
        title={form.record ? "Edit bill" : "New bill / subscription"}
        table="bills"
        record={form.record}
        defaults={{ freq: "monthly", every_n: 1, anchor_date: today(), active: 1, category_id: categories.find((c) => c.name === "Bills")?.id }}
        fields={[
          { key: "name", label: "Name", type: "text", required: true },
          { key: "amount_cents", label: "Amount", type: "money", required: true },
          {
            key: "freq",
            label: "Repeats",
            type: "select",
            required: true,
            options: [
              { value: "weekly", label: "Weekly" },
              { value: "monthly", label: "Monthly" },
              { value: "yearly", label: "Yearly" },
            ],
          },
          { key: "every_n", label: "Every how many", type: "number", hint: "1 = every time", more: true },
          { key: "anchor_date", label: "First / next due date", type: "date", required: true },
          {
            key: "remind_days_before",
            label: "Push reminder",
            type: "select",
            numeric: true,
            placeholder: "No reminder",
            options: [
              { value: 0, label: "On the due date" },
              { value: 1, label: "1 day before" },
              { value: 3, label: "3 days before" },
              { value: 7, label: "1 week before" },
            ],
          },
          { key: "category_id", label: "Category", type: "select", numeric: true, options: categories.filter((c) => c.kind === "expense").map((c) => ({ value: c.id, label: c.name })) },
          { key: "wallet_id", label: "Paid from", type: "select", numeric: true, options: wallets.map((w) => ({ value: w.id, label: w.name })) },
          { key: "active", label: "Status", type: "checkbox", placeholder: "Active", more: true },
          { key: "notes", label: "Notes", type: "text", full: true },
        ]}
        transform={(v) => {
          if (!v.amount_cents || v.amount_cents <= 0) throw new Error("Enter an amount greater than 0");
          return { ...v, every_n: Math.max(1, Number(v.every_n) || 1) };
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------- Summary */
function BarChart({ data }: { data: { label: string; income: number; expense: number }[] }) {
  const max = Math.max(1, ...data.flatMap((d) => [d.income, d.expense]));
  const H = 180;
  return (
    <div>
      <div className="flex h-[200px] items-end gap-4 border-b border-line px-2">
        {data.map((d) => (
          <div key={d.label} className="flex flex-1 flex-col items-center gap-1">
            <div className="flex w-full items-end justify-center gap-1" style={{ height: H }}>
              <div className="w-1/3 max-w-6 rounded-t bg-[#8fd1b8]" style={{ height: (d.income / max) * H }} title={`Income ${fmtMoney(d.income)}`} />
              <div className="w-1/3 max-w-6 rounded-t bg-[#f4a6c0]" style={{ height: (d.expense / max) * H }} title={`Expenses ${fmtMoney(d.expense)}`} />
            </div>
          </div>
        ))}
      </div>
      <div className="flex gap-4 px-2 pt-1">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-xs text-muted">
            {d.label}
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-4 text-xs text-muted">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#8fd1b8]" /> Income
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-[#f4a6c0]" /> Expenses
        </span>
      </div>
    </div>
  );
}

function Donut({ slices }: { slices: { name: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const R = 70;
  const C = 2 * Math.PI * R;
  let acc = 0;
  return (
    <div className="flex items-center gap-6">
      <svg viewBox="0 0 180 180" className="h-44 w-44 shrink-0 -rotate-90">
        <circle cx="90" cy="90" r={R} fill="none" stroke="var(--surface-2)" strokeWidth="26" />
        {slices.map((s) => {
          const len = (s.value / total) * C;
          const el = <circle key={s.name} cx="90" cy="90" r={R} fill="none" stroke={s.color} strokeWidth="26" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-acc} />;
          acc += len;
          return el;
        })}
      </svg>
      <ul className="flex-1 space-y-1.5 text-sm">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: s.color }} />
            <span className="flex-1">{s.name}</span>
            <span className="text-muted tabular-nums">{pct(s.value, total)}%</span>
            <span className="w-24 text-right tabular-nums">{fmtMoney(s.value)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Summary({ month }: { month: Date }) {
  const mk = monthKey(month);
  const first = monthKey(addMonths(month, -5));
  const byCat = useNamed("money_by_category", [mk]).rows;
  const totals = useNamed("money_monthly_totals", [first]).rows;
  const series = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => {
        const d = addMonths(month, i - 5);
        const k = monthKey(d);
        const t = totals.find((x) => x.month === k);
        return { label: d.toLocaleDateString(undefined, { month: "short" }), income: t?.income_cents ?? 0, expense: t?.expense_cents ?? 0 };
      }),
    [totals, month],
  );
  const cur = series[5];
  const expenses = byCat.filter((r) => r.kind === "expense").map((r, i) => ({ name: r.name, value: r.total_cents, color: r.color ?? SWATCHES[i % SWATCHES.length] }));
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-3 gap-4">
        <Card className="p-4">
          <div className="text-xs text-muted">Income</div>
          <div className="mt-1 text-xl font-semibold text-emerald-500 tabular-nums">{fmtMoney(cur.income)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Expenses</div>
          <div className="mt-1 text-xl font-semibold text-rose-500 tabular-nums">{fmtMoney(cur.expense)}</div>
        </Card>
        <Card className="p-4">
          <div className="text-xs text-muted">Net</div>
          <div className={cx("mt-1 text-xl font-semibold tabular-nums", cur.income - cur.expense < 0 && "text-danger")}>{fmtMoney(cur.income - cur.expense)}</div>
        </Card>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Income vs expenses (6 months)</h3>
          <BarChart data={series} />
        </Card>
        <Card className="p-5">
          <h3 className="mb-4 text-sm font-semibold">Spending by category</h3>
          {expenses.length ? <Donut slices={expenses} /> : <p className="text-sm text-muted">No expenses this month.</p>}
        </Card>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------- Setup (categories & wallets) */
function SetupModal({ open, onClose, categories, wallets }: { open: boolean; onClose: () => void; categories: Row[]; wallets: Row[] }) {
  const mutate = useMutate();
  const [cat, setCat] = useState({ name: "", kind: "expense", color: SWATCHES[0] });
  const [wal, setWal] = useState({ name: "", type: "Debit", opening: "" });
  return (
    <Modal open={open} onClose={onClose} title="Categories & wallets" width="max-w-2xl">
      <div className="grid grid-cols-2 gap-6">
        <div>
          <h3 className="mb-2 text-sm font-semibold">Categories</h3>
          <ul className="mb-3 max-h-64 space-y-1 overflow-y-auto">
            {categories.map((c) => (
              <li key={c.id} className="group flex items-center gap-2 text-sm">
                <input
                  type="color"
                  value={c.color ?? "#78716c"}
                  onChange={(e) => mutate(db.update("money_categories", c.id, { color: e.target.value }))}
                  className="h-5 w-5 cursor-pointer rounded border-0 bg-transparent"
                />
                <span className="flex-1">{c.name}</span>
                <span className="text-xs text-muted">{c.kind}</span>
                <IconButton icon={X} label="Delete category" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("money_categories", c.id))} />
              </li>
            ))}
          </ul>
          <form
            className="flex gap-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!cat.name.trim()) return;
              await mutate(db.insert("money_categories", { name: cat.name.trim(), kind: cat.kind, color: cat.color }));
              setCat({ ...cat, name: "" });
            }}
          >
            <Input value={cat.name} onChange={(e) => setCat({ ...cat, name: e.target.value })} placeholder="New category" className="h-8 flex-1" />
            <Select value={cat.kind} onChange={(e) => setCat({ ...cat, kind: e.target.value })} options={["expense", "income"]} className="h-8 w-28" />
            <IconButton icon={Plus} label="Add category" type="submit" />
          </form>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-semibold">Wallets & accounts</h3>
          <ul className="mb-3 space-y-1">
            {wallets.map((w) => (
              <li key={w.id} className="group flex items-center gap-2 text-sm">
                <span className={cx("flex-1", w.archived && "text-muted line-through")}>{w.name}</span>
                <span className="text-xs text-muted">{w.type}</span>
                <button type="button" className="text-xs text-muted hover:text-fg" onClick={() => mutate(db.update("wallets", w.id, { archived: w.archived ? 0 : 1 }))}>
                  {w.archived ? "Restore" : "Archive"}
                </button>
                <ConfirmDelete iconOnly label="Delete wallet" onConfirm={() => mutate(db.remove("wallets", w.id))} />
              </li>
            ))}
          </ul>
          <form
            className="space-y-1.5"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!wal.name.trim()) return;
              await mutate(db.insert("wallets", { name: wal.name.trim(), type: wal.type, opening_cents: toCents(wal.opening) ?? 0 }));
              setWal({ name: "", type: "Debit", opening: "" });
            }}
          >
            <div className="flex gap-1.5">
              <Input value={wal.name} onChange={(e) => setWal({ ...wal, name: e.target.value })} placeholder="New wallet" className="h-8 flex-1" />
              <Select value={wal.type} onChange={(e) => setWal({ ...wal, type: e.target.value })} options={["Cash", "Debit", "Credit", "Savings", "Other"]} className="h-8 w-28" />
            </div>
            <div className="flex gap-1.5">
              <Input value={wal.opening} onChange={(e) => setWal({ ...wal, opening: e.target.value })} placeholder="Opening balance" className="h-8 flex-1" />
              <Button size="sm" type="submit" icon={Plus} disabled={!wal.name.trim()}>
                Add
              </Button>
            </div>
          </form>
        </div>
      </div>
    </Modal>
  );
}

export default function MoneyPage() {
  const [params, setParams] = useSearchParams();
  const asked = params.get("tab");
  const tab: Tab = asked === "saving" || asked === "bills" || asked === "month" ? asked : "week";
  const setTab = (t: Tab) => setParams({ tab: t });
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [setup, setSetup] = useState(false);
  const categories = useRows("money_categories", undefined, "kind desc, name").rows;
  const wallets = useRows("wallets", undefined, "id").rows;
  const activeWallets = wallets.filter((w) => !w.archived);

  return (
    <>
      <PageHeader
        title="Money"
        icon={Wallet}
        subtitle="What you spend, and what you're saving for"
        actions={
          <>
            {tab === "month" && <MonthNav month={month} setMonth={setMonth} />}
            <IconButton icon={Settings2} label="Categories & wallets" onClick={() => setSetup(true)} />
          </>
        }
      >
        <Tabs<Tab>
          value={tab}
          onChange={setTab}
          tabs={[
            { value: "week", label: <span className="inline-flex items-center gap-1.5"><CalendarRange size={14} />This week</span> },
            { value: "saving", label: <span className="inline-flex items-center gap-1.5"><PiggyBank size={14} />Saving</span> },
            { value: "bills", label: <span className="inline-flex items-center gap-1.5"><Receipt size={14} />Bills</span> },
            { value: "month", label: <span className="inline-flex items-center gap-1.5"><PieChart size={14} />Month</span> },
          ]}
        />
      </PageHeader>
      <Page>
        {tab === "week" && <Week categories={categories} wallets={activeWallets} />}
        {tab === "saving" && <Saving />}
        {tab === "bills" && <Bills categories={categories} wallets={activeWallets} />}
        {tab === "month" && (
          <div className="space-y-5">
            <Summary month={month} />
            <Budgets month={month} />
          </div>
        )}
      </Page>
      <SetupModal open={setup} onClose={() => setSetup(false)} categories={categories} wallets={wallets} />
    </>
  );
}
