// Weekly allowance: set once, and each payday it's logged as income automatically.
// The only thing StudyMed adds by itself, and only because the user switched it on.
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { db } from "./api";
import { addDays, startOfWeek, toDateStr, today } from "./dates";
import { useUI } from "../stores/ui";

export interface Allowance {
  cents: number;
  /** 0 = Monday. */
  weekday: number;
  walletId: number | null;
  /** First payday that counts. */
  since: string;
  /** Last payday already logged. */
  lastPaid: string | null;
}
export const ALLOWANCE_KEY = "money.allowance";

/** This week's payday for a weekday (may be later this week). */
export const paydayThisWeek = (weekday: number) => toDateStr(addDays(startOfWeek(new Date()), weekday));

/** Paydays from `since` (or after the last paid one) up to today. */
export function duePaydays(a: Allowance): string[] {
  const out: string[] = [];
  const t = today();
  let d = new Date(`${a.lastPaid ? toDateStr(addDays(new Date(`${a.lastPaid}T12:00`), 7)) : a.since}T12:00`);
  // Never back-fill more than a year, in case the date was set oddly.
  for (let i = 0; i < 53; i++) {
    const s = toDateStr(d);
    if (s > t) break;
    out.push(s);
    d = addDays(d, 7);
  }
  return out;
}

let running = false;
/** Logs any allowance paydays that have come since the app last ran. */
export function useAllowance() {
  const qc = useQueryClient();
  const a = useUI((s) => s.settings[ALLOWANCE_KEY]) as Allowance | undefined;
  useEffect(() => {
    if (!a || !(a.cents > 0) || running) return;
    const due = duePaydays(a);
    if (!due.length) return;
    running = true;
    (async () => {
      try {
        const cats = await db.list("money_categories", { kind: "income" });
        const cat = cats.find((c) => c.name === "Allowance") ?? cats[0];
        for (const date of due) {
          // Already logged (e.g. the app closed half-way last time)? Skip it.
          const have = await db.list("transactions", { date, kind: "income", notes: "Weekly allowance" });
          if (have.length) continue;
          await db.insert("transactions", { kind: "income", amount_cents: a.cents, date, wallet_id: a.walletId, category_id: cat?.id ?? null, notes: "Weekly allowance" });
        }
        useUI.getState().setSetting(ALLOWANCE_KEY, { ...a, lastPaid: due[due.length - 1] });
        await qc.invalidateQueries();
      } finally {
        running = false;
      }
    })();
  }, [a, qc]);
}
