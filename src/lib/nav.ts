import type { LucideIcon } from "lucide-react";
import {
  Briefcase,
  CalendarDays,
  ClipboardList,
  FileText,
  Flame,
  Gift,
  GraduationCap,
  Images,
  KeyRound,
  Repeat2,
  School,
  Target,
  House,
  Percent,
  Clock,
  Library,
  ListTodo,
  NotebookPen,
  PartyPopper,
  Settings,
  Sparkles,
  StickyNote,
  Users,
  Wallet,
  BookOpen,
  Heart,
} from "lucide-react";

export interface NavItem {
  id: string;
  label: string;
  path: string;
  icon: LucideIcon;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  items: NavItem[];
}

export const homeItem: NavItem = { id: "home", label: "Home", path: "/home", icon: House };
export const calendarItem: NavItem = { id: "calendar", label: "Calendar", path: "/calendar", icon: CalendarDays };
export const settingsItem: NavItem = { id: "settings", label: "Settings", path: "/settings", icon: Settings };

export const groups: NavGroup[] = [
  {
    id: "personal",
    label: "Personal",
    icon: Heart,
    items: [
      { id: "todos", label: "To-Dos", path: "/life/todos", icon: ListTodo },
      { id: "goals", label: "Goals", path: "/life/goals", icon: Target },
      { id: "events", label: "Events", path: "/life/events", icon: PartyPopper },
      { id: "relationships", label: "Relationships", path: "/life/relationships", icon: Users },
      { id: "money", label: "Money", path: "/life/money", icon: Wallet },
      { id: "journal", label: "Journal", path: "/life/journal", icon: NotebookPen },
      { id: "habits", label: "Habits", path: "/life/habits", icon: Flame },
      { id: "moments", label: "Moments", path: "/life/moments", icon: Images },
      { id: "interests", label: "Interests", path: "/life/interests", icon: Sparkles },
      { id: "passwords", label: "Passwords", path: "/life/passwords", icon: KeyRound },
      { id: "important-notes", label: "Important Notes", path: "/life/important-notes", icon: StickyNote },
      { id: "wishlist", label: "Wishlist", path: "/life/wishlist", icon: Gift },
    ],
  },
  {
    id: "academics",
    label: "Academics",
    icon: BookOpen,
    items: [
      { id: "modules", label: "Modules", path: "/academics/modules", icon: Library },
      { id: "timetable", label: "Timetable", path: "/academics/timetable", icon: School },
      { id: "grades", label: "Grades", path: "/academics/grades", icon: Percent },
      { id: "routine", label: "Study Routine", path: "/academics/routine", icon: Clock },
      { id: "notes", label: "School Notes", path: "/academics/notes", icon: FileText },
      { id: "flashcards", label: "Spaced Repetition", path: "/academics/flashcards", icon: Repeat2 },
      { id: "homework", label: "Homework", path: "/academics/homework", icon: ClipboardList },
      { id: "exams", label: "Exams", path: "/academics/exams", icon: GraduationCap },
      { id: "portfolio", label: "Portfolio", path: "/academics/portfolio", icon: Briefcase },
    ],
  },
];

export const allItems: NavItem[] = [homeItem, calendarItem, ...groups.flatMap((g) => g.items), settingsItem];

/** Where a record of a given table lives in the app (used by search + calendar deep links). */
export function entityRoute(type: string, id: number | string): string | null {
  switch (type) {
    case "school_notes":
      return `/academics/notes?id=${id}`;
    case "homework":
      return `/academics/homework?id=${id}`;
    case "exams":
      return `/academics/exams?id=${id}`;
    case "modules":
      return `/academics/modules/${id}`;
    case "portfolio_entries":
      return `/academics/portfolio?id=${id}`;
    case "class_slots":
      return `/academics/timetable?id=${id}`;
    case "tick_goals":
      return `/life/goals?id=${id}`;
    case "review_topics":
      return `/academics/flashcards?topic=${id}`;
    case "decks":
      return `/academics/flashcards?deck=${id}`;
    case "todos":
      return `/life/todos?id=${id}`;
    case "events":
      return `/life/events?id=${id}`;
    case "people":
      return `/life/relationships?id=${id}`;
    case "journal_entries":
      return `/life/journal?id=${id}`;
    case "interest_items":
      return `/life/interests?id=${id}`;
    case "moments":
      return `/life/moments?id=${id}`;
    case "important_notes":
      return `/life/important-notes?id=${id}`;
    case "bills":
      return `/life/money?tab=bills&id=${id}`;
    default:
      return null;
  }
}

export const ENTITY_LABEL: Record<string, string> = {
  school_notes: "Note",
  homework: "Homework",
  exams: "Exam",
  review_topics: "Recall topic",
  modules: "Module",
  portfolio_entries: "Portfolio",
  todos: "To-Do",
  events: "Event",
  people: "Person",
  journal_entries: "Journal",
  interest_items: "Interest",
  moments: "Moment",
  important_notes: "Important note",
};
