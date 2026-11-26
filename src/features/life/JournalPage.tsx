// A paper journal: date page on the left, writing page on the right.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { useSearchParams } from "react-router-dom";
import { NotebookPen, ChevronLeft, ChevronRight, PanelLeftClose, PanelLeftOpen, Check, Loader2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { addDays, addMonths, parse, startOfMonth, startOfWeek, toDateStr, today, weekdayLong, fmtMonth } from "../../lib/dates";
import { cx } from "../../lib/format";
import { useSetting } from "../../stores/ui";
import { Button, ConfirmDelete, IconButton, Input } from "../../components/ui";
import { Connections } from "../../components/connections";
import { LinkedSections } from "../../components/linked";

const MOODS = [
  { id: "glowing", label: "Glowing", color: "#f4a6c0" },
  { id: "happy", label: "Happy", color: "#f4d8a6" },
  { id: "calm", label: "Calm", color: "#a6e3d0" },
  { id: "tired", label: "Tired", color: "#b8c0cc" },
  { id: "low", label: "Low", color: "#a6c8f4" },
  { id: "stressed", label: "Stressed", color: "#f4b8a6" },
];
const LINE = 34;
const INK = "#40322f";
const PAPERS: { id: string; label: string; page: string; pattern?: string; size?: string }[] = [
  { id: "lined", label: "Lined", page: "#fdf8ee", pattern: `repeating-linear-gradient(transparent 0 ${LINE - 1}px, rgba(120,90,70,.17) ${LINE - 1}px ${LINE}px)` },
  { id: "dotted", label: "Dotted", page: "#fdfaf4", pattern: "radial-gradient(rgba(120,90,70,.3) 1px, transparent 1.4px)", size: `17px ${LINE / 2}px` },
  { id: "rose", label: "Rose", page: "#fff0f4", pattern: `repeating-linear-gradient(transparent 0 ${LINE - 1}px, rgba(210,100,143,.22) ${LINE - 1}px ${LINE}px)` },
  { id: "parchment", label: "Parchment", page: "#efe3c8" },
];
const serif: CSSProperties = { fontFamily: '"Garamond", "Playfair Display Variable", Georgia, serif' };

function MiniCalendar({ value, onPick, marked }: { value: string; onPick: (d: string) => void; marked: Map<string, string> }) {
  const [month, setMonth] = useState(() => startOfMonth(parse(value) ?? new Date()));
  useEffect(() => setMonth(startOfMonth(parse(value) ?? new Date())), [value]);
  const start = startOfWeek(month);
  const t = today();
  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <IconButton icon={ChevronLeft} label="Previous month" onClick={() => setMonth(addMonths(month, -1))} />
        <span className="text-sm font-medium">{fmtMonth(month)}</span>
        <IconButton icon={ChevronRight} label="Next month" onClick={() => setMonth(addMonths(month, 1))} />
      </div>
      <div className="grid grid-cols-7 gap-0.5">
        {Array.from({ length: 42 }, (_, i) => addDays(start, i)).map((d) => {
          const k = toDateStr(d);
          return (
            <button
              type="button"
              key={k}
              onClick={() => onPick(k)}
              className={cx(
                "flex h-8 items-center justify-center rounded-full text-xs",
                k === value && "ring-2 ring-accent",
                k === t && "font-semibold text-accent",
                d.getMonth() !== month.getMonth() && "opacity-40",
              )}
              style={marked.has(k) ? { background: marked.get(k), color: INK } : undefined}
            >
              {d.getDate()}
            </button>
          );
        })}
      </div>
    </div>
  );
}

interface Draft {
  title: string;
  body: string;
  mood: string | null;
  grateful: string;
  paper: string;
}

function Book({ date, entry, defaultPaper, onPaper }: { date: string; entry: Row | undefined; defaultPaper: string; onPaper: (p: string) => void }) {
  const mutate = useMutate();
  const blank: Draft = { title: "", body: "", mood: null, grateful: "", paper: defaultPaper };
  const [v, setV] = useState<Draft>(
    entry ? { title: entry.title ?? "", body: entry.body_md ?? "", mood: entry.mood ?? null, grateful: entry.grateful ?? "", paper: entry.paper ?? defaultPaper } : blank,
  );
  const [id, setId] = useState<number | undefined>(entry?.id);
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const idRef = useRef<number | undefined>(entry?.id);
  const latest = useRef(v);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // Saves run one after another, so a new day can't be inserted twice.
  const queue = useRef<Promise<void>>(Promise.resolve());

  const persist = () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    queue.current = queue.current.then(async () => {
      const d = latest.current;
      if (!idRef.current && !d.title.trim() && !d.body.trim() && !d.mood && !d.grateful.trim()) return setState("saved");
      setState("saving");
      const values = { title: d.title.trim() || null, body_md: d.body, mood: d.mood, grateful: d.grateful.trim() || null, paper: d.paper };
      try {
        if (idRef.current) await mutate(db.update("journal_entries", idRef.current, values));
        else {
          const r = await mutate(db.insert("journal_entries", { entry_date: date, ...values }));
          idRef.current = r.id;
          setId(r.id);
        }
        setState(timer.current ? "dirty" : "saved");
      } catch {
        setState("dirty");
      }
    });
  };
  const change = (patch: Partial<Draft>) => {
    latest.current = { ...latest.current, ...patch };
    setV(latest.current);
    setState("dirty");
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 700);
  };
  useEffect(
    () => () => {
      if (timer.current) persist();
    },
    [], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const erase = async () => {
    clearTimeout(timer.current);
    timer.current = undefined;
    await queue.current;
    if (!idRef.current) return;
    await mutate(db.remove("journal_entries", idRef.current));
    idRef.current = undefined;
    setId(undefined);
    latest.current = blank;
    setV(blank);
    setState("saved");
  };

  const d = parse(date)!;
  const paper = PAPERS.find((p) => p.id === v.paper) ?? PAPERS[0];
  const mood = MOODS.find((m) => m.id === v.mood);
  const words = v.body.trim() ? v.body.trim().split(/\s+/).length : 0;

  return (
    <div className="anim-page mx-auto flex min-h-full max-w-6xl flex-col p-5 lg:flex-row">
      <div
        className="flex shrink-0 flex-col gap-5 rounded-t-[26px] p-7 shadow-xl lg:w-[300px] lg:rounded-l-[26px] lg:rounded-tr-none"
        style={{ color: INK, background: `linear-gradient(165deg, ${mood?.color ?? "#f4cddb"}, ${paper.page} 78%)` }}
      >
        <div className="text-center">
          <p className="text-[11px] tracking-[0.25em] uppercase opacity-70">{weekdayLong(d)}</p>
          <p className="font-display text-[104px] leading-none">{d.getDate()}</p>
          <p className="text-xl italic" style={serif}>
            {fmtMonth(d)}
          </p>
        </div>
        <div>
          <p className="mb-2 text-[11px] tracking-widest uppercase opacity-60">Today I felt</p>
          <div className="flex flex-wrap gap-1.5">
            {MOODS.map((m) => (
              <button
                type="button"
                key={m.id}
                aria-pressed={v.mood === m.id}
                onClick={() => change({ mood: v.mood === m.id ? null : m.id })}
                className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs"
                style={{ background: v.mood === m.id ? m.color : "rgba(255,255,255,.5)", boxShadow: v.mood === m.id ? `inset 0 0 0 1.5px ${INK}` : undefined }}
              >
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: m.color }} />
                {m.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="mb-1 text-[11px] tracking-widest uppercase opacity-60">Grateful for</p>
          <textarea
            value={v.grateful}
            onChange={(e) => change({ grateful: e.target.value })}
            placeholder="three small things…"
            className="h-24 w-full resize-none rounded-2xl bg-white/40 px-3 py-2 text-lg italic outline-none placeholder:opacity-50"
            style={serif}
          />
        </div>
        {id && (
          <div style={{ "--color-accent": INK, "--accent": INK, "--fg": INK } as CSSProperties}>
            <p className="mb-1.5 text-[11px] tracking-widest uppercase opacity-60">Who & what it's about</p>
            <Connections type="journal_entries" id={id} />
          </div>
        )}
        <div className="mt-auto flex flex-wrap justify-center gap-1.5">
          {PAPERS.map((p) => (
            <button
              type="button"
              key={p.id}
              title={`${p.label} paper`}
              aria-label={`${p.label} paper`}
              onClick={() => {
                change({ paper: p.id });
                onPaper(p.id);
              }}
              className="h-7 w-7 rounded-full"
              style={{ backgroundColor: p.page, backgroundImage: p.pattern, backgroundSize: p.size, boxShadow: `inset 0 0 0 ${p.id === paper.id ? 2 : 1}px ${p.id === paper.id ? INK : "rgba(64,50,47,.25)"}` }}
            />
          ))}
        </div>
      </div>

      <div
        className="relative flex min-w-0 flex-1 flex-col rounded-b-[26px] px-8 pt-7 pb-6 shadow-xl lg:rounded-r-[26px] lg:rounded-bl-none lg:pl-12"
        style={{ color: INK, backgroundColor: paper.page }}
      >
        <span className="pointer-events-none absolute inset-y-0 left-0 hidden w-10 bg-gradient-to-r from-black/15 to-transparent lg:block" />
        <div className="flex h-8 items-center gap-2 text-xs opacity-70">
          <span className="ml-auto inline-flex items-center gap-1">
            {state === "saving" ? <Loader2 size={12} className="animate-spin" /> : state === "saved" ? <Check size={12} /> : null}
            {state === "dirty" ? "Unsaved" : state === "saving" ? "Saving" : `${words} words`}
          </span>
          {id && <ConfirmDelete iconOnly label="Delete entry" onConfirm={erase} />}
        </div>
        <input
          value={v.title}
          onChange={(e) => change({ title: e.target.value })}
          placeholder="Give today a title"
          className="font-display mb-4 w-full bg-transparent text-2xl outline-none placeholder:opacity-30"
        />
        <textarea
          value={v.body}
          autoFocus
          onChange={(e) => change({ body: e.target.value })}
          onBlur={() => timer.current && persist()}
          placeholder="Dear diary…"
          spellCheck
          className="min-h-[58vh] w-full flex-1 resize-none bg-transparent text-[21px] outline-none placeholder:opacity-35"
          style={{ ...serif, lineHeight: `${LINE}px`, backgroundImage: paper.pattern, backgroundSize: paper.size, backgroundAttachment: "local" }}
        />
      </div>
    </div>
  );
}

export default function JournalPage() {
  const [params, setParams] = useSearchParams();
  const { rows, isSuccess } = useRows("journal_entries", undefined, "entry_date desc");
  const [date, setDate] = useState(today());
  const [drawer, setDrawer] = useState(true);
  const [search, setSearch] = useState("");
  const [paper, setPaper] = useSetting<string>("journal.paper", "lined");
  const entry = rows.find((r) => r.entry_date === date);
  const marked = useMemo(
    () => new Map(rows.filter((r) => r.body_md?.trim() || r.title || r.mood).map((r) => [r.entry_date as string, MOODS.find((m) => m.id === r.mood)?.color ?? "#f4cddb"])),
    [rows],
  );
  const listed = rows.filter((r) => `${r.title ?? ""} ${r.body_md ?? ""} ${r.grateful ?? ""}`.toLowerCase().includes(search.toLowerCase()));

  useEffect(() => {
    const id = params.get("id");
    if (id) {
      db.get("journal_entries", Number(id))
        .then((r) => setDate(r.entry_date))
        .catch(() => undefined);
    } else if (params.get("today")) setDate(today());
    if (id || params.get("today")) setParams({}, { replace: true });
  }, [params, setParams]);

  return (
    <div className="flex h-full gap-3">
      {drawer && (
        <aside className="glass anim-pop flex w-72 shrink-0 flex-col overflow-y-auto rounded-[18px]">
          <div className="flex items-center gap-2 p-3">
            <NotebookPen size={16} className="text-accent" />
            <h1 className="flex-1 text-lg font-semibold">Journal</h1>
            <Button size="sm" onClick={() => setDate(today())}>
              Today
            </Button>
            <IconButton icon={PanelLeftClose} label="Hide entries" onClick={() => setDrawer(false)} />
          </div>
          <div className="space-y-3 p-3 pt-0">
            <MiniCalendar value={date} onPick={setDate} marked={marked} />
            <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search entries…" className="h-8" />
            <LinkedSections
              type="journal_entries"
              rows={listed}
              kinds={["people", "events", "moments"]}
              grid="space-y-1"
              empty={<p className="p-3 text-center text-sm text-muted">No pages yet.</p>}
              render={(r) => (
                <button
                  type="button"
                  onClick={() => setDate(r.entry_date)}
                  className={cx("flex w-full items-center gap-2.5 rounded-2xl px-2.5 py-2 text-left", r.entry_date === date ? "bg-accent-soft" : "hover:bg-surface-2")}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm" style={{ background: marked.get(r.entry_date) ?? "#f4cddb", color: INK }}>
                    {Number(String(r.entry_date).slice(8))}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm">{r.title || (r.body_md ?? "").slice(0, 60) || "Untitled"}</span>
                    <span className="block text-[11px] text-muted">{fmtMonth(parse(r.entry_date)!)}</span>
                  </span>
                </button>
              )}
            />
          </div>
        </aside>
      )}
      <div className="relative min-w-0 flex-1 overflow-y-auto">
        {!drawer && (
          <div className="absolute top-3 left-3 z-10">
            <IconButton icon={PanelLeftOpen} label="Show entries" onClick={() => setDrawer(true)} />
          </div>
        )}
        {/* Wait for entries to load so an existing day is never treated as new. */}
        {isSuccess && <Book key={date} date={date} entry={entry} defaultPaper={paper} onPaper={setPaper} />}
      </div>
    </div>
  );
}
