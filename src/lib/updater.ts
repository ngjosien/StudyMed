import { create } from "zustand";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { getIdentifier } from "@tauri-apps/api/app";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Only the installed app updates itself; test copies and dev builds never do. */
const LIVE_IDENTIFIER = "com.studymed.app";
const FIRST_CHECK_MS = 15_000;
const CHECK_EVERY_MS = 3 * 60 * 60 * 1000;
/** How long the "restarting" banner waits before installing. */
export const RESTART_DELAY_S = 20;

type Status = "idle" | "checking" | "downloading" | "ready" | "installing" | "latest" | "error" | "off";

interface UpdaterState {
  status: Status;
  version?: string;
  progress?: number;
  error?: string;
  lastChecked?: Date;
  /** The user pressed "Not now": install the next time the window is hidden. */
  postponed: boolean;
  set(p: Partial<UpdaterState>): void;
}

export const useUpdater = create<UpdaterState>((set) => ({ status: "idle", postponed: false, set: (p) => set(p) }));

let pending: Update | null = null;

async function enabled() {
  if (import.meta.env.DEV) return false;
  try {
    return (await getIdentifier()) === LIVE_IDENTIFIER;
  } catch {
    return false;
  }
}

/** Checks GitHub for a newer release and downloads it. Returns true if one is ready to install. */
export async function checkForUpdate(manual = false): Promise<boolean> {
  const s = useUpdater.getState();
  if (s.status === "ready") return true;
  if (s.status === "checking" || s.status === "downloading" || s.status === "installing") return false;
  if (!(await enabled())) {
    s.set({ status: "off" });
    return false;
  }
  s.set({ status: "checking", error: undefined });
  try {
    const update = await check();
    s.set({ lastChecked: new Date() });
    if (!update) {
      s.set({ status: "latest" });
      return false;
    }
    s.set({ status: "downloading", version: update.version, progress: 0 });
    let total = 0;
    let got = 0;
    await update.download((e) => {
      if (e.event === "Started") total = e.data.contentLength ?? 0;
      if (e.event === "Progress") {
        got += e.data.chunkLength;
        if (total) useUpdater.getState().set({ progress: got / total });
      }
    });
    pending = update;
    s.set({ status: "ready", progress: 1, postponed: false });
    return true;
  } catch (e) {
    s.set({ status: "error", error: String(e) });
    if (manual) throw e;
    return false;
  }
}

/** Installs the downloaded update. On Windows the installer closes StudyMed and reopens it. */
export async function installNow() {
  if (!pending) return;
  useUpdater.getState().set({ status: "installing" });
  try {
    await pending.install();
    await relaunch();
  } catch (e) {
    useUpdater.getState().set({ status: "error", error: String(e) });
  }
}

let started = false;
/** Starts background checks: shortly after launch, then every few hours. */
export function startAutoUpdate() {
  if (started) return;
  started = true;
  setTimeout(() => void checkForUpdate(), FIRST_CHECK_MS);
  setInterval(() => void checkForUpdate(), CHECK_EVERY_MS);
  // A postponed update installs once the window is closed to the tray.
  const win = getCurrentWindow();
  setInterval(async () => {
    const s = useUpdater.getState();
    if (s.status === "ready" && s.postponed && !(await win.isVisible())) void installNow();
  }, 60_000);
}
