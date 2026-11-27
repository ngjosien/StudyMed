// The focus timer. It counts down the planned time, then keeps counting past it
// until Break or Stop is pressed. The running state lives in settings (as
// timestamps, not a ticking number) so it survives page changes and restarts.
import { useEffect, useState } from "react";
import { api } from "./api";
import { toDateTimeStr } from "./dates";
import { useUI } from "../stores/ui";
import { toast } from "../stores/toast";

export type FocusKind = "academic" | "other";

export interface FocusSetup {
  kind: FocusKind;
  moduleId: number | null;
  /** Topic (academic) or what it is (non-academic). */
  label: string;
  plannedMin: number;
}

export interface FocusRun extends FocusSetup {
  startedAt: string; // local 'YYYY-MM-DDTHH:MM'
  focusMs: number; // focus banked before the current stretch
  breakMs: number;
  breaks: number;
  runFrom: number | null; // epoch ms the current focus stretch began
  breakFrom: number | null; // epoch ms the current break began
  endedAt: number | null; // set once Stop is pressed; then the finish dialog shows
  reached: boolean; // planned time reached (so we only celebrate once)
}

export const ACTIVE_KEY = "focus.active";
export const LAST_KEY = "focus.last";
/** Beats earned per to-do; one beat per focused minute. */
export const BEATS_PER_TODO = 5;

const REMINDER = { type: "focus", id: 0 };

const get = () => (useUI.getState().settings[ACTIVE_KEY] as FocusRun | null | undefined) ?? null;
const put = (r: FocusRun | null) => useUI.getState().setSetting(ACTIVE_KEY, r);

export const focusMs = (r: FocusRun, now = Date.now()) => r.focusMs + (r.runFrom != null ? (r.endedAt ?? now) - r.runFrom : 0);
export const breakMs = (r: FocusRun, now = Date.now()) => r.breakMs + (r.breakFrom != null ? (r.endedAt ?? now) - r.breakFrom : 0);
export const phase = (r: FocusRun): "focus" | "break" | "ended" => (r.endedAt != null ? "ended" : r.breakFrom != null ? "break" : "focus");

/** Desktop notification when the planned time runs out (fires even if the window is hidden). */
function scheduleNotice(r: FocusRun | null) {
  const items: { remindAt: string; title: string; body: string }[] = [];
  if (r && r.runFrom != null && !r.reached) {
    const left = r.plannedMin * 60_000 - focusMs(r);
    if (left > 0) {
      const at = new Date(Date.now() + left + 59_000); // round up to the next whole minute
      items.push({
        remindAt: toDateTimeStr(at),
        title: "Planned focus time reached",
        body: "The timer keeps counting. Take a break or stop when you're ready.",
      });
    }
  }
  api.remindersSync(REMINDER.type, REMINDER.id, items).catch(() => {});
}

export function startFocus(setup: FocusSetup) {
  const now = Date.now();
  const r: FocusRun = {
    ...setup,
    startedAt: toDateTimeStr(new Date(now)),
    focusMs: 0,
    breakMs: 0,
    breaks: 0,
    runFrom: now,
    breakFrom: null,
    endedAt: null,
    reached: false,
  };
  // Remember the set-up for next time, but not a one-off study topic.
  useUI.getState().setSetting(LAST_KEY, { ...setup, label: setup.kind === "other" ? setup.label : "" });
  put(r);
  scheduleNotice(r);
}

export function takeBreak() {
  const r = get();
  if (!r || r.runFrom == null || r.endedAt != null) return;
  const now = Date.now();
  const next = { ...r, focusMs: r.focusMs + now - r.runFrom, runFrom: null, breakFrom: now, breaks: r.breaks + 1 };
  put(next);
  scheduleNotice(next);
}

export function resumeFocus() {
  const r = get();
  if (!r || r.breakFrom == null || r.endedAt != null) return;
  const now = Date.now();
  const next = { ...r, breakMs: r.breakMs + now - r.breakFrom, breakFrom: null, runFrom: now };
  put(next);
  scheduleNotice(next);
}

/** Freeze the clock; the finish dialog then asks to save or discard. */
export function stopFocus() {
  const r = get();
  if (!r || r.endedAt != null) return;
  const now = Date.now();
  put({
    ...r,
    focusMs: focusMs(r, now),
    breakMs: breakMs(r, now),
    runFrom: null,
    breakFrom: null,
    endedAt: now,
  });
  scheduleNotice(null);
}

/** Back to the running clock from the finish dialog ("Keep going"). */
export function unstopFocus() {
  const r = get();
  if (!r || r.endedAt == null) return;
  const next = { ...r, endedAt: null, runFrom: Date.now() };
  put(next);
  scheduleNotice(next);
}

export function clearFocus() {
  put(null);
  scheduleNotice(null);
}

export const useFocusRun = () => (useUI((s) => s.settings[ACTIVE_KEY]) as FocusRun | null | undefined) ?? null;

/** Re-render every second while a session is live. */
export function useTick(active: boolean) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** Celebrate (once) when the planned time is reached while the app is open. */
export function useFocusWatcher() {
  const r = useFocusRun();
  const now = useTick(!!r && r.runFrom != null && !r.reached);
  useEffect(() => {
    if (!r || r.reached || r.runFrom == null) return;
    if (focusMs(r, now) >= r.plannedMin * 60_000) {
      put({ ...r, reached: true });
      toast.success("Planned time reached. The timer keeps going until you take a break or stop.");
    }
  }, [r, now]);
}

/** 1:05:09 / 25:03 */
export function clock(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${p(m)}:${p(sec)}` : `${p(m)}:${p(sec)}`;
}

/** "1h 30m" */
export function hm(min: number) {
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h && m ? `${h}h ${m}m` : h ? `${h}h` : `${m}m`;
}
