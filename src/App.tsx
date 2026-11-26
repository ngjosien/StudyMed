import { Navigate, Route, Routes, useLocation } from "react-router-dom";
import { Layout } from "./components/layout";
import SettingsPage from "./features/settings/SettingsPage";
import CalendarPage from "./features/calendar/CalendarPage";
import ModulesPage from "./features/academics/ModulesPage";
import ModuleDashboard from "./features/academics/ModuleDashboard";
import NotesPage from "./features/academics/NotesPage";
import RecallPage from "./features/academics/RecallPage";
import GradesPage from "./features/academics/GradesPage";
import RoutinePage from "./features/routine/RoutinePage";
import FocusPage from "./features/focus/FocusPage";
import RewardsPage from "./features/rewards/RewardsPage";
import HomePage from "./features/home/HomePage";
import TimetablePage from "./features/academics/TimetablePage";
import GoalsPage from "./features/life/GoalsPage";
import HomeworkPage from "./features/academics/HomeworkPage";
import ExamsPage from "./features/academics/ExamsPage";
import PortfolioPage from "./features/academics/PortfolioPage";
import TodosPage from "./features/life/TodosPage";
import EventsPage from "./features/life/EventsPage";
import RelationshipsPage from "./features/life/RelationshipsPage";
import MoneyPage from "./features/life/MoneyPage";
import JournalPage from "./features/life/JournalPage";
import HabitsPage from "./features/life/HabitsPage";
import MomentsPage from "./features/life/MomentsPage";
import InterestsPage from "./features/life/InterestsPage";
import PasswordsPage from "./features/secure/PasswordsPage";
import ImportantNotesPage from "./features/secure/ImportantNotesPage";

/** Old addresses (e.g. /life/todos?id=3) still open the right record. */
function KeepQuery({ to }: { to: string }) {
  const { search } = useLocation();
  return <Navigate to={{ pathname: to, search }} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="calendar" element={<CalendarPage />} />

        <Route path="academics/modules" element={<ModulesPage />} />
        <Route path="academics/modules/:id" element={<ModuleDashboard />} />
        <Route path="academics/notes" element={<NotesPage />} />
        <Route path="academics/flashcards" element={<RecallPage />} />
        <Route path="academics/grades" element={<GradesPage />} />
        <Route path="academics/timetable" element={<TimetablePage />} />
        <Route path="life/goals" element={<GoalsPage />} />
        <Route path="routine" element={<RoutinePage />} />
        <Route path="focus" element={<FocusPage />} />
        <Route path="rewards" element={<RewardsPage />} />
        <Route path="academics/routine" element={<Navigate to="/routine?tab=study" replace />} />
        <Route path="academics/homework" element={<HomeworkPage />} />
        <Route path="academics/exams" element={<ExamsPage />} />
        <Route path="academics/portfolio" element={<PortfolioPage />} />

        <Route path="todos" element={<TodosPage />} />
        <Route path="events" element={<EventsPage />} />
        <Route path="life/todos" element={<KeepQuery to="/todos" />} />
        <Route path="life/events" element={<KeepQuery to="/events" />} />
        <Route path="life/relationships" element={<RelationshipsPage />} />
        <Route path="life/money" element={<MoneyPage />} />
        <Route path="life/journal" element={<JournalPage />} />
        <Route path="life/habits" element={<HabitsPage />} />
        <Route path="life/moments" element={<MomentsPage />} />
        <Route path="life/interests" element={<InterestsPage />} />
        <Route path="life/passwords" element={<PasswordsPage />} />
        <Route path="life/important-notes" element={<ImportantNotesPage />} />

        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<Navigate to="/home" replace />} />
      </Route>
    </Routes>
  );
}
