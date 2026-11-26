import { useMemo } from "react";
import type { Row } from "../../lib/api";
import { useRows } from "../../lib/hooks";

export const HOMEWORK_TYPES = ["Assignment", "Lab Report", "Tutorial", "Group Project", "Reading"];
export const HOMEWORK_STATUS = ["Not Started", "Researching", "Drafting", "Reviewing", "Submitted"];
export const EXAM_FORMATS = ["MCQ", "Written", "Practical", "Open-Book", "Oral", "Other"];

export const PORTFOLIO_KINDS: Record<string, string> = {
  Volunteering: "#f4a6c0",
  CCA: "#9fd3e0",
  "Clinical & shadowing": "#a6e3d0",
  "Important events": "#c3a6f4",
  Leadership: "#f4b8a6",
  Research: "#a6c8f4",
  Awards: "#f4d8a6",
  Certifications: "#b8c0cc",
};
export const KIND_NAMES = Object.keys(PORTFOLIO_KINDS);

export const STATUS_COLOR: Record<string, string> = {
  "Not Started": "#b8c0cc",
  Researching: "#a6c8f4",
  Drafting: "#c3a6f4",
  Reviewing: "#f4d8a6",
  Submitted: "#a6e3d0",
};

export function useModules(includeArchived = true) {
  const { rows, isLoading } = useRows("modules", includeArchived ? undefined : { archived: 0 }, "archived, code");
  return useMemo(() => {
    const byId = new Map<number, Row>(rows.map((m) => [m.id, m]));
    const options = rows.filter((m) => !m.archived).map((m) => ({ value: m.id as number, label: `${m.code} · ${m.name}`, color: m.color as string }));
    return { modules: rows, byId, options, isLoading };
  }, [rows, isLoading]);
}

export function ModuleChip({ module }: { module?: Row | null }) {
  if (!module) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap"
      style={{ background: `color-mix(in srgb, ${module.color} 30%, transparent)`, color: `color-mix(in srgb, ${module.color} 45%, var(--fg))` }}
      title={module.name}
    >
      {module.code}
    </span>
  );
}

export const CONFIDENCE: { value: string; label: string; color: string }[] = [
  { value: "red", label: "Not confident", color: "#ef4444" },
  { value: "yellow", label: "Getting there", color: "#f59e0b" },
  { value: "green", label: "Confident", color: "#10b981" },
];
