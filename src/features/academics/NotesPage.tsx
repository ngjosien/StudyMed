import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { FileText, Plus, Layers, Check, Loader2, Repeat2 } from "lucide-react";
import { db, type Row } from "../../lib/api";
import { useMutate, useRow, useRows } from "../../lib/hooks";
import { fmtDateTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Button, ConfirmDelete, Empty, Field, Input, Modal, Select, Textarea } from "../../components/ui";
import { MarkdownEditor } from "../../components/markdown";
import { ChoiceField } from "../../components/pickers";
import { MultiSelect } from "../../components/shared";
import { useFormState } from "../../components/form";
import { Connections } from "../../components/connections";
import { LinkedSections } from "../../components/linked";
import { ModuleChip, useModules } from "./common";
import { TopicForm } from "./forms";
import { toast } from "../../stores/toast";

function SpawnCardModal({ note, excerpt, onClose }: { note: Row; excerpt: string | null; onClose: () => void }) {
  const mutate = useMutate();
  const decks = useRows("decks", { module_id: note.module_id }, "name").rows;
  const [deckId, setDeckId] = useState<number | "new" | "">("");
  const [newDeck, setNewDeck] = useState("");
  const [front, setFront] = useState("");
  const [back, setBack] = useState("");
  const [kind, setKind] = useState<"qa" | "topic">("qa");

  useEffect(() => {
    if (excerpt !== null) {
      setFront(excerpt.length < 140 ? excerpt : "");
      setBack(excerpt.length < 140 ? "" : excerpt);
      setKind("qa");
    }
  }, [excerpt]);
  useEffect(() => {
    if (deckId === "" && decks.length) setDeckId(decks[0].id);
    if (deckId === "" && !decks.length) setDeckId("new");
  }, [decks, deckId]);

  const save = async () => {
    if (!front.trim()) return toast.error("The front of the card can't be empty");
    await mutate(async () => {
      let did = deckId;
      if (did === "new") {
        const d = await db.insert("decks", { module_id: note.module_id, name: newDeck.trim() || `${note.title} deck` });
        did = d.id;
        setDeckId(d.id);
      }
      await db.insert("cards", {
        deck_id: did,
        note_id: note.id,
        kind,
        front_md: front.trim(),
        back_md: back.trim(),
        source_excerpt: excerpt,
      });
    });
    toast.success("Flashcard created");
    onClose();
  };

  return (
    <Modal
      open={excerpt !== null}
      onClose={onClose}
      title="New flashcard from note"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            Create card
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        {excerpt && (
          <blockquote className="rounded-lg border-l-4 border-accent bg-accent-soft/50 px-3 py-2 text-sm whitespace-pre-wrap">{excerpt}</blockquote>
        )}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Deck">
            <ChoiceField
              value={deckId}
              onChange={(v) => setDeckId(v === "new" ? "new" : Number(v))}
              options={[...decks.map((d) => ({ value: d.id, label: d.name })), { value: "new", label: "New deck" }]}
            />
          </Field>
          {deckId === "new" ? (
            <Field label="New deck name">
              <Input value={newDeck} onChange={(e) => setNewDeck(e.target.value)} placeholder={`${note.title} deck`} />
            </Field>
          ) : (
            <Field label="Card type">
              <ChoiceField
                value={kind}
                onChange={(v) => setKind(v as "qa" | "topic")}
                options={[
                  { value: "qa", label: "Question & answer" },
                  { value: "topic", label: "Topic to recall" },
                ]}
              />
            </Field>
          )}
        </div>
        <Field label={kind === "qa" ? "Front (question)" : "Topic"}>
          <Textarea value={front} onChange={(e) => setFront(e.target.value)} autoFocus />
        </Field>
        <Field label={kind === "qa" ? "Back (answer)" : "Key points to recall"}>
          <Textarea value={back} onChange={(e) => setBack(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}

function NoteEditor({ note, onDeleted }: { note: Row; onDeleted: () => void }) {
  const mutate = useMutate();
  const { options, byId } = useModules();
  const [v, setV] = useState<Row>(note);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [excerpt, setExcerpt] = useState<string | null>(null);
  const topicForm = useFormState();
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const latest = useRef(v);
  latest.current = v;

  const exams = useRows("exams", { module_id: v.module_id }, "start_at").rows;
  const homework = useRows("homework", { module_id: v.module_id }, "due_at").rows;
  const examLinks = useRows("note_exam_links", { note_id: note.id }).rows.map((r) => r.exam_id as number);
  const hwLinks = useRows("note_homework_links", { note_id: note.id }).rows.map((r) => r.homework_id as number);
  const cards = useRows("cards", { note_id: note.id }, "created_at").rows;

  const persist = async () => {
    clearTimeout(timer.current);
    const cur = latest.current;
    if (!String(cur.title ?? "").trim()) return;
    setSaving(true);
    try {
      await mutate(
        db.update("school_notes", note.id, {
          title: String(cur.title).trim(),
          module_id: cur.module_id,
          week: cur.week === "" || cur.week == null ? null : Number(cur.week),
          topic: cur.topic || null,
          body_md: cur.body_md ?? "",
        }),
      );
      setDirty(false);
    } finally {
      setSaving(false);
    }
  };

  const change = (k: string, val: unknown) => {
    setV((p) => ({ ...p, [k]: val }));
    setDirty(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(persist, 900);
  };

  // Save pending edits when switching notes / leaving the page.
  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
        const cur = latest.current;
        db.update("school_notes", note.id, {
          title: String(cur.title || "Untitled note"),
          module_id: cur.module_id,
          week: cur.week === "" || cur.week == null ? null : Number(cur.week),
          topic: cur.topic || null,
          body_md: cur.body_md ?? "",
        }).catch(() => undefined);
      }
    },
    [note.id],
  );

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        persist();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  });

  return (
    <div className="mx-auto max-w-4xl px-8 py-6">
      <div className="mb-3 flex items-center gap-2 text-xs text-muted">
        <ModuleChip module={byId.get(v.module_id)} />
        <span>Edited {fmtDateTime(note.updated_at?.replace(" ", "T"))}</span>
        <span className="ml-auto inline-flex items-center gap-1">
          {saving ? (
            <>
              <Loader2 size={12} className="animate-spin" /> Saving
            </>
          ) : dirty ? (
            "Unsaved"
          ) : (
            <>
              <Check size={12} /> Saved
            </>
          )}
        </span>
        <Button size="sm" icon={Repeat2} onClick={() => topicForm.openNew({ module_id: v.module_id, title: v.title, note_id: note.id })}>
          Start 1-3-5-7
        </Button>
        <ConfirmDelete
          size="sm"
          label="Delete note"
          onConfirm={async () => {
            clearTimeout(timer.current);
            timer.current = undefined;
            await mutate(db.remove("school_notes", note.id));
            onDeleted();
          }}
        />
      </div>
      <input
        value={v.title ?? ""}
        onChange={(e) => change("title", e.target.value)}
        placeholder="Note title"
        className="mb-3 w-full bg-transparent text-xl font-semibold tracking-tight outline-none"
      />
      <div className="mb-4 grid grid-cols-[2fr_100px_2fr] gap-3">
        <Field label="Module">
          <Select value={v.module_id} onChange={(e) => change("module_id", Number(e.target.value))} options={options} />
        </Field>
        <Field label="Week">
          <Input type="number" value={v.week ?? ""} onChange={(e) => change("week", e.target.value)} />
        </Field>
        <Field label="Topic">
          <Input value={v.topic ?? ""} onChange={(e) => change("topic", e.target.value)} placeholder="e.g. Cardiac cycle" />
        </Field>
      </div>
      <MarkdownEditor
        value={v.body_md ?? ""}
        onChange={(t) => change("body_md", t)}
        minHeight={420}
        subdir="notes"
        onSelectionAction={(s) => setExcerpt(s)}
        selectionActionLabel="Flashcard from selection"
      />
      <div className="mt-5 grid grid-cols-2 gap-4">
        <Field label="Linked exams">
          <MultiSelect
            options={exams.map((e) => ({ value: e.id, label: e.name }))}
            value={examLinks}
            onChange={(ids) => mutate(db.linksSet("note_exam_links", "note_id", note.id, ids))}
            placeholder="Link to an exam…"
          />
        </Field>
        <Field label="Linked homework">
          <MultiSelect
            options={homework.map((h) => ({ value: h.id, label: h.title }))}
            value={hwLinks}
            onChange={(ids) => mutate(db.linksSet("note_homework_links", "note_id", note.id, ids))}
            placeholder="Link to homework…"
          />
        </Field>
      </div>
      <div className="mt-5">
        <div className="mb-2 flex items-center gap-2">
          <Layers size={14} className="text-muted" />
          <span className="text-sm font-medium">Flashcards from this note ({cards.length})</span>
          <Button size="sm" icon={Plus} className="ml-auto" onClick={() => setExcerpt("")}>
            New card
          </Button>
        </div>
        {cards.length > 0 && (
          <ul className="divide-y divide-line rounded-lg border border-line text-sm">
            {cards.map((c) => (
              <li key={c.id} className="flex gap-3 px-3 py-2">
                <span className="flex-1 truncate">{c.front_md}</span>
                <span className="text-xs text-muted">due {c.due_date}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-6 space-y-3">
        <Field label="Connected pages">
          <Connections type="school_notes" id={note.id} />
        </Field>
        <TopicForm state={topicForm} />
      </div>
      <SpawnCardModal note={{ ...note, ...v }} excerpt={excerpt} onClose={() => setExcerpt(null)} />
    </div>
  );
}

export default function NotesPage() {
  const [params, setParams] = useSearchParams();
  const mutate = useMutate();
  const { options, byId } = useModules();
  const [search, setSearch] = useState("");
  const { rows: all } = useRows("school_notes", undefined, "module_id, week, id");
  const rows = all.filter((n) => `${n.title} ${n.topic ?? ""} ${n.body_md ?? ""}`.toLowerCase().includes(search.toLowerCase()));
  const selectedId = params.get("id") ? Number(params.get("id")) : null;
  const selected = useRow("school_notes", selectedId);

  const create = async (mod?: number | null) => {
    const m = mod ?? options[0]?.value;
    if (!m) return toast.info("Create a module first (Academics → Modules)");
    const n = await mutate(db.insert("school_notes", { module_id: m, title: "Untitled note", body_md: "" }));
    setParams({ id: String(n.id) });
  };

  // Quick-create from the command palette / module dashboard.
  const handled = useRef<string | null>(null);
  useEffect(() => {
    const key = params.toString();
    if (params.get("new") && options.length && handled.current !== key) {
      handled.current = key; // guard against double-run (StrictMode)
      create(params.get("module") ? Number(params.get("module")) : null);
    }
  }, [params, options.length]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full gap-3">
      <div className="glass flex w-80 shrink-0 flex-col rounded-[18px]">
        <div className="space-y-2 border-b border-line p-3">
          <div className="flex items-center gap-2">
            <FileText size={16} className="text-accent" />
            <h1 className="flex-1 text-lg font-semibold">School Notes</h1>
            <Button size="sm" variant="primary" icon={Plus} onClick={() => create()}>
              New
            </Button>
          </div>
          <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search notes…" className="h-8" />
        </div>
        <div className="flex-1 overflow-y-auto p-2.5">
          <LinkedSections
            type="school_notes"
            rows={rows}
            kinds={["modules", "exams", "homework", "review_topics"]}
            heading={(n) => byId.get(n.module_id)?.name ?? ""}
            empty={<p className="p-4 text-center text-sm text-muted">No notes here yet.</p>}
            grid="space-y-0.5"
            render={(n) => (
              <button
                type="button"
                onClick={() => setParams({ id: String(n.id) })}
                className={cx("mb-0.5 block w-full rounded-2xl px-3 py-2 text-left", n.id === selectedId ? "bg-accent-soft" : "hover:bg-surface-2")}
              >
                <div className="flex items-center gap-2">
                  <ModuleChip module={byId.get(n.module_id)} />
                  {n.week != null && <span className="text-[11px] text-muted">W{n.week}</span>}
                </div>
                <div className="mt-0.5 truncate text-sm font-medium">{n.title}</div>
                {n.topic && <div className="truncate text-xs text-muted">{n.topic}</div>}
              </button>
            )}
          />
        </div>
      </div>
      <div className="glass min-w-0 flex-1 overflow-y-auto rounded-[18px]">
        {selected.data ? (
          <NoteEditor key={selected.data.id} note={selected.data} onDeleted={() => setParams({})} />
        ) : (
          <div className="p-10">
            <Empty icon={FileText} title="Select or create a note">
              Notes support headings, tables, callouts, checklists, code and $math$. Paste images straight in.
            </Empty>
          </div>
        )}
      </div>
    </div>
  );
}
