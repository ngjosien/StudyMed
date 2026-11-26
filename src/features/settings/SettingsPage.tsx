import { useState, type ReactNode } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { disable as disableAutostart, enable as enableAutostart, isEnabled as isAutostartEnabled } from "@tauri-apps/plugin-autostart";
import { save as saveDialog } from "@tauri-apps/plugin-dialog";
import { openPath } from "@tauri-apps/plugin-opener";
import { ChoiceField, DateTimeField, TimeField } from "../../components/pickers";
import { Bell, Database, FolderOpen, Lock, Monitor, Moon, Settings, Sun, Trash2, Download, Copy, Power, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";
import { useAppInfo, useMutate } from "../../lib/hooks";
import { fmtDateTime, toDateTimeStr, addMinutes } from "../../lib/dates";
import { Button, Card, Checkbox, Field, IconButton, Input, Page, PageHeader, Segmented } from "../../components/ui";
import { BODY_FONTS, FONT_PAIRS, HEAD_FONTS, PALETTES, useSetting, useUI, type Theme } from "../../stores/ui";
import { cx } from "../../lib/format";
import { toast } from "../../stores/toast";
import { VaultSettings } from "../secure/vault";
import { checkForUpdate, installNow, useUpdater } from "../../lib/updater";

function Section({ title, icon: Icon, children, desc }: { title: string; icon: typeof Bell; children: ReactNode; desc?: string }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center gap-2">
        <Icon size={16} className="text-accent" />
        <h2 className="font-semibold">{title}</h2>
      </div>
      {desc && <p className="-mt-2 mb-4 text-sm text-muted">{desc}</p>}
      <div className="space-y-4">{children}</div>
    </Card>
  );
}

function Notifications() {
  const mutate = useMutate();
  const reminders = useQuery({ queryKey: ["reminders", "all"], queryFn: () => api.remindersList(true) });
  const [title, setTitle] = useState("");
  const [at, setAt] = useState(() => toDateTimeStr(addMinutes(new Date(), 2)));
  const [defaultTime, setDefaultTime] = useSetting("reminders.defaultTime", "09:00");
  const [srsOn, setSrsOn] = useSetting<boolean>("srs.reminders", true);
  const [srsTime, setSrsTime] = useSetting("srs.reminderTime", "09:00");
  const pending = (reminders.data ?? []).filter((r) => !r.fired_at);
  const fired = (reminders.data ?? []).filter((r) => r.fired_at);

  return (
    <Section
      title="Notifications"
      icon={Bell}
      desc="Push reminders are the only thing StudyMed ever does on its own. Everything else stays manual."
    >
      <div className="flex flex-wrap items-end gap-3">
        <Button
          icon={Bell}
          onClick={() =>
            api
              .notifyNow("StudyMed", "Notifications are working")
              .then(() => toast.success("Test notification sent"))
              .catch((e) => toast.error(String(e)))
          }
        >
          Send test notification
        </Button>
        <Field label="Default reminder time for date-only items">
          <TimeField className="w-40" value={defaultTime} clearable={false} onChange={(t) => setDefaultTime(t ?? "09:00")} />
        </Field>
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <Checkbox checked={srsOn} onChange={setSrsOn} label="Daily reminder when active recall is due" />
        <Field label="at">
          <div className={srsOn ? "" : "pointer-events-none opacity-50"}>
            <TimeField className="w-40" value={srsTime} clearable={false} onChange={(t) => setSrsTime(t ?? "09:00")} />
          </div>
        </Field>
      </div>

      <div className="rounded-xl border border-line p-4">
        <p className="mb-2 text-sm font-medium">Quick reminder</p>
        <div className="flex flex-wrap gap-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Remind me to…" className="min-w-56 flex-1" />
          <div className="w-80">
            <DateTimeField value={at} onChange={(v) => setAt(v ?? "")} />
          </div>
          <Button
            variant="primary"
            disabled={!title.trim() || !at}
            onClick={async () => {
              await mutate(api.reminderCreate({ remindAt: at, title: title.trim() }));
              setTitle("");
              toast.success("Reminder scheduled");
            }}
          >
            Schedule
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-medium">Upcoming ({pending.length})</p>
        {pending.length === 0 ? (
          <p className="text-sm text-muted">No reminders scheduled.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line">
            {pending.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="w-44 shrink-0 text-muted">{fmtDateTime(r.remind_at)}</span>
                <span className="min-w-0 flex-1 truncate">{r.title}</span>
                <IconButton icon={Trash2} label="Cancel reminder" onClick={() => mutate(api.reminderDelete(r.id))} />
              </li>
            ))}
          </ul>
        )}
      </div>
      {fired.length > 0 && (
        <div>
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium">Recently sent</p>
            <Button size="sm" variant="ghost" onClick={() => mutate(api.remindersClearFired())}>
              Clear history
            </Button>
          </div>
          <ul className="max-h-48 divide-y divide-line overflow-y-auto rounded-lg border border-line">
            {fired.slice(0, 30).map((r) => (
              <li key={r.id} className="flex gap-3 px-3 py-1.5 text-sm text-muted">
                <span className="w-44 shrink-0">{fmtDateTime(r.fired_at)}</span>
                <span className="truncate">{r.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Section>
  );
}

function ScenePicker() {
  const [scene, setScene] = useSetting<string>("background.scene", "neural");
  return (
    <Field label="Background">
      <ChoiceField
        options={[
          { value: "neural", label: "Neurons firing" },
          { value: "still", label: "Neurons, still" },
          { value: "wash", label: "Plain wash" },
        ]}
        value={scene}
        onChange={(v) => setScene(String(v ?? "neural"))}
      />
    </Field>
  );
}

function PalettePicker() {
  const palette = useUI((s) => s.palette);
  const setPalette = useUI((s) => s.setPalette);
  return (
    <div className="space-y-4">
      {(["Pastel", "Old money"] as const).map((family) => (
        <div key={family}>
          <div className="mb-2 text-xs font-medium text-muted">{family}</div>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2">
            {PALETTES.filter((p) => p.family === family).map((p) => (
              <button
                type="button"
                key={p.id}
                onClick={() => setPalette(p.id)}
                className={cx(
                  "flex items-center gap-3 rounded-2xl border-2 p-2.5 text-left text-sm hover:-translate-y-0.5",
                  palette === p.id ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2",
                )}
              >
                <span className="flex -space-x-1.5">
                  {p.swatch.map((c) => (
                    <span key={c} className="h-5 w-5 rounded-full border-2 border-surface-solid" style={{ background: c }} />
                  ))}
                </span>
                <span className={cx("font-medium", p.family === "Old money" && "font-[Georgia,serif]")}>{p.name}</span>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FontPicker() {
  const [body, setBody] = useSetting<string>("font.body", "sf");
  const [head, setHead] = useSetting<string>("font.head", "auto");
  return (
    <div className="space-y-4">
      <Field label="Old money pairs">
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(190px,1fr))]">
          {FONT_PAIRS.map((p) => {
            const on = p.head === head && p.body === body;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => {
                  setHead(p.head);
                  setBody(p.body);
                }}
                className={cx("rounded-[16px] border-2 p-3 text-left hover:-translate-y-0.5", on ? "border-accent bg-accent-soft" : "border-transparent bg-surface-2")}
              >
                <span className="block text-xl leading-tight" data-font-sample={p.head}>
                  {p.name}
                </span>
                <span className="block text-xs text-muted" data-font-body-sample={p.body}>
                  {p.note}
                </span>
              </button>
            );
          })}
        </div>
      </Field>
      <Field label="Body font">
        <ChoiceField value={body} onChange={(v) => setBody(String(v))} options={BODY_FONTS.map((f) => ({ value: f.id as string, label: f.name }))} />
      </Field>
      <Field label="Heading font">
        <ChoiceField value={head} onChange={(v) => setHead(String(v))} options={HEAD_FONTS.map((f) => ({ value: f.id as string, label: f.name }))} />
      </Field>
    </div>
  );
}

function BackgroundSection() {
  const [closeToTray, setCloseToTray] = useSetting<boolean>("tray.closeToTray", true);
  const autostart = useQuery({ queryKey: ["autostart"], queryFn: isAutostartEnabled });
  const qc = useQueryClient();
  return (
    <Section
      title="Background & startup"
      icon={Power}
      desc="Reminders can only fire while StudyMed is running. Keep it in the system tray so they still arrive after you close the window."
    >
      <Checkbox checked={closeToTray} onChange={setCloseToTray} label="Keep running in the system tray when the window is closed" />
      <Checkbox
        checked={!!autostart.data}
        onChange={async (on) => {
          try {
            if (on) await enableAutostart();
            else await disableAutostart();
            await qc.invalidateQueries({ queryKey: ["autostart"] });
            toast.success(on ? "StudyMed will start with Windows (in the tray)" : "Start with Windows turned off");
          } catch (e) {
            toast.error(String(e));
          }
        }}
        label="Start StudyMed when Windows starts (opens quietly in the tray)"
      />
      <p className="text-xs text-muted">To fully quit, right-click the StudyMed icon in the system tray and choose Quit.</p>
    </Section>
  );
}

function UpdatesSection() {
  const u = useUpdater();
  const run = async () => {
    try {
      const found = await checkForUpdate(true);
      const s = useUpdater.getState();
      if (s.status === "off") toast.info("Updates only run in the installed app");
      else if (!found) toast.success("You're on the latest version");
    } catch (e) {
      toast.error(`Couldn't check for updates: ${e}`);
    }
  };
  const label: Record<string, string> = {
    checking: "Checking GitHub…",
    downloading: `Downloading ${u.version ?? ""}${u.progress ? ` (${Math.round(u.progress * 100)}%)` : ""}…`,
    ready: `Version ${u.version} is downloaded and installs when you restart.`,
    installing: "Installing…",
    latest: "You're on the latest version.",
    error: "The last check failed. It tries again in a few hours.",
    off: "This copy doesn't update itself (test or development build).",
  };
  return (
    <Section title="Updates" icon={RefreshCw} desc="StudyMed checks GitHub for new versions every few hours, downloads them, and restarts to install. Your data stays on this PC.">
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={RefreshCw} onClick={run} disabled={u.status === "checking" || u.status === "downloading" || u.status === "installing"}>
          Check for updates
        </Button>
        {u.status === "ready" && (
          <Button variant="primary" onClick={() => void installNow()}>
            Restart and update
          </Button>
        )}
        <span className="text-xs text-muted">
          {label[u.status] ?? ""}
          {u.lastChecked && ` Last checked ${u.lastChecked.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`}
        </span>
      </div>
    </Section>
  );
}

function DataSection() {
  const info = useAppInfo();
  const backup = async () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const dest = await saveDialog({ defaultPath: `StudyMed-backup-${stamp}.db`, filters: [{ name: "SQLite database", extensions: ["db"] }] });
    if (!dest) return;
    try {
      await api.backupCreate(dest);
      toast.success("Backup saved");
    } catch (e) {
      toast.error(String(e));
    }
  };
  return (
    <Section title="Data & backup" icon={Database} desc="Everything lives on this PC. No cloud, no account.">
      {info.data && (
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-muted">Database</span>
            <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">{info.data.dbPath}</code>
            <IconButton
              icon={Copy}
              label="Copy path"
              onClick={() => navigator.clipboard.writeText(info.data!.dbPath).then(() => toast.success("Copied"))}
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-28 shrink-0 text-muted">Files & photos</span>
            <code className="min-w-0 flex-1 truncate rounded bg-surface-2 px-2 py-1 text-xs">{info.data.dataDir}\files</code>
            <IconButton
              icon={FolderOpen}
              label="Open folder"
              onClick={() => openPath(info.data!.dataDir).catch((e) => toast.error(String(e)))}
            />
          </div>
          <p className="text-xs text-muted">
            Version {info.data.version} · schema v{info.data.schemaVersion}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button icon={Download} onClick={backup}>
          Back up database…
        </Button>
        <span className="text-xs text-muted">
          Creates a consistent snapshot. To back up attachments and photos too, copy the data folder above.
        </span>
      </div>
    </Section>
  );
}

export default function SettingsPage() {
  const theme = useUI((s) => s.theme);
  const setTheme = useUI((s) => s.setTheme);
  return (
    <>
      <PageHeader title="Settings" icon={Settings} />
      <Page className="max-w-3xl space-y-5">
        <Section title="Appearance" icon={Sun}>
          <Segmented<Theme>
            value={theme}
            onChange={setTheme}
            options={[
              { value: "light", label: "Light", icon: Sun },
              { value: "dark", label: "Dark", icon: Moon },
              { value: "system", label: "System", icon: Monitor },
            ]}
          />
          <PalettePicker />
          <FontPicker />
          <ScenePicker />
        </Section>
        <Notifications />
        <BackgroundSection />
        <Section title="Security" icon={Lock} desc="Your master password encrypts the Password vault and locked notes, and unlocks private Wishlists.">
          <VaultSettings />
        </Section>
        <UpdatesSection />
        <DataSection />
      </Page>
    </>
  );
}
