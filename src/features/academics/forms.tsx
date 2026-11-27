// Record forms shared by the Academics pages and the Module dashboard.
import { useMemo } from "react";
import { FormModal, type FormState } from "../../components/form";
import type { Row } from "../../lib/api";
import { useRows } from "../../lib/hooks";
import { fmtDateTime, today } from "../../lib/dates";
import { EXAM_FORMATS, HOMEWORK_STATUS, HOMEWORK_TYPES, KIND_NAMES, STATUS_COLOR, useModules } from "./common";
import { useEventMatchOptions } from "./hours";

export function ModuleForm({ state }: { state: FormState }) {
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit module" : "New module"}
      table="modules"
      record={state.record}
      defaults={{ color: "var(--theme-1)", ...state.defaults }}
      fields={[
        { key: "name", label: "Module name", type: "text", required: true, placeholder: "Human Biosciences 2" },
        { key: "code", label: "Module code", type: "text", required: true, placeholder: "HBS2" },
        { key: "credits", label: "Credit units", type: "number", placeholder: "4" },
        { key: "term", label: "Semester", type: "text", placeholder: "Year 1 Sem 2", full: true, hint: "Used for your semester GPA" },
        { key: "color", label: "Colour", type: "color", hint: "Theme colours change with your theme" },
        { key: "lecturer", label: "Lecturer", type: "text", more: true },
        { key: "lecturer_contact", label: "Contact", type: "text", placeholder: "Email or office", more: true },
        { key: "syllabus_md", label: "Syllabus", type: "markdown", more: true },
        { key: "archived", label: "Finished module", type: "checkbox", placeholder: "Hide from active lists", more: true },
      ]}
    />
  );
}

function useLinkOptions(moduleId?: number | null) {
  const { byId } = useModules();
  const notes = useRows("school_notes", undefined, "module_id, week, title").rows;
  const exams = useRows("exams", undefined, "start_at").rows;
  return useMemo(() => {
    const label = (r: Row, t: string) => `${byId.get(r.module_id)?.code ?? "?"} · ${t}`;
    const color = (r: Row) => byId.get(r.module_id)?.color;
    const sameFirst = (a: Row, b: Row) => Number(b.module_id === moduleId) - Number(a.module_id === moduleId);
    return {
      notes: [...notes].sort(sameFirst).map((n) => ({ value: n.id, label: label(n, n.title), color: color(n) })),
      exams: [...exams].sort(sameFirst).map((e) => ({ value: e.id, label: label(e, e.name), color: color(e) })),
    };
  }, [notes, exams, byId, moduleId]);
}

export function HomeworkForm({ state }: { state: FormState }) {
  const { options, byId } = useModules();
  const moduleId = (state.record?.module_id ?? state.defaults?.module_id) as number | undefined;
  const links = useLinkOptions(moduleId);
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit homework" : "New homework"}
      table="homework"
      record={state.record}
      defaults={{ type: "Assignment", status: "Not Started", module_id: options[0]?.value, ...state.defaults }}
      fields={[
        { key: "title", label: "Title", type: "text", required: true, placeholder: "What needs doing?" },
        { key: "module_id", label: "Module", type: "select", options, numeric: true, required: true, full: true },
        { key: "type", label: "Kind", type: "select", options: HOMEWORK_TYPES, required: true },
        { key: "due_at", label: "Due", type: "datetime" },
        { key: "status", label: "Where you're at", type: "select", options: HOMEWORK_STATUS.map((s) => ({ value: s, label: s, color: STATUS_COLOR[s] })), required: true },
        { key: "weight_pct", label: "Worth (% of module)", type: "number", more: true },
        { key: "notes_md", label: "Notes", type: "markdown", more: true },
      ]}
      links={[
        { table: "note_homework_links", col: "homework_id", otherCol: "note_id", label: "School notes", options: links.notes },
        { table: "homework_exam_links", col: "homework_id", otherCol: "exam_id", label: "Exams", options: links.exams },
      ]}
      reminders={{
        entityType: "homework",
        base: (v) => v.due_at,
        title: (v) => `${byId.get(v.module_id)?.code ?? ""} homework due: ${v.title}`,
        body: (v) => (v.due_at ? `Due ${fmtDateTime(v.due_at)}` : ""),
      }}
      attachments={{ entityType: "homework", subdir: "homework" }}
    />
  );
}

export function ExamForm({ state }: { state: FormState }) {
  const { options, byId } = useModules();
  const moduleId = (state.record?.module_id ?? state.defaults?.module_id) as number | undefined;
  const links = useLinkOptions(moduleId);
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit exam" : "New exam"}
      table="exams"
      record={state.record}
      defaults={{ format: "Written", module_id: options[0]?.value, ...state.defaults }}
      fields={[
        { key: "name", label: "Exam name", type: "text", required: true, placeholder: "Class Test 1" },
        { key: "module_id", label: "Module", type: "select", options, numeric: true, required: true, full: true },
        { key: "start_at", label: "When", type: "datetime" },
        { key: "format", label: "Format", type: "select", options: EXAM_FORMATS },
        { key: "venue", label: "Venue", type: "text" },
        { key: "seat", label: "Seat", type: "text" },
        { key: "duration_min", label: "Length (minutes)", type: "number", more: true },
        { key: "weight_pct", label: "Worth (% of module)", type: "number", hint: "Shows in Grades" },
        { key: "grade", label: "Result", type: "text", placeholder: "24/30, 78% or B+", hint: "Counts in Grades" },
        { key: "reflection_md", label: "How it went", type: "markdown", more: true },
      ]}
      links={[{ table: "note_exam_links", col: "exam_id", otherCol: "note_id", label: "School notes", options: links.notes }]}
      reminders={{
        entityType: "exams",
        base: (v) => v.start_at,
        title: (v) => `Exam: ${byId.get(v.module_id)?.code ?? ""} ${v.name}`,
        body: (v) => [fmtDateTime(v.start_at), v.venue, v.seat && `Seat ${v.seat}`].filter(Boolean).join(" · "),
      }}
    />
  );
}

export function TopicForm({ state }: { state: FormState }) {
  const { options, byId } = useModules();
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit topic" : "I just learned…"}
      table="review_topics"
      record={state.record}
      defaults={{ module_id: options[0]?.value, learned_date: today(), whole_module: 0, ...state.defaults }}
      fields={[
        { key: "module_id", label: "Which module", type: "select", options, numeric: true, required: true, full: true },
        { key: "whole_module", label: "How much", type: "checkbox", placeholder: "The whole module", full: true },
        { key: "title", label: "Which topic", type: "text", required: true, placeholder: "e.g. Cardiac cycle", showIf: (v) => !v.whole_module },
        { key: "learned_date", label: "Day I first finished learning it", type: "date", required: true, full: true, hint: "All seven recall days count from here" },
      ]}
      transform={(v) => (v.whole_module ? { ...v, title: `All of ${byId.get(v.module_id)?.name ?? "the module"}` } : v)}
    />
  );
}

export function PortfolioForm({ state }: { state: FormState }) {
  const { options } = useModules();
  const eventOptions = useEventMatchOptions();
  return (
    <FormModal
      open={state.open}
      onClose={state.close}
      title={state.record ? "Edit portfolio" : "Add to portfolio"}
      table="portfolio_entries"
      record={state.record}
      defaults={{ kind: "Volunteering", highlight: 0, ...state.defaults }}
      fields={[
        { key: "title", label: "What you did", type: "text", required: true, placeholder: "Hospice befriender" },
        { key: "kind", label: "Kind", type: "select", options: KIND_NAMES, required: true },
        { key: "organisation", label: "Organisation", type: "text", placeholder: "Where, or who with" },
        { key: "role", label: "Your role", type: "text" },
        { key: "start_date", label: "Started", type: "date" },
        { key: "end_date", label: "Ended", type: "date", placeholder: "Still going" },
        { key: "hours", label: "Hours before tracking here", type: "number", hint: "Log new sessions from the portfolio page." },
        { key: "count_events", label: "Also count these events as hours", type: "select", options: eventOptions, full: true, hint: "Past events of this kind add their length to this activity." },
        { key: "highlight", label: "Highlight", type: "checkbox", placeholder: "Feature at the top" },
        { key: "summary_md", label: "What happened", type: "markdown" },
        { key: "reflection_md", label: "Why it matters for medicine", type: "markdown", placeholder: "What you saw, felt and learned" },
        { key: "referee", label: "Someone who can vouch for it", type: "text", full: true, more: true },
        { key: "module_id", label: "Linked module", type: "select", options, numeric: true, full: true, more: true },
      ]}
      transform={(v) => {
        if (v.start_date && v.end_date && v.end_date < v.start_date) throw new Error("It can't end before it started");
        // `category` is the column's original, now hidden, field.
        return { ...v, category: v.category ?? "Project" };
      }}
      tags={{ entityType: "portfolio_entries", scope: "skill", label: "Qualities it shows" }}
      attachments={{ entityType: "portfolio_entries", subdir: "portfolio" }}
    />
  );
}
