import { create } from "zustand";
import { api } from "../lib/api";

export type Theme = "light" | "dark" | "system";
export type Palette = "cotton" | "blossom" | "lavender" | "sky" | "butter" | "mint" | "heritage" | "estate" | "bordeaux";
export type SidebarGroup = "personal" | "academics";

export const PALETTES: { id: Palette; name: string; family: "Pastel" | "Old money"; swatch: string[] }[] = [
  { id: "cotton", name: "Cotton Candy", family: "Pastel", swatch: ["#ffd6e7", "#d9e4ff", "#fff1c9", "#8d6fd6"] },
  { id: "blossom", name: "Blossom", family: "Pastel", swatch: ["#ffd1e1", "#ffe4ec", "#f6dcff", "#d2648f"] },
  { id: "lavender", name: "Lavender", family: "Pastel", swatch: ["#e2d6ff", "#d7deff", "#f3d9fa", "#7b63d0"] },
  { id: "sky", name: "Sky", family: "Pastel", swatch: ["#cfe5ff", "#d6f3f2", "#e2dcff", "#4a86cf"] },
  { id: "butter", name: "Butter", family: "Pastel", swatch: ["#fff0bd", "#ffe2c7", "#fdf6d4", "#b98a14"] },
  { id: "mint", name: "Mint", family: "Pastel", swatch: ["#cdf2e0", "#d8efff", "#e8f6cf", "#3e9a77"] },
  { id: "heritage", name: "Heritage", family: "Old money", swatch: ["#f3eee3", "#e6dcc6", "#c9ab72", "#1f3354"] },
  { id: "estate", name: "Estate", family: "Old money", swatch: ["#f1ede1", "#dfe2cf", "#c8a965", "#2f4a3a"] },
  { id: "bordeaux", name: "Bordeaux", family: "Old money", swatch: ["#f4ede4", "#ecd8cc", "#d4a373", "#6e2233"] },
];

export const BODY_FONTS = [
  { id: "sf", name: "SF Pro Display" },
  { id: "inter", name: "Inter" },
  { id: "sourceserif", name: "Source Serif" },
  { id: "baskerville", name: "Baskerville" },
] as const;
export const HEAD_FONTS = [
  { id: "auto", name: "EB Garamond (default)" },
  { id: "cooper", name: "Cooper Black" },
  { id: "fraunces", name: "Fraunces" },
  { id: "bodoni", name: "Bodoni" },
  { id: "baskerville", name: "Baskerville" },
  { id: "cormorant", name: "Cormorant" },
  { id: "dmserif", name: "DM Serif" },
  { id: "playfair", name: "Playfair" },
  { id: "cinzel", name: "Cinzel" },
  { id: "garamond", name: "Garamond" },
  { id: "sans", name: "Same as body" },
] as const;

/** Old-money heading and body pairs. */
export const FONT_PAIRS = [
  { id: "college", name: "College", head: "auto", body: "inter", note: "EB Garamond over Inter" },
  { id: "estate", name: "Estate", head: "bodoni", body: "sf", note: "Bodoni over SF Pro" },
  { id: "library", name: "Library", head: "baskerville", body: "sourceserif", note: "Baskerville over Source Serif" },
  { id: "club", name: "Country club", head: "dmserif", body: "inter", note: "DM Serif over Inter" },
  { id: "heirloom", name: "Heirloom", head: "fraunces", body: "sf", note: "Fraunces over SF Pro" },
  { id: "monogram", name: "Monogram", head: "cinzel", body: "baskerville", note: "Cinzel over Baskerville" },
  { id: "manor", name: "Manor", head: "cormorant", body: "sourceserif", note: "Cormorant over Source Serif" },
] as const;

export function applyFonts(body: unknown, head: unknown) {
  const el = document.documentElement;
  el.dataset.fontBody = BODY_FONTS.find((f) => f.id === body)?.id ?? "sf";
  el.dataset.fontHead = HEAD_FONTS.find((f) => f.id === head)?.id ?? "auto";
}

export const SIDEBAR_MIN = 220;
export const SIDEBAR_MAX = 420;

interface UIState {
  theme: Theme;
  palette: Palette;
  sidebarCollapsed: boolean;
  sidebarWidth: number;
  sidebarGroup: SidebarGroup;
  paletteOpen: boolean;
  settings: Record<string, unknown>;
  setTheme(t: Theme): void;
  setPalette(p: Palette): void;
  toggleSidebar(): void;
  setSidebarWidth(w: number, persist?: boolean): void;
  setSidebarGroup(g: SidebarGroup): void;
  setPaletteOpen(o: boolean): void;
  setSetting(key: string, value: unknown): void;
}

const persist = (key: string, value: unknown) => {
  api.settingsSet(key, value).catch((e) => console.error("settings_set failed", e));
};

const mq = window.matchMedia("(prefers-color-scheme: dark)");

export function applyTheme(t: Theme, p?: Palette) {
  const dark = t === "dark" || (t === "system" && mq.matches);
  const el = document.documentElement;
  el.classList.toggle("dark", dark);
  el.style.colorScheme = dark ? "dark" : "light";
  if (p) el.dataset.palette = p;
}

export const useUI = create<UIState>((set, get) => ({
  theme: "system",
  palette: "cotton",
  sidebarCollapsed: false,
  sidebarWidth: 256,
  sidebarGroup: "personal",
  paletteOpen: false,
  settings: {},
  setTheme(theme) {
    set({ theme });
    applyTheme(theme, get().palette);
    persist("theme", theme);
  },
  setPalette(palette) {
    set({ palette });
    applyTheme(get().theme, palette);
    persist("theme.palette", palette);
  },
  toggleSidebar() {
    const v = !get().sidebarCollapsed;
    set({ sidebarCollapsed: v });
    persist("sidebar.collapsed", v);
  },
  setSidebarWidth(w, save = true) {
    const width = Math.round(Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, w)));
    set({ sidebarWidth: width });
    if (save) persist("sidebar.width", width);
  },
  setSidebarGroup(sidebarGroup) {
    set({ sidebarGroup });
    persist("sidebar.group", sidebarGroup);
  },
  setPaletteOpen(paletteOpen) {
    set({ paletteOpen });
  },
  setSetting(key, value) {
    const settings = { ...get().settings, [key]: value };
    set({ settings });
    if (key.startsWith("font.")) applyFonts(settings["font.body"], settings["font.head"]);
    persist(key, value);
  },
}));

mq.addEventListener("change", () => applyTheme(useUI.getState().theme));

export async function loadSettings() {
  try {
    const s = await api.settingsGetAll();
    const theme = s.theme;
    const palette = PALETTES.find((p) => p.id === s["theme.palette"])?.id ?? "cotton";
    useUI.setState({
      settings: s,
      theme: theme === "light" || theme === "dark" || theme === "system" ? theme : "system",
      palette,
      sidebarCollapsed: s["sidebar.collapsed"] === true,
      sidebarWidth: typeof s["sidebar.width"] === "number" ? (s["sidebar.width"] as number) : 256,
      sidebarGroup: s["sidebar.group"] === "academics" ? "academics" : "personal",
    });
  } catch (e) {
    console.error("could not load settings", e);
  }
  // One-time switch to the new default heading font (EB Garamond); later choices are kept.
  if (useUI.getState().settings["font.v2"] !== true) {
    useUI.getState().setSetting("font.head", "auto");
    useUI.getState().setSetting("font.v2", true);
  }
  const { theme, palette, settings } = useUI.getState();
  applyTheme(theme, palette);
  applyFonts(settings["font.body"], settings["font.head"]);
}

export const useSetting = <T,>(key: string, fallback: T): [T, (v: T) => void] => {
  const v = useUI((s) => s.settings[key]) as T | undefined;
  const set = useUI((s) => s.setSetting);
  return [v === undefined ? fallback : v, (nv: T) => set(key, nv)];
};
