import { IWhoopWorkout } from "../types";
import {
  LibraryRules_effortZone,
  LibraryRules_isoWeek,
  LibraryRules_limits,
  LibraryRules_textProblems,
} from "./libraryRules";
import { ICardioSessionBody } from "./libraryTypes";

const kjPerKcal = 4.184;
// WHOOP logs lifting sessions as workouts too. Their heart rate belongs to the resistance boards, so the
// cardio board leaves them out.
const resistanceSports = /weight|power|strength|functional|crossfit/i;

export function CardioLeaderboard_zoneMinutes(minutesPerZone: number[]): number {
  const total = minutesPerZone.reduce((sum, minutes, zone) => sum + minutes * zone, 0);
  return Math.round(total * 10) / 10;
}

export function CardioLeaderboard_manualBody(
  installId: string,
  now: number,
  activity: string,
  minutes: number,
  effort: number
): { ok: true; body: ICardioSessionBody } | { ok: false; errors: string[] } {
  const limits = LibraryRules_limits;
  const errors = LibraryRules_textProblems(activity, limits.activity).map((p) => `Activity: ${p}`);
  if (!Number.isFinite(minutes) || minutes < 1 || minutes > limits.manualMinutes) {
    errors.push(`Minutes must be between 1 and ${limits.manualMinutes}.`);
  }
  if (!Number.isInteger(effort) || effort < 1 || effort > 10) {
    errors.push("Effort must be a whole number from 1 to 10.");
  }
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const rounded = Math.round(minutes);
  return {
    ok: true,
    body: {
      installId,
      sessionId: `m-${now}`,
      week: LibraryRules_isoWeek(now),
      activity: activity.trim(),
      minutes: rounded,
      zoneMinutes: rounded * LibraryRules_effortZone(effort),
      source: "manual",
    },
  };
}

export function CardioLeaderboard_whoopBodies(
  installId: string,
  workouts: IWhoopWorkout[],
  alreadySentIds: string[]
): ICardioSessionBody[] {
  const sent = new Set(alreadySentIds);
  return workouts
    .filter((w) => w.zoneMinutes != null && !sent.has(w.id) && !resistanceSports.test(w.sport ?? ""))
    .map((w) => ({
      installId,
      sessionId: `w-${w.id}`,
      week: LibraryRules_isoWeek(w.start),
      activity: w.sport ?? "Workout",
      minutes: Math.round((w.end - w.start) / 60000),
      zoneMinutes: CardioLeaderboard_zoneMinutes(w.zoneMinutes ?? []),
      kcal: w.kilojoule != null ? Math.round(w.kilojoule / kjPerKcal) : undefined,
      source: "whoop" as const,
    }));
}
