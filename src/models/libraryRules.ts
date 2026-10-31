import { Dots_score } from "./dots";
import { ILibraryBoardLift, ILibrarySex } from "./libraryTypes";

export const LibraryRules_limits = {
  name: 80,
  author: 40,
  description: 2000,
  tags: 5,
  tag: 20,
  comment: 1000,
  coachNote: 280,
  displayName: 30,
  activity: 40,
  manualMinutes: 600,
  programBytes: 256 * 1024,
};

const dayMs = 24 * 60 * 60 * 1000;

// Kept short on purpose: it catches the obvious cases Apple's guideline 1.2 asks a filter for, and reports
// with owner removal handle the rest.
const blockedWords = ["fuck", "shit", "cunt", "nigger", "nigga", "faggot", "retard", "whore", "slut"];

const weightClasses: Record<ILibrarySex, number[]> = {
  male: [59, 66, 74, 83, 93, 105, 120],
  female: [47, 52, 57, 63, 69, 76, 84],
};

// The best raw totals ever recorded score a little above 600 DOTS, so 650 leaves headroom for a real record
// while rejecting typos and made-up numbers.
const maxTotalDots = 650;
const maxShareOfTotal: Record<ILibraryBoardLift, number> = { squat: 0.45, bench: 0.36, deadlift: 0.45, total: 1 };
const maxJumpRatio = 1.15;

export function LibraryRules_isoWeek(ts: number): string {
  const date = new Date(ts);
  const day = date.getUTCDay() || 7;
  const thursday = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + 4 - day);
  const year = new Date(thursday).getUTCFullYear();
  const week = Math.floor((thursday - Date.UTC(year, 0, 1)) / dayMs / 7) + 1;
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export function LibraryRules_previousWeeks(week: string, count: number): string[] {
  const match = week.match(/^(\d{4})-W(\d{2})$/);
  if (!match) {
    return [];
  }
  const year = Number(match[1]);
  const jan4 = Date.UTC(year, 0, 4);
  const mondayOfWeek1 = jan4 - ((new Date(jan4).getUTCDay() || 7) - 1) * dayMs;
  const monday = mondayOfWeek1 + (Number(match[2]) - 1) * 7 * dayMs;
  const weeks: string[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    weeks.push(LibraryRules_isoWeek(monday - i * 7 * dayMs));
  }
  return weeks;
}

export function LibraryRules_textProblems(text: string, maxLength: number): string[] {
  const problems: string[] = [];
  const trimmed = text.trim();
  if (trimmed.length === 0) {
    problems.push("Write something first.");
  }
  if (trimmed.length > maxLength) {
    problems.push(`Keep it under ${maxLength} characters.`);
  }
  const lower = trimmed.toLowerCase();
  if (blockedWords.some((word) => new RegExp(`\\b${word}`).test(lower))) {
    problems.push("Please remove the offensive language.");
  }
  if (/https?:\/\/|www\./.test(lower)) {
    problems.push("Links aren't allowed.");
  }
  return problems;
}

export function LibraryRules_normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  for (const tag of tags) {
    const clean = tag.trim().toLowerCase().replace(/\s+/g, "-");
    if (clean) {
      seen.add(clean);
    }
  }
  return Array.from(seen);
}

export function LibraryRules_effortZone(effort: number): number {
  return Math.min(5, Math.max(1, Math.ceil(effort / 2)));
}

export function LibraryRules_weightClasses(sex: ILibrarySex): string[] {
  const classes = weightClasses[sex];
  return [...classes.map(String), `${classes[classes.length - 1]}+`];
}

export function LibraryRules_weightClass(bodyweightKg: number, sex: ILibrarySex): string {
  const classes = weightClasses[sex];
  const match = classes.find((limit) => bodyweightKg <= limit);
  return match != null ? String(match) : `${classes[classes.length - 1]}+`;
}

export function LibraryRules_capKg(lift: ILibraryBoardLift, sex: ILibrarySex, bodyweightKg: number): number {
  const totalCap = maxTotalDots / Dots_score(1, bodyweightKg, sex);
  return Math.round(totalCap * maxShareOfTotal[lift]);
}

export function LibraryRules_liftStatus(e1rmKg: number, previousBestKg: number | undefined): "ok" | "pending" {
  const limitKg = Math.round(previousBestKg != null ? previousBestKg * maxJumpRatio * 100 : Infinity) / 100;
  return e1rmKg > limitKg ? "pending" : "ok";
}

export function LibraryRules_dots(totalKg: number, bodyweightKg: number, sex: ILibrarySex): number {
  return Math.round(Dots_score(totalKg, bodyweightKg, sex) * 10) / 10;
}
