// The add/edit sheet used across the app: live preview on the left, a soft form on the right.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { Bell, Camera, ChevronDown, Gift, Link2, Paperclip, Plus, Tag, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { api, db, type Row } from "../lib/api";
import { useMutate } from "../lib/hooks";
import { cx, fmtMoney, fromCents, toCents, truthy } from "../lib/format";
import { fmtDateShort, fmtDateTime } from "../lib/dates";
import { RECORDS } from "../lib/records";
import { Button, ColorPicker, ConfirmDelete, IconButton, Input, Rating, Textarea } from "./ui";
import { ChoiceField, DateField, DateTimeField, TimeField, Toggle } from "./pickers";
import { AttachmentList, LocalImage, MultiSelect, pickAndImportImage, ReminderPicker, TagInput } from "./shared";
import { Connections, saveLinks, type Ref } from "./connections";
import { toast } from "../stores/toast";

export type FieldType =
  | "text"
  | "textarea"
  | "markdown"
  | "number"
  | "money"
  | "date"
  | "datetime"
  | "time"
  | "select"
  | "checkbox"
  | "color"
  | "rating"
  | "url";

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  options?: (string | { value: string | number; label: string; color?: string | null })[];
  numeric?: boolean; // select whose values are ids
  required?: boolean;
  placeholder?: string;
  full?: boolean;
  /** Tucked under "More details". */
  more?: boolean;
  hint?: string;
  showIf?: (v: Row) => boolean;
}

export interface ReminderCfg {
  entityType: string;
  base: (v: Row) => string | null | undefined;
  title: (v: Row) => string;
  body?: (v: Row) => string;
}
export interface TagCfg {
  entityType: string;
  scope: string;
  label?: string;
}
export interface LinkCfg {
  table: string;
  col: string;
  otherCol: string;
  label: string;
  options: { value: number; label: string; color?: string | null }[];
}
export interface AttachCfg {
  entityType: string;
  subdir: string;
}

const optionsOf = (f: FieldDef) => (f.options ?? []).map((o) => (typeof o === "string" ? { value: o, label: o } : o));
const tall = "h-11 rounded-2xl px-3.5";

export function FieldInput({ f, value, onChange }: { f: FieldDef; value: unknown; onChange: (v: unknown) => void }) {
  const text = value === null || value === undefined ? "" : String(value);
  switch (f.type) {
    case "textarea":
    case "markdown":
      return <Textarea value={text} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "Write anything"} className="min-h-24 w-full rounded-2xl px-3.5 py-3 leading-relaxed" />;
    case "number":
      return <Input type="number" value={text} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} placeholder={f.placeholder} className={`w-full ${tall}`} />;
    case "money":
      return (
        <div className="relative">
          <span className="absolute top-1/2 left-3.5 -translate-y-1/2 text-sm text-muted">$</span>
          <Input inputMode="decimal" value={text} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? "0.00"} className={`w-full ${tall} !pl-7 text-base`} />
        </div>
      );
    case "date":
      return <DateField value={text || null} onChange={onChange} clearable={!f.required} placeholder={f.placeholder} />;
    case "datetime":
      return <DateTimeField value={text || null} onChange={onChange} />;
    case "time":
      return <TimeField value={text || null} onChange={onChange} clearable={!f.required} />;
    case "select":
      return (
        <ChoiceField
          options={optionsOf(f)}
          value={value}
          clearable={!f.required}
          placeholder={f.placeholder}
          onChange={(v) => onChange(v === null ? null : f.numeric ? Number(v) : v)}
        />
      );
    case "checkbox":
      return <Toggle checked={truthy(value)} onChange={(c) => onChange(c ? 1 : 0)} label={f.placeholder ?? f.label} />;
    case "color":
      return <ColorPicker value={text || "#f4a6c0"} onChange={onChange} />;
    case "rating":
      return <Rating value={Number(value ?? 0)} onChange={onChange} size={22} />;
    default:
      return <Input type={f.type === "url" ? "url" : "text"} value={text} onChange={(e) => onChange(e.target.value)} placeholder={f.placeholder ?? (f.type === "url" ? "https://" : "")} className={`w-full ${tall}`} />;
  }
}

function Fold({ icon: Icon, title, note, startOpen, children }: { icon: LucideIcon; title: string; note?: string; startOpen?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(!!startOpen);
  return (
    <div className="rounded-[16px] bg-surface-2/70">
      <button type="button" onClick={() => setOpen(!open)} aria-expanded={open} className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-accent-soft text-accent">
          <Icon size={15} />
        </span>
        <span className="flex-1 font-medium">{title}</span>
        {note && <span className="text-xs text-muted">{note}</span>}
        <ChevronDown size={15} className={cx("text-muted transition-transform duration-300", open && "rotate-180")} />
      </button>
      {open && <div className="anim-item px-4 pb-4">{children}</div>}
    </div>
  );
}

/** A one-line summary chip for the preview. */
function previewValue(f: FieldDef, v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;
  if (f.type === "select") return optionsOf(f).find((o) => String(o.value) === String(v))?.label ?? null;
  if (f.type === "date") return fmtDateShort(String(v));
  if (f.type === "datetime") return fmtDateTime(String(v));
  if (f.type === "money") return toCents(String(v)) ? fmtMoney(toCents(String(v))) : null;
  return null;
}

interface FormProps {
  open: boolean;
  onClose: () => void;
  title: string;
  table: string;
  record?: Row | null;
  defaults?: Row;
  fields: FieldDef[];
  /** Map a stored record into form values (e.g. split a combined column). */
  prepare?: (v: Row) => Row;
  /** Map form values back into columns before saving. May throw to show a validation message. */
  transform?: (v: Row) => Row;
  reminders?: ReminderCfg;
  tags?: TagCfg;
  links?: LinkCfg[];
  attachments?: AttachCfg;
  /** Photo shown and picked in the preview panel. */
  image?: { key: string; subdir: string; round?: boolean };
  onSaved?: (row: Row) => void;
  extra?: (v: Row, set: (k: string, val: unknown) => void) => ReactNode;
  deletable?: boolean;
}

/**
 * Create/edit any record. Persists the row, then its tags, links and reminders.
 */
export function FormModal(props: FormProps) {
  if (!props.open) return null;
  // Mounted per opening, so no state leaks between two records.
  return <Sheet key={`${props.table}:${props.record?.id ?? "new"}`} {...props} />;
}

function Sheet({
  onClose,
  title,
  table,
  record,
  defaults,
  fields,
  prepare,
  transform,
  reminders,
  tags,
  links,
  attachments,
  image,
  onSaved,
  extra,
  deletable = true,
}: FormProps) {
  const mutate = useMutate();
  const id: number | undefined = record?.id;
  const [values, setValues] = useState<Row>(() => {
    let base: Row = { ...(defaults ?? {}), ...(record ?? {}) };
    for (const f of fields) if (f.type === "money") base[f.key] = fromCents(base[f.key]);
    if (prepare) base = prepare(base);
    return base;
  });
  const [tagValues, setTagValues] = useState<string[]>([]);
  const [reminderValues, setReminderValues] = useState<string[]>([]);
  const [linkValues, setLinkValues] = useState<Record<string, number[]>>({});
  const [pending, setPending] = useState<Ref[]>([]);
  // Saving before these have loaded would overwrite them with empty lists.
  const [loaded, setLoaded] = useState(id == null);
  const [saving, setSaving] = useState(false);
  const dirty = useRef(false);

  const tagSuggestions = useQuery({
    queryKey: ["rows", "tags", { scope: tags?.scope }],
    queryFn: () => db.list("tags", { scope: tags!.scope }, "name"),
    enabled: !!tags,
  });

  useEffect(() => {
    if (id == null) return;
    let live = true;
    (async () => {
      const t = tags ? await db.tagsFor(tags.entityType, tags.scope) : [];
      const r = reminders ? await api.remindersFor(reminders.entityType, id) : [];
      const l: Record<string, number[]> = {};
      for (const c of links ?? []) l[c.table + c.col] = (await db.list(c.table, { [c.col]: id })).map((x) => Number(x[c.otherCol]));
      if (!live) return;
      setTagValues(t.filter((x) => x.entity_id === id).map((x) => x.name));
      setReminderValues(r.map((x) => String(x.remind_at)));
      setLinkValues(l);
      setLoaded(true);
    })().catch((e) => toast.error(String(e)));
    return () => {
      live = false;
    };
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && !dirty.current && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);

  const set = (k: string, v: unknown) => {
    dirty.current = true;
    setValues((p) => ({ ...p, [k]: v }));
  };

  const save = async () => {
    if (saving || !loaded) return;
    for (const f of fields) {
      if (f.showIf && !f.showIf(values)) continue;
      if (f.required && (values[f.key] === null || values[f.key] === undefined || values[f.key] === "")) {
        toast.error(`${f.label} is required`);
        return;
      }
    }
    let out: Row = {};
    for (const f of fields) {
      if (f.showIf && !f.showIf(values)) continue;
      let v = values[f.key];
      if (f.type === "money") v = toCents(v as string);
      if (typeof v === "string" && f.type !== "markdown" && f.type !== "textarea") v = v.trim();
      if (v === "") v = null;
      out[f.key] = v ?? null;
    }
    if (image) out[image.key] = values[image.key] ?? null;
    if (transform) {
      try {
        out = transform({ ...values, ...out });
      } catch (e) {
        toast.error(e instanceof Error ? e.message : String(e));
        return;
      }
    }
    // Let the backend stamp this; `transform` copies the old value in.
    delete out.updated_at;
    setSaving(true);
    try {
      const row = await mutate(async () => {
        const saved = id != null ? await db.update(table, id, out) : await db.insert(table, out);
        const sid = saved.id as number;
        if (id == null) await saveLinks(table, sid, pending);
        if (tags) await db.tagsSet(tags.entityType, sid, tags.scope, tagValues);
        if (links) for (const l of links) await db.linksSet(l.table, l.col, sid, linkValues[l.table + l.col] ?? []);
        if (reminders) {
          const merged = { ...values, ...saved };
          await api.remindersSync(
            reminders.entityType,
            sid,
            reminderValues.map((at) => ({ remindAt: at, title: reminders.title(merged), body: reminders.body?.(merged) ?? null })),
          );
        }
        return saved;
      });
      onSaved?.(row);
      onClose();
    } catch {
      /* toast already shown */
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (id == null) return;
    await mutate(db.remove(table, id));
    onClose();
  };

  const pickImage = async () => {
    if (!image) return;
    try {
      const rel = await pickAndImportImage(image.subdir);
      if (rel) set(image.key, rel);
    } catch (e) {
      toast.error(String(e));
    }
  };

  const shown = fields.filter((f) => !f.showIf || f.showIf(values));
  const hero = shown.find((f) => f.type === "text" && f.required);
  const main = shown.filter((f) => f !== hero && !f.more);
  const more = shown.filter((f) => f !== hero && f.more);
  const kind = RECORDS[table];
  const Icon = kind?.icon ?? (table === "wishlist_items" ? Gift : Plus);
  const tint = String(values.color || kind?.color || "#f4a6c0");
  const chips = shown.map((f) => previewValue(f, values[f.key])).filter(Boolean).slice(0, 5) as string[];

  const grid = (list: FieldDef[]) => (
    <div className="grid grid-cols-2 gap-x-3 gap-y-4">
      {list.map((f) => {
        const wide =
          f.full || f.type === "markdown" || f.type === "textarea" || f.type === "datetime" || f.type === "color" || (f.type === "select" && optionsOf(f).length > 2);
        return (
          <div key={f.key} className={cx(wide && "col-span-2", f.type === "checkbox" && "self-end")}>
            {f.type !== "checkbox" && <div className="mb-1.5 flex items-baseline justify-between gap-2 px-1 text-xs font-medium text-muted">
              <span>
                {f.label}
                {f.required && <span className="text-accent"> *</span>}
              </span>
              {f.hint && <span className="truncate font-normal">{f.hint}</span>}
            </div>}
            <FieldInput f={f} value={values[f.key]} onChange={(v) => set(f.key, v)} />
          </div>
        );
      })}
    </div>
  );

  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-center justify-center bg-black/20 p-6 backdrop-blur-[3px]" onMouseDown={() => !dirty.current && onClose()}>
      <div
        role="dialog"
        aria-modal
        aria-label={title}
        onMouseDown={(e) => e.stopPropagation()}
        className="glass anim-pop flex h-[min(690px,90vh)] w-full max-w-[900px] overflow-hidden rounded-[22px] bg-surface-solid"
      >
        <aside
          className="flex w-[290px] shrink-0 flex-col p-7 transition-[background] duration-500"
          style={{ background: `linear-gradient(160deg, color-mix(in srgb, ${tint} 55%, var(--surface-solid)), color-mix(in srgb, ${tint} 14%, var(--surface-solid)))` }}
        >
          <span className="text-[11px] font-semibold tracking-widest uppercase opacity-70">{title}</span>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            {image ? (
              <button type="button" onClick={pickImage} title="Choose a photo" className={cx("group relative h-32 w-32 overflow-hidden bg-surface-solid/70 shadow-lg", image.round ? "rounded-full" : "rounded-[18px]")}>
                {values[image.key] ? <LocalImage path={values[image.key]} className="h-full w-full object-cover" /> : <Icon size={40} className="absolute inset-0 m-auto opacity-70" />}
                <span className="absolute inset-x-0 bottom-0 flex items-center justify-center gap-1 bg-black/35 py-1.5 text-[11px] text-white">
                  <Camera size={12} /> {values[image.key] ? "Change" : "Add photo"}
                </span>
              </button>
            ) : (
              <span className="flex h-24 w-24 items-center justify-center rounded-[18px] bg-surface-solid/70 shadow-lg">
                <Icon size={40} className="opacity-80" />
              </span>
            )}
            <p className={cx("font-display mt-6 line-clamp-3 w-full text-[21px] leading-tight break-words", !(hero && values[hero.key]) && "opacity-40")}>
              {(hero && values[hero.key]) || hero?.placeholder || hero?.label || kind?.label}
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5">
              {chips.map((c, i) => (
                <span key={`${c}${i}`} className="anim-item max-w-full truncate rounded-full bg-surface-solid/65 px-3 py-1 text-xs">
                  {c}
                </span>
              ))}
            </div>
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex justify-end px-4 pt-4">
            <IconButton icon={X} label="Close" onClick={onClose} />
          </div>
          <form
            className="flex-1 space-y-5 overflow-y-auto px-8 pb-5"
            onSubmit={(e) => {
              e.preventDefault();
              void save();
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void save();
            }}
            onInput={() => (dirty.current = true)}
          >
            {hero && (
              <input
                autoFocus
                value={values[hero.key] ?? ""}
                onChange={(e) => set(hero.key, e.target.value)}
                placeholder={hero.placeholder ?? hero.label}
                aria-label={hero.label}
                className="w-full border-b-2 border-line bg-transparent pb-2 text-xl font-semibold outline-none transition-colors placeholder:text-muted/40 focus:border-accent"
              />
            )}
            {grid(main)}
            {extra?.(values, set)}
            <div className="space-y-2">
              {more.length > 0 && (
                <Fold icon={Plus} title="More details">
                  {grid(more)}
                </Fold>
              )}
              {reminders && (
                <Fold icon={Bell} title="Remind me" note={reminderValues.length ? `${reminderValues.length} set` : undefined}>
                  <ReminderPicker
                    base={reminders.base(values)}
                    value={reminderValues}
                    onChange={(v) => {
                      dirty.current = true;
                      setReminderValues(v);
                    }}
                  />
                </Fold>
              )}
              {kind && (
                <Fold icon={Link2} title="Connected pages" note={pending.length ? `${pending.length} linked` : undefined} startOpen>
                  <div className="space-y-3">
                    {links?.map((l) => (
                      <div key={l.table + l.col}>
                        <div className="mb-1 text-xs text-muted">{l.label}</div>
                        <MultiSelect options={l.options} value={linkValues[l.table + l.col] ?? []} onChange={(v) => setLinkValues((p) => ({ ...p, [l.table + l.col]: v }))} />
                      </div>
                    ))}
                    <Connections
                      type={table}
                      id={id}
                      pending={pending}
                      setPending={(v) => {
                        dirty.current = true;
                        setPending(v);
                      }}
                    />
                  </div>
                </Fold>
              )}
              {tags && (
                <Fold icon={Tag} title={tags.label ?? "Tags"}>
                  <TagInput value={tagValues} onChange={setTagValues} suggestions={(tagSuggestions.data ?? []).map((t) => t.name)} />
                </Fold>
              )}
              {attachments && (
                <Fold icon={Paperclip} title="Files & links">
                  {id != null ? (
                    <AttachmentList entityType={attachments.entityType} entityId={id} subdir={attachments.subdir} />
                  ) : (
                    <p className="text-xs text-muted">Save first, then open it again to attach files.</p>
                  )}
                </Fold>
              )}
            </div>
            <button type="submit" hidden />
          </form>
          <div className="flex items-center gap-2 border-t border-line px-8 py-4">
            {id != null && deletable && <ConfirmDelete onConfirm={remove} />}
            <Button variant="ghost" className="ml-auto" onClick={onClose}>
              Cancel
            </Button>
            <Button variant="primary" className="h-11 !rounded-full px-7" onClick={save} disabled={saving || !loaded}>
              {id != null ? "Save changes" : "Add"}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Small helper for pages: open the form for a new record or an existing one. */
export function useFormState() {
  const [state, setState] = useState<{ open: boolean; record: Row | null; defaults?: Row }>({ open: false, record: null });
  return {
    ...state,
    openNew: (defaults?: Row) => setState({ open: true, record: null, defaults }),
    openEdit: (record: Row) => setState({ open: true, record }),
    close: () => setState((s) => ({ ...s, open: false })),
  };
}
export type FormState = ReturnType<typeof useFormState>;
