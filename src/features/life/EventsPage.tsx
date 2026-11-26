import { useState } from "react";
import { Link } from "react-router-dom";
import { PartyPopper, Plus, Pencil, MapPin, Clock, X, Users, CalendarOff, CalendarDays } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRow, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { fmtDateTime, fmtMonth, fmtTime, parse, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Badge, Button, Card, Checkbox, Drawer, Empty, IconButton, Input, Page, PageHeader } from "../../components/ui";
import { FormModal, useFormState } from "../../components/form";
import { CountdownBadge, LocalImage } from "../../components/shared";
import { Connections } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";
import { MarkdownView } from "../../components/markdown";

export const EVENT_TYPES = ["Social", "Appointment", "Travel", "Celebration", "Study", "Work", "Other"];
const TYPE_COLOR: Record<string, string> = {
  Social: "#c3a6f4",
  Appointment: "#a6c8f4",
  Travel: "#a6e3d0",
  Celebration: "#f4a6c0",
  Study: "#f4d8a6",
  Work: "#b8c0cc",
  Other: "#f4b8a6",
};

function Checklist({ eventId }: { eventId: number }) {
  const mutate = useMutate();
  const { rows } = useRows("event_checklist", { event_id: eventId }, "position, id");
  const [text, setText] = useState("");
  return (
    <div>
      <ul className="space-y-1">
        {rows.map((c) => (
          <li key={c.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-2">
            <Checkbox checked={!!c.done} onChange={(d) => mutate(db.update("event_checklist", c.id, { done: d ? 1 : 0 }))} />
            <span className={cx("flex-1 text-sm", c.done && "text-muted line-through")}>{c.text}</span>
            <IconButton icon={X} label="Remove" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("event_checklist", c.id))} />
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await mutate(db.insert("event_checklist", { event_id: eventId, text: text.trim(), position: rows.length }));
          setText("");
        }}
      >
        <Input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add checklist item (book table, buy gift…)" className="h-8 flex-1" />
        <Button size="sm" type="submit" icon={Plus} disabled={!text.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

function EventDetail({ id }: { id: number }) {
  const e = useRow("events", id).data;
  const personIds = useRows("event_people", { event_id: id }).rows.map((r) => r.person_id);
  const people = useRows("people", { id: { in: personIds } }, "name", personIds.length > 0).rows;
  if (!e) return null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <Badge color={TYPE_COLOR[e.type]}>{e.type}</Badge>
        <CountdownBadge date={e.start_at} />
        {!e.sync_calendar ? (
          <Badge>
            <CalendarOff size={11} /> Hidden from calendar
          </Badge>
        ) : (
          <Link to={`/calendar?date=${String(e.start_at).slice(0, 10)}`} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent hover:brightness-95">
            <CalendarDays size={12} /> Show in calendar
          </Link>
        )}
      </div>
      <div className="space-y-1.5 text-sm">
        <div className="flex items-center gap-2">
          <Clock size={14} className="text-muted" />
          {e.all_day ? fmtDateTime(e.start_at.slice(0, 10)) : fmtDateTime(e.start_at)}
          {e.end_at && !e.all_day && ` – ${e.end_at.slice(0, 10) === e.start_at.slice(0, 10) ? fmtTime(e.end_at) : fmtDateTime(e.end_at)}`}
        </div>
        {e.location && (
          <div className="flex items-center gap-2">
            <MapPin size={14} className="text-muted" />
            {e.location}
          </div>
        )}
      </div>
      {people.length > 0 && (
        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
            <Users size={14} /> With
          </h3>
          <div className="flex flex-wrap gap-2">
            {people.map((p) => (
              <Link key={p.id} to={`/life/relationships?id=${p.id}`} className="flex items-center gap-2 rounded-full border border-line py-0.5 pr-3 pl-0.5 text-sm hover:border-accent">
                {p.photo_path ? (
                  <LocalImage path={p.photo_path} className="h-6 w-6 rounded-full object-cover" />
                ) : (
                  <span className="flex h-6 w-6 items-center justify-center rounded-full bg-accent-soft text-[11px] font-semibold text-accent">{p.name[0]}</span>
                )}
                {p.name}
              </Link>
            ))}
          </div>
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Checklist</h3>
        <Checklist eventId={id} />
      </div>
      {e.notes_md && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Notes</h3>
          <MarkdownView source={e.notes_md} />
        </div>
      )}
      <div>
        <h3 className="mb-2 text-sm font-semibold">Connected pages</h3>
        <Connections type="events" id={id} />
      </div>
    </div>
  );
}

export function EventForm({ state }: { state: ReturnType<typeof useFormState> }) {
  const { rows: people } = useRows("people", undefined, "name");
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit event" : "New event"}
      table="events"
      record={state.record}
      defaults={{ type: "Social", sync_calendar: 1, all_day: 0, ...state.defaults }}
      fields={[
        { key: "name", label: "Event name", type: "text", required: true, placeholder: "What's happening?" },
        { key: "type", label: "Kind", type: "select", options: EVENT_TYPES.map((t) => ({ value: t, label: t, color: TYPE_COLOR[t] })), required: true },
        { key: "start_at", label: "Starts", type: "datetime", required: true },
        { key: "location", label: "Where", type: "text", full: true, placeholder: "Add a place" },
        { key: "all_day", label: "All day", type: "checkbox", placeholder: "All day" },
        { key: "sync_calendar", label: "Calendar", type: "checkbox", placeholder: "Show on calendar" },
        { key: "end_at", label: "Ends", type: "datetime", more: true },
        { key: "notes_md", label: "Notes", type: "markdown", more: true },
      ]}
      transform={(v) => {
        if (v.end_at && v.start_at && v.end_at < v.start_at) throw new Error("The event can't end before it starts");
        return v;
      }}
      links={[{ table: "event_people", col: "event_id", otherCol: "person_id", label: "Who's going", options: people.map((p) => ({ value: p.id, label: p.name })) }]}
      reminders={{
        entityType: "events",
        base: (v) => (v.all_day ? String(v.start_at ?? "").slice(0, 10) : v.start_at),
        title: (v) => `Upcoming: ${v.name}`,
        body: (v) => [fmtDateTime(v.start_at), v.location].filter(Boolean).join(" · "),
      }}
    />
  );
}

const KINDS = ["people", "homework", "exams", "modules", "portfolio_entries", "savings_goals", "todos"];

export default function EventsPage() {
  const [openId, setOpenId] = useState<number | null>(null);
  const form = useFormState();
  useDeepLinkForm("events", form, undefined, (r) => setOpenId(r.id));
  const { rows: all } = useRows("events", undefined, "start_at, id");
  const open = all.find((e) => e.id === openId);
  const t = today();
  const isPast = (e: Row) => String(e.end_at ?? e.start_at).slice(0, 10) < t;
  const rows = [...all.filter((e) => !isPast(e)), ...all.filter(isPast).reverse()];

  return (
    <>
      <PageHeader
        title="Events"
        icon={PartyPopper}
        subtitle="Plans and occasions"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
            New event
          </Button>
        }
      />
      <Page className="space-y-4">
        <LinkedSections
          type="events"
          rows={rows}
          kinds={KINDS}
          heading={(e) => (isPast(e) ? "Memories" : fmtMonth(parse(e.start_at) ?? new Date()))}
          grid="grid gap-3 md:grid-cols-2"
          empty={
            <Empty icon={PartyPopper} title="No events yet">
              Add dinners, appointments, trips and celebrations. They appear on your calendar automatically.
            </Empty>
          }
          render={(e) => (
            <Card onClick={() => setOpenId(e.id)} className="h-full p-4">
              <div className="flex items-center gap-4">
                <div className="w-16 shrink-0 rounded-[16px] py-2 text-center" style={{ background: `color-mix(in srgb, ${TYPE_COLOR[e.type]} 40%, transparent)` }}>
                  <div className="text-xs font-medium uppercase text-accent">{parse(e.start_at)?.toLocaleDateString(undefined, { month: "short" })}</div>
                  <div className="font-display text-xl leading-tight font-semibold">{Number(String(e.start_at).slice(8, 10))}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{e.name}</div>
                  <div className="truncate text-sm text-muted">
                    {e.all_day ? "All day" : fmtTime(e.start_at)}
                    {e.location ? ` · ${e.location}` : ""}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <Badge color={TYPE_COLOR[e.type]}>{e.type}</Badge>
                  <CountdownBadge date={e.start_at} />
                </div>
              </div>
              <LinkChips type="events" id={e.id} />
            </Card>
          )}
        />
      </Page>
      <Drawer
        open={!!open}
        onClose={() => setOpenId(null)}
        title={open?.name}
        actions={
          open && (
            <Button size="sm" icon={Pencil} onClick={() => form.openEdit(open as Row)}>
              Edit
            </Button>
          )
        }
      >
        {openId && <EventDetail id={openId} />}
      </Drawer>
      <EventForm state={form} />
    </>
  );
}
