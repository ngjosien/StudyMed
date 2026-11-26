import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Gift, Plus, Lock, LockOpen, ExternalLink, Pencil, Check } from "lucide-react";
import { api, db, isVaultLocked, type Row } from "../../lib/api";
import { useMutate, useRows } from "../../lib/hooks";
import { cx, fmtMoney } from "../../lib/format";
import { Badge, Button, Card, ConfirmDelete, Empty, IconButton, Input, Modal, Page, PageHeader } from "../../components/ui";
import { FormModal, useFormState } from "../../components/form";
import { LocalImage } from "../../components/shared";
import { useSetting } from "../../stores/ui";
import { toast } from "../../stores/toast";
import { LockGate, SetupForm, UnlockForm, useVault } from "./vault";

const PRIORITIES = ["Must-Have", "Nice-to-Have", "Dream"];
const PRIORITY_COLOR: Record<string, string> = { "Must-Have": "#f4a6c0", "Nice-to-Have": "#a6c8f4", Dream: "#c3a6f4" };

function ItemForm({ state, listId }: { state: ReturnType<typeof useFormState>; listId: number }) {
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit item" : "Add to wishlist"}
      table="wishlist_items"
      image={{ key: "image_path", subdir: "wishlist" }}
      record={state.record}
      defaults={{ wishlist_id: listId, priority: "Nice-to-Have", purchased: 0 }}
      fields={[
        { key: "name", label: "Item name", type: "text", required: true, placeholder: "What do you want?" },
        { key: "price_cents", label: "Price", type: "money" },
        { key: "priority", label: "Priority", type: "select", options: PRIORITIES, required: true },
        { key: "store", label: "Store", type: "text" },
        { key: "category", label: "Category", type: "text", placeholder: "Tech, Clothes, Books…" },
        { key: "url", label: "Link", type: "url", full: true },
        { key: "notes", label: "Notes", type: "textarea", more: true },
        { key: "purchased", label: "Purchased", type: "checkbox", placeholder: "Bought it — move to archive" },
      ]}
      transform={(v) => ({
        ...v,
        wishlist_id: v.wishlist_id ?? listId,
        image_path: v.image_path ?? null,
        purchased_at: v.purchased ? (v.purchased_at ?? new Date().toISOString().slice(0, 10)) : null,
      })}
    />
  );
}

function ListItems({ list }: { list: Row }) {
  const mutate = useMutate();
  const qc = useQueryClient();
  const vault = useVault();
  const form = useFormState();
  const blocked = !!list.locked && !vault.data?.unlocked;
  const q = useQuery({ queryKey: ["wishlistItems", list.id], queryFn: () => api.wishlistItems(list.id), enabled: !blocked, retry: false });
  const all = q.data ?? [];
  const sections = [
    { title: "", items: all.filter((i) => !i.purchased) },
    { title: "Bought", items: all.filter((i) => i.purchased) },
  ].filter((s) => s.items.length);
  useEffect(() => {
    if (q.isError && isVaultLocked(q.error)) qc.invalidateQueries({ queryKey: ["vault"] });
  }, [q.isError, q.error, qc]);
  useEffect(() => {
    if (blocked) qc.removeQueries({ queryKey: ["wishlistItems", list.id] });
  }, [blocked, list.id, qc]);

  if (blocked) {
    return (
      <div className="mx-auto mt-10 flex max-w-sm flex-col items-center gap-4 rounded-2xl border border-dashed border-line px-6 py-12 text-center">
        <Lock size={28} className="text-muted" />
        <p className="font-medium">“{list.name}” is private</p>
        <div className="w-full">
          <UnlockForm compact />
        </div>
      </div>
    );
  }
  const total = all.filter((i) => !i.purchased).reduce((s, i) => s + (i.price_cents ?? 0), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm text-muted">
          {all.length} items · {fmtMoney(total)} still to buy
        </span>
        <Button variant="primary" icon={Plus} className="ml-auto" onClick={() => form.openNew()}>
          Add item
        </Button>
      </div>
      {!all.length && <Empty icon={Gift} title="Nothing on this list" />}
      {sections.map((s) => (
        <section key={s.title}>
          {s.title && <h2 className="font-display mb-2 px-1 text-lg font-semibold">{s.title}</h2>}
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
          {s.items.map((i) => (
            <Card key={i.id} className={cx("group flex flex-col overflow-hidden", i.purchased && "opacity-70")}>
              <button type="button" className="relative aspect-[4/3] bg-surface-2" onClick={() => form.openEdit(i)}>
                {i.image_path ? (
                  <LocalImage path={i.image_path} className="h-full w-full object-cover" />
                ) : (
                  <Gift className="absolute inset-0 m-auto text-muted/50" size={36} />
                )}
                <span className="absolute top-2 left-2">
                  <Badge color={PRIORITY_COLOR[i.priority]} className="bg-surface/90">
                    {i.priority}
                  </Badge>
                </span>
              </button>
              <div className="flex flex-1 flex-col p-3">
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{i.name}</div>
                    <div className="truncate text-xs text-muted">{[i.store, i.category].filter(Boolean).join(" · ")}</div>
                  </div>
                  {i.price_cents != null && <div className="font-semibold tabular-nums">{fmtMoney(i.price_cents)}</div>}
                </div>
                {i.notes && <p className="mt-1 line-clamp-2 text-xs text-muted">{i.notes}</p>}
                <div className="mt-auto flex items-center gap-1 pt-2">
                  <Button
                    size="sm"
                    variant={i.purchased ? "ghost" : "secondary"}
                    icon={Check}
                    onClick={() => mutate(db.update("wishlist_items", i.id, { purchased: i.purchased ? 0 : 1, purchased_at: i.purchased ? null : new Date().toISOString().slice(0, 10) }))}
                  >
                    {i.purchased ? "Undo" : "Bought"}
                  </Button>
                  {i.url && (
                    <IconButton
                      icon={ExternalLink}
                      label="Open link"
                      onClick={() => openUrl(/^[a-z]+:/i.test(i.url) ? i.url : `https://${i.url}`).catch((e) => toast.error(String(e)))}
                    />
                  )}
                  <IconButton icon={Pencil} label="Edit" className="ml-auto" onClick={() => form.openEdit(i)} />
                </div>
              </div>
            </Card>
          ))}
          </div>
        </section>
      ))}
      <ItemForm state={form} listId={list.id} />
    </div>
  );
}

function WishlistBody() {
  const mutate = useMutate();
  const vault = useVault();
  const { rows: lists } = useRows("wishlists", undefined, "position, id");
  const [pageLocked, setPageLocked] = useSetting<boolean>("wishlist.pageLocked", false);
  const [listId, setListId] = useState<number | null>(null);
  const [rename, setRename] = useState<{ id?: number; name: string } | null>(null);
  const [setup, setSetup] = useState<null | (() => Promise<void>)>(null);
  const list = lists.find((l) => l.id === listId) ?? lists[0];

  /** Run a lock change; needs a configured + unlocked vault. */
  const needVault = (fn: () => Promise<void>) => {
    if (!vault.data?.configured) return setSetup(() => fn);
    if (!vault.data.unlocked) return toast.info("Unlock with your master password first (Settings → Security)");
    fn().catch((e) => toast.error(String(e)));
  };
  const setListLock = (l: Row, locked: boolean) => needVault(() => mutate(api.wishlistSetLocked(l.id, locked)));
  const togglePageLock = () =>
    needVault(async () => {
      const next = !pageLocked;
      await mutate(async () => {
        for (const l of lists) await api.wishlistSetLocked(l.id, next);
      });
      setPageLocked(next);
      toast.success(next ? "Whole Wishlist is now private" : "Wishlist lock removed");
    });

  return (
    <>
      <PageHeader
        title="Wishlist"
        icon={Gift}
        subtitle="Things you want — and gift ideas you'd rather keep private"
        actions={
          <Button icon={pageLocked ? LockOpen : Lock} onClick={togglePageLock}>
            {pageLocked ? "Remove page lock" : "Lock whole Wishlist"}
          </Button>
        }
      >
        <div className="flex flex-wrap items-center gap-1 border-b border-line">
          {lists.map((l) => (
            <button
              type="button"
              key={l.id}
              onClick={() => setListId(l.id)}
              onDoubleClick={() => setRename({ id: l.id, name: l.name })}
              title="Double-click to rename"
              className={cx(
                "-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm",
                list?.id === l.id ? "border-accent font-medium text-accent" : "border-transparent text-muted hover:text-fg",
              )}
            >
              {l.locked ? <Lock size={12} /> : null}
              {l.name}
            </button>
          ))}
          <IconButton icon={Plus} label="New list" onClick={() => setRename({ name: "" })} />
          {list && (
            <div className="ml-auto flex items-center gap-1 pb-1">
              <Button size="sm" variant="ghost" icon={list.locked ? LockOpen : Lock} onClick={() => setListLock(list, !list.locked)}>
                {list.locked ? "Make list public" : "Make list private"}
              </Button>
              <IconButton icon={Pencil} label="Rename list" onClick={() => setRename({ id: list.id, name: list.name })} />
            </div>
          )}
        </div>
      </PageHeader>
      <Page>{list ? <ListItems key={list.id} list={list} /> : <Empty icon={Gift} title="Create a list to start" />}</Page>
      <Modal
        open={!!rename}
        onClose={() => setRename(null)}
        title={rename?.id ? "Rename list" : "New list"}
        footer={
          <>
            {rename?.id && lists.length > 1 && (
              <div className="mr-auto">
                <ConfirmDelete
                  label="Delete list & items"
                  onConfirm={async () => {
                    await mutate(db.remove("wishlists", rename.id!));
                    setRename(null);
                    setListId(null);
                  }}
                />
              </div>
            )}
            <Button
              variant="primary"
              disabled={!rename?.name.trim()}
              onClick={async () => {
                if (!rename) return;
                if (rename.id) await mutate(db.update("wishlists", rename.id, { name: rename.name.trim() }));
                else {
                  const l = await mutate(db.insert("wishlists", { name: rename.name.trim(), position: lists.length }));
                  if (pageLocked && vault.data?.unlocked) await mutate(api.wishlistSetLocked(l.id, true));
                  setListId(l.id);
                }
                setRename(null);
              }}
            >
              Save
            </Button>
          </>
        }
      >
        <Input autoFocus value={rename?.name ?? ""} onChange={(e) => setRename((r) => r && { ...r, name: e.target.value })} placeholder="e.g. Gift ideas for Mum" />
      </Modal>
      <Modal open={!!setup} onClose={() => setSetup(null)} title="Set a master password">
        <SetupForm
          onDone={() => {
            const fn = setup;
            setSetup(null);
            fn?.().catch((e: unknown) => toast.error(String(e)));
          }}
        />
      </Modal>
    </>
  );
}

export default function WishlistPage() {
  const [pageLocked] = useSetting<boolean>("wishlist.pageLocked", false);
  return pageLocked ? (
    <LockGate what="Wishlist">
      <WishlistBody />
    </LockGate>
  ) : (
    <WishlistBody />
  );
}
