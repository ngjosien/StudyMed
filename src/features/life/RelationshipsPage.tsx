import { useEffect, useRef, useState, type ReactNode } from "react";
import { Users, Plus, Pencil, Cake, Camera, X, Heart, Lightbulb, BookHeart, ImagePlus, Link2 } from "lucide-react";
import { api, db, type Row } from "../../lib/api";
import { useMutate, useRow, useRows } from "../../lib/hooks";
import { useDeepLinkForm } from "../../lib/deeplink";
import { daysUntil, fmtDate, today } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Badge, Button, Card, Checkbox, ConfirmDelete, Drawer, Empty, IconButton, Input, Page, PageHeader, Select, Textarea } from "../../components/ui";
import { FormModal, useFormState } from "../../components/form";
import { LocalImage, pickAndImportImage, pickAndImportImages } from "../../components/shared";
import { MarkdownEditor } from "../../components/markdown";
import { DateField } from "../../components/pickers";
import { Connections } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";

const REL_TAGS = ["Family", "Close Friend", "Friend", "Classmate", "Colleague", "Partner", "Mentor", "Other"];
const DETAIL_FIELDS: { value: string; label: string }[] = [
  { value: "favorite_food", label: "Favourite food / drinks" },
  { value: "coffee_order", label: "Coffee order" },
  { value: "allergies", label: "Allergies" },
  { value: "sizes", label: "Clothing / ring sizes" },
  { value: "gift_ideas", label: "Gift ideas" },
  { value: "likes", label: "Likes" },
  { value: "dislikes", label: "Dislikes" },
  { value: "how_we_met", label: "How we met" },
  { value: "custom", label: "Other…" },
];
const detailLabel = (d: Row) => (d.field === "custom" ? d.label || "Note" : DETAIL_FIELDS.find((f) => f.value === d.field)?.label ?? d.field);

/** Next birthday: { days, turning } for 'YYYY-MM-DD' or '--MM-DD'. */
export function nextBirthday(bd?: string | null) {
  if (!bd) return null;
  const m = /^(\d{4}|-)-?(\d{2})-(\d{2})$/.exec(bd.startsWith("--") ? `-${bd.slice(1)}` : bd);
  if (!m) return null;
  const month = Number(m[2]);
  const day = Number(m[3]);
  const now = new Date();
  let year = now.getFullYear();
  const mk = (y: number) => `${y}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  if (mk(year) < today()) year += 1;
  const birthYear = m[1] !== "-" ? Number(m[1]) : null;
  return { days: daysUntil(mk(year)) ?? 0, turning: birthYear ? year - birthYear : null, date: mk(year) };
}

function Avatar({ p, size = 56 }: { p: Row; size?: number }) {
  return p.photo_path ? (
    <LocalImage path={p.photo_path} className="shrink-0 rounded-full object-cover" alt={p.name} />
  ) : (
    <div
      className="flex shrink-0 items-center justify-center rounded-full bg-accent-soft font-semibold text-accent"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
    >
      {String(p.name)
        .split(/\s+/)
        .map((s) => s[0])
        .slice(0, 2)
        .join("")
        .toUpperCase()}
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof Heart; title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold">
        <Icon size={14} className="text-accent" /> {title}
      </h3>
      {children}
    </section>
  );
}

function Details({ personId }: { personId: number }) {
  const mutate = useMutate();
  const { rows } = useRows("person_details", { person_id: personId }, "field, position, id");
  const [field, setField] = useState("favorite_food");
  const [label, setLabel] = useState("");
  const [value, setValue] = useState("");
  return (
    <div>
      {rows.length > 0 && (
        <dl className="mb-2 divide-y divide-line rounded-lg border border-line">
          {rows.map((d) => (
            <div key={d.id} className="group flex items-start gap-3 px-3 py-2 text-sm">
              <dt className="w-40 shrink-0 text-muted">{detailLabel(d)}</dt>
              <dd className="flex-1 whitespace-pre-wrap">{d.value}</dd>
              <IconButton icon={X} label="Remove" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("person_details", d.id))} />
            </div>
          ))}
        </dl>
      )}
      <form
        className="flex flex-wrap gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!value.trim()) return;
          await mutate(db.insert("person_details", { person_id: personId, field, label: field === "custom" ? label.trim() || null : null, value: value.trim() }));
          setValue("");
          setLabel("");
        }}
      >
        <Select className="w-48" value={field} onChange={(e) => setField(e.target.value)} options={DETAIL_FIELDS} />
        {field === "custom" && <Input className="w-32" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Label" />}
        <Input className="min-w-40 flex-1" value={value} onChange={(e) => setValue(e.target.value)} placeholder="e.g. Iced oat latte, less sweet" />
        <Button type="submit" icon={Plus} disabled={!value.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

function Memories({ personId }: { personId: number }) {
  const mutate = useMutate();
  const { rows } = useRows("person_memories", { person_id: personId }, "date desc, id desc");
  const photos = useRows("attachments", { entity_type: "person_memories", entity_id: { in: rows.map((r) => r.id) } }, "position, id", rows.length > 0).rows;
  const [date, setDate] = useState(today());
  const [text, setText] = useState("");
  const addPhotos = async (memoryId: number) => {
    const paths = await pickAndImportImages("memories");
    if (!paths.length) return;
    await mutate(
      db.insertMany(
        "attachments",
        paths.map((p) => ({ entity_type: "person_memories", entity_id: memoryId, kind: "image", path_or_url: p, label: "photo" })),
      ),
    );
  };
  return (
    <div>
      <form
        className="mb-3 space-y-2 rounded-lg border border-line p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!text.trim()) return;
          await mutate(db.insert("person_memories", { person_id: personId, date, text: text.trim() }));
          setText("");
        }}
      >
        <div className="flex gap-2">
          <DateField className="w-48" value={date} clearable={false} onChange={(d) => d && setDate(d)} />
          <Button type="submit" icon={Plus} disabled={!text.trim() || !date} className="ml-auto">
            Add memory
          </Button>
        </div>
        <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="What happened?" className="min-h-16" />
      </form>
      <ol className="relative space-y-4 border-l border-line pl-4">
        {rows.map((m) => (
          <li key={m.id} className="group relative">
            <span className="absolute top-1.5 -left-[21px] h-2.5 w-2.5 rounded-full bg-accent" />
            <div className="flex items-center gap-2 text-xs text-muted">
              {fmtDate(m.date)}
              <span className="ml-auto flex opacity-0 group-hover:opacity-100">
                <IconButton icon={ImagePlus} label="Add photos" onClick={() => addPhotos(m.id)} />
                <ConfirmDelete iconOnly label="Delete memory" onConfirm={() => mutate(db.remove("person_memories", m.id))} />
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{m.text}</p>
            {photos.some((p) => p.entity_id === m.id) && (
              <div className="mt-2 flex flex-wrap gap-2">
                {photos
                  .filter((p) => p.entity_id === m.id)
                  .map((p) => (
                    <div key={p.id} className="group/ph relative">
                      <LocalImage path={p.path_or_url} className="h-24 w-24 rounded-lg object-cover" />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        className="absolute top-1 right-1 hidden rounded-full bg-black/60 p-0.5 text-white group-hover/ph:block"
                        onClick={() =>
                          mutate(async () => {
                            await api.fileDelete(p.path_or_url).catch(() => undefined);
                            await db.remove("attachments", p.id);
                          })
                        }
                      >
                        <X size={12} />
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}

function Plans({ personId }: { personId: number }) {
  const mutate = useMutate();
  const { rows } = useRows("person_plans", { person_id: personId }, "id");
  const [title, setTitle] = useState("");
  return (
    <div>
      <ul className="space-y-1">
        {rows.map((p) => (
          <li key={p.id} className="group flex items-center gap-2 rounded-lg px-1 py-0.5 hover:bg-surface-2">
            <Checkbox checked={!!p.done} onChange={(d) => mutate(db.update("person_plans", p.id, { done: d ? 1 : 0 }))} />
            <span className={cx("flex-1 text-sm", p.done && "text-muted line-through")}>{p.title}</span>
            <IconButton icon={X} label="Remove" className="opacity-0 group-hover:opacity-100" onClick={() => mutate(db.remove("person_plans", p.id))} />
          </li>
        ))}
      </ul>
      <form
        className="mt-1 flex gap-2"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!title.trim()) return;
          await mutate(db.insert("person_plans", { person_id: personId, title: title.trim() }));
          setTitle("");
        }}
      >
        <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Hangout or trip idea…" className="h-8 flex-1" />
        <Button size="sm" type="submit" icon={Plus} disabled={!title.trim()}>
          Add
        </Button>
      </form>
    </div>
  );
}

function GeneralNotes({ person }: { person: Row }) {
  const mutate = useMutate();
  const [v, setV] = useState(person.general_notes_md ?? "");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => setV(person.general_notes_md ?? ""), [person.id]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <MarkdownEditor
      value={v}
      minHeight={120}
      subdir="people"
      onChange={(s) => {
        setV(s);
        clearTimeout(t.current);
        t.current = setTimeout(() => mutate(db.update("people", person.id, { general_notes_md: s })), 700);
      }}
    />
  );
}

function Profile({ id, onEdit }: { id: number; onEdit: (p: Row) => void }) {
  const mutate = useMutate();
  const p = useRow("people", id).data;
  if (!p) return null;
  const nb = nextBirthday(p.birthday);
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <button
          type="button"
          title="Change photo"
          className="group relative h-20 w-20 shrink-0 overflow-hidden rounded-full [&_img]:h-20 [&_img]:w-20"
          onClick={async () => {
            const rel = await pickAndImportImage("people");
            if (rel) await mutate(db.update("people", p.id, { photo_path: rel }));
          }}
        >
          <Avatar p={p} size={80} />
          <span className="absolute inset-0 hidden items-center justify-center bg-black/40 text-white group-hover:flex">
            <Camera size={18} />
          </span>
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xl font-semibold">{p.name}</div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-sm text-muted">
            {p.relationship_tag && <Badge color="#f4a6c0">{p.relationship_tag}</Badge>}
            {nb && (
              <span className="inline-flex items-center gap-1">
                <Cake size={13} />
                {fmtDate(nb.date)}
                {nb.turning ? ` · turns ${nb.turning}` : ""} · {nb.days === 0 ? "today" : `in ${nb.days} days`}
              </span>
            )}
          </div>
        </div>
        <Button size="sm" icon={Pencil} onClick={() => onEdit(p)}>
          Edit
        </Button>
      </div>
      <Section icon={Heart} title="Little details">
        <Details personId={p.id} />
      </Section>
      <Section icon={BookHeart} title="Memories">
        <Memories personId={p.id} />
      </Section>
      <Section icon={Lightbulb} title="Plans">
        <Plans personId={p.id} />
      </Section>
      <Section icon={Pencil} title="General notes">
        <GeneralNotes person={p} />
      </Section>
      <Section icon={Link2} title="Connected pages">
        <Connections type="people" id={p.id} />
      </Section>
    </div>
  );
}

const KINDS = ["events", "todos", "moments", "journal_entries", "homework", "exams", "savings_goals", "transactions"];
const ORDER = ["Partner", "Family", "Close Friend", "Friend", "Classmate", "Mentor", "Colleague", "Other"];
const rank = (p: Row) => (p.relationship_tag ? ORDER.indexOf(p.relationship_tag) : ORDER.length);

export default function RelationshipsPage() {
  const [openId, setOpenId] = useState<number | null>(null);
  const form = useFormState();
  useDeepLinkForm("people", form, undefined, (r) => setOpenId(r.id));
  const { rows } = useRows("people", undefined, "id");
  const open = rows.find((p) => p.id === openId);
  const sorted = [...rows].sort((a, b) => rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)));

  return (
    <>
      <PageHeader
        title="Relationships"
        icon={Users}
        subtitle="The people who matter — and the little things worth remembering"
        actions={
          <Button variant="primary" icon={Plus} onClick={() => form.openNew()}>
            Add person
          </Button>
        }
      />
      <Page className="space-y-4">
        <LinkedSections
          type="people"
          rows={sorted}
          kinds={KINDS}
          heading={(p) => p.relationship_tag ?? "Not grouped"}
          grid="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]"
          empty={
            <Empty icon={Users} title="No one here yet">
              Add friends and family to remember birthdays, coffee orders, gift ideas and shared memories.
            </Empty>
          }
          render={(p) => {
            const nb = nextBirthday(p.birthday);
            return (
              <Card onClick={() => setOpenId(p.id)} className="flex h-full flex-col items-center p-5 text-center [&_img]:h-16 [&_img]:w-16">
                <Avatar p={p} size={64} />
                <div className="mt-3 font-semibold">{p.name}</div>
                {p.relationship_tag && <div className="text-xs text-muted">{p.relationship_tag}</div>}
                {nb && (
                  <div className="mt-2 inline-flex items-center gap-1 text-xs text-muted">
                    <Cake size={12} /> {nb.days === 0 ? "Today" : `${nb.days}d`}
                  </div>
                )}
                <LinkChips type="people" id={p.id} max={2} />
              </Card>
            );
          }}
        />
      </Page>
      <Drawer open={!!open} onClose={() => setOpenId(null)} title={open?.name} width="w-[680px]">
        {openId && <Profile id={openId} onEdit={form.openEdit} />}
      </Drawer>
      <FormModal
        open={form.open}
        onClose={form.close}
        title={form.record ? "Edit person" : "Add person"}
        table="people"
        record={form.record}
        defaults={form.defaults}
        onSaved={(r) => !form.record && setOpenId(r.id)}
        image={{ key: "photo_path", subdir: "people", round: true }}
        fields={[
          { key: "name", label: "Name", type: "text", required: true, placeholder: "Their name" },
          { key: "relationship_tag", label: "Relationship", type: "select", options: REL_TAGS },
          { key: "birthday", label: "Birthday", type: "date" },
          { key: "year_unknown", label: "Birth year", type: "checkbox", placeholder: "I don't know the year", showIf: (v) => !!v.birthday },
          {
            key: "birthday_remind_days",
            label: "Birthday reminder",
            type: "select",
            numeric: true,
            placeholder: "No reminder",
            showIf: (v) => !!v.birthday,
            options: [
              { value: 0, label: "On the day" },
              { value: 1, label: "1 day before" },
              { value: 3, label: "3 days before" },
              { value: 7, label: "1 week before" },
              { value: 14, label: "2 weeks before" },
            ],
          },
        ]}
        prepare={(v) => {
          if (typeof v.birthday === "string" && v.birthday.startsWith("--")) {
            return { ...v, birthday: `2000-${v.birthday.slice(2)}`, year_unknown: 1 };
          }
          return { ...v, year_unknown: 0 };
        }}
        transform={(v) => {
          const out = { ...v };
          if (out.birthday && out.year_unknown) out.birthday = `--${String(out.birthday).slice(5)}`;
          delete out.year_unknown;
          return out;
        }}
      />
    </>
  );
}
