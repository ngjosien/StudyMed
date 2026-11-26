import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StickyNote, Plus, Pin, PinOff, Lock, LockOpen, FolderPlus, X, Check, Loader2, ShieldAlert } from "lucide-react";
import { api, db, isVaultLocked, type Row } from "../../lib/api";
import { useMutate, useRow, useRows } from "../../lib/hooks";
import { fmtDateTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Button, ConfirmDelete, Empty, IconButton, Input, Modal, Select } from "../../components/ui";
import { MarkdownEditor } from "../../components/markdown";
import { toast } from "../../stores/toast";
import { SetupForm, UnlockForm, useVault } from "./vault";
import { Connections } from "../../components/connections";
import { LinkedSections } from "../../components/linked";

function useAutosave(save: (v: string) => Promise<unknown>) {
  const [state, setState] = useState<"saved" | "dirty" | "saving">("saved");
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef<string | null>(null);
  const flush = async () => {
    clearTimeout(t.current);
    t.current = undefined;
    if (latest.current === null) return;
    const v = latest.current;
    latest.current = null;
    setState("saving");
    try {
      await save(v);
      setState("saved");
    } catch (e) {
      setState("dirty");
      toast.error(isVaultLocked(e) ? "Vault locked — unlock to keep editing" : String(e));
    }
  };
  const change = (v: string) => {
    latest.current = v;
    setState("dirty");
    clearTimeout(t.current);
    t.current = setTimeout(flush, 800);
  };
  useEffect(() => () => void flush(), []); // eslint-disable-line react-hooks/exhaustive-deps
  return { state, change };
}

function SaveState({ state }: { state: "saved" | "dirty" | "saving" }) {
  return (
    <span className="inline-flex items-center gap-1 text-xs text-muted">
      {state === "saving" ? <Loader2 size={12} className="animate-spin" /> : state === "saved" ? <Check size={12} /> : null}
      {state === "dirty" ? "Unsaved" : state === "saving" ? "Saving" : "Saved"}
    </span>
  );
}

function PlainBody({ note }: { note: Row }) {
  const mutate = useMutate();
  const [body, setBody] = useState(note.body_md ?? "");
  const { state, change } = useAutosave((v) => mutate(db.update("important_notes", note.id, { body_md: v })));
  return (
    <>
      <div className="mb-2 flex justify-end">
        <SaveState state={state} />
      </div>
      <MarkdownEditor
        value={body}
        onChange={(v) => {
          setBody(v);
          change(v);
        }}
        minHeight={460}
        subdir="important"
        defaultMode="split"
      />
    </>
  );
}

function LockedBody({ note }: { note: Row }) {
  const vault = useVault();
  const qc = useQueryClient();
  const unlocked = !!vault.data?.unlocked;
  const q = useQuery({ queryKey: ["lockedNote", note.id], queryFn: () => api.noteReadLocked(note.id), enabled: unlocked, retry: false, staleTime: Infinity });
  const [body, setBody] = useState<string | null>(null);
  useEffect(() => {
    if (q.data !== undefined) setBody(q.data);
  }, [q.data]);
  useEffect(() => {
    if (q.isError && isVaultLocked(q.error)) qc.invalidateQueries({ queryKey: ["vault"] });
  }, [q.isError, q.error, qc]);
  const { state, change } = useAutosave(async (v) => {
    await api.noteSaveLocked(note.id, v);
    qc.setQueryData(["lockedNote", note.id], v);
  });
  if (!unlocked) {
    return (
      <div className="mt-10 flex flex-col items-center gap-4 rounded-2xl border border-dashed border-line py-14 text-center">
        <Lock size={28} className="text-muted" />
        <div>
          <p className="font-medium">This note is encrypted</p>
          <p className="text-sm text-muted">Enter your master password to view it.</p>
        </div>
        <div className="w-80">
          <UnlockForm compact />
        </div>
      </div>
    );
  }
  if (body === null) return null;
  return (
    <>
      <div className="mb-2 flex justify-end gap-2">
        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Lock size={12} /> Encrypted at rest
        </span>
        <SaveState state={state} />
      </div>
      <MarkdownEditor
        value={body}
        onChange={(v) => {
          setBody(v);
          change(v);
        }}
        minHeight={460}
        subdir="important"
        defaultMode="split"
      />
    </>
  );
}

function NoteView({ note, folders, onDeleted }: { note: Row; folders: Row[]; onDeleted: () => void }) {
  const mutate = useMutate();
  const qc = useQueryClient();
  const vault = useVault();
  const [title, setTitle] = useState(note.title);
  const [setup, setSetup] = useState(false);
  useEffect(() => setTitle(note.title), [note.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const lock = async () => {
    if (!vault.data?.configured) return setSetup(true);
    if (!vault.data.unlocked) return toast.info("Unlock the vault first (Settings → Security, or any locked note)");
    try {
      await api.noteLock(note.id);
      await qc.invalidateQueries();
      toast.success("Note encrypted");
    } catch (e) {
      toast.error(String(e));
    }
  };
  const unlockPermanently = async () => {
    try {
      await api.noteUnlock(note.id);
      qc.removeQueries({ queryKey: ["lockedNote", note.id] });
      await qc.invalidateQueries();
      toast.success("Lock removed — note stored as plain text");
    } catch (e) {
      toast.error(isVaultLocked(e) ? "Unlock the vault first" : String(e));
    }
  };

  return (
    <div className="mx-auto max-w-5xl px-8 py-6">
      <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-muted">
        <Select
          className="h-8 w-48 text-xs"
          value={note.folder_id ?? ""}
          onChange={(e) => mutate(db.update("important_notes", note.id, { folder_id: e.target.value ? Number(e.target.value) : null }))}
          options={folders.map((f) => ({ value: f.id, label: f.name }))}
          placeholder="No folder"
        />
        <span>Updated {fmtDateTime(String(note.updated_at).replace(" ", "T"))}</span>
        <div className="ml-auto flex items-center gap-1">
          <IconButton
            icon={note.pinned ? PinOff : Pin}
            label={note.pinned ? "Unpin" : "Pin to top"}
            active={!!note.pinned}
            onClick={() => mutate(db.update("important_notes", note.id, { pinned: note.pinned ? 0 : 1 }))}
          />
          {note.locked ? (
            <Button size="sm" icon={LockOpen} onClick={unlockPermanently}>
              Remove lock
            </Button>
          ) : (
            <Button size="sm" icon={Lock} onClick={lock}>
              Lock note
            </Button>
          )}
          <ConfirmDelete
            iconOnly
            label="Delete note"
            onConfirm={async () => {
              await mutate(db.remove("important_notes", note.id));
              onDeleted();
            }}
          />
        </div>
      </div>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() => title.trim() && title !== note.title && mutate(db.update("important_notes", note.id, { title: title.trim() }))}
        className="mb-4 w-full bg-transparent text-xl font-semibold tracking-tight outline-none"
        placeholder="Title"
      />
      {note.locked ? <LockedBody key={`l${note.id}`} note={note} /> : <PlainBody key={`p${note.id}`} note={note} />}
      <div className="mt-6 space-y-3">
        <p className="text-xs font-medium text-muted">Connected pages</p>
        <Connections type="important_notes" id={note.id} />
      </div>
      <Modal open={setup} onClose={() => setSetup(false)} title="Set a master password">
        <SetupForm
          onDone={() => {
            setSetup(false);
            lock();
          }}
        />
      </Modal>
    </div>
  );
}

export default function ImportantNotesPage() {
  const mutate = useMutate();
  const [params, setParams] = useSearchParams();
  const { rows: all } = useRows("important_notes", undefined, "pinned desc, id");
  const { rows: folders } = useRows("note_folders", undefined, "position, id");
  const [folder, setFolder] = useState<number | "all">("all");
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [search, setSearch] = useState("");
  const rows = useMemo(
    () =>
      all.filter(
        (n) =>
          (folder === "all" || n.folder_id === folder) &&
          `${n.title} ${n.locked ? "" : (n.body_md ?? "")}`.toLowerCase().includes(search.toLowerCase()),
      ),
    [all, folder, search],
  );
  const [newFolder, setNewFolder] = useState<string | null>(null);
  const selected = useRow("important_notes", selectedId);

  useEffect(() => {
    const id = params.get("id");
    if (id) {
      setSelectedId(Number(id));
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const create = async () => {
    const n = await mutate(db.insert("important_notes", { title: "Untitled", body_md: "", folder_id: folder === "all" ? null : folder }));
    setSelectedId(n.id);
  };

  return (
    <div className="flex h-full gap-3">
      <div className="glass flex w-80 shrink-0 flex-col rounded-[18px]">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <StickyNote size={16} className="text-accent" />
            <h1 className="flex-1 text-lg font-semibold">Important Notes</h1>
            <Button size="sm" variant="primary" icon={Plus} onClick={create}>
              New
            </Button>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search…" className="h-8" />
          <div className="flex flex-wrap gap-1">
            <button type="button" onClick={() => setFolder("all")} className={cx("rounded-full px-2.5 py-0.5 text-xs", folder === "all" ? "bg-accent-soft text-accent" : "text-muted hover:text-fg")}>
              All
            </button>
            {folders.map((f) => (
              <span key={f.id} className="group relative">
                <button
                  type="button"
                  onClick={() => setFolder(f.id)}
                  className={cx("rounded-full px-2.5 py-0.5 text-xs", folder === f.id ? "bg-accent-soft text-accent" : "text-muted hover:text-fg")}
                >
                  {f.name}
                </button>
                {folder === f.id && (
                  <button
                    type="button"
                    aria-label={`Delete folder ${f.name}`}
                    title="Delete folder (notes are kept)"
                    className="absolute -top-1.5 -right-1 hidden rounded-full bg-surface p-0.5 text-muted shadow group-hover:block hover:text-danger"
                    onClick={async () => {
                      await mutate(db.remove("note_folders", f.id));
                      setFolder("all");
                    }}
                  >
                    <X size={10} />
                  </button>
                )}
              </span>
            ))}
            <IconButton icon={FolderPlus} label="New folder" className="h-6 w-6" onClick={() => setNewFolder("")} />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto p-2">
          <LinkedSections
            type="important_notes"
            rows={rows}
            kinds={["people", "events", "modules"]}
            empty={<p className="p-4 text-center text-sm text-muted">No notes here yet.</p>}
            render={(n) => (
              <button
                type="button"
                onClick={() => setSelectedId(n.id)}
                className={cx("mb-0.5 flex w-full items-start gap-2 rounded-2xl px-3 py-2 text-left", n.id === selectedId ? "bg-accent-soft" : "hover:bg-surface-2")}
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{n.title}</div>
                  <div className="truncate text-xs text-muted">{n.locked ? "Encrypted" : (n.body_md ?? "").replace(/[#*_>`|-]/g, "").slice(0, 60) || "Empty"}</div>
                </div>
                {n.pinned ? <Pin size={12} className="mt-1 shrink-0 text-accent" /> : null}
                {n.locked ? <Lock size={12} className="mt-1 shrink-0 text-muted" /> : null}
              </button>
            )}
          />
        </div>
      </div>
      <div className="glass min-w-0 flex-1 overflow-y-auto rounded-[18px]">
        {selected.data ? (
          <NoteView key={selected.data.id} note={selected.data} folders={folders} onDeleted={() => setSelectedId(null)} />
        ) : (
          <div className="p-10">
            <Empty icon={ShieldAlert} title="Keep important info in one place">
              IDs, insurance policies, emergency contacts, clinic details, templates. Lock sensitive notes with your master password.
            </Empty>
          </div>
        )}
      </div>
      <Modal
        open={newFolder !== null}
        onClose={() => setNewFolder(null)}
        title="New folder"
        footer={
          <Button
            variant="primary"
            disabled={!newFolder?.trim()}
            onClick={async () => {
              await mutate(db.insert("note_folders", { name: newFolder!.trim(), position: folders.length }));
              setNewFolder(null);
            }}
          >
            Create
          </Button>
        }
      >
        <Input autoFocus value={newFolder ?? ""} onChange={(e) => setNewFolder(e.target.value)} placeholder="Folder name" />
      </Modal>
    </div>
  );
}
