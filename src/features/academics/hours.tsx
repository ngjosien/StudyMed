// Hours for CCA, volunteering and clinical work, kept on the portfolio activity itself.
// An activity's hours = hours from before tracking + sessions logged here + (optionally)
// the length of every past event that matches it, e.g. all "CCA: Red Cross" events.
import { useMemo, useState } from "react";
import { Clock, Plus, Trash2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { fmtDate, fmtDateShort, parse, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Button, Card, Field, IconButton, Input, Modal } from "../../components/ui";
import { ChoiceField, DateField } from "../../components/pickers";
import { toast } from "../../stores/toast";
import { EVENT_TYPES, SCHOOL_KINDS } from "../life/EventsPage";

export const HOUR_KINDS = ["CCA", "Volunteering", "Clinical & shadowing"];
export const round1 = (n: number) => Math.round(n * 10) / 10;
export const fmtHours = (n: number) => `${round1(n).toLocaleString()} h`;

/** Which events an activity can count: every event type, and each school kind (the CCAs). */
export function useEventMatchOptions() {
  const events = useRows("events").rows;
  return useMemo(() => {
    const subs = new Set<string>(SCHOOL_KINDS.filter((k) => k.startsWith("CCA")));
    events.forEach((e) => e.subtype && subs.add(String(e.subtype)));
    return [
      ...[...subs].sort().map((s) => ({ value: `subtype:${s}`, label: `My "${s}" events` })),
      ...EVENT_TYPES.map((t) => ({ value: `type:${t}`, label: `All my ${t} events` })),
    ];
  }, [events]);
}

const minutesBetween = (a?: string | null, b?: string | null) => {
  const s = parse(a);
  const e = parse(b);
  return s && e && e > s ? (e.getTime() - s.getTime()) / 60_000 : 0;
};

export interface Hours {
  before: number;
  logged: number;
  fromEvents: number;
  total: number;
  sessions: number;
  events: Row[];
  logs: Row[];
  last: string | null;
}

/** Hours per portfolio activity. */
export function useActivityHours(entries: Row[]) {
  const logs = useRows("activity_logs", undefined, "date desc, id desc").rows;
  const events = useRows("events", undefined, "start_at desc").rows;
  return useMemo(() => {
    const now = new Date();
    const out = new Map<number, Hours>();
    for (const e of entries) {
      const mine = logs.filter((l) => l.entry_id === e.id);
      const [field, value] = String(e.count_events ?? "").split(/:(.*)/s);
      const matched = !e.count_events
        ? []
        : events.filter((ev) => {
            if ((field === "type" ? ev.type : ev.subtype) !== value) return false;
            const day = String(ev.start_at).slice(0, 10);
            if (e.start_date && day < e.start_date) return false;
            if (e.end_date && day > e.end_date) return false;
            return (parse(ev.end_at ?? ev.start_at) ?? now) <= now;
          });
      const before = Number(e.hours || 0);
      const logged = mine.reduce((s, l) => s + Number(l.hours), 0);
      const fromEvents = matched.reduce((s, ev) => s + minutesBetween(ev.start_at, ev.end_at) / 60, 0);
      const dates = [...mine.map((l) => String(l.date)), ...matched.map((ev) => String(ev.start_at).slice(0, 10))].sort();
      out.set(e.id, {
        before,
        logged,
        fromEvents,
        total: before + logged + fromEvents,
        sessions: mine.length + matched.length,
        events: matched,
        logs: mine,
        last: dates[dates.length - 1] ?? null,
      });
    }
    return out;
  }, [entries, logs, events]);
}

/* ------------------------------------------------------------ Log a session */
export function LogHoursModal({ entries, entryId, onClose }: { entries: Row[]; entryId?: number; onClose: () => void }) {
  const mutate = useMutate();
  const [entry, setEntry] = useState<number | null>(entryId ?? entries[0]?.id ?? null);
  const [date, setDate] = useState(today());
  const [hours, setHours] = useState("2");
  const [note, setNote] = useState("");
  const h = Number(hours);
  const save = async () => {
    if (!entry) return toast.error("Pick the activity");
    if (!(h > 0)) return toast.error("Enter how many hours");
    await mutate(db.insert("activity_logs", { entry_id: entry, date, hours: round1(h), note: note.trim() || null }));
    toast.success(`${fmtHours(h)} logged`);
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Log hours"
      width="max-w-md"
      footer={
        <Button variant="primary" className="!rounded-full px-6" onClick={save}>
          Log
        </Button>
      }
    >
      <div className="space-y-4 pb-2">
        {!entryId && (
          <Field label="Activity">
            <ChoiceField options={entries.map((e) => ({ value: e.id, label: e.title }))} value={entry} onChange={(v) => setEntry(v == null ? null : Number(v))} />
          </Field>
        )}
        <Field label="When">
          <DateField value={date} clearable={false} onChange={(d) => d && setDate(d)} />
        </Field>
        <Field label="Hours">
          <div className="flex flex-wrap items-center gap-1.5">
            {["1", "2", "3", "4", "6", "8"].map((v) => (
              <button
                type="button"
                key={v}
                onClick={() => setHours(v)}
                className={cx("rounded-full px-3 py-1.5 text-xs font-medium", hours === v ? "bg-accent text-accent-fg" : "bg-surface-2 hover:bg-accent-soft")}
              >
                {v}h
              </button>
            ))}
            <Input type="number" min={0.5} step={0.5} value={hours} onChange={(e) => setHours(e.target.value)} className="h-8 w-20" />
          </div>
        </Field>
        <Field label="What you did (optional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. First aid duty at the school sports day" />
        </Field>
      </div>
    </Modal>
  );
}

/* ------------------------------------------------------------ Summary strip on Portfolio */
export function HoursBoard({ entries, hours, onOpen, onLog }: { entries: Row[]; hours: Map<number, Hours>; onOpen: (id: number) => void; onLog: (id?: number) => void }) {
  const tracked = entries.filter((e) => HOUR_KINDS.includes(e.kind) || e.count_events || (hours.get(e.id)?.logged ?? 0) > 0);
  const sum = (k: string) => tracked.filter((e) => e.kind === k).reduce((s, e) => s + (hours.get(e.id)?.total ?? 0), 0);
  const year = String(new Date().getFullYear());
  const thisYear = tracked.reduce((s, e) => {
    const h = hours.get(e.id);
    if (!h) return s;
    const logged = h.logs.filter((l) => String(l.date).startsWith(year)).reduce((n, l) => n + Number(l.hours), 0);
    const ev = h.events.filter((x) => String(x.start_at).startsWith(year)).reduce((n, x) => n + minutesBetween(x.start_at, x.end_at) / 60, 0);
    return s + logged + ev;
  }, 0);
  return (
    <section>
      <div className="mb-3 flex items-center gap-2 px-1">
        <h2 className="font-display flex flex-1 items-center gap-2 text-xl">
          <Clock size={16} className="text-accent" /> Hours
        </h2>
        <Button size="sm" icon={Plus} onClick={() => onLog()} disabled={!tracked.length}>
          Log hours
        </Button>
      </div>
      <div className="mb-3 grid grid-cols-2 gap-2.5 md:grid-cols-4">
        {[
          [fmtHours(sum("CCA")), "CCA"],
          [fmtHours(sum("Volunteering")), "Volunteering"],
          [fmtHours(sum("Clinical & shadowing")), "Clinical & shadowing"],
          [fmtHours(thisYear), `Logged in ${year}`],
        ].map(([n, label]) => (
          <Card key={label} className="px-4 py-3">
            <div className="font-display tabular text-2xl">{n}</div>
            <div className="text-xs text-muted">{label}</div>
          </Card>
        ))}
      </div>
      {!tracked.length ? (
        <p className="px-1 text-sm text-muted">Add a CCA, volunteering or clinical experience and its hours add up here: log each session, or let it count your matching events.</p>
      ) : (
        <div className="grid gap-2.5 md:grid-cols-2 xl:grid-cols-3">
          {tracked.map((e) => {
            const h = hours.get(e.id)!;
            const ongoing = !e.end_date || e.end_date >= today();
            return (
              <Card key={e.id} onClick={() => onOpen(e.id)} className="flex items-center gap-3 p-4">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow !text-[9.5px]">
                    {e.kind}
                    {ongoing ? " · ongoing" : ""}
                  </p>
                  <p className="truncate font-semibold">{e.title}</p>
                  <p className="text-xs text-muted">
                    {h.sessions} session{h.sessions === 1 ? "" : "s"}
                    {h.last ? ` · last ${fmtDateShort(h.last)}` : ""}
                    {e.count_events ? " · counts events" : ""}
                  </p>
                </div>
                <div className="text-right">
                  <div className="font-display tabular text-xl">{fmtHours(h.total)}</div>
                  {ongoing && (
                    <button
                      type="button"
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onLog(e.id);
                      }}
                      className="mt-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-medium text-accent hover:bg-accent hover:text-accent-fg"
                    >
                      + Log
                    </button>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------ Inside an activity */
export function HoursDetail({ entry, h, onLog }: { entry: Row; h: Hours | undefined; onLog: () => void }) {
  const mutate = useMutate();
  if (!h) return null;
  const rows = [
    ...h.logs.map((l) => ({ key: `l${l.id}`, date: String(l.date), hours: Number(l.hours), what: l.note || "Session", log: l as Row | null })),
    ...h.events.map((ev) => ({ key: `e${ev.id}`, date: String(ev.start_at).slice(0, 10), hours: minutesBetween(ev.start_at, ev.end_at) / 60, what: ev.name, log: null })),
  ].sort((a, b) => b.date.localeCompare(a.date));
  const untimed = h.events.filter((ev) => !minutesBetween(ev.start_at, ev.end_at)).length;
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <h3 className="flex-1 text-sm font-semibold">Hours · {fmtHours(h.total)}</h3>
        <Button size="sm" icon={Plus} onClick={onLog}>
          Log hours
        </Button>
      </div>
      <p className="mb-2 text-xs text-muted">
        {[h.before ? `${fmtHours(h.before)} from before` : null, h.logged ? `${fmtHours(h.logged)} logged` : null, entry.count_events ? `${fmtHours(h.fromEvents)} from events` : null].filter(Boolean).join(" · ") ||
          "Nothing logged yet."}
        {untimed > 0 && ` ${untimed} matching event${untimed > 1 ? "s have" : " has"} no end time, so ${untimed > 1 ? "they don't" : "it doesn't"} count yet.`}
      </p>
      <ul className="max-h-72 space-y-0.5 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.key} className="group flex items-center gap-3 rounded-xl px-2 py-1.5 text-sm hover:bg-surface-2">
            <span className="w-20 shrink-0 text-xs text-muted">{fmtDate(r.date)}</span>
            <span className="min-w-0 flex-1 truncate">
              {r.what}
              {!r.log && <span className="ml-1.5 text-[10px] text-muted uppercase">event</span>}
            </span>
            <span className="tabular shrink-0 text-xs font-medium">{fmtHours(r.hours)}</span>
            {r.log ? (
              <IconButton icon={Trash2} label="Remove" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("activity_logs", r.log!.id))} />
            ) : (
              <span className="w-7" />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
