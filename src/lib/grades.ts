// Ngee Ann Polytechnic grading, plus StudyMed's own (clearly labelled) planning estimates.
// Official: https://www.np.edu.sg/admissions-enrolment/academic-matters
import type { Row } from "./api";

/** Official grade points. `null` = no grade point, so it stays out of the GPA. */
export const GRADES: { grade: string; point: number | null; note?: string }[] = [
  { grade: "AD", point: 4, note: "Distinction, about the top 5%" },
  { grade: "A+", point: 4 },
  { grade: "A", point: 4 },
  { grade: "B+", point: 3.5 },
  { grade: "B", point: 3 },
  { grade: "C+", point: 2.5 },
  { grade: "C", point: 2 },
  { grade: "D+", point: 1.5 },
  { grade: "D", point: 1 },
  { grade: "F", point: 0 },
  { grade: "PM", point: null, note: "Pass with merit" },
  { grade: "PX", point: null, note: "Pass, for pass/fail modules" },
];
export const GRADE_NAMES = GRADES.map((g) => g.grade);
export const TARGETS = ["AD", "A+", "A", "B+", "B", "C+", "C", "D+", "D"];
export const pointOf = (grade?: string | null) => GRADES.find((g) => g.grade === grade)?.point ?? null;

/** NP doesn't publish mark ranges. These are guesses that can be edited on the Grades page. */
export const DEFAULT_CUTOFFS: Record<string, number> = { AD: 90, "A+": 85, A: 80, "B+": 75, B: 70, "C+": 65, C: 60, "D+": 55, D: 50 };

export const gradeForMark = (mark: number, cut: Record<string, number>) =>
  // AD is given by ranking, so a mark alone never predicts it.
  TARGETS.filter((g) => g !== "AD").find((g) => mark >= cut[g]) ?? "F";

/** Σ(credit units × grade points) ÷ Σ(graded credit units). */
export function gpa(modules: { credits?: number | null; grade?: string | null }[]) {
  let points = 0;
  let units = 0;
  for (const m of modules) {
    const p = pointOf(m.grade);
    if (p === null || !m.credits) continue;
    points += p * m.credits;
    units += Number(m.credits);
  }
  return { value: units ? points / units : null, units };
}

export interface Standing {
  totalWeight: number;
  doneWeight: number;
  /** Marks already earned, out of 100 for the whole module. */
  secured: number;
  /** Average on the graded parts. */
  average: number | null;
  remaining: number;
}

export function standing(components: Row[]): Standing {
  let totalWeight = 0;
  let doneWeight = 0;
  let secured = 0;
  for (const c of components) {
    const w = Number(c.weight_pct) || 0;
    totalWeight += w;
    if (c.score === null || c.score === undefined) continue;
    doneWeight += w;
    secured += (w * Number(c.score)) / 100;
  }
  return { totalWeight, doneWeight, secured, average: doneWeight ? (secured / doneWeight) * 100 : null, remaining: Math.max(0, 100 - doneWeight) };
}

/** Average needed on everything not graded yet. Null when nothing is left. */
export const neededFor = (s: Standing, mark: number) => (s.remaining > 0 ? ((mark - s.secured) / s.remaining) * 100 : null);

const GOAL_FACTOR: Record<string, number> = { AD: 1.6, "A+": 1.45, A: 1.3, "B+": 1.15, B: 1, "C+": 0.9, C: 0.8, "D+": 0.75, D: 0.7 };
const DIFFICULTY_FACTOR: Record<number, number> = { 1: 0.8, 2: 1, 3: 1.25 };
export const HOURS_PER_CREDIT = 0.75;
export const ASSUMED_CREDITS = 4;

export interface StudyNeed {
  minutes: number;
  /** Plain-English working, shown to the user. */
  why: string[];
}

/**
 * How much to study per week. A transparent rule of thumb, not NP guidance:
 * credits × 45 min × goal × difficulty × how far behind × how close the next exam is.
 */
export function studyNeed(module: Row, s: Standing, cut: Record<string, number>, daysToExam: number | null): StudyNeed {
  const target = module.target_grade as string | null;
  if (!target) return { minutes: 0, why: ["Choose a target grade first"] };
  const credits = Number(module.credits) || ASSUMED_CREDITS;
  let hours = credits * HOURS_PER_CREDIT;
  const why = [`${credits} credits${module.credits ? "" : " (assumed)"} gives ${hours.toFixed(1)}h to start`];
  const times = (factor: number, label: string) => {
    hours *= factor;
    if (Math.abs(factor - 1) > 0.001) why.push(`${label}: ×${factor.toFixed(2)}`);
  };
  times(GOAL_FACTOR[target] ?? 1, `aiming for ${target}`);
  const difficulty = Number(module.difficulty) || 2;
  times(DIFFICULTY_FACTOR[difficulty] ?? 1, difficulty === 1 ? "easy for you" : "hard for you");
  if (s.average !== null) {
    const gap = cut[target] - s.average;
    if (gap > 0) times(1 + Math.min(0.4, gap * 0.02), `${Math.round(gap)} marks behind target`);
    else if (gap < -5) times(0.9, "comfortably ahead");
  }
  if (daysToExam !== null && daysToExam >= 0 && daysToExam <= 28) times(daysToExam <= 14 ? 1.3 : 1.15, `exam in ${daysToExam} days`);
  return { minutes: Math.max(30, Math.round((hours * 60) / 30) * 30), why };
}

/**
 * Reads a score the way it's written on the script: "20/30", "78%", "78", or a grade
 * letter ("B+"). Returns the percentage for that assessment, or an error to show.
 * A letter counts as the middle of its (estimated) mark range.
 */
export function parseScore(text: string, cut: Record<string, number>): { pct: number | null; error?: string } {
  const t = text.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return { pct: null };
  const frac = t.match(/^(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)$/);
  if (frac) {
    const [got, outOf] = [Number(frac[1]), Number(frac[2])];
    if (!(outOf > 0)) return { pct: null, error: "The total can't be 0" };
    if (got > outOf) return { pct: null, error: `${got} is more than ${outOf}` };
    return { pct: (got / outOf) * 100 };
  }
  const num = t.match(/^(\d+(?:\.\d+)?)%?$/);
  if (num) {
    const n = Number(num[1]);
    return n <= 100 ? { pct: n } : { pct: null, error: "A percentage can't be over 100" };
  }
  if (t === "F") return { pct: cut.D / 2 };
  if (cut[t] !== undefined) {
    const above = TARGETS.filter((g) => g !== "AD" && cut[g] > cut[t]).map((g) => cut[g]);
    const top = t === "AD" ? 100 : Math.min(100, ...above);
    return { pct: (cut[t] + top) / 2 };
  }
  return { pct: null, error: 'Write it like "20/30", "78%" or "B+"' };
}

export const fmtPct = (n: number) => `${Math.round(n * 10) / 10}%`;
