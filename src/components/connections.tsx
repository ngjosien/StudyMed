// "Connect to another page": one link, visible from both records.
import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Link2, X } from "lucide-react";
import { db, type Row } from "../lib/api";
import { useMutate, useRows } from "../lib/hooks";
import { RECORDS, routeOf } from "../lib/records";
import { cx } from "../lib/format";
import { Input, Popover } from "./ui";

export interface Ref {
  type: string;
  id: number;
}

export async function saveLinks(type: string, id: number, refs: Ref[]) {
  for (const r of refs) await db.insert("record_links", { a_type: type, a_id: id, b_type: r.type, b_id: r.id });
}

/** Types linked to each record of `type`, for the filter tabs on pages. */
export function useLinkedTypes(type: string) {
  const { rows } = useRows("connections", { from_type: type });
  return useMemo(() => {
    const m = new Map<number, Set<string>>();
    rows.forEach((r) => m.set(r.from_id, (m.get(r.from_id) ?? new Set<string>()).add(r.to_type)));
    return m;
  }, [rows]);
}

export function RecordChip({ target, onRemove, navigable = true }: { target: Ref; onRemove?: () => void; navigable?: boolean }) {
  const nav = useNavigate();
  const kind = RECORDS[target.type];
  const rows = useRows(target.type, undefined, undefined, !!kind).rows;
  const row = rows.find((r) => r.id === target.id);
  if (!kind || !row) return null;
  const route = navigable ? routeOf(target.type, target.id) : null;
  const go = () => route && nav(route);
  return (
    <span className="anim-item inline-flex max-w-full items-center gap-1.5 rounded-full py-1 pr-2.5 pl-1.5 text-xs" style={{ background: `color-mix(in srgb, ${kind.color} 28%, transparent)` }}>
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full" style={{ background: kind.color, color: "#3a2330" }}>
        <kind.icon size={11} />
      </span>
      <span
        role={route ? "link" : undefined}
        tabIndex={route ? 0 : undefined}
        onClick={(e) => {
          if (!route) return;
          e.stopPropagation();
          go();
        }}
        onKeyDown={(e) => e.key === "Enter" && go()}
        className={cx("max-w-56 truncate", route && "cursor-pointer hover:underline")}
        title={`${kind.label}: ${kind.title(row)}`}
      >
        {kind.title(row)}
      </span>
      {onRemove && (
        <button
          type="button"
          aria-label="Remove link"
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          className="text-muted hover:text-danger"
        >
          <X size={12} />
        </button>
      )}
    </span>
  );
}

export function LinkPicker({
  self,
  linked,
  onToggle,
  only,
}: {
  self: { type: string; id?: number | null };
  linked: Ref[];
  onToggle: (r: Ref, on: boolean) => void;
  only?: string[];
}) {
  const kinds = only ?? Object.keys(RECORDS);
  const [type, setType] = useState(kinds[0]);
  const [q, setQ] = useState("");
  const kind = RECORDS[type];
  const all = useRows(type, type === "todos" ? { parent_id: null } : undefined, "id desc").rows;
  const list: Row[] = all.filter((r) => !(type === self.type && r.id === self.id) && String(kind.title(r)).toLowerCase().includes(q.toLowerCase()));
  return (
    <div className="p-1.5">
      <div className="mb-2 flex flex-wrap gap-1">
        {kinds.map((k) => {
          const K = RECORDS[k];
          return (
            <button
              type="button"
              key={k}
              onClick={() => setType(k)}
              className={cx("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px]", k === type ? "bg-accent text-accent-fg" : "bg-surface-2 hover:bg-accent-soft")}
            >
              <K.icon size={11} />
              {K.label}
            </button>
          );
        })}
      </div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={`Search ${kind.label.toLowerCase()}`} />
      <div className="mt-1.5 max-h-52 overflow-y-auto">
        {!list.length && <p className="p-3 text-center text-xs text-muted">Nothing in {kind.label} yet.</p>}
        {list.map((r) => {
          const on = linked.some((l) => l.type === type && l.id === r.id);
          return (
            <button type="button" key={r.id} onClick={() => onToggle({ type, id: r.id }, !on)} className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-sm hover:bg-accent-soft">
              <span className="flex-1 truncate">{kind.title(r)}</span>
              {on && <Check size={14} className="text-accent" />}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Existing record: saves straight away. New record: keeps links in `pending`
 * until the parent has an id and calls `saveLinks`.
 */
export function Connections({
  type,
  id,
  pending = [],
  setPending,
  only,
}: {
  type: string;
  id?: number | null;
  pending?: Ref[];
  setPending?: (r: Ref[]) => void;
  only?: string[];
}) {
  const mutate = useMutate();
  const stored = useRows("connections", { from_type: type, from_id: id ?? -1 }, undefined, id != null).rows;
  const items = useMemo(() => {
    if (id == null) return pending.map((r) => ({ ...r, linkId: null as number | null }));
    const m = new Map<string, Ref & { linkId: number | null }>();
    stored.forEach((r) => {
      const key = `${r.to_type}:${r.to_id}`;
      if (!m.get(key)?.linkId) m.set(key, { type: r.to_type, id: r.to_id, linkId: r.link_id });
    });
    return [...m.values()];
  }, [id, pending, stored]);

  const toggle = (target: Ref, on: boolean) => {
    if (id == null) {
      setPending?.(on ? [...pending, target] : pending.filter((p) => p.type !== target.type || p.id !== target.id));
      return;
    }
    const found = items.find((i) => i.type === target.type && i.id === target.id);
    if (on) void mutate(saveLinks(type, id, [target])).catch(() => undefined);
    else if (found?.linkId) void mutate(db.remove("record_links", found.linkId)).catch(() => undefined);
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {items.map((i) => (
        <RecordChip key={`${i.type}:${i.id}`} target={i} navigable={id != null} onRemove={id == null || i.linkId ? () => toggle(i, false) : undefined} />
      ))}
      <Popover
        width={390}
        trigger={({ toggle: open }) => (
          <button type="button" onClick={open} className="inline-flex items-center gap-1.5 rounded-full border border-dashed border-accent/50 px-3 py-1.5 text-xs text-accent hover:bg-accent-soft">
            <Link2 size={13} /> Connect to a page
          </button>
        )}
      >
        <LinkPicker self={{ type, id }} linked={items} onToggle={toggle} only={only} />
      </Popover>
    </div>
  );
}
