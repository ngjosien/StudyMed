import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { Command } from "cmdk";
import { useQuery } from "@tanstack/react-query";
import { Moon, Monitor, PanelLeftClose, PanelLeftOpen, Search, Sun, X, CornerDownLeft, Plus, Bell, Menu } from "lucide-react";
import { api } from "../lib/api";
import { allItems, ENTITY_LABEL, entityRoute, focusItem, gardenItem, groups, homeItem, routineItem, settingsItem, todosItem, topItems, type NavItem } from "../lib/nav";
import { isMobile } from "../lib/platform";
import { isPermissionGranted, requestPermission } from "@tauri-apps/plugin-notification";
import { useDebounced, useReminderEvents } from "../lib/hooks";
import { cx } from "../lib/format";
import { SIDEBAR_MAX, SIDEBAR_MIN, useSetting, useUI, type SidebarGroup, type Theme } from "../stores/ui";
import { useToasts } from "../stores/toast";
import { Kbd } from "./ui";
import { normalizeScene, SceneBackdrop } from "./backdrop";
import { installNow, RESTART_DELAY_S, startAutoUpdate, useUpdater } from "../lib/updater";
import { useAllowance } from "../lib/allowance";
import { BeatsChip } from "./beats";
import { AppMark } from "./app-mark";
import { FocusFinish, FocusPill } from "./focus-widgets";

const nextTheme: Record<Theme, Theme> = { light: "dark", dark: "system", system: "light" };
const themeIcon = { light: Sun, dark: Moon, system: Monitor };
const COLLAPSED_W = 72;

function SideLink({ item, collapsed, delay = 0 }: { item: NavItem; collapsed: boolean; delay?: number }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.path}
      title={collapsed ? item.label : undefined}
      style={{ animationDelay: `${delay}ms` }}
      className={({ isActive }) =>
        cx(
          "anim-item group flex items-center gap-3 rounded-2xl px-3 py-[7px] text-[13px]",
          collapsed && "justify-center px-0",
          isActive
            ? "relative bg-surface-solid/80 font-semibold text-fg shadow-[0_1px_2px_rgba(0,0,0,0.06),inset_0_1px_0_var(--glass-highlight)] before:absolute before:top-2 before:bottom-2 before:left-0 before:w-[3px] before:rounded-full before:bg-accent"
            : "text-fg/75 hover:bg-surface-2 hover:text-fg",
        )
      }
    >
      <Icon size={18} className="shrink-0 transition-transform duration-300 group-hover:scale-110" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

/** Telegram-style folder switcher: rounded pills with a sliding highlight. */
function GroupSwitcher({ collapsed }: { collapsed: boolean }) {
  const { sidebarGroup, setSidebarGroup } = useUI();
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});
  const box = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, top: 0, width: 0, height: 0 });
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[sidebarGroup];
      if (el) setInd({ left: el.offsetLeft, top: el.offsetTop, width: el.offsetWidth, height: el.offsetHeight });
    };
    measure();
    // Re-measure while the sidebar animates between widths.
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [sidebarGroup, collapsed]);
  return (
    <div ref={box} className={cx("relative flex rounded-2xl bg-surface-2 p-1", collapsed ? "flex-col gap-1" : "gap-1")}>
      <span
        className="absolute rounded-xl bg-surface-solid shadow-sm transition-all duration-300 ease-[var(--ease)]"
        style={{ left: ind.left, top: ind.top, width: ind.width, height: ind.height }}
      />
      {groups.map((g) => {
        const Icon = g.icon;
        const active = sidebarGroup === g.id;
        return (
          <button
            type="button"
            key={g.id}
            ref={(el) => {
              refs.current[g.id] = el;
            }}
            title={g.label}
            onClick={() => setSidebarGroup(g.id as SidebarGroup)}
            className={cx(
              "relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-xl py-1.5 text-[13px] font-medium",
              active ? "text-accent" : "text-muted hover:text-fg",
            )}
          >
            <Icon size={15} />
            {!collapsed && g.label}
          </button>
        );
      })}
    </div>
  );
}

/** Phones and narrow windows get the phone layout: top bar, bottom tabs, slide-out menu. */
const NARROW = "(max-width: 767px)";
function useNarrow() {
  const [narrow, setNarrow] = useState(() => isMobile || window.matchMedia(NARROW).matches);
  useEffect(() => {
    const m = window.matchMedia(NARROW);
    const h = () => setNarrow(isMobile || m.matches);
    m.addEventListener("change", h);
    return () => m.removeEventListener("change", h);
  }, []);
  return narrow;
}

export function Sidebar({ drawer = false, onClose }: { drawer?: boolean; onClose?: () => void }) {
  const { sidebarCollapsed: storedCollapsed, toggleSidebar, sidebarWidth, setSidebarWidth, sidebarGroup, theme, setTheme, setPaletteOpen } = useUI();
  const [dragging, setDragging] = useState(false);
  const collapsed = drawer ? false : storedCollapsed;
  const ThemeIcon = themeIcon[theme];
  const group = groups.find((g) => g.id === sidebarGroup) ?? groups[0];

  const startResize = (e: RPointerEvent<HTMLDivElement>) => {
    if (collapsed) return;
    e.preventDefault();
    const startX = e.clientX;
    const startW = sidebarWidth;
    setDragging(true);
    const move = (ev: PointerEvent) => setSidebarWidth(startW + ev.clientX - startX, false);
    const up = (ev: PointerEvent) => {
      setDragging(false);
      setSidebarWidth(startW + ev.clientX - startX, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  return (
    <aside
      className={cx("glass relative z-20 flex h-full shrink-0 flex-col rounded-[18px]", !dragging && "transition-[width] duration-300 ease-[var(--ease)]")}
      style={{ width: drawer ? "100%" : collapsed ? COLLAPSED_W : sidebarWidth }}
    >
      <div className={cx("flex items-center gap-2 px-4 pt-4 pb-3", collapsed && "flex-col px-2")}>
        <AppMark className="h-9 w-9" />
        {!collapsed && <span className="flex-1 truncate">
            <span className="font-display block text-[18px] leading-none">StudyMed</span>
            <span className="eyebrow !text-[9px]">Medicine · Life</span>
          </span>}
        <button
          type="button"
          onClick={drawer ? onClose : toggleSidebar}
          title={drawer ? "Close menu" : collapsed ? "Expand sidebar (Ctrl+\\)" : "Collapse to icons (Ctrl+\\)"}
          className="rounded-xl p-1.5 text-muted hover:bg-surface-2 hover:text-fg"
        >
          {drawer ? <X size={18} /> : collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <div className={cx("pb-3", collapsed ? "px-2" : "px-4")}>
        <button
          type="button"
          onClick={() => {
            onClose?.();
            setPaletteOpen(true);
          }}
          title="Search (Ctrl+K)"
          className={cx(
            "flex h-9 w-full items-center gap-2 rounded-2xl bg-surface-2 px-3 text-sm text-muted hover:text-fg",
            collapsed && "justify-center px-0",
          )}
        >
          <Search size={15} />
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">Search…</span>
              {!drawer && <Kbd>Ctrl K</Kbd>}
            </>
          )}
        </button>
      </div>

      <div className={cx("space-y-3", collapsed ? "px-2" : "px-4")}>
        <div className="space-y-0.5">
          {topItems.map((it) => (
            <SideLink key={it.id} item={it} collapsed={collapsed} />
          ))}
        </div>
        <FocusPill collapsed={collapsed} />
        <GroupSwitcher collapsed={collapsed} />
      </div>

      <nav key={group.id + String(collapsed)} className={cx("mt-2 flex-1 space-y-0.5 overflow-y-auto pb-3", collapsed ? "px-2" : "px-4")}>
        {group.items.map((it, i) => (
          <SideLink key={it.id} item={it} collapsed={collapsed} delay={i * 22} />
        ))}
      </nav>

      <div className={cx("flex items-center gap-1 p-3", collapsed && "flex-col")}>
        <div className={cx(!collapsed && "flex-1")}>
          <SideLink item={settingsItem} collapsed={collapsed} />
        </div>
        <BeatsChip collapsed={collapsed} />
        <button
          type="button"
          onClick={() => setTheme(nextTheme[theme])}
          title={`Light/dark: ${theme} (click to change)`}
          className="rounded-xl p-2 text-muted hover:bg-surface-2 hover:text-fg"
        >
          <ThemeIcon size={17} />
        </button>
      </div>

      {!collapsed && !drawer && (
        <div
          onPointerDown={startResize}
          onDoubleClick={() => setSidebarWidth(256)}
          title="Drag to resize · double-click to reset"
          className="group absolute top-6 -right-2 bottom-6 w-4 cursor-col-resize"
          role="separator"
          aria-orientation="vertical"
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          aria-valuenow={sidebarWidth}
        >
          <div className={cx("mx-auto h-full w-[3px] rounded-full transition-colors", dragging ? "bg-accent" : "bg-transparent group-hover:bg-accent/50")} />
        </div>
      )}
    </aside>
  );
}

const QUICK_CREATE = [
  { label: "New to-do", path: "/todos?new=1" },
  { label: "New event", path: "/events?new=1" },
  { label: "New homework", path: "/academics/homework?new=1" },
  { label: "New exam", path: "/academics/exams?new=1" },
  { label: "New school note", path: "/academics/notes?new=1" },
  { label: "Today's journal entry", path: "/life/journal?today=1" },
  { label: "Log a transaction", path: "/life/money?new=1" },
  { label: "Log something I learned", path: "/academics/flashcards?new=1" },
];

export function CommandPalette() {
  const { paletteOpen: open, setPaletteOpen, setTheme, theme, toggleSidebar } = useUI();
  const [q, setQ] = useState("");
  const dq = useDebounced(q.trim(), 150);
  const nav = useNavigate();
  const hits = useQuery({ queryKey: ["search", dq], queryFn: () => api.search(dq), enabled: open && dq.length >= 2 });

  useEffect(() => {
    if (!open) setQ("");
  }, [open]);

  const ql = q.trim().toLowerCase();
  const pages = useMemo(() => allItems.filter((i) => !ql || i.label.toLowerCase().includes(ql)), [ql]);
  const creates = useMemo(() => QUICK_CREATE.filter((c) => !ql || c.label.toLowerCase().includes(ql)), [ql]);
  const actions = [
    { label: `Switch light/dark (now ${theme})`, run: () => setTheme(nextTheme[theme]) },
    { label: "Toggle sidebar", run: toggleSidebar },
  ].filter((a) => !ql || a.label.toLowerCase().includes(ql));

  const go = (fn: () => void) => {
    setPaletteOpen(false);
    fn();
  };
  const itemCls = "flex cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2 text-sm data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent";
  const groupCls = "text-xs text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5";

  return (
    <Command.Dialog
      open={open}
      onOpenChange={setPaletteOpen}
      shouldFilter={false}
      label="Search and commands"
      overlayClassName="anim-fade fixed inset-0 z-50 bg-black/20 backdrop-blur-[3px]"
      contentClassName="glass anim-pop fixed left-1/2 top-[12vh] z-50 w-[640px] max-w-[92vw] -translate-x-1/2 overflow-hidden rounded-[16px] bg-surface-solid/85"
    >
      <div className="flex items-center gap-2 border-b border-line px-5">
        <Search size={16} className="text-muted" />
        <Command.Input value={q} onValueChange={setQ} placeholder="Search everything or jump to a page…" className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted" />
        <button type="button" onClick={() => setPaletteOpen(false)} className="text-muted hover:text-fg" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      <Command.List className="max-h-[420px] overflow-y-auto p-2">
        <Command.Empty className="px-3 py-6 text-center text-sm text-muted">{dq.length >= 2 && hits.isFetching ? "Searching…" : "No results."}</Command.Empty>
        {(hits.data?.length ?? 0) > 0 && (
          <Command.Group heading="Results" className={groupCls}>
            {hits.data!.map((h) => {
              const route = entityRoute(h.entity_type, h.entity_id);
              return (
                <Command.Item key={`${h.entity_type}-${h.entity_id}`} value={`r-${h.entity_type}-${h.entity_id}`} onSelect={() => route && go(() => nav(route))} className={itemCls}>
                  <span className="w-20 shrink-0 text-[11px] text-muted">{ENTITY_LABEL[h.entity_type] ?? h.entity_type}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-fg">{h.title}</span>
                    {h.snippet && <span className="block truncate text-xs text-muted">{h.snippet}</span>}
                  </span>
                  <CornerDownLeft size={13} className="text-muted" />
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
        {creates.length > 0 && (
          <Command.Group heading="Create" className={groupCls}>
            {creates.map((c) => (
              <Command.Item key={c.label} value={`c-${c.label}`} onSelect={() => go(() => nav(c.path))} className={itemCls}>
                <Plus size={15} className="text-muted" />
                <span className="text-fg">{c.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
        {pages.length > 0 && (
          <Command.Group heading="Go to" className={groupCls}>
            {pages.map((p) => {
              const Icon = p.icon;
              return (
                <Command.Item key={p.id} value={`p-${p.id}`} onSelect={() => go(() => nav(p.path))} className={itemCls}>
                  <Icon size={15} className="text-muted" />
                  <span className="text-fg">{p.label}</span>
                </Command.Item>
              );
            })}
          </Command.Group>
        )}
        {actions.length > 0 && (
          <Command.Group heading="Actions" className={groupCls}>
            {actions.map((a) => (
              <Command.Item key={a.label} value={`a-${a.label}`} onSelect={() => go(a.run)} className={itemCls}>
                <span className="text-fg">{a.label}</span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
    </Command.Dialog>
  );
}

/** Counts down, then installs a downloaded update; StudyMed reopens by itself afterwards. */
function UpdateBanner() {
  const { status, version, postponed, set } = useUpdater();
  const [left, setLeft] = useState(RESTART_DELAY_S);
  const active = status === "ready" && !postponed;
  useEffect(() => {
    if (!active) return;
    setLeft(RESTART_DELAY_S);
    const t = setInterval(() => setLeft((n) => n - 1), 1000);
    return () => clearInterval(t);
  }, [active]);
  useEffect(() => {
    if (active && left <= 0) void installNow();
  }, [active, left]);
  if (!active && status !== "installing") return null;
  return (
    <div className="glass anim-pop fixed bottom-5 left-1/2 z-[70] flex -translate-x-1/2 items-center gap-4 rounded-full bg-surface-solid/90 py-2 pr-2 pl-5 text-sm">
      <span>
        {status === "installing" ? (
          <>Installing StudyMed {version}…</>
        ) : (
          <>
            StudyMed <strong>{version}</strong> is ready. Restarting in <span className="tabular">{left}s</span>
          </>
        )}
      </span>
      {status === "ready" && (
        <span className="flex gap-1.5">
          <button type="button" onClick={() => set({ postponed: true })} className="rounded-full px-3 py-1.5 text-muted hover:bg-surface-2 hover:text-fg">
            Not now
          </button>
          <button type="button" onClick={() => void installNow()} className="rounded-full bg-accent px-4 py-1.5 font-medium text-accent-fg">
            Restart now
          </button>
        </span>
      )}
    </div>
  );
}

function Toasts() {
  const { toasts, dismiss } = useToasts();
  return (
    <div className="pointer-events-none fixed right-5 bottom-5 z-[60] flex w-80 flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cx("glass anim-pop pointer-events-auto flex items-start gap-2 rounded-2xl bg-surface-solid/85 px-4 py-3 text-sm", t.kind === "error" && "text-danger")}
        >
          {t.kind === "info" && <Bell size={14} className="mt-0.5 text-accent" />}
          <span className="flex-1">{t.text}</span>
          <button type="button" onClick={() => dismiss(t.id)} className="text-muted hover:text-fg" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}

const TABS = [homeItem, routineItem, focusItem, gardenItem, todosItem];

/** The phone layout: a slim top bar, the page, and tabs along the bottom. */
function PhoneShell({ scene, motion }: { scene: ReturnType<typeof normalizeScene> | "wash"; motion: string }) {
  const location = useLocation();
  const setOpen = useUI((s) => s.setPaletteOpen);
  const [menu, setMenu] = useState(false);
  useEffect(() => setMenu(false), [location.pathname]);
  // Phones ask before an app may show notifications (reminders need them).
  useEffect(() => {
    if (!isMobile) return;
    void isPermissionGranted()
      .then((ok) => (ok ? undefined : requestPermission()))
      .catch(() => undefined);
  }, []);
  return (
    <>
      <div className="app-backdrop">{scene !== "wash" && <SceneBackdrop scene={scene} still={motion === "still"} />}</div>
      <div className="relative z-10 flex h-[100dvh] flex-col gap-2 overflow-hidden p-2 text-fg">
        <header className="glass flex shrink-0 items-center gap-2 rounded-2xl px-2 py-1.5">
          <button type="button" onClick={() => setMenu(true)} aria-label="Menu" className="rounded-xl p-2 text-muted active:bg-surface-2">
            <Menu size={20} />
          </button>
          <AppMark className="h-7 w-7" />
          <span className="font-display flex-1 truncate text-[17px]">StudyMed</span>
          <BeatsChip collapsed />
          <button type="button" onClick={() => setOpen(true)} aria-label="Search" className="rounded-xl p-2 text-muted active:bg-surface-2">
            <Search size={19} />
          </button>
        </header>
        <main className="relative min-h-0 flex-1 overflow-y-auto overscroll-contain rounded-[18px]">
          <div key={location.pathname} className="anim-page min-h-full pb-4">
            <Outlet />
          </div>
        </main>
        <nav className="glass grid shrink-0 grid-cols-5 rounded-2xl p-1">
          {TABS.map((it) => (
            <NavLink
              key={it.id}
              to={it.path}
              className={({ isActive }) => cx("flex flex-col items-center gap-0.5 rounded-xl py-1.5 text-[10.5px] font-medium", isActive ? "bg-accent-soft text-accent" : "text-muted")}
            >
              <it.icon size={20} strokeWidth={1.8} />
              {it.label}
            </NavLink>
          ))}
        </nav>
        {menu && (
          <div className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[2px]" onClick={() => setMenu(false)}>
            <div className="anim-drawer h-full w-[84vw] max-w-[330px] p-2" onClick={(e) => e.stopPropagation()}>
              <Sidebar drawer onClose={() => setMenu(false)} />
            </div>
          </div>
        )}
        <CommandPalette />
        <Toasts />
        <FocusFinish />
      </div>
    </>
  );
}

export function Layout() {
  const narrow = useNarrow();
  const setOpen = useUI((s) => s.setPaletteOpen);
  const toggleSidebar = useUI((s) => s.toggleSidebar);
  const setGroup = useUI((s) => s.setSidebarGroup);
  const location = useLocation();
  useReminderEvents();
  useAllowance();
  const [rawScene] = useSetting<string>("background.scene", "neurons");
  const [motion] = useSetting<string>("background.motion", rawScene === "still" ? "still" : "animated");
  const scene = rawScene === "wash" ? "wash" : normalizeScene(rawScene);
  useEffect(() => startAutoUpdate(), []);

  // Keep the sidebar folder in sync with the page you're on.
  useEffect(() => {
    const g = groups.find((gr) => gr.items.some((i) => location.pathname.startsWith(i.path)));
    if (g && g.id !== useUI.getState().sidebarGroup) setGroup(g.id as SidebarGroup);
  }, [location.pathname, setGroup]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(!useUI.getState().paletteOpen);
      } else if (e.ctrlKey && e.key === "\\") {
        e.preventDefault();
        toggleSidebar();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [setOpen, toggleSidebar]);

  if (narrow) return <PhoneShell scene={scene} motion={motion} />;
  return (
    <>
      <div className="app-backdrop">{scene !== "wash" && <SceneBackdrop scene={scene} still={motion === "still"} />}</div>
      <div className="relative z-10 flex h-screen gap-3 overflow-hidden p-3 text-fg">
        <Sidebar />
        <main className="relative min-w-0 flex-1 overflow-y-auto rounded-[18px]">
          <div key={location.pathname} className="anim-page h-full">
            <Outlet />
          </div>
        </main>
        <CommandPalette />
        <Toasts />
        <UpdateBanner />
        <FocusFinish />
      </div>
    </>
  );
}
