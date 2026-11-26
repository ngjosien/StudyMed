import { useEffect, useState, type KeyboardEvent } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { openPath, openUrl } from "@tauri-apps/plugin-opener";
import { Bell, File, Image as ImageIcon, Link2, Paperclip, Plus, X } from "lucide-react";
import { api, db, type Row } from "../lib/api";
import { useAppInfo, useMutate, useRows } from "../lib/hooks";
import { addDays, addMinutes, fmtDateTime, parse, toDateTimeStr } from "../lib/dates";
import { Badge, Button, IconButton, Input, Select } from "./ui";
import { DateTimeField } from "./pickers";
import { toast } from "../stores/toast";
import { useSetting } from "../stores/ui";

export const localSrc = (dataDir: string, rel: string) =>
  convertFileSrc(`${dataDir}\\${rel.replace(/\//g, "\\")}`);

export function LocalImage({ path, className, alt = "" }: { path?: string | null; className?: string; alt?: string }) {
  const info = useAppInfo();
  if (!path || !info.data) return null;
  return <img src={localSrc(info.data.dataDir, path)} alt={alt} className={className} draggable={false} />;
}

/** Pick an image file and copy it into app storage. Returns the stored relative path. */
export async function pickAndImportImage(subdir: string): Promise<string | null> {
  const path = await openDialog({
    multiple: false,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "heic"] }],
  });
  if (typeof path !== "string") return null;
  return api.fileImport(path, subdir);
}

export async function pickAndImportImages(subdir: string): Promise<string[]> {
  const paths = await openDialog({
    multiple: true,
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp"] }],
  });
  if (!paths) return [];
  const list = Array.isArray(paths) ? paths : [paths];
  const out: string[] = [];
  for (const p of list) out.push(await api.fileImport(p, subdir));
  return out;
}

/* ------------------------------------------------------------ Tag input */
export function TagInput({
  value,
  onChange,
  suggestions = [],
  placeholder = "Add tag…",
}: {
  value: string[];
  onChange: (v: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}) {
  const [text, setText] = useState("");
  const id = `tags-${Math.random().toString(36).slice(2, 8)}`;
  const add = (t: string) => {
    const v = t.trim().replace(/,$/, "");
    if (v && !value.includes(v)) onChange([...value, v]);
    setText("");
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" || e.key === ",") {
      e.preventDefault();
      add(text);
    } else if (e.key === "Backspace" && !text && value.length) {
      onChange(value.slice(0, -1));
    }
  };
  return (
    <div className="flex min-h-9 flex-wrap items-center gap-1 rounded-lg border border-line bg-surface px-2 py-1 focus-within:border-accent">
      {value.map((t) => (
        <span key={t} className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2 py-0.5 text-xs text-accent">
          {t}
          <button type="button" onClick={() => onChange(value.filter((x) => x !== t))} aria-label={`Remove ${t}`}>
            <X size={12} />
          </button>
        </span>
      ))}
      <input
        list={id}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKey}
        onBlur={() => text && add(text)}
        placeholder={value.length ? "" : placeholder}
        className="min-w-24 flex-1 bg-transparent py-1 text-sm outline-none"
      />
      <datalist id={id}>
        {suggestions.filter((s) => !value.includes(s)).map((s) => (
          <option key={s} value={s} />
        ))}
      </datalist>
    </div>
  );
}

/* ------------------------------------------------------------ Multi-select (relations) */
export function MultiSelect({
  options,
  value,
  onChange,
  placeholder = "Link…",
}: {
  options: { value: number; label: string; color?: string | null }[];
  value: number[];
  onChange: (v: number[]) => void;
  placeholder?: string;
}) {
  const remaining = options.filter((o) => !value.includes(o.value));
  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => {
            const o = options.find((x) => x.value === v);
            return (
              <span
                key={v}
                className="inline-flex items-center gap-1 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs"
              >
                {o?.color && <span className="h-2 w-2 rounded-full" style={{ background: o.color }} />}
                {o?.label ?? `#${v}`}
                <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label="Remove link">
                  <X size={12} />
                </button>
              </span>
            );
          })}
        </div>
      )}
      <Select
        value=""
        onChange={(e) => e.target.value && onChange([...value, Number(e.target.value)])}
        options={remaining.map((o) => ({ value: o.value, label: o.label }))}
        placeholder={remaining.length ? placeholder : "Nothing else to link"}
        disabled={!remaining.length}
      />
    </div>
  );
}

/* ------------------------------------------------------------ Reminders */
export function ReminderPicker({
  base,
  value,
  onChange,
}: {
  base?: string | null;
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [defaultTime] = useSetting("reminders.defaultTime", "09:00");
  const [custom, setCustom] = useState("");
  const b = parse(base);
  const hasTime = !!base && base.length > 10;
  let anchor: Date | null = null;
  if (b) {
    anchor = new Date(b);
    if (!hasTime) {
      const [h, m] = defaultTime.split(":").map(Number);
      anchor.setHours(h, m, 0, 0);
    }
  }
  const presets: { label: string; at: Date }[] = anchor
    ? hasTime
      ? [
          { label: "At time", at: anchor },
          { label: "10 min before", at: addMinutes(anchor, -10) },
          { label: "1 hour before", at: addMinutes(anchor, -60) },
          { label: "1 day before", at: addDays(anchor, -1) },
          { label: "1 week before", at: addDays(anchor, -7) },
        ]
      : [
          { label: `Morning of (${defaultTime})`, at: anchor },
          { label: "1 day before", at: addDays(anchor, -1) },
          { label: "3 days before", at: addDays(anchor, -3) },
          { label: "1 week before", at: addDays(anchor, -7) },
        ]
    : [];
  const add = (s: string) => {
    if (s && !value.includes(s)) onChange([...value, s].sort());
  };
  const now = toDateTimeStr(new Date());
  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {value.map((v) => (
            <span
              key={v}
              className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs ${
                v <= now ? "bg-surface-2 text-muted line-through" : "bg-accent-soft text-accent"
              }`}
              title={v <= now ? "In the past — won't fire" : undefined}
            >
              <Bell size={11} /> {fmtDateTime(v)}
              <button type="button" onClick={() => onChange(value.filter((x) => x !== v))} aria-label="Remove reminder">
                <X size={12} />
              </button>
            </span>
          ))}
        </div>
      )}
      {presets.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {presets.map((p) => (
            <button
              type="button"
              key={p.label}
              onClick={() => add(toDateTimeStr(p.at))}
              className="rounded-full border border-line px-2 py-0.5 text-xs text-muted hover:border-accent hover:text-accent"
            >
              + {p.label}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <DateTimeField value={custom} onChange={(v) => setCustom(v ?? "")} />
        </div>
        <Button
          size="md"
          icon={Plus}
          disabled={!custom}
          onClick={() => {
            add(custom);
            setCustom("");
          }}
        >
          Add
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Attachments */
const IMAGE_EXT = /\.(png|jpe?g|gif|webp|bmp|svg)$/i;

export function AttachmentList({ entityType, entityId, subdir }: { entityType: string; entityId: number; subdir: string }) {
  const mutate = useMutate();
  const info = useAppInfo();
  const { rows } = useRows("attachments", { entity_type: entityType, entity_id: entityId }, "position, id");
  const [link, setLink] = useState("");
  const [linkLabel, setLinkLabel] = useState("");

  const addFiles = async () => {
    const picked = await openDialog({ multiple: true });
    if (!picked) return;
    const list = Array.isArray(picked) ? picked : [picked];
    await mutate(async () => {
      for (const p of list) {
        const rel = await api.fileImport(p, subdir);
        await db.insert("attachments", {
          entity_type: entityType,
          entity_id: entityId,
          kind: IMAGE_EXT.test(p) ? "image" : "file",
          path_or_url: rel,
          label: p.split(/[\\/]/).pop(),
        });
      }
    });
  };

  const addLink = async () => {
    let url = link.trim();
    if (!url) return;
    if (!/^[a-z]+:/i.test(url)) url = `https://${url}`;
    await mutate(
      db.insert("attachments", { entity_type: entityType, entity_id: entityId, kind: "link", path_or_url: url, label: linkLabel.trim() || url }),
    );
    setLink("");
    setLinkLabel("");
  };

  const openIt = (a: Row) => {
    const p =
      a.kind === "link"
        ? openUrl(a.path_or_url)
        : info.data
          ? openPath(`${info.data.dataDir}\\${String(a.path_or_url).replace(/\//g, "\\")}`)
          : Promise.resolve();
    p.catch((e) => toast.error(String(e)));
  };

  const remove = async (a: Row) => {
    await mutate(async () => {
      if (a.kind !== "link") await api.fileDelete(a.path_or_url).catch(() => undefined);
      await db.remove("attachments", a.id);
    });
  };

  return (
    <div className="space-y-2">
      {rows.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line">
          {rows.map((a) => {
            const Icon = a.kind === "link" ? Link2 : a.kind === "image" ? ImageIcon : File;
            return (
              <li key={a.id} className="flex items-center gap-2 px-3 py-1.5 text-sm">
                <Icon size={14} className="shrink-0 text-muted" />
                <button type="button" onClick={() => openIt(a)} className="min-w-0 flex-1 truncate text-left hover:text-accent hover:underline">
                  {a.label || a.path_or_url}
                </button>
                <IconButton icon={X} label="Remove attachment" onClick={() => remove(a)} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" icon={Paperclip} onClick={addFiles}>
          Attach files
        </Button>
        <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" className="h-7 w-48 text-xs" />
        <Input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} placeholder="Label (optional)" className="h-7 w-36 text-xs" />
        <Button size="sm" icon={Link2} onClick={addLink} disabled={!link.trim()}>
          Add link
        </Button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ Countdown badge */
export function CountdownBadge({ date, done }: { date?: string | null; done?: boolean }) {
  if (!date) return null;
  const d = parse(date)!;
  const days = Math.round(
    (new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() -
      new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime()) /
      86_400_000,
  );
  const text = days === 0 ? "Today" : days === 1 ? "Tomorrow" : days > 0 ? `In ${days} days` : `${-days}d ago`;
  const color = done ? undefined : days < 0 ? "#ef4444" : days <= 3 ? "#f59e0b" : days <= 14 ? "#6366f1" : undefined;
  return <Badge color={color}>{text}</Badge>;
}

/** Keep a value in sync with a prop that loads asynchronously. */
export function useSynced<T>(source: T, deps: unknown[]): [T, (v: T) => void] {
  const [v, setV] = useState(source);
  useEffect(() => setV(source), deps); // eslint-disable-line react-hooks/exhaustive-deps
  return [v, setV];
}
