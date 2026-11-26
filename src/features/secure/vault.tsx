import { useEffect, useRef, useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Lock, LockOpen, ShieldCheck } from "lucide-react";
import { api } from "../../lib/api";
import { Button, Card, Field, Input, Select } from "../../components/ui";
import { toast } from "../../stores/toast";

export function useVault() {
  // Keep checking while unfocused/in the tray so decrypted content leaves the screen on time.
  return useQuery({ queryKey: ["vault"], queryFn: api.vaultStatus, refetchInterval: 15_000, refetchIntervalInBackground: true });
}

const AUTO_LOCK = [
  { value: 1, label: "1 minute" },
  { value: 5, label: "5 minutes" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
  { value: 0, label: "Never (until app closes)" },
];

export function SetupForm({ onDone }: { onDone?: () => void }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [mins, setMins] = useState(5);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw !== pw2) return toast.error("The two entries don't match");
    setBusy(true);
    try {
      await api.vaultSetup(pw, mins);
      await qc.invalidateQueries();
      toast.success("Master password set");
      onDone?.();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <p className="text-sm text-muted">
        Choose a master password or PIN (4+ characters). It's never stored — only used to derive the encryption key.{" "}
        <strong className="text-fg">If you forget it, encrypted data can't be recovered.</strong>
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Master password / PIN">
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field>
        <Field label="Confirm">
          <Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </Field>
        <Field label="Auto-lock after inactivity">
          <Select value={mins} onChange={(e) => setMins(Number(e.target.value))} options={AUTO_LOCK} />
        </Field>
      </div>
      <Button type="submit" variant="primary" icon={ShieldCheck} disabled={busy || pw.length < 4}>
        Set master password
      </Button>
    </form>
  );
}

export function UnlockForm({ compact }: { compact?: boolean }) {
  const qc = useQueryClient();
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    try {
      await api.vaultUnlock(pw);
      setPw("");
      await qc.invalidateQueries();
    } catch (e) {
      toast.error(String(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <form
      className={compact ? "flex gap-2" : "mx-auto flex max-w-sm flex-col gap-3"}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Master password / PIN" autoFocus={!compact} />
      <Button type="submit" variant="primary" icon={LockOpen} disabled={busy || !pw}>
        Unlock
      </Button>
    </form>
  );
}

/** Resets the backend auto-lock timer while the user is active on a protected page. */
function ActivityKeeper() {
  const last = useRef(0);
  useEffect(() => {
    const h = () => {
      const now = Date.now();
      if (now - last.current > 30_000) {
        last.current = now;
        api.vaultTouch().catch(() => undefined);
      }
    };
    window.addEventListener("mousemove", h);
    window.addEventListener("keydown", h);
    return () => {
      window.removeEventListener("mousemove", h);
      window.removeEventListener("keydown", h);
    };
  }, []);
  return null;
}

export function LockNowButton() {
  const qc = useQueryClient();
  return (
    <Button
      icon={Lock}
      onClick={async () => {
        await api.vaultLock();
        await qc.invalidateQueries();
      }}
    >
      Lock now
    </Button>
  );
}

/** Shows children only while the vault is unlocked. */
export function LockGate({ children, what }: { children: ReactNode; what: string }) {
  const v = useVault();
  const qc = useQueryClient();
  const unlocked = !!v.data?.configured && !!v.data?.unlocked;
  useEffect(() => {
    // Drop any decrypted data held in the query cache as soon as the vault is locked.
    if (v.data && !unlocked) {
      qc.removeQueries({ queryKey: ["vaultEntries"] });
      qc.removeQueries({ queryKey: ["lockedNote"] });
    }
  }, [unlocked, v.data, qc]);
  if (!v.data) return null;
  if (!v.data.configured || !v.data.unlocked) {
    return (
      <div className="flex justify-center px-8 py-16">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
            <KeyRound size={22} />
          </div>
          <h2 className="mb-1 text-lg font-semibold">{what} {v.data.configured ? "is locked" : "needs a master password"}</h2>
          <div className="mt-5 text-left">{v.data.configured ? <UnlockForm /> : <SetupForm />}</div>
        </Card>
      </div>
    );
  }
  return (
    <>
      <ActivityKeeper />
      {children}
    </>
  );
}

export function VaultSettings() {
  const v = useVault();
  const qc = useQueryClient();
  const [oldPw, setOldPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [newPw2, setNewPw2] = useState("");
  if (!v.data) return null;
  if (!v.data.configured) return <SetupForm />;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-1.5 text-sm">
          {v.data.unlocked ? <LockOpen size={15} className="text-emerald-500" /> : <Lock size={15} className="text-muted" />}
          Vault is {v.data.unlocked ? "unlocked" : "locked"}
        </span>
        {v.data.unlocked ? <LockNowButton /> : <UnlockForm compact />}
      </div>
      {v.data.unlocked && (
        <>
          <Field label="Auto-lock after inactivity">
            <Select
              className="w-60"
              value={v.data.autoLockMin}
              onChange={async (e) => {
                try {
                  await api.vaultSetAutoLock(Number(e.target.value));
                  await qc.invalidateQueries({ queryKey: ["vault"] });
                  toast.success("Auto-lock updated");
                } catch (err) {
                  toast.error(String(err));
                }
              }}
              options={AUTO_LOCK}
            />
          </Field>
          <form
            className="grid grid-cols-3 items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              if (newPw !== newPw2) return toast.error("New passwords don't match");
              try {
                await api.vaultChangePassword(oldPw, newPw);
                setOldPw("");
                setNewPw("");
                setNewPw2("");
                toast.success("Master password changed — everything was re-encrypted");
              } catch (err) {
                toast.error(String(err));
              }
            }}
          >
            <Field label="Current password">
              <Input type="password" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
            </Field>
            <Field label="New password">
              <Input type="password" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
            </Field>
            <Field label="Confirm new">
              <Input type="password" value={newPw2} onChange={(e) => setNewPw2(e.target.value)} />
            </Field>
            <div className="col-span-3">
              <Button type="submit" disabled={!oldPw || newPw.length < 4}>
                Change master password
              </Button>
            </div>
          </form>
        </>
      )}
    </div>
  );
}
