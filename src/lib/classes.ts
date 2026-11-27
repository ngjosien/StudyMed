// The weekly timetable applied to real days, with one-day changes: a class can be
// cancelled, held at another time or room, or moved to another day on one date
// only. The weekly class itself never changes. Used by Timetable and Routine
// (the Calendar does the same in calendar.rs).
import type { Row } from "./api";
import { parse } from "./dates";

export interface ClassOn {
  key: string;
  slot: Row;
  date: string; // the day it is shown on
  start: string;
  end: string;
  venue: string | null;
  change: Row | null; // the one-day change, if any
  cancelled: boolean; // cancelled on this day
  movedTo: string | null; // moved away from this day to that one
  movedFrom: string | null; // moved here from that day
  changed: boolean; // different time or room on this day
}

const weekdayOf = (date: string) => (parse(date)!.getDay() + 6) % 7;
const inTerm = (s: Row, date: string) => (!s.starts_on || s.starts_on <= date) && (!s.ends_on || s.ends_on >= date);

/**
 * The classes on one day. Cancelled and moved-away classes are included (marked) so
 * a timetable can show them faded; leave them out with `live` for "what's on".
 */
export function classesOn(slots: Row[], changes: Row[], date: string, live = false): ClassOn[] {
  const out: ClassOn[] = [];
  const wd = weekdayOf(date);
  for (const s of slots) {
    if (s.weekday !== wd || !inTerm(s, date)) continue;
    const ch = changes.find((c) => c.slot_id === s.id && c.date === date) ?? null;
    const cancelled = !!ch?.cancelled;
    const movedTo = ch?.new_date && ch.new_date !== date ? String(ch.new_date) : null;
    if (live && (cancelled || movedTo)) continue;
    out.push({
      key: `c${s.id}:${date}`,
      slot: s,
      date,
      start: movedTo ? s.start_time : (ch?.start_time ?? s.start_time),
      end: movedTo ? s.end_time : (ch?.end_time ?? s.end_time),
      venue: movedTo ? s.venue : (ch?.venue ?? s.venue ?? null),
      change: ch,
      cancelled,
      movedTo,
      movedFrom: null,
      changed: !!ch && !cancelled && !movedTo && (!!ch.start_time || !!ch.end_time || !!ch.venue),
    });
  }
  for (const ch of changes) {
    if (ch.new_date !== date || ch.date === date || ch.cancelled) continue;
    const s = slots.find((x) => x.id === ch.slot_id);
    if (!s) continue;
    out.push({
      key: `m${s.id}:${ch.date}`,
      slot: s,
      date,
      start: ch.start_time ?? s.start_time,
      end: ch.end_time ?? s.end_time,
      venue: ch.venue ?? s.venue ?? null,
      change: ch,
      cancelled: false,
      movedTo: null,
      movedFrom: String(ch.date),
      changed: true,
    });
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
