import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { openUrl } from "@tauri-apps/plugin-opener";
import { KeyRound, Plus, Copy, Eye, EyeOff, ExternalLink, RefreshCw, Wand2, ShieldCheck } from "lucide-react";
import { api, isVaultLocked, type Row } from "../../lib/api";
import { fmtDateTime } from "../../lib/dates";
import { cx } from "../../lib/format";
import { Badge, Button, Checkbox, ConfirmDelete, Empty, Field, IconButton, Input, Modal, Page, PageHeader, Textarea } from "../../components/ui";
import { toast } from "../../stores/toast";
import { LockGate, LockNowButton } from "./vault";
import { ChoiceField } from "../../components/pickers";

const CATEGORIES = ["Personal", "School", "Work", "Finance", "Social", "Shopping", "Health", "Other"];

/* ---------------------------------------------------------- Generator */
export interface GenOpts {
  length: number;
  upper: boolean;
  lower: boolean;
  digits: boolean;
  symbols: boolean;
}
const SETS = {
  upper: "ABCDEFGHJKLMNPQRSTUVWXYZ",
  lower: "abcdefghijkmnopqrstuvwxyz",
  digits: "23456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?/~",
};

function randInt(max: number) {
  // Rejection sampling for an unbiased index.
  const lim = Math.floor(0x100000000 / max) * max;
  const buf = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(buf);
    if (buf[0] < lim) return buf[0] % max;
  }
}

export function generatePassword(o: GenOpts) {
  const pools = (Object.keys(SETS) as (keyof typeof SETS)[]).filter((k) => o[k]).map((k) => SETS[k]);
  if (!pools.length) return "";
  const all = pools.join("");
  const chars = pools.map((p) => p[randInt(p.length)]); // at least one from each chosen set
  while (chars.length < o.length) chars.push(all[randInt(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.slice(0, o.length).join("");
}

function strength(pw: string) {
  if (!pw) return { label: "", color: "", score: 0 };
  let pool = 0;
  if (/[a-z]/.test(pw)) pool += 26;
  if (/[A-Z]/.test(pw)) pool += 26;
  if (/\d/.test(pw)) pool += 10;
  if (/[^a-zA-Z0-9]/.test(pw)) pool += 32;
  const bits = pw.length * Math.log2(Math.max(pool, 1));
  if (bits < 40) return { label: "Weak", color: "#ef4444", score: 1 };
  if (bits < 60) return { label: "Fair", color: "#f59e0b", score: 2 };
  if (bits < 80) return { label: "Strong", color: "#10b981", score: 3 };
  return { label: "Very strong", color: "#10b981", score: 4 };
}

function Generator({ onUse }: { onUse: (pw: string) => void }) {
  const [o, setO] = useState<GenOpts>({ length: 20, upper: true, lower: true, digits: true, symbols: true });
  const [pw, setPw] = useState(() => generatePassword({ length: 20, upper: true, lower: true, digits: true, symbols: true }));
  const regen = (n: GenOpts) => {
    setO(n);
    setPw(generatePassword(n));
  };
  return (
    <div className="space-y-3 rounded-xl border border-line bg-surface-2/50 p-3">
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-lg bg-surface px-3 py-2 font-mono text-sm select-all">{pw || "Pick at least one character set"}</code>
        <IconButton icon={RefreshCw} label="Regenerate" onClick={() => regen(o)} />
        <Button size="sm" variant="primary" disabled={!pw} onClick={() => onUse(pw)}>
          Use
        </Button>
      </div>
      <div className="flex items-center gap-3">
        <span className="w-16 text-xs text-muted">Length {o.length}</span>
        <input type="range" min={8} max={64} value={o.length} onChange={(e) => regen({ ...o, length: Number(e.target.value) })} className="flex-1 accent-[var(--accent)]" />
      </div>
      <div className="flex flex-wrap gap-4">
        <Checkbox checked={o.upper} onChange={(c) => regen({ ...o, upper: c })} label="A–Z" />
        <Checkbox checked={o.lower} onChange={(c) => regen({ ...o, lower: c })} label="a–z" />
        <Checkbox checked={o.digits} onChange={(c) => regen({ ...o, digits: c })} label="0–9" />
        <Checkbox checked={o.symbols} onChange={(c) => regen({ ...o, symbols: c })} label="!@#$" />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------- Entry form */
function EntryModal({ entry, onClose }: { entry: Row | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [v, setV] = useState<Row>(entry ?? {});
  const [show, setShow] = useState(false);
  const [gen, setGen] = useState(!entry?.id);
  const s = strength(v.password ?? "");
  const save = async () => {
    if (!String(v.service ?? "").trim()) return toast.error("Service / website is required");
    try {
      await api.vaultEntrySave(entry?.id ?? null, {
        service: String(v.service).trim(),
        username: v.username ?? "",
        password: v.password ?? "",
        url: v.url ?? "",
        category: v.category ?? "",
        notes: v.notes ?? "",
      });
      await qc.invalidateQueries();
      onClose();
    } catch (e) {
      toast.error(isVaultLocked(e) ? "The vault locked — unlock and try again" : String(e));
      await qc.invalidateQueries({ queryKey: ["vault"] });
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={entry?.id ? "Edit login" : "New login"}
      width="max-w-xl"
      footer={
        <>
          {entry?.id && (
            <div className="mr-auto">
              <ConfirmDelete
                onConfirm={async () => {
                  try {
                    await api.vaultEntryDelete(entry.id);
                    await qc.invalidateQueries();
                    onClose();
                  } catch (e) {
                    toast.error(String(e));
                  }
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
      <div className="grid grid-cols-2 gap-3">
        <Field label="Service / website *" className="col-span-2">
          <Input value={v.service ?? ""} onChange={(e) => setV({ ...v, service: e.target.value })} autoFocus />
        </Field>
        <Field label="Category" className="col-span-2">
          <ChoiceField value={v.category} clearable onChange={(c) => setV({ ...v, category: c })} options={CATEGORIES.map((c) => ({ value: c, label: c }))} />
        </Field>
        <Field label="Username / email" className="col-span-2">
          <Input value={v.username ?? ""} onChange={(e) => setV({ ...v, username: e.target.value })} autoComplete="off" />
        </Field>
        <Field label="Password" className="col-span-2" hint={s.label && <span style={{ color: s.color }}>{s.label}</span>}>
          <div className="flex gap-2">
            <Input
              type={show ? "text" : "password"}
              value={v.password ?? ""}
              onChange={(e) => setV({ ...v, password: e.target.value })}
              autoComplete="new-password"
              className="flex-1 font-mono"
            />
            <IconButton icon={show ? EyeOff : Eye} label={show ? "Hide" : "Show"} onClick={() => setShow(!show)} />
            <IconButton icon={Wand2} label="Password generator" active={gen} onClick={() => setGen(!gen)} />
          </div>
        </Field>
        {gen && (
          <div className="col-span-2">
            <Generator
              onUse={(pw) => {
                setV({ ...v, password: pw });
                setShow(true);
              }}
            />
          </div>
        )}
        <Field label="URL" className="col-span-2">
          <Input value={v.url ?? ""} onChange={(e) => setV({ ...v, url: e.target.value })} placeholder="https://" />
        </Field>
        <Field label="Recovery codes / notes" className="col-span-2">
          <Textarea value={v.notes ?? ""} onChange={(e) => setV({ ...v, notes: e.target.value })} className="font-mono text-xs" />
        </Field>
      </div>
    </Modal>
  );
}

/* ---------------------------------------------------------- Vault list */
function VaultList() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["vaultEntries"], queryFn: api.vaultEntries, retry: false });
  const [shown, setShown] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<Row | null>(null);

  // Auto-lock expired on the backend: refresh status so the lock screen appears.
  useEffect(() => {
    if (q.isError && isVaultLocked(q.error)) qc.invalidateQueries({ queryKey: ["vault"] });
  }, [q.isError, q.error, qc]);
  const [search, setSearch] = useState("");
  // Passwords themselves are never searched.
  const rows = (q.data ?? [])
    .filter((r) => `${r.service} ${r.username ?? ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => String(a.service).localeCompare(String(b.service)));
  const groups = [...CATEGORIES, ""]
    .map((c) => ({ key: c || "none", label: c || "No category", rows: rows.filter((r) => (c ? r.category === c : !CATEGORIES.includes(r.category))) }))
    .filter((g) => g.rows.length);

  const copy = (text: string, what: string) =>
    navigator.clipboard
      .writeText(text)
      .then(() => toast.success(`${what} copied`))
      .catch((e) => toast.error(String(e)));

  return (
    <>
      <PageHeader
        title="Passwords"
        icon={KeyRound}
        subtitle="AES-256-GCM encrypted · key derived from your master password with Argon2id"
        actions={
          <>
            <LockNowButton />
            <Button variant="primary" icon={Plus} onClick={() => setEditing({})}>
              New login
            </Button>
          </>
        }
      />
      <Page className="space-y-4">
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Find a login…" />
        {rows.length === 0 ? (
          <Empty icon={ShieldCheck} title={q.data?.length ? "No matches" : "Your vault is empty"}>
            Logins are encrypted before they touch the disk and are only decrypted in memory while unlocked.
          </Empty>
        ) : (
          groups.map((g) => (
          <section key={g.key}>
            {g.label && <div className="mb-2 text-sm font-medium">{g.label} <span className="text-xs text-muted">{g.rows.length}</span></div>}
          <div className="glass overflow-hidden rounded-[16px]">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted">
                <tr>
                  <th className="px-4 py-2 font-medium">Service</th>
                  <th className="px-3 py-2 font-medium">Username</th>
                  <th className="px-3 py-2 font-medium">Password</th>
                  <th className="px-3 py-2 font-medium">Category</th>
                  <th className="px-3 py-2 font-medium">Updated</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line border-t border-line">
                {g.rows.map((r) => {
                  const vis = shown.has(r.id);
                  return (
                    <tr key={r.id} className="cursor-pointer hover:bg-surface-2/60" onClick={() => setEditing(r)}>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-xs font-bold text-accent">
                            {String(r.service).slice(0, 1).toUpperCase()}
                          </span>
                          <span className="font-medium">{r.service}</span>
                          {r.url && (
                            <IconButton
                              icon={ExternalLink}
                              label="Open website"
                              onClick={(e) => {
                                e.stopPropagation();
                                const u = /^[a-z]+:/i.test(r.url) ? r.url : `https://${r.url}`;
                                openUrl(u).catch((err) => toast.error(String(err)));
                              }}
                            />
                          )}
                        </div>
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        {r.username && (
                          <span className="inline-flex items-center gap-1">
                            <span className="max-w-48 truncate">{r.username}</span>
                            <IconButton icon={Copy} label="Copy username" onClick={() => copy(r.username, "Username")} />
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2" onClick={(e) => e.stopPropagation()}>
                        <span className="inline-flex items-center gap-1">
                          <code className={cx("max-w-56 truncate font-mono text-xs", !vis && "tracking-widest")}>{vis ? r.password : "••••••••••"}</code>
                          <IconButton
                            icon={vis ? EyeOff : Eye}
                            label={vis ? "Hide password" : "Show password"}
                            onClick={() => {
                              const n = new Set(shown);
                              if (vis) n.delete(r.id);
                              else n.add(r.id);
                              setShown(n);
                            }}
                          />
                          <IconButton icon={Copy} label="Copy password" onClick={() => copy(r.password, "Password")} />
                        </span>
                      </td>
                      <td className="px-3 py-2">{r.category && <Badge>{r.category}</Badge>}</td>
                      <td className="px-3 py-2 text-xs text-muted">{fmtDateTime(String(r.updated_at).replace(" ", "T"))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          </section>
          ))
        )}
      </Page>
      {editing && <EntryModal entry={editing.id ? editing : null} onClose={() => setEditing(null)} />}
    </>
  );
}

export default function PasswordsPage() {
  return (
    <LockGate what="Password vault">
      <VaultList />
    </LockGate>
  );
}
