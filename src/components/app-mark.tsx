// The app mark inside the app (sidebar). It takes the colour of the chosen palette;
// the Windows icon (desktop, taskbar) stays the fixed burgundy one.
import { useUI, PALETTES } from "../stores/ui";
import { cx } from "../lib/format";

const SERPENT = "M 612 300 C 380 318 380 420 512 452 C 652 486 652 572 512 604 C 384 634 396 726 520 754";

export function AppMark({ className }: { className?: string }) {
  const palette = useUI((s) => s.palette);
  const base = PALETTES.find((p) => p.id === palette)?.swatch[3] ?? "#7d2136";
  const deep = `color-mix(in srgb, ${base} 62%, #120a10)`;
  const edge = `color-mix(in srgb, ${base} 72%, #120a10)`;
  const ivory = "#f6ecd8";
  const id = `mark-${palette}`;
  return (
    <svg
      viewBox="0 0 1024 1024"
      className={cx("shrink-0 rounded-[10px]", className)}
      style={{ boxShadow: `0 6px 14px -6px color-mix(in srgb, ${base} 70%, transparent)` }}
      aria-hidden
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={base} />
          <stop offset="1" stopColor={deep} />
        </linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="228" fill={`url(#${id})`} />
      <line x1="512" y1="214" x2="512" y2="822" stroke={ivory} strokeWidth="58" strokeLinecap="round" />
      <path d={SERPENT} fill="none" stroke={edge} strokeWidth="96" strokeLinecap="round" />
      <path d={SERPENT} fill="none" stroke={ivory} strokeWidth="50" strokeLinecap="round" />
      <ellipse cx="628" cy="296" rx="50" ry="36" fill={ivory} transform="rotate(-12 628 296)" />
    </svg>
  );
}
