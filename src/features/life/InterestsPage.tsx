import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Sparkles, Plus, Settings2, ArrowLeft, ArrowRight, X, ExternalLink, Check } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRows, useTagsBy } from "../../lib/hooks";
import { truthy } from "../../lib/format";
import { Badge, Button, Card, ConfirmDelete, Empty, Field, IconButton, Input, Modal, Page, PageHeader, Progress, Rating, Select, Tabs, Textarea } from "../../components/ui";
import { ChoiceField, DateField, Toggle } from "../../components/pickers";
import { Connections, saveLinks, type Ref } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";
import { MarkdownEditor, MarkdownView } from "../../components/markdown";
import { TagInput } from "../../components/shared";
import { toast } from "../../stores/toast";

type FType = "text" | "longtext" | "number" | "url" | "bool" | "progress" | "date";
interface FDef {
  key: string;
  label: string;
  type: FType;
}
const FTYPES: { value: FType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "longtext", label: "Long text" },
  { value: "number", label: "Number" },
  { value: "url", label: "Link" },
  { value: "bool", label: "Yes / no" },
  { value: "progress", label: "Progress %" },
  { value: "date", label: "Date" },
];
const json = <T,>(s: unknown, d: T): T => {
  try {
    return s ? (JSON.parse(String(s)) as T) : d;
  } catch {
    return d;
  }
};
const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "") || `f${Date.now()}`;
const STATUS_PALETTE = ["#b8c0cc", "#a6c8f4", "#a6e3d0", "#f4d8a6", "#c3a6f4", "#f4a6c0"];

/* ---------------------------------------------------------- Tab settings */
function TabSettings({ tab, onClose, isNew }: { tab: Row | null; onClose: () => void; isNew: boolean }) {
  const mutate = useMutate();
  const [name, setName] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [fields, setFields] = useState<FDef[]>([]);
  const [nf, setNf] = useState<{ label: string; type: FType }>({ label: "", type: "text" });
  useEffect(() => {
    if (!tab) return;
    setName(tab.name ?? "");
    setStatuses(json<string[]>(tab.statuses_json, ["To Do", "In Progress", "Done"]));
    setFields(json<FDef[]>(tab.fields_json, []));
  }, [tab]);
  if (!tab) return null;
  const save = async () => {
    if (!name.trim()) return toast.error("Give the tab a name");
    const values = { name: name.trim(), statuses_json: JSON.stringify(statuses), fields_json: JSON.stringify(fields) };
    await mutate(isNew ? db.insert("interest_tabs", { ...values, position: tab.position ?? 0 }) : db.update("interest_tabs", tab.id, values));
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? "New tab" : `Customise “${tab.name}”`}
      width="max-w-2xl"
      footer={
        <>
          {!isNew && (
            <div className="mr-auto">
              <ConfirmDelete
                label="Delete tab & items"
                onConfirm={async () => {
                  await mutate(db.remove("interest_tabs", tab.id));
                  onClose();
                }}
              />
            </div>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <Field label="Tab name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Podcasts" autoFocus />
        </Field>
        <Field label="Statuses" hint="Order matters">
          <TagInput value={statuses} onChange={setStatuses} placeholder="Add a status and press Enter" />
        </Field>
        <div>
          <div className="mb-1 text-xs font-medium text-muted">Details to track (title, status, rating, notes and tags are built in)</div>
          <ul className="mb-2 divide-y divide-line rounded-lg border border-line">
            {fields.length === 0 && <li className="px-3 py-2 text-sm text-muted">No custom fields.</li>}
            {fields.map((f, i) => (
              <li key={f.key} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <Input value={f.label} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className="h-8 flex-1" />
                <Select value={f.type} onChange={(e) => setFields(fields.map((x, j) => (j === i ? { ...x, type: e.target.value as FType } : x)))} options={FTYPES} className="h-8 w-36" />
                <IconButton icon={ArrowLeft} label="Move up" className="rotate-90" disabled={i === 0} onClick={() => setFields(fields.map((x, j) => (j === i - 1 ? fields[i] : j === i ? fields[i - 1] : x)))} />
                <IconButton icon={X} label="Remove field" onClick={() => setFields(fields.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ul>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!nf.label.trim()) return;
              let key = slug(nf.label);
              while (fields.some((f) => f.key === key)) key += "_";
              setFields([...fields, { key, label: nf.label.trim(), type: nf.type }]);
              setNf({ label: "", type: "text" });
            }}
          >
            <Input value={nf.label} onChange={(e) => setNf({ ...nf, label: e.target.value })} placeholder="New field label" className="flex-1" />
            <Select value={nf.type} onChange={(e) => setNf({ ...nf, type: e.target.value as FType })} options={FTYPES} className="w-36" />
            <Button type="submit" icon={Plus} disabled={!nf.label.trim()}>
              Add field
            </Button>
          </form>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Item editor */
function ItemEditor({ tab, item, onClose }: { tab: Row; item: Row | null; onClose: () => void }) {
  const mutate = useMutate();
  const fields = json<FDef[]>(tab.fields_json, []);
  const statuses = json<string[]>(tab.statuses_json, []);
  const scope = `interest:${tab.id}`;
  const tagDefs = useRows("tags", { scope }, "name").rows;
  const [v, setV] = useState<Row>({});
  const [tags, setTags] = useState<string[]>([]);
  const [pending, setPending] = useState<Ref[]>([]);
  useEffect(() => {
    if (!item) return;
    setV({ ...item, values: json<Row>(item.values_json, {}) });
    setTags([]);
    setPending([]);
    if (item.id) db.tagsFor("interest_items", scope).then((r) => setTags(r.filter((t) => t.entity_id === item.id).map((t) => t.name)));
  }, [item]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!item) return null;
  const setVal = (k: string, val: unknown) => setV((p) => ({ ...p, values: { ...p.values, [k]: val } }));
  const save = async () => {
    if (!String(v.title ?? "").trim()) return toast.error("Title is required");
    const values = {
      tab_id: tab.id,
      title: String(v.title).trim(),
      status: v.status || null,
      rating: v.rating || null,
      values_json: JSON.stringify(v.values ?? {}),
      notes_md: v.notes_md || null,
    };
    await mutate(async () => {
      const r = item.id ? await db.update("interest_items", item.id, values) : await db.insert("interest_items", values);
      await db.tagsSet("interest_items", r.id, scope, tags);
      if (!item.id) await saveLinks("interest_items", r.id, pending);
    });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={item.id ? "Edit" : `Add to ${tab.name}`}
      width="max-w-2xl"
      footer={
        <>
          {item.id && (
            <div className="mr-auto">
              <ConfirmDelete
                onConfirm={async () => {
                  await mutate(db.remove("interest_items", item.id));
                  onClose();
                }}
              />
            </div>
          )}
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {item.id ? "Save" : "Add"}
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-3">
        <Field label="Title *" className="col-span-2">
          <Input value={v.title ?? ""} onChange={(e) => setV({ ...v, title: e.target.value })} autoFocus className="h-12 w-full text-lg font-semibold" />
        </Field>
        <Field label="Status">
          <ChoiceField options={statuses.map((s) => ({ value: s, label: s }))} value={v.status} clearable onChange={(s) => setV({ ...v, status: s })} />
        </Field>
        <Field label="Rating">
          <Rating value={Number(v.rating ?? 0)} onChange={(r) => setV({ ...v, rating: r })} size={20} />
        </Field>
        {fields.map((f) => {
          const val = v.values?.[f.key];
          const wide = f.type === "longtext";
          return (
            <Field key={f.key} label={f.label} className={wide ? "col-span-2" : ""}>
              {f.type === "longtext" ? (
                <Textarea value={val ?? ""} onChange={(e) => setVal(f.key, e.target.value)} />
              ) : f.type === "bool" ? (
                <Toggle checked={truthy(val)} onChange={(c) => setVal(f.key, c)} label={f.label} />
              ) : f.type === "progress" ? (
                <div className="flex items-center gap-2">
                  <input type="range" min={0} max={100} value={Number(val ?? 0)} onChange={(e) => setVal(f.key, Number(e.target.value))} className="flex-1 accent-[var(--accent)]" />
                  <span className="w-10 text-right text-sm tabular-nums">{Number(val ?? 0)}%</span>
                </div>
              ) : f.type === "date" ? (
                <DateField value={val} onChange={(d) => setVal(f.key, d)} />
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "url" ? "url" : "text"}
                  value={val ?? ""}
                  onChange={(e) => setVal(f.key, f.type === "number" ? (e.target.value === "" ? null : Number(e.target.value)) : e.target.value)}
                />
              )}
            </Field>
          );
        })}
        <Field label="Tags" className="col-span-2">
          <TagInput value={tags} onChange={setTags} suggestions={tagDefs.map((t) => t.name)} />
        </Field>
        <div className="col-span-2 space-y-3">
          <Field label="Connected pages">
            <Connections type="interest_items" id={item.id} pending={pending} setPending={setPending} />
          </Field>
        </div>
        <Field label="Notes" className="col-span-2">
          <MarkdownEditor value={v.notes_md ?? ""} onChange={(s) => setV({ ...v, notes_md: s })} minHeight={120} subdir="interests" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Page */
const KINDS = ["people", "events", "savings_goals", "moments", "todos"];

function TabView({ tab, onEdit }: { tab: Row; onEdit: (r: Row) => void }) {
  const { rows: items } = useRows("interest_items", { tab_id: tab.id }, "id");
  const scope = `interest:${tab.id}`;
  const tags = useTagsBy("interest_items", scope);
  const statuses = json<string[]>(tab.statuses_json, []);
  const fields = json<FDef[]>(tab.fields_json, []);
  const statusColor = (s: string) => STATUS_PALETTE[Math.max(0, statuses.indexOf(s)) % STATUS_PALETTE.length];

  return (
    <div className="space-y-4">
      <LinkedSections
        type="interest_items"
        rows={items}
        kinds={KINDS}
        grid="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]"
        empty={<Empty icon={Sparkles} title={`Nothing in ${tab.name} yet`} />}
        render={(it) => {
          const vals = json<Row>(it.values_json, {});
          return (
            <Card onClick={() => onEdit(it)} className="h-full p-4">
              <div className="mb-1 flex items-start gap-2">
                <div className="font-display flex-1 font-semibold">{it.title}</div>
                {it.status && <Badge color={statusColor(it.status)}>{it.status}</Badge>}
              </div>
              {it.rating ? <Rating value={it.rating} size={13} /> : null}
              <dl className="mt-2 space-y-1 text-sm">
                {fields.map((f) => {
                  const val = vals[f.key];
                  if (val === undefined || val === null || val === "") return null;
                  return (
                    <div key={f.key} className="flex gap-2">
                      <dt className="w-24 shrink-0 text-muted">{f.label}</dt>
                      <dd className="min-w-0 flex-1">
                        {f.type === "progress" ? (
                          <div className="flex items-center gap-2">
                            <Progress value={Number(val)} /> <span className="text-xs">{val}%</span>
                          </div>
                        ) : f.type === "bool" ? (
                          truthy(val) ? <Check size={14} className="text-accent" /> : <span className="text-muted">No</span>
                        ) : f.type === "url" ? (
                          <button
                            type="button"
                            className="inline-flex max-w-full items-center gap-1 truncate text-accent hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              openUrl(String(val)).catch((err) => toast.error(String(err)));
                            }}
                          >
                            <ExternalLink size={12} className="shrink-0" />
                            <span className="truncate">{String(val).replace(/^https?:\/\//, "")}</span>
                          </button>
                        ) : f.type === "longtext" ? (
                          <span className="line-clamp-3 whitespace-pre-wrap">{String(val)}</span>
                        ) : (
                          <span className="truncate">{String(val)}</span>
                        )}
                      </dd>
                    </div>
                  );
                })}
              </dl>
              {it.notes_md && <MarkdownView source={it.notes_md} className="mt-2 line-clamp-3 text-sm text-muted" />}
              {tags.by.get(it.id)?.length ? (
                <div className="mt-2 flex flex-wrap gap-1">
                  {tags.by.get(it.id)!.map((t) => (
                    <Badge key={t}>#{t}</Badge>
                  ))}
                </div>
              ) : null}
              <LinkChips type="interest_items" id={it.id} />
            </Card>
          );
        }}
      />
    </div>
  );
}

export default function InterestsPage() {
  const mutate = useMutate();
  const [params, setParams] = useSearchParams();
  const { rows: tabs } = useRows("interest_tabs", undefined, "position, id");
  const [tabId, setTabId] = useState<number | null>(null);
  const tab = tabs.find((t) => t.id === tabId) ?? tabs[0];
  const [editing, setEditing] = useState<Row | null>(null);
  const [settings, setSettings] = useState<{ tab: Row; isNew: boolean } | null>(null);
  const statuses = json<string[]>(tab?.statuses_json, []);

  useEffect(() => {
    const id = params.get("id");
    if (id) {
      db.get("interest_items", Number(id))
        .then((r) => {
          setTabId(r.tab_id);
          setEditing(r);
        })
        .catch(() => undefined);
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const moveTab = async (dir: -1 | 1) => {
    if (!tab) return;
    const idx = tabs.findIndex((t) => t.id === tab.id);
    const j = idx + dir;
    if (j < 0 || j >= tabs.length) return;
    const ids = tabs.map((t) => t.id as number);
    [ids[idx], ids[j]] = [ids[j], ids[idx]];
    await mutate(db.reorder("interest_tabs", ids));
  };

  return (
    <>
      <PageHeader
        title="Interests"
        icon={Sparkles}
        subtitle="Shows, books, things to learn, places to try — your way"
        actions={
          tab && (
            <Button variant="primary" icon={Plus} onClick={() => setEditing({ status: statuses[0] ?? null })}>
              Add item
            </Button>
          )
        }
      >
        <div className="flex flex-wrap items-center gap-2">
          {tabs.length > 0 && <Tabs value={tab?.id ?? 0} onChange={(id) => setTabId(id)} tabs={tabs.map((t) => ({ value: t.id as number, label: t.name }))} />}
          <IconButton
            icon={Plus}
            label="New tab"
            onClick={() => setSettings({ tab: { name: "", statuses_json: '["To Do","In Progress","Done"]', fields_json: "[]", position: tabs.length }, isNew: true })}
          />
          {tab && (
            <div className="ml-auto flex items-center">
              <IconButton icon={ArrowLeft} label="Move tab left" onClick={() => moveTab(-1)} />
              <IconButton icon={ArrowRight} label="Move tab right" onClick={() => moveTab(1)} />
              <IconButton icon={Settings2} label="Customise tab (rename, statuses, fields)" onClick={() => setSettings({ tab, isNew: false })} />
            </div>
          )}
        </div>
      </PageHeader>
      <Page>
        {!tab ? (
          <Empty icon={Sparkles} title="No tabs">
            Create a tab to start collecting.
          </Empty>
        ) : (
          <TabView key={tab.id} tab={tab} onEdit={setEditing} />
        )}
      </Page>
      {tab && editing && <ItemEditor tab={tab} item={editing} onClose={() => setEditing(null)} />}
      {settings && <TabSettings tab={settings.tab} isNew={settings.isNew} onClose={() => setSettings(null)} />}
    </>
  );
}
