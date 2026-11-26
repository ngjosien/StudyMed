import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Images, Plus, MapPin, ChevronLeft, ChevronRight, Pencil, ImagePlus, X } from "lucide-react";
import { api, db, type Row } from "../../lib/api";
import { useMutate, useRows, useTagsBy } from "../../lib/hooks";
import { fmtDate, today } from "../../lib/dates";
import { Badge, Button, ConfirmDelete, Empty, Field, IconButton, Input, Modal, Page, PageHeader, Textarea } from "../../components/ui";
import { DateField } from "../../components/pickers";
import { Connections, saveLinks, type Ref } from "../../components/connections";
import { LinkChips, LinkedSections } from "../../components/linked";
import { LocalImage, pickAndImportImages, TagInput } from "../../components/shared";
import { toast } from "../../stores/toast";

interface Draft {
  id?: number;
  caption: string;
  date: string;
  location: string;
  tags: string[];
  photos: { id?: number; path: string }[];
}

function MomentEditor({ draft, onClose, allTags }: { draft: Draft | null; onClose: () => void; allTags: string[] }) {
  const mutate = useMutate();
  const [d, setD] = useState<Draft | null>(draft);
  const [links, setLinks] = useState<Ref[]>([]);
  useEffect(() => {
    setD(draft);
    setLinks([]);
  }, [draft]);
  if (!d) return null;
  // Photos are copied into storage as soon as they're picked; drop unsaved copies on cancel.
  const cancel = () => {
    d.photos.filter((p) => !p.id).forEach((p) => api.fileDelete(p.path).catch(() => undefined));
    onClose();
  };
  const addPhotos = async () => {
    try {
      const paths = await pickAndImportImages("moments");
      setD((x) => x && { ...x, photos: [...x.photos, ...paths.map((path) => ({ path }))] });
    } catch (e) {
      toast.error(String(e));
    }
  };
  const save = async () => {
    if (!d.photos.length) return toast.error("Add at least one photo");
    await mutate(async () => {
      const values = { caption: d.caption.trim() || null, date: d.date || today(), location: d.location.trim() || null };
      const m = d.id ? await db.update("moments", d.id, values) : await db.insert("moments", values);
      const existing = d.id ? await db.list("moment_photos", { moment_id: d.id }) : [];
      const keep = new Set(d.photos.filter((p) => p.id).map((p) => p.id));
      for (const p of existing) {
        if (!keep.has(p.id)) {
          await db.remove("moment_photos", p.id);
          await api.fileDelete(p.path).catch(() => undefined);
        }
      }
      let pos = 0;
      for (const p of d.photos) {
        if (p.id) await db.update("moment_photos", p.id, { position: pos });
        else await db.insert("moment_photos", { moment_id: m.id, path: p.path, position: pos });
        pos++;
      }
      await db.tagsSet("moments", m.id, "moment", d.tags);
      if (!d.id) await saveLinks("moments", m.id, links);
    });
    onClose();
  };
  return (
    <Modal
      open
      onClose={cancel}
      title={d.id ? "Edit moment" : "New moment"}
      width="max-w-2xl"
      footer={
        <>
          {d.id && (
            <div className="mr-auto">
              <ConfirmDelete
                onConfirm={async () => {
                  await mutate(async () => {
                    for (const p of d.photos) await api.fileDelete(p.path).catch(() => undefined);
                    await db.remove("moments", d.id!);
                  });
                  onClose();
                }}
              />
            </div>
          )}
          <Button variant="ghost" onClick={cancel}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save}>
            {d.id ? "Save" : "Post"}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {d.photos.map((p, i) => (
            <div key={p.path} className="group relative">
              <LocalImage path={p.path} className="h-28 w-28 rounded-lg object-cover" />
              <div className="absolute inset-x-1 top-1 hidden justify-between group-hover:flex">
                <button
                  type="button"
                  aria-label="Move left"
                  disabled={i === 0}
                  className="rounded-full bg-black/60 p-0.5 text-white disabled:opacity-0"
                  onClick={() => setD({ ...d, photos: d.photos.map((x, j) => (j === i - 1 ? d.photos[i] : j === i ? d.photos[i - 1] : x)) })}
                >
                  <ChevronLeft size={12} />
                </button>
                <button type="button" aria-label="Remove photo" className="rounded-full bg-black/60 p-0.5 text-white" onClick={() => setD({ ...d, photos: d.photos.filter((_, j) => j !== i) })}>
                  <X size={12} />
                </button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addPhotos} className="flex h-28 w-28 flex-col items-center justify-center gap-1 rounded-lg border-2 border-dashed border-line text-xs text-muted hover:border-accent hover:text-accent">
            <ImagePlus size={20} /> Add photos
          </button>
        </div>
        <Field label="Caption">
          <Textarea value={d.caption} onChange={(e) => setD({ ...d, caption: e.target.value })} placeholder="What made this moment special?" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date">
            <DateField value={d.date} clearable={false} onChange={(v) => v && setD({ ...d, date: v })} />
          </Field>
          <Field label="Location">
            <Input value={d.location} onChange={(e) => setD({ ...d, location: e.target.value })} placeholder="Optional" />
          </Field>
        </div>
        <Field label="Connected pages">
          <Connections type="moments" id={d.id} pending={links} setPending={setLinks} />
        </Field>
        <Field label="Tags">
          <TagInput value={d.tags} onChange={(tags) => setD({ ...d, tags })} suggestions={allTags} />
        </Field>
      </div>
    </Modal>
  );
}

export default function MomentsPage() {
  const [params, setParams] = useSearchParams();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [viewer, setViewer] = useState<{ id: number; idx: number } | null>(null);
  const { rows: moments } = useRows("moments", undefined, "date desc, id desc");
  const { rows: photos } = useRows("moment_photos", undefined, "position, id");
  const tags = useTagsBy("moments", "moment");
  const tagsBy = tags.by;
  const tagDefs = tags.names;
  const photosOf = (id: number) => photos.filter((p) => p.moment_id === id);
  useEffect(() => {
    const id = params.get("id");
    if (id) {
      setViewer({ id: Number(id), idx: 0 });
      setParams({}, { replace: true });
    }
  }, [params, setParams]);

  const edit = (m: Row) =>
    setDraft({
      id: m.id,
      caption: m.caption ?? "",
      date: m.date,
      location: m.location ?? "",
      tags: tagsBy.get(m.id) ?? [],
      photos: photosOf(m.id).map((p) => ({ id: p.id, path: p.path })),
    });
  const vm = viewer ? moments.find((m) => m.id === viewer.id) : null;
  const vp = vm ? photosOf(vm.id) : [];

  return (
    <>
      <PageHeader
        title="Moments"
        icon={Images}
        subtitle="A private photo diary — stored only on this PC"
        actions={
          <>
            <Button variant="primary" icon={Plus} onClick={() => setDraft({ caption: "", date: today(), location: "", tags: [], photos: [] })}>
              New moment
            </Button>
          </>
        }
      />
      <Page>
        <LinkedSections
          type="moments"
          rows={moments}
          kinds={["people", "events", "portfolio_entries", "interest_items"]}
          heading={(m) => new Date(`${m.date}T00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}
          grid="grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(210px,1fr))]"
          empty={
            <Empty icon={Images} title="No moments yet">
              Post photos with a caption, like a diary only you can see. No likes, no followers.
            </Empty>
          }
          render={(m) => {
            const ps = photosOf(m.id);
            return (
              <article className="glass anim-item h-full rounded-[16px] p-2.5 transition-transform duration-300">
                <button type="button" onClick={() => setViewer({ id: m.id, idx: 0 })} className="relative block aspect-square w-full overflow-hidden rounded-2xl bg-surface-2">
                  {ps[0] && <LocalImage path={ps[0].path} className="h-full w-full object-cover" />}
                  {ps.length > 1 && <span className="absolute top-2 right-2 rounded-full bg-black/50 px-1.5 text-[10px] text-white">{ps.length}</span>}
                </button>
                <div className="px-1.5 pt-2.5 pb-1">
                  <p className="font-display line-clamp-2 leading-snug">{m.caption || fmtDate(m.date)}</p>
                  <p className="text-[11px] text-muted">{[fmtDate(m.date), m.location].filter(Boolean).join(" · ")}</p>
                  <LinkChips type="moments" id={m.id} max={2} />
                </div>
              </article>
            );
          }}
        />
      </Page>

      {vm && (
        <div className="fixed inset-0 z-50 flex bg-black/90" onClick={() => setViewer(null)}>
          <div className="relative flex flex-1 items-center justify-center" onClick={(e) => e.stopPropagation()}>
            {vp[viewer!.idx] && <LocalImage path={vp[viewer!.idx].path} className="max-h-[92vh] max-w-full object-contain" />}
            {viewer!.idx > 0 && (
              <button type="button" aria-label="Previous photo" className="absolute left-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setViewer({ ...viewer!, idx: viewer!.idx - 1 })}>
                <ChevronLeft />
              </button>
            )}
            {viewer!.idx < vp.length - 1 && (
              <button type="button" aria-label="Next photo" className="absolute right-4 rounded-full bg-white/10 p-2 text-white hover:bg-white/20" onClick={() => setViewer({ ...viewer!, idx: viewer!.idx + 1 })}>
                <ChevronRight />
              </button>
            )}
          </div>
          <aside className="w-80 shrink-0 overflow-y-auto bg-surface p-5 text-fg" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center gap-2">
              <span className="flex-1 font-semibold">{fmtDate(vm.date)}</span>
              <IconButton
                icon={Pencil}
                label="Edit"
                onClick={() => {
                  setViewer(null);
                  edit(vm);
                }}
              />
              <IconButton icon={X} label="Close" onClick={() => setViewer(null)} />
            </div>
            {vm.location && (
              <div className="mb-2 flex items-center gap-1 text-sm text-muted">
                <MapPin size={13} /> {vm.location}
              </div>
            )}
            {vm.caption && <p className="text-sm whitespace-pre-wrap">{vm.caption}</p>}
            <div className="mt-3 flex flex-wrap gap-1">
              {(tagsBy.get(vm.id) ?? []).map((t) => (
                <Badge key={t}>#{t}</Badge>
              ))}
            </div>
            <p className="mt-4 text-xs text-muted">
              Photo {viewer!.idx + 1} of {vp.length}
            </p>
          </aside>
        </div>
      )}
      <MomentEditor draft={draft} onClose={() => setDraft(null)} allTags={tagDefs} />
    </>
  );
}
