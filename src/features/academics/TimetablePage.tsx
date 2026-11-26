// Weekly school timetable. Classes also appear on the Calendar under the "Classes" layer.
import { CalendarDays, MapPin, Plus, School } from "lucide-react";
import { Link } from "react-router-dom";
import type { Row } from "../../lib/api";
import { useNow, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { fmtTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { WEEKDAYS } from "../../lib/goals";
import { Button, Empty, Page, PageHeader } from "../../components/ui";
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
  const classes = useRows("class_slots", undefined, "weekday, start_time").rows.filter((c) => !byId.get(c.module_id)?.archived);
  const todayIdx = (now.getDay() + 6) % 7;
  const days = classes.some((c) => c.weekday > 4) ? [0, 1, 2, 3, 4, 5, 6] : [0, 1, 2, 3, 4];
  const first = Math.min(8 * 60, ...classes.map((c) => toMin(c.start_time)));
  const last = Math.max(18 * 60, ...classes.map((c) => toMin(c.end_time)));
  const top = Math.floor(first / 60) * 60;
  const hours = Array.from({ length: Math.ceil((last - top) / 60) }, (_, i) => top / 60 + i);
  const nowMin = now.getHours() * 60 + now.getMinutes();
  const clash = (a: Row) => classes.some((b) => b.id !== a.id && b.weekday === a.weekday && b.start_time < a.end_time && a.start_time < b.end_time);
  const weekMinutes = classes.reduce((s, c) => s + toMin(c.end_time) - toMin(c.start_time), 0);

  return (
    <>
      <PageHeader
        title="Timetable"
        icon={School}
        subtitle={classes.length ? `${classes.length} class${classes.length === 1 ? "" : "es"}, ${Math.round(weekMinutes / 6) / 10} hours a week` : "Your weekly classes"}
        actions={
          <>
            <Link to="/calendar">
              <Button icon={CalendarDays}>See on calendar</Button>
            </Link>
            <Button variant="primary" icon={Plus} disabled={!options.length} onClick={() => form.openNew({ weekday: Math.min(todayIdx, days.length - 1) })}>
              Add class
            </Button>
          </>
        }
      />
      <Page>
        {!classes.length ? (
          <Empty icon={School} title={options.length ? "No classes yet" : "Add your modules first"}>
            Add each lecture, tutorial and lab once. They repeat every week, here and on your calendar.
          </Empty>
        ) : (
          <div className="glass overflow-x-auto rounded-[22px] p-4">
            <div className="grid min-w-[720px]" style={{ gridTemplateColumns: `56px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div />
              {days.map((d) => (
                <div key={d} className={cx("pb-3 text-center text-sm font-semibold", d === todayIdx && "text-accent")}>
                  {WEEKDAYS[d]}
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
                <div key={d} className={cx("relative border-l border-line", d === todayIdx && "bg-accent-soft/40")} style={{ height: hours.length * HOUR }}>
                  {hours.map((h, i) => (
                    <div key={h} className="absolute inset-x-0 border-t border-line/70" style={{ top: i * HOUR }} />
                  ))}
                  {d === todayIdx && nowMin >= top && nowMin <= top + hours.length * 60 && (
                    <div className="absolute inset-x-0 z-10 h-0.5 bg-danger" style={{ top: ((nowMin - top) / 60) * HOUR }}>
                      <span className="absolute -top-1 -left-1 h-2.5 w-2.5 rounded-full bg-danger" />
                    </div>
                  )}
                  {classes
                    .filter((c) => c.weekday === d)
                    .map((c) => {
                      const m = byId.get(c.module_id);
                      const color = m?.color ?? "#c3a6f4";
                      const s = toMin(c.start_time);
                      const e = toMin(c.end_time);
                      return (
                        <button
                          type="button"
                          key={c.id}
                          onClick={() => form.openEdit(c)}
                          className={cx("anim-item absolute inset-x-1 overflow-hidden rounded-2xl p-2 text-left text-[11px] leading-tight shadow-sm hover:z-20 hover:-translate-y-px", clash(c) && "ring-2 ring-danger")}
                          style={{
                            top: ((s - top) / 60) * HOUR + 2,
                            height: ((e - s) / 60) * HOUR - 4,
                            background: `linear-gradient(160deg, color-mix(in srgb, ${color} 80%, white), color-mix(in srgb, ${color} 55%, transparent))`,
                            color: "#2b1d26",
                            borderLeft: `4px solid color-mix(in srgb, ${color} 60%, #2b1d26)`,
                          }}
                          title={clash(c) ? "Overlaps another class" : undefined}
                        >
                          <span className="block truncate text-[12px] font-bold">{m?.code}</span>
                          <span className="block truncate">{c.kind}</span>
                          <span className="block truncate opacity-75">
                            {fmtTime(c.start_time)}–{fmtTime(c.end_time)}
                          </span>
                          {c.venue && (
                            <span className="mt-0.5 flex items-center gap-0.5 truncate opacity-75">
                              <MapPin size={10} /> {c.venue}
                            </span>
                          )}
                        </button>
                      );
                    })}
                </div>
              ))}
            </div>
          </div>
        )}
      </Page>
      <ClassForm state={form} />
    </>
  );
}
