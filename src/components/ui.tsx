import {
  forwardRef,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { X, Star, Trash2, Check } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useLocation } from "react-router-dom";
import { cx } from "../lib/format";

/* ---------------------------------------------------------------- Button */
type Variant = "primary" | "secondary" | "ghost" | "danger";
export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: "sm" | "md"; icon?: LucideIcon }
>(function Button({ variant = "secondary", size = "md", icon: Icon, className, children, ...rest }, ref) {
  return (
    <button
      ref={ref}
      type="button"
      {...rest}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-xl font-medium whitespace-nowrap disabled:pointer-events-none disabled:opacity-50",
        "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent",
        size === "sm" ? "h-7 px-2.5 text-xs" : "h-9 px-3.5 text-sm",
        variant === "primary" && "bg-accent text-accent-fg shadow-[0_6px_16px_-6px_var(--accent)] hover:-translate-y-px hover:brightness-105",
        variant === "secondary" && "border border-line bg-surface-solid/70 backdrop-blur hover:bg-surface-solid",
        variant === "ghost" && "text-fg hover:bg-surface-2",
        variant === "danger" && "text-danger hover:bg-danger/10",
        className,
      )}
    >
      {Icon && <Icon size={size === "sm" ? 14 : 16} />}
      {children}
    </button>
  );
});

export function IconButton({
  icon: Icon,
  label,
  className,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { icon: LucideIcon; label: string; active?: boolean }) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      {...rest}
      className={cx(
        "inline-flex h-8 w-8 items-center justify-center rounded-xl text-muted hover:bg-surface-2 hover:text-fg disabled:opacity-40",
        active && "bg-accent-soft text-accent",
        className,
      )}
    >
      <Icon size={16} />
    </button>
  );
}

/* ---------------------------------------------------------------- Inputs */
const baseInput =
  "rounded-xl border border-line bg-surface-solid/70 px-3 py-2 text-sm outline-none transition-[border-color,box-shadow,background-color] duration-200 placeholder:text-muted/70 focus:border-accent focus:bg-surface-solid focus:ring-4 focus:ring-accent/15 disabled:opacity-60";
/** Full width unless the caller sets its own width. */
const withWidth = (className?: string) => (/(^|\s)(w-|flex-1|min-w-)/.test(className ?? "") ? baseInput : `w-full ${baseInput}`);

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} {...rest} className={cx(withWidth(className), "h-9 py-0", className)} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} {...rest} className={cx(withWidth(className), "min-h-20 resize-y", className)} />;
});

export function Select({
  className,
  options,
  placeholder,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  options: (string | { value: string | number; label: string })[];
  placeholder?: string;
}) {
  return (
    <select {...rest} className={cx(withWidth(className), "h-9 py-0 pr-8", className)}>
      {placeholder !== undefined && <option value="">{placeholder}</option>}
      {options.map((o) =>
        typeof o === "string" ? (
          <option key={o} value={o}>
            {o}
          </option>
        ) : (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ),
      )}
    </select>
  );
}

export function Checkbox({
  checked,
  onChange,
  label,
  className,
  color,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label?: ReactNode;
  className?: string;
  color?: string;
}) {
  return (
    <label className={cx("inline-flex cursor-pointer items-center gap-2 text-sm", className)}>
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 cursor-pointer rounded accent-[var(--accent)]"
        style={color ? { accentColor: color } : undefined}
      />
      {label}
    </label>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-1 flex items-baseline justify-between text-xs font-medium text-muted">
      <span>{children}</span>
      {hint && <span className="font-normal">{hint}</span>}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: ReactNode; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <Label hint={hint}>{label}</Label>
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Overlays */
function useEscape(open: boolean, onClose: () => void) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="anim-fade fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/20 p-6 pt-[8vh] backdrop-blur-[3px]" onMouseDown={onClose}>
      <div className={cx("glass anim-pop w-full overflow-hidden rounded-[22px] bg-surface-solid", width)} onMouseDown={(e) => e.stopPropagation()} role="dialog" aria-modal>
        <div className="flex items-center justify-between bg-gradient-to-br from-accent-soft to-transparent px-7 pt-7 pb-6">
          <h2 className="font-display text-xl font-semibold">{title}</h2>
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="max-h-[66vh] overflow-y-auto px-7 py-3 [&_input:not([type=checkbox]):not([type=color])]:rounded-2xl [&_select]:rounded-2xl [&_textarea]:rounded-2xl">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 px-6 pt-3 pb-5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  actions,
  width = "w-[520px]",
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
  width?: string;
}) {
  useEscape(open, onClose);
  if (!open) return null;
  return createPortal(
    <div className="anim-fade fixed inset-0 z-40 flex justify-end bg-black/10 p-3" onMouseDown={onClose}>
      <aside className={cx("glass anim-drawer flex h-full max-w-[92vw] flex-col rounded-[16px] bg-surface-solid/80", width)} onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-2 px-6 pt-5 pb-3">
          <h2 className="font-display min-w-0 flex-1 truncate text-lg font-semibold">{title}</h2>
          {actions}
          <IconButton icon={X} label="Close" onClick={onClose} />
        </div>
        <div className="flex-1 overflow-y-auto px-6 pb-6">{children}</div>
      </aside>
    </div>,
    document.body,
  );
}

/**
 * Floating menu anchored to its trigger. Closes on outside click / Escape.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  width = 300,
  open: controlled,
  onOpenChange,
}: {
  trigger: (props: { open: boolean; toggle: () => void }) => ReactNode;
  children: ReactNode | ((close: () => void) => ReactNode);
  align?: "start" | "end";
  width?: number;
  open?: boolean;
  onOpenChange?: (o: boolean) => void;
}) {
  const [inner, setInner] = useState(false);
  const open = controlled ?? inner;
  const setOpen = (o: boolean) => (onOpenChange ? onOpenChange(o) : setInner(o));
  const anchor = useRef<HTMLSpanElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useLayoutEffect(() => {
    if (!open || !anchor.current) return;
    const r = anchor.current.getBoundingClientRect();
    let left = align === "end" ? r.right - width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
    // Open upwards when there isn't room underneath (pickers low down in a sheet).
    const h = panel.current?.offsetHeight ?? 0;
    const below = r.bottom + 6;
    setPos({ top: below + h <= window.innerHeight - 8 ? below : Math.max(8, Math.min(r.top - h - 6, window.innerHeight - h - 8)), left });
  }, [open, align, width]);
  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => {
      const t = e.target as Node;
      if (!panel.current?.contains(t) && !anchor.current?.contains(t)) setOpen(false);
    };
    const k = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Only close the menu, not the sheet underneath it.
      e.stopPropagation();
      setOpen(false);
    };
    window.addEventListener("mousedown", h);
    window.addEventListener("keydown", k, true);
    return () => {
      window.removeEventListener("mousedown", h);
      window.removeEventListener("keydown", k, true);
    };
  });
  const close = () => setOpen(false);
  return (
    <>
      <span ref={anchor} className="inline-flex">
        {trigger({ open, toggle: () => setOpen(!open) })}
      </span>
      {open &&
        createPortal(
          <div
            ref={panel}
            className="glass anim-pop fixed z-[55] max-h-[70vh] overflow-y-auto rounded-2xl bg-surface-solid/90 p-2"
            style={{ top: pos.top, left: pos.left, width }}
          >
            {typeof children === "function" ? children(close) : children}
          </div>,
          document.body,
        )}
    </>
  );
}

export function MenuItem({ icon: Icon, children, onClick, danger, active }: { icon?: LucideIcon; children: ReactNode; onClick?: () => void; danger?: boolean; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-sm hover:bg-surface-2",
        danger && "text-danger",
        active && "bg-accent-soft text-accent",
      )}
    >
      {Icon && <Icon size={14} className="shrink-0 opacity-70" />}
      {children}
    </button>
  );
}

/** Delete button that asks for a second click to confirm. */
export function ConfirmDelete({
  onConfirm,
  label = "Delete",
  size = "md",
  iconOnly,
}: {
  onConfirm: () => void;
  label?: string;
  size?: "sm" | "md";
  iconOnly?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const t = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(t.current), []);
  const click = () => {
    if (armed) {
      setArmed(false);
      onConfirm();
    } else {
      setArmed(true);
      t.current = setTimeout(() => setArmed(false), 3000);
    }
  };
  if (iconOnly && !armed) return <IconButton icon={Trash2} label={label} onClick={click} className="hover:text-danger" />;
  return (
    <Button variant="danger" size={size} icon={Trash2} onClick={click}>
      {armed ? "Click again to confirm" : iconOnly ? "" : label}
    </Button>
  );
}

/* ---------------------------------------------------------------- Display */
export function PageHeader({
  title,
  icon: Icon,
  subtitle,
  actions,
  children,
}: {
  title: ReactNode;
  icon?: LucideIcon;
  subtitle?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
}) {
  const { pathname } = useLocation();
  const section = pathname.startsWith("/life") ? "Personal" : pathname.startsWith("/academics") ? "Academics" : "StudyMed";
  return (
    <header className="px-4 pt-4 pb-3 md:px-8 md:pt-8 md:pb-4">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
        {Icon && (
          <div className="mb-1 hidden h-11 w-11 shrink-0 md:flex items-center justify-center rounded-full border border-accent/40 text-accent shadow-[inset_0_1px_0_var(--glass-highlight)]">
            <Icon size={19} strokeWidth={1.75} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="eyebrow">{section}</p>
          <h1 className="truncate text-[22px] leading-tight tracking-tight md:text-[25px]">{title}</h1>
          {subtitle && <p className="text-sm text-muted md:truncate">{subtitle}</p>}
        </div>
        <div className="flex max-w-full shrink-0 flex-wrap items-center gap-2">{actions}</div>
      </div>
      <div className="rule-fine mt-4" />
      {children && <div className="mt-4">{children}</div>}
    </header>
  );
}

export function Page({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx("px-4 py-3 md:px-8 md:py-4", className)}>{children}</div>;
}

export function Card({ children, className, onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  return (
    <div
      onClick={onClick}
      className={cx(
        "glass anim-item rounded-[var(--radius)] transition-[transform,box-shadow] duration-300 ease-[var(--ease)]",
        onClick && "cursor-pointer hover:-translate-y-0.5 hover:shadow-[0_16px_36px_-14px_rgba(0,0,0,0.25)]",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function Badge({ children, color, className }: { children: ReactNode; color?: string | null; className?: string }) {
  return (
    <span
      className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap", !color && "bg-surface-2 text-muted", className)}
      // Pastel tag colours: tinted background, text mixed toward the foreground for contrast.
      style={color ? { background: `color-mix(in srgb, ${color} 32%, transparent)`, color: `color-mix(in srgb, ${color} 45%, var(--fg))` } : undefined}
    >
      {children}
    </span>
  );
}

export function Progress({ value, max = 100, color, className }: { value: number; max?: number; color?: string; className?: string }) {
  const p = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className={cx("h-2 w-full overflow-hidden rounded-full bg-surface-2", className)}>
      <div className="h-full rounded-full bg-accent transition-[width] duration-500 ease-[var(--ease)]" style={{ width: `${p}%`, background: color }} />
    </div>
  );
}

/** The savings-goal bar: a thick track with checkpoints at 25, 50, 75 and 100% that fill as you pass them. */
export function MilestoneBar({ value, max, color = "var(--accent)", className, label }: { value: number; max: number; color?: string; className?: string; label?: string }) {
  const done = max > 0 ? Math.max(0, (value / max) * 100) : 0;
  return (
    <div
      className={cx("relative h-4 rounded-full bg-surface-solid/70", className)}
      role="progressbar"
      aria-label={label}
      aria-valuenow={Math.round(Math.min(100, done))}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className="h-full rounded-full transition-[width] duration-700 ease-[var(--ease)]"
        style={{ width: `${Math.min(100, done)}%`, background: `color-mix(in srgb, ${color} 75%, var(--fg))` }}
      />
      {[25, 50, 75, 100].map((m) => (
        <span
          key={m}
          title={`${m}%`}
          className={cx("absolute top-1/2 flex h-5 w-5 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-surface-solid", done < m && "bg-surface-2")}
          style={{ left: `${m === 100 ? 98 : m}%`, background: done >= m ? color : undefined, color: "#3a2330" }}
        >
          {done >= m && <Check size={10} strokeWidth={4} />}
        </span>
      ))}
    </div>
  );
}

export function Empty({ icon: Icon, title, children }: { icon?: LucideIcon; title: string; children?: ReactNode }) {
  return (
    <div className="glass anim-item flex flex-col items-center justify-center rounded-[16px] px-6 py-14 text-center">
      {Icon && (
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-soft text-accent">
          <Icon size={22} />
        </div>
      )}
      <p className="font-display font-medium">{title}</p>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

/** Segmented pill tabs with a sliding highlight. */
export function Tabs<T extends string | number>({
  tabs,
  value,
  onChange,
  className,
}: {
  tabs: { value: T; label: ReactNode }[];
  value: T;
  onChange: (v: T) => void;
  className?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const [ind, setInd] = useState({ left: 0, width: 0 });
  const idx = tabs.findIndex((t) => t.value === value);
  useLayoutEffect(() => {
    const measure = () => {
      const el = refs.current[idx];
      if (el) setInd({ left: el.offsetLeft, width: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (box.current) ro.observe(box.current);
    return () => ro.disconnect();
  }, [idx, tabs.length]);
  return (
    <div ref={box} className={cx("relative inline-flex items-center gap-1 rounded-2xl bg-surface-2 p-1", className)}>
      <span
        className="absolute top-1 bottom-1 rounded-xl bg-surface-solid shadow-sm transition-all duration-300 ease-[var(--ease)]"
        style={{ left: ind.left, width: ind.width, opacity: idx < 0 ? 0 : 1 }}
      />
      {tabs.map((t, i) => (
        <button
          type="button"
          key={String(t.value)}
          ref={(el) => {
            refs.current[i] = el;
          }}
          onClick={() => onChange(t.value)}
          className={cx("relative z-10 rounded-xl px-3 py-1 text-sm font-medium", t.value === value ? "text-fg" : "text-muted hover:text-fg")}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function Rating({ value, onChange, size = 16 }: { value: number; onChange?: (v: number) => void; size?: number }) {
  return (
    <div className="inline-flex items-center">
      {[1, 2, 3, 4, 5].map((n) => (
        <button type="button" key={n} disabled={!onChange} onClick={() => onChange?.(n === value ? 0 : n)} className="p-0.5 disabled:cursor-default" aria-label={`${n} star${n > 1 ? "s" : ""}`}>
          <Star size={size} className={n <= value ? "fill-amber-400 text-amber-400" : "text-line"} />
        </button>
      ))}
    </div>
  );
}

/** Pastel-friendly swatches for colour tags. */
export const SWATCHES = ["#f4a6c0", "#c3a6f4", "#a6c8f4", "#a6e3d0", "#f4d8a6", "#f4b8a6", "#b8c0cc", "#8d6fd6", "#4a86cf", "#3e9a77", "#d2648f", "#b98a14"];

/** Colours that follow the selected theme (defined per theme in index.css). */
export const THEME_COLORS = ["var(--theme-1)", "var(--theme-2)", "var(--theme-3)", "var(--theme-4)", "var(--theme-5)"];

export function ColorPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-0.5 text-[11px] font-medium text-muted">Theme</span>
      {THEME_COLORS.map((c, i) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          aria-label={`Theme colour ${i + 1}`}
          title="Changes with your theme"
          className={cx("h-6 w-6 rounded-full border-2 hover:scale-110", value === c ? "border-fg" : "border-transparent")}
          style={{ background: c }}
        />
      ))}
      <span className="mx-1 h-5 w-px bg-line" />
      {SWATCHES.map((c) => (
        <button
          type="button"
          key={c}
          onClick={() => onChange(c)}
          aria-label={c}
          className={cx("h-6 w-6 rounded-full border-2 hover:scale-110", value === c ? "border-fg" : "border-transparent")}
          style={{ background: c }}
        />
      ))}
      <input type="color" value={/^#[0-9a-f]{6}$/i.test(value) ? value : "#8d6fd6"} onChange={(e) => onChange(e.target.value)} className="h-6 w-8 cursor-pointer rounded border-0 bg-transparent" />
    </div>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: ReactNode; icon?: LucideIcon }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <Tabs
      value={value}
      onChange={onChange}
      tabs={options.map(({ value: v, label, icon: Icon }) => ({
        value: v,
        label: (
          <span className="inline-flex items-center gap-1.5">
            {Icon && <Icon size={14} />}
            {label}
          </span>
        ),
      }))}
    />
  );
}

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="rounded-md border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-[10px] text-muted">{children}</kbd>;
}
