// Weekly school timetable, shown week by week. The weekly classes are a set pattern;
// any one day can be changed, cancelled or moved without touching the pattern.
// Classes also appear on the Calendar under the "Classes" layer.
import { useState } from "react";
import { CalendarDays, CalendarX, ChevronLeft, ChevronRight, MapPin, Pencil, Plus, School, Undo2 } from "lucide-react";
import { Link } from "react-router-dom";
import { db, type Row } from "../../lib/api";
import { useMutate, useNow, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { addDays, fmtTime, parse, startOfWeek, toDateStr, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { WEEKDAYS } from "../../lib/goals";
import { classesOn, type ClassOn } from "../../lib/classes";
import { Button, Empty, Field, IconButton, Input, Modal, Page, PageHeader } from "../../components/ui";
import { DateField, TimeField } from "../../components/pickers";
import { toast } from "../../stores/toast";
import { FormModal, useFormState, type FormState } from "../../components/form";
import { useModules } from "./common";

/** General kinds of lesson, so they still fit next year's modules. */
export const CLASS_KIND_OPTIONS = [
  { value: "Lecture", label: "Lecture · content & slides" },
  { value: "Tutorial", label: "Tutorial · discussion & practice questions" },
  { value: "Skills lab", label: "Skills lab · hands-on practice" },
  { value: "Practical", label: "Practical · science lab" },
  { value: "Communication", label: "Communication · speaking & presenting" },
  { value: "PE", label: "PE · physical activity" },
  { value: "Clinical", label: "Clinical · placement or attachment" },
  { value: "Online", label: "Online · e-learning" },
  { value: "Other", label: "Other" },
];
export const CLASS_KINDS = CLASS_KIND_OPTIONS.map((k) => k.value);
const HOUR = 68;
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));

export function ClassForm({ state }: { state: FormState }) {
  const { options } = useModules();
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit class" : "New class"}
      table="class_slots"
      record={state.record}
      defaults={{ module_id: options[0]?.value, kind: "Lecture", weekday: 0, start_time: "09:00", end_time: "11:00", ...state.defaults }}
      fields={[
        { key: "module_id", label: "Module", type: "select", options, numeric: true, required: true, full: true },
        { key: "kind", label: "Kind of lesson", type: "select", options: CLASS_KIND_OPTIONS, required: true, full: true },
        { key: "weekday", label: "Every", type: "select", numeric: true, required: true, full: true, options: WEEKDAYS.map((d, i) => ({ value: i, label: d })) },
        { key: "start_time", label: "From", type: "time", required: true },
        { key: "end_time", label: "To", type: "time", required: true },
        { key: "venue", label: "Room", type: "text", full: true, placeholder: "e.g. 72-03-01" },
        { key: "starts_on", label: "Term starts", type: "date", more: true, hint: "Leave empty for every week" },
        { key: "ends_on", label: "Term ends", type: "date", more: true },
      ]}
      transform={(v) => {
        if (String(v.end_time) <= String(v.start_time)) throw new Error("The class has to end after it starts");
        if (v.starts_on && v.ends_on && v.ends_on < v.starts_on) throw new Error("The term can't end before it starts");
        return v;
      }}
    />
  );
}

export default function TimetablePage() {
  const { byId, options } = useModules();
  const form = useFormState();
  useDeepLinkForm("class_slots", form);
  const now = useNow();
  const slots = useRows("class_slots", undefined, "weekday, start_time").rows.filter((c) => !byId.get(c.module_id)?.archived);
  const changes = useRows("class_changes", undefined, "date").rows;
  const [offset, setOffset] = useState(0);
  const [open, setOpen] = useState<ClassOn | null>(null);
  const t = today();
  const monday = addDays(startOfWeek(now), offset * 7);
  const dates = Array.from({ length: 7 }, (_, i) => toDateStr(addDays(monday, i)));
  const perDay = dates.map((d) => classesOn(slots, changes, d));
  const all = perDay.flat();
  const days = perDay[5].length || perDay[6].length || slots.some((c) => c.weekday > 4) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const first = Math.min(8 * 60, ...all.map((c) => toMin(c.start)));
  const last = Math.max(18 * 60, ...all.map((c) => toMin(c.end)));
  const top = Math.floor(first / 60) * 60;
  const hours = Array.from({ length: Math.ceil((last - top) / 60) }, (_, i) => top / 60 + i);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const live = (c: ClassOn) => !c.cancelled && !c.movedTo;
  const clash = (a: ClassOn, list: ClassOn[]) => live(a) && list.some((b) => b.key !== a.key && live(b) && b.start < a.end && a.start < b.end);
  const weekMinutes = slots.reduce((s, c) => s + toMin(c.end_time) - toMin(c.start_time), 0);
  const changedThisWeek = all.filter((c) => c.change).length;
  const fmtDay = (d: string, opts: Intl.DateTimeFormatOptions) => parse(d)!.toLocaleDateString(undefined, opts);
  const dayLabel = (d: string) => `${fmtDay(d, { weekday: "short" })} ${parse(d)!.getDate()}`;
  const weekLabel = offset === 0 ? "This week" : offset === 1 ? "Next week" : offset === -1 ? "Last week" : `${fmtDay(dates[0], { day: "numeric", month: "short" })} – ${fmtDay(dates[6], { day: "numeric", month: "short" })}`;

  return (
    <>
      <PageHeader
        title="Timetable"
        icon={School}
        subtitle={slots.length ? `${slots.length} class${slots.length === 1 ? "" : "es"}, ${Math.round(weekMinutes / 6) / 10} hours a week` : "Your weekly classes"}
        actions={
          <>
            <Link to="/calendar">
              <Button icon={CalendarDays}>See on calendar</Button>
            </Link>
            <Button variant="primary" icon={Plus} disabled={!options.length} onClick={() => form.openNew({ weekday: Math.min((now.getDay() + 6) % 7, 4) })}>
              Add class
            </Button>
          </>
        }
      />
      <Page>
        {!slots.length ? (
          <Empty icon={School} title={options.length ? "No classes yet" : "Add your modules first"}>
            Add each lecture, tutorial and lab once. They repeat every week, here and on your calendar.
          </Empty>
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1 rounded-full bg-surface-2 p-1">
                <IconButton icon={ChevronLeft} label="Previous week" onClick={() => setOffset(offset - 1)} />
                <span className="min-w-32 text-center text-sm font-semibold">{weekLabel}</span>
                <IconButton icon={ChevronRight} label="Next week" onClick={() => setOffset(offset + 1)} />
              </span>
              {offset !== 0 && (
                <Button size="sm" variant="ghost" onClick={() => setOffset(0)}>
                  Back to this week
                </Button>
              )}
              <p className="ml-auto text-xs text-muted">
                {changedThisWeek ? `${changedThisWeek} change${changedThisWeek === 1 ? "" : "s"} this week · ` : ""}Click a class to change, cancel or move it for one day, or to edit it every week.
              </p>
            </div>
            <div className="glass overflow-x-auto rounded-[22px] p-4">
              <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
                <div />
                {days.map((d) => (
                  <div key={d} className={cx("pb-3 text-center text-sm font-semibold", dates[d] === t && "text-accent")}>
                    {WEEKDAYS[d].slice(0, 3)} <span className="font-normal text-muted">{parse(dates[d])!.getDate()}</span>
                  </div>
                ))}
                <div className="relative" style={{ height: hours.length * HOUR }}>
                  {hours.map((h, i) => (
                    <span key={h} className="absolute right-2 -translate-y-1/2 text-[11px] text-muted" style={{ top: i * HOUR }}>
                      {fmtTime(`${String(h).padStart(2, "0")}:00`)}
                    </span>
                  ))}
                </div>
                {days.map((d) => (
                  <div key={d} className={cx("relative border-l border-line", dates[d] === t && "bg-accent-soft/40")} style={{ height: hours.length * HOUR }}>
                    {hours.map((h, i) => (
                      <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR }} />
                    ))}
                    {dates[d] === t && nowMin >= top && nowMin <= top + hours.length * 60 && (
                      <div className="absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: ((nowMin - top) / 60) * HOUR }}>
                        <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-danger" />
                      </div>
                    )}
                    {perDay[d].map((c) => {
                      const m = byId.get(c.slot.module_id);
                      const color = m?.color ?? "#c3a6f4";
                      const s = toMin(c.start);
                      const e = toMin(c.end);
                      const off = !live(c);
                      return (
                        <button
                          type="button"
                          key={c.key}
                          onClick={() => setOpen(c)}
                          className={cx(
                            "anim-item absolute inset-x-1 overflow-hidden rounded-2xl p-2 text-left text-[11px] leading-tight shadow-sm hover:z-20 hover:-translate-y-px",
                            clash(c, perDay[d]) && "ring-2 ring-danger",
                            off && "border border-dashed opacity-55 shadow-none",
                          )}
                          style={{
                            top: ((s - top) / 60) * HOUR + 2,
                            height: ((e - s) / 60) * HOUR - 4,
                            background: off ? "transparent" : `linear-gradient(160deg, color-mix(in srgb, ${color} 80%, white), color-mix(in srgb, ${color} 55%, transparent))`,
                            color: off ? undefined : "#2b1d26",
                            borderLeft: off ? undefined : `4px solid color-mix(in srgb, ${color} 60%, #2b1d26)`,
                            borderColor: off ? color : undefined,
                          }}
                          title={clash(c, perDay[d]) ? "Overlaps another class" : undefined}
                        >
                          <span className={cx("block truncate text-[12px] font-bold", off && "line-through")}>{m?.code}</span>
                          <span className={cx("block truncate", off && "line-through")}>{c.slot.kind}</span>
                          {c.cancelled ? (
                            <span className="mt-0.5 block font-semibold">Cancelled</span>
                          ) : c.movedTo ? (
                            <span className="mt-0.5 block font-semibold">Moved to {dayLabel(c.movedTo)}</span>
                          ) : (
                            <>
                              <span className="block truncate opacity-75">
                                {fmtTime(c.start)}–{fmtTime(c.end)}
                              </span>
                              {c.venue && (
                                <span className="mt-0.5 flex items-center gap-0.5 truncate opacity-75">
                                  <MapPin size={10} /> {c.venue}
                                </span>
                              )}
                              {(c.movedFrom || c.changed) && (
                                <span className="mt-0.5 inline-block rounded-full bg-white/60 px-1.5 text-[10px] font-semibold">
                                  {c.movedFrom ? `From ${dayLabel(c.movedFrom)}` : "Changed"}
                                </span>
                              )}
                            </>
                          )}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </Page>
      <ClassForm state={form} />
      {open && (
        <ClassDayModal
          occ={open}
          module={byId.get(open.slot.module_id)}
          onClose={() => setOpen(null)}
          onEditWeekly={() => {
            setOpen(null);
            form.openEdit(open.slot);
          }}
        />
      )}
    </>
  );
}

/** Change one class on one day only: another time, room or day, or cancel it. */
function ClassDayModal({ occ, module, onClose, onEditWeekly }: { occ: ClassOn; module?: Row; onClose: () => void; onEditWeekly: () => void }) {
  const mutate = useMutate();
  const s = occ.slot;
  const ch = occ.change;
  const original = ch ? String(ch.date) : occ.date;
  const [date, setDate] = useState<string>(String(ch?.new_date ?? original));
  const [start, setStart] = useState<string>(String(ch?.start_time ?? s.start_time));
  const [end, setEnd] = useState<string>(String(ch?.end_time ?? s.end_time));
  const [venue, setVenue] = useState<string>(String(ch?.venue ?? s.venue ?? ""));
  const [note, setNote] = useState<string>(String(ch?.note ?? ""));
  const long = (d: string) => parse(d)!.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const write = async (values: Row) => {
    await mutate(ch ? db.update("class_changes", ch.id, values) : db.insert("class_changes", { slot_id: s.id, date: original, ...values }));
    onClose();
  };
  const saveDay = async () => {
    if (end <= start) return toast.error("The class has to end after it starts");
    const values = {
      cancelled: 0,
      new_date: date !== original ? date : null,
      start_time: start !== s.start_time ? start : null,
      end_time: end !== s.end_time ? end : null,
      venue: venue.trim() !== String(s.venue ?? "") ? venue.trim() || null : null,
      note: note.trim() || null,
    };
    if (!values.new_date && !values.start_time && !values.end_time && !values.venue && !values.note) return backToNormal();
    await write(values);
    toast.success(values.new_date ? `Moved to ${long(date)}` : "Changed for this day only");
  };
  const cancelDay = async () => {
    await write({ cancelled: 1, new_date: null, start_time: null, end_time: null, venue: null, note: note.trim() || null });
    toast.success(`Cancelled on ${long(original)}`);
  };
  const backToNormal = async () => {
    if (ch) await mutate(db.remove("class_changes", ch.id));
    onClose();
  };

  return (
    <Modal open onClose={onClose} title={`${module?.code ?? ""} ${s.kind} · ${long(original)}`} width="max-w-lg">
      <p className="text-sm text-muted">
        Every {WEEKDAYS[s.weekday]}, {fmtTime(s.start_time)}–{fmtTime(s.end_time)}
        {s.venue ? ` · ${s.venue}` : ""}
      </p>
      {ch && (
        <p className="mt-2 rounded-2xl bg-accent-soft px-3 py-2 text-sm">
          {ch.cancelled ? "Cancelled on this day." : ch.new_date ? `Moved to ${long(String(ch.new_date))}.` : "Changed on this day."}
          {ch.note ? ` ${ch.note}` : ""}
        </p>
      )}
      <h3 className="mt-5 mb-2 text-sm font-semibold">Just this day</h3>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Day" className="col-span-2">
          <DateField value={date} clearable={false} onChange={(d) => d && setDate(d)} />
        </Field>
        <Field label="From">
          <TimeField value={start} clearable={false} onChange={(v) => v && setStart(v)} />
        </Field>
        <Field label="To">
          <TimeField value={end} clearable={false} onChange={(v) => v && setEnd(v)} />
        </Field>
        <Field label="Room" className="col-span-2">
          <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="e.g. 72-03-01" />
        </Field>
        <Field label="Note" className="col-span-2">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. Replacement lesson" />
        </Field>
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button variant="primary" onClick={saveDay}>
          Save for this day
        </Button>
        {!ch?.cancelled && (
          <Button icon={CalendarX} onClick={cancelDay}>
            Cancel this class
          </Button>
        )}
        {ch && (
          <Button variant="ghost" icon={Undo2} onClick={backToNormal}>
            Back to normal
          </Button>
        )}
      </div>
      <div className="mt-6 flex items-center gap-3 border-t border-line pt-4">
        <p className="flex-1 text-sm text-muted">Changing it every week?</p>
        <Button icon={Pencil} onClick={onEditWeekly}>
          Edit the weekly class
        </Button>
      </div>
    </Modal>
  );
}
