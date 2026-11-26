// Fixed sorting for every list page: "All", then the pages its records link to.
import { useState, type ReactNode } from "react";
import type { Row } from "../lib/api";
import { useRows } from "../lib/hooks";
import { RECORDS } from "../lib/records";
import { cx } from "../lib/format";
import { RecordChip } from "./connections";

export function SortPills({ kinds, value, onChange, counts }: { kinds: string[]; value: string; onChange: (v: string) => void; counts?: Record<string, number> }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Sort by linked page">
      {["all", ...kinds].map((k) => {
        const kind = RECORDS[k];
        return (
          <button
            type="button"
            role="tab"
            key={k}
            aria-selected={k === value}
            onClick={() => onChange(k)}
            className={cx(
              "inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-medium",
              k === value ? "bg-accent text-accent-fg shadow-sm" : "glass hover:bg-accent-soft",
            )}
          >
            {kind && <kind.icon size={13} />}
            {kind?.label ?? "All"}
            {!!counts?.[k] && <span className="opacity-70">{counts[k]}</span>}
          </button>
        );
      })}
    </div>
  );
}

interface Props {
  type: string;
  rows: Row[];
  /** The pages this list can be sorted by. */
  kinds: string[];
  render: (r: Row) => ReactNode;
  empty: ReactNode;
  grid?: string;
  /** Headings used on the All tab. */
  heading?: (r: Row) => string;
  tab?: string;
  onTab?: (t: string) => void;
}

export function LinkedSections({ type, rows, kinds, render, empty, grid = "space-y-2", heading, tab: controlled, onTab }: Props) {
  const [inner, setInner] = useState("all");
  const tab = controlled ?? inner;
  const links = useRows("connections", { from_type: type }).rows;
  const here = new Map(rows.map((r) => [r.id as number, r]));

  const counts: Record<string, number> = {};
  for (const k of kinds) counts[k] = new Set(links.filter((l) => l.to_type === k && here.has(l.from_id)).map((l) => l.from_id)).size;

  const sections = new Map<string, { head: ReactNode; items: Row[] }>();
  const put = (key: string, head: ReactNode, r: Row) => {
    const s = sections.get(key) ?? { head, items: [] };
    if (!s.items.includes(r)) s.items.push(r);
    sections.set(key, s);
  };
  if (tab === "all") {
    for (const r of rows) {
      const h = heading?.(r) ?? "";
      put(h, h && <h2 className="font-display text-lg font-semibold">{h}</h2>, r);
    }
  } else {
    // One section per linked record, keeping the page's own order inside it.
    for (const r of rows) {
      for (const l of links) {
        if (l.from_id === r.id && l.to_type === tab) put(String(l.to_id), <RecordChip target={{ type: tab, id: l.to_id }} />, r);
      }
    }
  }

  return (
    <div className="space-y-5">
      <SortPills kinds={kinds} value={tab} onChange={onTab ?? setInner} counts={counts} />
      {!rows.length ? (
        empty
      ) : !sections.size ? (
        <p className="glass rounded-[16px] p-8 text-center text-sm text-muted">
          Nothing here is linked to {RECORDS[tab]?.label} yet. Open one and choose “What's it for?”.
        </p>
      ) : (
        [...sections].map(([key, s]) => (
          <section key={`${tab}:${key}`} className="anim-item">
            {s.head && <div className="mb-2.5 px-1">{s.head}</div>}
            <div className={grid}>
              {s.items.map((r) => (
                <div key={r.id} className="min-w-0">
                  {render(r)}
                </div>
              ))}
            </div>
          </section>
        ))
      )}
    </div>
  );
}

/** Small chips on a card showing what it's linked to. */
export function LinkChips({ type, id, skip = [], max = 4 }: { type: string; id: number; skip?: string[]; max?: number }) {
  const { rows } = useRows("connections", { from_type: type, from_id: id });
  const seen = new Map(rows.filter((r) => !skip.includes(r.to_type)).map((r) => [`${r.to_type}:${r.to_id}`, r]));
  if (!seen.size) return null;
  return (
    <div className="mt-2 flex flex-wrap items-center gap-1">
      {[...seen].slice(0, max).map(([key, r]) => (
        <RecordChip key={key} target={{ type: r.to_type, id: r.to_id }} />
      ))}
      {seen.size > max && <span className="text-xs text-muted">+{seen.size - max}</span>}
    </div>
  );
}
