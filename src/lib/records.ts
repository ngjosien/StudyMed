// Every kind of record that can be connected to another one.
import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  ClipboardList,
  FileText,
  Flame,
  GraduationCap,
  Images,
  Layers,
  Library,
  ListTodo,
  NotebookPen,
  PartyPopper,
  PiggyBank,
  Receipt,
  Repeat2,
  Sparkles,
  Target,
  StickyNote,
  Users,
  Wallet,
} from "lucide-react";
import type { Row } from "./api";
import { entityRoute } from "./nav";

export interface RecordKind {
  label: string;
  icon: LucideIcon;
  color: string;
  title: (r: Row) => string;
  route?: (id: number) => string;
}

/** Keys are table names. */
export const RECORDS: Record<string, RecordKind> = {
  events: { label: "Events", icon: PartyPopper, color: "#c3a6f4", title: (r) => r.name },
  people: { label: "Relationships", icon: Users, color: "#f4a6c0", title: (r) => r.name },
  homework: { label: "Homework", icon: ClipboardList, color: "#f4d8a6", title: (r) => r.title },
  exams: { label: "Exams", icon: GraduationCap, color: "#f4b8a6", title: (r) => r.name },
  modules: { label: "Modules", icon: Library, color: "#a6c8f4", title: (r) => `${r.code} · ${r.name}` },
  school_notes: { label: "School Notes", icon: FileText, color: "#a6e3d0", title: (r) => r.title },
  review_topics: {
    label: "Spaced Repetition",
    icon: Repeat2,
    color: "#c3a6f4",
    title: (r) => r.title,
    route: (id) => `/academics/flashcards?topic=${id}`,
  },
  portfolio_entries: { label: "Portfolio", icon: Briefcase, color: "#f4a6c0", title: (r) => r.title },
  todos: { label: "To-Dos", icon: ListTodo, color: "#a6e3d0", title: (r) => r.title },
  tick_goals: { label: "Goals", icon: Target, color: "#f4a6c0", title: (r) => r.title },
  savings_goals: { label: "Saving goals", icon: PiggyBank, color: "#f4d8a6", title: (r) => r.name, route: () => "/life/money?tab=saving" },
  transactions: { label: "Spending", icon: Wallet, color: "#a6c8f4", title: (r) => r.notes || `${r.kind} on ${r.date}`, route: () => "/life/money" },
  bills: { label: "Bills", icon: Receipt, color: "#f4b8a6", title: (r) => r.name },
  habits: { label: "Habits", icon: Flame, color: "#f4b8a6", title: (r) => r.name, route: () => "/life/habits" },
  journal_entries: { label: "Journal", icon: NotebookPen, color: "#f4d8a6", title: (r) => r.title || r.entry_date },
  moments: { label: "Moments", icon: Images, color: "#f4a6c0", title: (r) => r.caption || r.date },
  interest_items: { label: "Interests", icon: Sparkles, color: "#c3a6f4", title: (r) => r.title },
  important_notes: { label: "Important Notes", icon: StickyNote, color: "#a6c8f4", title: (r) => r.title },
  decks: { label: "Flashcards", icon: Layers, color: "#a6e3d0", title: (r) => r.name },
};

export const routeOf = (type: string, id: number): string | null => RECORDS[type]?.route?.(id) ?? entityRoute(type, id);
