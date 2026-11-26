import { useEffect, useLayoutEffect, useMemo, useRef, useState, type MouseEvent as RMouseEvent, type WheelEvent } from "react";
import { createPortal } from "react-dom";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Cake,
  ClipboardList,
  GraduationCap,
  ListTodo,
  PartyPopper,
  Receipt,
  Repeat2,
  School,
  ArrowUpRight,
  MapPin,
  Clock,
  ZoomIn,
  ZoomOut,
  Plus,
  Check,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, type Row } from "../../lib/api";
import {
  addDays,
  addMonths,
  fmtMonth,
  fmtTime,
  parse,
  sameDay,
  startOfMonth,
  startOfWeek,
  toDateStr,
  countdown,
  fmtDateShort,
} from "../../lib/dates";
import { useNow } from "../../lib/hooks";
import { entityRoute } from "../../lib/nav";
import { cx } from "../../lib/format";
import { Button, IconButton, Segmented } from "../../components/ui";
import { useSetting } from "../../stores/ui";

type Layer = "birthday" | "homework" | "exam" | "todo" | "event" | "bill" | "review" | "class";

const LAYERS: { id: Layer; label: string; color: string; icon: LucideIcon }[] = [
  { id: "class", label: "Classes", color: "#4a86cf", icon: School },
  { id: "event", label: "Events", color: "#6366f1", icon: PartyPopper },
  { id: "todo", label: "To-Dos", color: "#10b981", icon: ListTodo },
  { id: "homework", label: "Homework", color: "#f59e0b", icon: ClipboardList },
  { id: "exam", label: "Exams", color: "#ef4444", icon: GraduationCap },
  { id: "birthday", label: "Birthdays", color: "#ec4899", icon: Cake },
  { id: "review", label: "Recall", color: "#a855f7", icon: Repeat2 },
  { id: "bill", label: "Bills", color: "#0ea5e9", icon: Receipt },
];
const LAYER = Object.fromEntries(LAYERS.map((l) => [l.id, l])) as Record<Layer, (typeof LAYERS)[number]>;

const SOURCE_LABEL: Record<string, string> = {
  todos: "To-Dos",
  events: "Events",
  homework: "Homework",
  exams: "Exams",
  people: "Relationships",
  bills: "Money",
  review_topics: "Spaced Repetition",
  class_slots: "Timetable",
};

interface Item extends Row {
  layer: Layer;
  source_type: string;
  source_id: number;
  title: string;
  start_at: string;
  end_at: string | null;
  all_day: number;
  location: string | null;
  color: string | null;
  done: number;
}

// Classes take their module's colour.
const itemColor = (it: Item) => (it.layer === "class" && it.color) || (LAYER[it.layer]?.color ?? "#6366f1");
const dayKey = (s: string) => s.slice(0, 10);
const HOUR_MIN = 36;
const HOUR_MAX = 84;
const isTypingTarget = (t: EventTarget | null) =>
  t instanceof HTMLElement && !!t.closest("input, textarea, select, [contenteditable]");

/* ------------------------------------------------------------------ Popover */
function ItemPopover({ item, anchor, onClose }: { item: Item; anchor: { x: number; y: number }; onClose: () => void }) {
  const nav = useNavigate();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(anchor);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    setPos({
      x: Math.min(anchor.x, window.innerWidth - w - 12),
      y: anchor.y + h + 12 > window.innerHeight ? Math.max(12, anchor.y - h - 8) : anchor.y + 8,
    });
  }, [anchor]);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const t = setTimeout(() => window.addEventListener("mousedown", h));
    window.addEventListener("keydown", k);
    return () => {
      clearTimeout(t);
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k);
    };
  }, [onClose]);
  const L = LAYER[item.layer];
  const route = entityRoute(item.source_type, item.source_id);
  const hasTime = item.start_at.length > 10 && !item.all_day;
  return createPortal(
    <div ref={ref} className="fixed z-50 w-80 rounded-xl border border-line bg-surface p-4 shadow-2xl" style={{ left: pos.x, top: pos.y }}>
      <div className="mb-2 flex items-center gap-2 text-xs font-medium" style={{ color: L.color }}>
        <L.icon size={14} /> {L.label}
        {item.done ? (
          <span className="ml-auto inline-flex items-center gap-1 text-emerald-500">
            <Check size={12} /> Done
          </span>
        ) : null}
      </div>
      <div className="mb-2 leading-snug font-semibold">{item.title}</div>
      <div className="space-y-1 text-sm text-muted">
        <div className="flex items-center gap-2">
          <Clock size={13} />
          {fmtDateShort(item.start_at)}
          {hasTime && ` · ${fmtTime(item.start_at)}`}
          {item.end_at && hasTime && ` – ${fmtTime(item.end_at)}`}
          <span className="ml-auto text-xs">{countdown(item.start_at)}</span>
        </div>
        {item.location && (
          <div className="flex items-center gap-2">
            <MapPin size={13} /> {item.location}
          </div>
        )}
      </div>
      {route && (
        <Button
          variant="primary"
          size="sm"
          icon={ArrowUpRight}
          className="mt-3 w-full"
          onClick={() => {
            onClose();
            nav(route);
          }}
        >
          Open in {SOURCE_LABEL[item.source_type] ?? "source"}
        </Button>
      )}
    </div>,
    document.body,
  );
}

/* ------------------------------------------------------------------ Month */
function MonthView({
  anchor,
  items,
  density,
  onOpen,
  onDay,
}: {
  anchor: Date;
  items: Item[];
  density: number; // 0..1 within month mode
  onOpen: (it: Item, e: RMouseEvent) => void;
  onDay: (d: Date) => void;
}) {
  const start = startOfWeek(startOfMonth(anchor));
  const days = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  const byDay = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of items) {
      const s = parse(it.start_at)!;
      const e = parse(it.end_at) ?? s;
      // multi-day events appear on every day they cover
      let n = 0;
      for (let d = new Date(s.getFullYear(), s.getMonth(), s.getDate()); d <= e && n < 60; d = addDays(d, 1), n++) {
        const k = toDateStr(d);
        m.set(k, [...(m.get(k) ?? []), it]);
      }
    }
    return m;
  }, [items]);
  const today = new Date();
  const showChips = density > 0.25;
  const maxChips = Math.max(2, Math.round(2 + density * 6));
  return (
    <div className="flex h-full flex-col">
      <div className="grid grid-cols-7 border-b border-line text-xs font-medium text-muted">
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
          <div key={d} className="px-2 py-2">
            {d}
          </div>
        ))}
      </div>
      <div className="grid flex-1 grid-cols-7 grid-rows-6">
        {days.map((d) => {
          const list = [...(byDay.get(toDateStr(d)) ?? [])].sort(
            (a, b) => Number(b.all_day) - Number(a.all_day) || a.start_at.localeCompare(b.start_at),
          );
          const inMonth = d.getMonth() === anchor.getMonth();
          const isToday = sameDay(d, today);
          return (
            <div
              key={d.toISOString()}
              onDoubleClick={() => onDay(d)}
              className={cx("min-h-0 overflow-hidden border-r border-b border-line p-1.5", !inMonth && "bg-surface-2/40")}
            >
              <div className="mb-1 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDay(d)}
                  title="Open week"
                  className={cx(
                    "flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs",
                    isToday ? "bg-accent font-semibold text-accent-fg" : inMonth ? "text-fg hover:bg-surface-2" : "text-muted",
                  )}
                >
                  {d.getDate()}
                </button>
                {!showChips && list.length > 0 && <span className="text-[10px] text-muted">{list.length}</span>}
              </div>
              {showChips ? (
                <div className="space-y-0.5">
                  {list.slice(0, maxChips).map((it, i) => (
                    <button
                      type="button"
                      key={`${it.source_type}-${it.source_id}-${i}`}
                      onClick={(e) => onOpen(it, e)}
                      className={cx(
                        "flex w-full items-center gap-1 truncate rounded px-1.5 py-0.5 text-left text-[11px] leading-tight hover:brightness-95",
                        it.done && "line-through opacity-60",
                      )}
                      style={{ background: `${itemColor(it)}1f`, color: itemColor(it) }}
                    >
                      {it.start_at.length > 10 && !it.all_day && <span className="shrink-0 opacity-75">{fmtTime(it.start_at)}</span>}
                      <span className="truncate font-medium">{it.title}</span>
                    </button>
                  ))}
                  {list.length > maxChips && (
                    <button type="button" onClick={() => onDay(d)} className="px-1.5 text-[11px] text-muted hover:text-fg">
                      +{list.length - maxChips} more
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex flex-wrap gap-1 px-1">
                  {list.map((it, i) => (
                    <button
                      type="button"
                      key={`${it.source_type}-${it.source_id}-${i}`}
                      title={it.title}
                      onClick={(e) => onOpen(it, e)}
                      className="h-2 w-2 rounded-full"
                      style={{ background: itemColor(it) }}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Week */
interface Placed {
  it: Item;
  top: number;
  height: number;
  col: number;
  cols: number;
}

function layoutDay(items: Item[], hourPx: number): Placed[] {
  const evs = items
    .map((it) => {
      const s = parse(it.start_at)!;
      const startMin = s.getHours() * 60 + s.getMinutes();
      const e = parse(it.end_at);
      let endMin = e && sameDay(e, s) ? e.getHours() * 60 + e.getMinutes() : e ? 24 * 60 : startMin + 45;
      if (endMin - startMin < 30) endMin = startMin + 30;
      return { it, startMin, endMin };
    })
    .sort((a, b) => a.startMin - b.startMin || b.endMin - a.endMin);
  const placed: Placed[] = [];
  let group: typeof evs = [];
  let groupEnd = -1;
  const flush = () => {
    const colsEnd: number[] = [];
    const assigned = group.map((g) => {
      let c = colsEnd.findIndex((end) => end <= g.startMin);
      if (c === -1) {
        c = colsEnd.length;
        colsEnd.push(g.endMin);
      } else colsEnd[c] = g.endMin;
      return { g, c };
    });
    for (const { g, c } of assigned) {
      placed.push({
        it: g.it,
        top: (g.startMin / 60) * hourPx,
        height: Math.max(((g.endMin - g.startMin) / 60) * hourPx - 2, 18),
        col: c,
        cols: colsEnd.length,
      });
    }
    group = [];
  };
  for (const e of evs) {
    if (group.length && e.startMin >= groupEnd) {
      flush();
      groupEnd = -1;
    }
    group.push(e);
    groupEnd = Math.max(groupEnd, e.endMin);
  }
  if (group.length) flush();
  return placed;
}

function WeekView({
  anchor,
  items,
  hourPx,
  onOpen,
}: {
  anchor: Date;
  items: Item[];
  hourPx: number;
  onOpen: (it: Item, e: RMouseEvent) => void;
}) {
  const now = useNow();
  const start = startOfWeek(anchor);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const scroller = useRef<HTMLDivElement>(null);
  const isAllDay = (it: Item) => !!it.all_day || it.start_at.length <= 10;

  useEffect(() => {
    if (scroller.current) scroller.current.scrollTop = 7 * hourPx;
  }, [toDateStr(start)]); // eslint-disable-line react-hooks/exhaustive-deps

  const perDay = days.map((d) => {
    const k = toDateStr(d);
    const list = items.filter((it) => {
      const s = dayKey(it.start_at);
      const e = it.end_at ? dayKey(it.end_at) : s;
      return s <= k && e >= k;
    });
    const multiDay = (it: Item) => dayKey(it.start_at) !== dayKey(it.end_at ?? it.start_at);
    return {
      d,
      k,
      allDay: list.filter((it) => isAllDay(it) || multiDay(it)),
      timed: list.filter((it) => !isAllDay(it) && !multiDay(it)),
    };
  });

  const rowCls = "grid grid-cols-[56px_repeat(7,1fr)] overflow-y-hidden border-b border-line [scrollbar-gutter:stable]";

  return (
    <div className="flex h-full flex-col">
      <div className={rowCls}>
        <div />
        {perDay.map(({ d }) => {
          const isToday = sameDay(d, now);
          return (
            <div key={d.toISOString()} className="border-l border-line px-2 py-2 text-center">
              <div className="text-xs text-muted">{d.toLocaleDateString(undefined, { weekday: "short" })}</div>
              <div className={cx("mx-auto mt-0.5 flex h-8 w-8 items-center justify-center rounded-full text-lg", isToday && "bg-accent font-semibold text-accent-fg")}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>
      <div className={rowCls}>
        <div className="py-1.5 pr-2 text-right text-[10px] text-muted">all-day</div>
        {perDay.map(({ k, allDay }) => (
          <div key={k} className="min-h-8 space-y-0.5 border-l border-line p-1">
            {allDay.map((it, i) => (
              <button
                type="button"
                key={`${it.source_type}-${it.source_id}-${i}`}
                onClick={(e) => onOpen(it, e)}
                className={cx("block w-full truncate rounded px-1.5 py-0.5 text-left text-[11px] font-medium", it.done && "line-through opacity-60")}
                style={{ background: `${itemColor(it)}24`, color: itemColor(it) }}
              >
                {it.title}
              </button>
            ))}
          </div>
        ))}
      </div>
      <div ref={scroller} className="relative flex-1 overflow-y-auto [scrollbar-gutter:stable]">
        <div className="grid grid-cols-[56px_repeat(7,1fr)]" style={{ height: 24 * hourPx }}>
          <div className="relative">
            {Array.from({ length: 24 }, (_, h) => (
              <div key={h} className="absolute right-2 -translate-y-1/2 text-[10px] text-muted" style={{ top: h * hourPx }}>
                {h === 0 ? "" : fmtTime(`${String(h).padStart(2, "0")}:00`)}
              </div>
            ))}
          </div>
          {perDay.map(({ d, k, timed }) => (
            <div key={k} className="relative border-l border-line">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="absolute inset-x-0 border-t border-line/60" style={{ top: h * hourPx }} />
              ))}
              {sameDay(d, now) && (
                <div className="absolute inset-x-0 z-10 h-0.5 bg-red-500" style={{ top: ((now.getHours() * 60 + now.getMinutes()) / 60) * hourPx }}>
                  <div className="-mt-1 -ml-1 h-2.5 w-2.5 rounded-full bg-red-500" />
                </div>
              )}
              {layoutDay(timed, hourPx).map(({ it, top, height, col, cols }, i) => (
                <button
                  type="button"
                  key={`${it.source_type}-${it.source_id}-${i}`}
                  onClick={(e) => onOpen(it, e)}
                  className={cx(
                    "absolute overflow-hidden rounded-md border-l-[3px] px-1.5 py-0.5 text-left text-[11px] leading-tight shadow-sm hover:z-20 hover:shadow-md",
                    it.done && "opacity-60",
                  )}
                  style={{
                    top,
                    height,
                    left: `calc(${(col / cols) * 100}% + 2px)`,
                    width: `calc(${100 / cols}% - 4px)`,
                    background: `color-mix(in srgb, ${itemColor(it)} 16%, var(--surface))`,
                    borderColor: itemColor(it),
                  }}
                >
                  <div className={cx("truncate font-semibold", it.done && "line-through")} style={{ color: itemColor(it) }}>
                    {it.title}
                  </div>
                  {height > 30 && (
                    <div className="truncate text-muted">
                      {fmtTime(it.start_at)}
                      {it.end_at ? ` – ${fmtTime(it.end_at)}` : ""}
                    </div>
                  )}
                  {height > 46 && it.location && (
                    <div className="flex items-center gap-1 truncate text-muted">
                      <MapPin size={10} className="shrink-0" /> {it.location}
                    </div>
                  )}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ Page */
export default function CalendarPage() {
  const nav = useNavigate();
  const [zoom, setZoom] = useSetting<number>("calendar.zoom", 0.4); // <0.5 month, >=0.5 week
  const [z, setZ] = useState(zoom);
  const [params, setParams] = useSearchParams();
  const [anchor, setAnchor] = useState(() => parse(params.get("date")) ?? new Date());
  // Deep link from another page (?date=YYYY-MM-DD): open that week.
  useEffect(() => {
    const d = parse(params.get("date"));
    if (d) {
      setAnchor(d);
      setZ(0.7);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);
  const [layersOn, setLayersOn] = useSetting<Record<string, boolean>>("calendar.layers", {});
  const [open, setOpen] = useState<{ item: Item; x: number; y: number } | null>(null);
  const mode: "month" | "week" = z < 0.5 ? "month" : "week";
  const persistTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const updateZoom = (v: number) => {
    const nz = Math.min(1, Math.max(0, v));
    setZ(nz);
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => setZoom(nz), 400);
  };

  const range = useMemo(() => {
    if (mode === "month") {
      const s = startOfWeek(startOfMonth(anchor));
      return { start: toDateStr(s), end: toDateStr(addDays(s, 41)) };
    }
    const s = startOfWeek(anchor);
    return { start: toDateStr(s), end: toDateStr(addDays(s, 6)) };
  }, [anchor, mode]);

  const q = useQuery({
    queryKey: ["calendar", range.start, range.end],
    queryFn: () => api.calendarRange(range.start, range.end) as Promise<Item[]>,
  });
  const items = (q.data ?? []).filter((it) => layersOn[it.layer] !== false);
  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    (q.data ?? []).forEach((it) => (c[it.layer] = (c[it.layer] ?? 0) + 1));
    return c;
  }, [q.data]);

  const step = (dir: number) => setAnchor((a) => (mode === "month" ? addMonths(a, dir) : addDays(a, 7 * dir)));

  // Ctrl+wheel and touchpad pinch both arrive as ctrl+wheel: continuous semantic zoom.
  const onWheel = (e: WheelEvent) => {
    if (!e.ctrlKey) return;
    updateZoom(z - e.deltaY * 0.0025);
  };
  const wheelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // React's wheel listener is passive; block the WebView's own page zoom with a non-passive one.
    const el = wheelRef.current;
    if (!el) return;
    const h = (e: globalThis.WheelEvent) => {
      if (e.ctrlKey) e.preventDefault();
    };
    el.addEventListener("wheel", h, { passive: false });
    return () => el.removeEventListener("wheel", h);
  }, []);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.ctrlKey || e.altKey || e.metaKey) return;
      if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if (e.key.toLowerCase() === "t") setAnchor(new Date());
      else if (e.key.toLowerCase() === "m") updateZoom(0.3);
      else if (e.key.toLowerCase() === "w") updateZoom(0.7);
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  const monthDensity = Math.min(1, z / 0.5);
  const hourPx = HOUR_MIN + ((Math.max(z, 0.5) - 0.5) / 0.5) * (HOUR_MAX - HOUR_MIN);
  const title =
    mode === "month"
      ? fmtMonth(anchor)
      : (() => {
          const s = startOfWeek(anchor);
          const e = addDays(s, 6);
          return s.getMonth() === e.getMonth()
            ? `${s.getDate()} – ${e.getDate()} ${fmtMonth(e)}`
            : `${s.toLocaleDateString(undefined, { day: "numeric", month: "short" })} – ${e.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" })}`;
        })();

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-line px-6 pt-5 pb-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
            <CalendarDays size={18} />
          </div>
          <h1 className="min-w-48 text-xl font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center">
            <IconButton icon={ChevronLeft} label="Previous (Left arrow)" onClick={() => step(-1)} />
            <Button size="sm" variant="ghost" onClick={() => setAnchor(new Date())}>
              Today
            </Button>
            <IconButton icon={ChevronRight} label="Next (Right arrow)" onClick={() => step(1)} />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="flex items-center gap-1.5" title="Semantic zoom: drag, or Ctrl + scroll / pinch on the calendar">
              <ZoomOut size={14} className="text-muted" />
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={z}
                onChange={(e) => updateZoom(Number(e.target.value))}
                className="w-32 accent-[var(--accent)]"
                aria-label="Zoom"
              />
              <ZoomIn size={14} className="text-muted" />
            </div>
            <Segmented
              value={mode}
              onChange={(m) => updateZoom(m === "month" ? 0.3 : 0.7)}
              options={[
                { value: "month", label: "Month" },
                { value: "week", label: "Week" },
              ]}
            />
            <Button variant="primary" icon={Plus} onClick={() => nav("/events?new=1")}>
              Event
            </Button>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          {LAYERS.map((l) => {
            const on = layersOn[l.id] !== false;
            return (
              <button
                type="button"
                key={l.id}
                onClick={() => setLayersOn({ ...layersOn, [l.id]: !on })}
                className={cx(
                  "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all",
                  on ? "border-transparent" : "border-line text-muted opacity-60",
                )}
                style={on ? { background: `${l.color}1f`, color: l.color } : undefined}
                aria-pressed={on}
              >
                <l.icon size={13} />
                {l.label}
                {counts[l.id] ? <span className="opacity-70">{counts[l.id]}</span> : null}
              </button>
            );
          })}
        </div>
      </header>
      <div ref={wheelRef} onWheel={onWheel} className="relative min-h-0 flex-1">
        <div key={mode} className="absolute inset-0 animate-[calzoom_.22s_ease-out]">
          {mode === "month" ? (
            <MonthView
              anchor={anchor}
              items={items}
              density={monthDensity}
              onOpen={(item, e) => setOpen({ item, x: e.clientX, y: e.clientY })}
              onDay={(d) => {
                setAnchor(d);
                updateZoom(0.7);
              }}
            />
          ) : (
            <WeekView anchor={anchor} items={items} hourPx={hourPx} onOpen={(item, e) => setOpen({ item, x: e.clientX, y: e.clientY })} />
          )}
        </div>
      </div>
      {open && <ItemPopover item={open.item} anchor={{ x: open.x, y: open.y }} onClose={() => setOpen(null)} />}
    </div>
  );
}
