import {
  ILeaderboardRow,
  ILibraryBoardLift,
  ILibraryLift,
  ILibraryRankChange,
  ILibrarySex,
  ICardioSource,
} from "../src/models/libraryTypes";
import { LibraryRules_dots, LibraryRules_weightClass } from "../src/models/libraryRules";

export interface IWeeklyRank {
  programId: string;
  rank: number;
  change: ILibraryRankChange;
  liftersThisWeek: number;
  sparkline: number[];
}

export interface ILifterBests {
  lifterId: string;
  displayName: string;
  sex: ILibrarySex;
  bodyweightKg: number;
  okKg: Partial<Record<ILibraryLift, number>>;
}

const lifts: ILibraryLift[] = ["squat", "bench", "deadlift"];

export function LibraryRanking_bayesian(sum: number, count: number, globalMean: number, priorVotes: number): number {
  return (priorVotes * globalMean + sum) / (priorVotes + count);
}

function byLiftersThenScore(
  rows: { programId: string; lifters: number }[],
  tiebreak: Record<string, number>
): { programId: string; lifters: number }[] {
  return [...rows].sort(
    (a, b) =>
      b.lifters - a.lifters ||
      (tiebreak[b.programId] ?? 0) - (tiebreak[a.programId] ?? 0) ||
      a.programId.localeCompare(b.programId)
  );
}

export function LibraryRanking_weekly(
  thisWeek: { programId: string; lifters: number }[],
  lastWeek: { programId: string; lifters: number }[],
  history: { programId: string; week: string; lifters: number }[],
  weeks: string[],
  tiebreak: Record<string, number>,
  limit: number
): IWeeklyRank[] {
  const lastRanks = new Map(byLiftersThenScore(lastWeek, tiebreak).map((r, i) => [r.programId, i + 1]));
  const lifterCounts = new Map(history.map((h) => [`${h.programId}|${h.week}`, h.lifters]));
  return byLiftersThenScore(thisWeek, tiebreak)
    .slice(0, limit)
    .map((row, i) => {
      const rank = i + 1;
      const lastRank = lastRanks.get(row.programId);
      const change: ILibraryRankChange =
        lastRank == null
          ? { kind: "new" }
          : lastRank === rank
            ? { kind: "same" }
            : lastRank > rank
              ? { kind: "up", by: lastRank - rank }
              : { kind: "down", by: rank - lastRank };
      return {
        programId: row.programId,
        rank,
        change,
        liftersThisWeek: row.lifters,
        sparkline: weeks.map((w) => lifterCounts.get(`${row.programId}|${w}`) ?? 0),
      };
    });
}

function withRanks(rows: Omit<ILeaderboardRow, "rank">[]): ILeaderboardRow[] {
  return rows.sort((a, b) => b.value - a.value).map((row, i) => ({ ...row, rank: i + 1 }));
}

export function LibraryRanking_strengthRows(
  lifters: ILifterBests[],
  lift: ILibraryBoardLift,
  sex: ILibrarySex,
  weightClass: string | undefined,
  limit: number
): ILeaderboardRow[] {
  const rows: Omit<ILeaderboardRow, "rank">[] = [];
  for (const lifter of lifters) {
    const lifterClass = LibraryRules_weightClass(lifter.bodyweightKg, lifter.sex);
    if (lifter.sex !== sex || (weightClass != null && lifterClass !== weightClass)) {
      continue;
    }
    const kg =
      lift === "total"
        ? lifts.every((l) => lifter.okKg[l] != null)
          ? lifts.reduce((sum, l) => sum + (lifter.okKg[l] ?? 0), 0)
          : undefined
        : lifter.okKg[lift];
    if (kg == null) {
      continue;
    }
    rows.push({
      lifterId: lifter.lifterId,
      displayName: lifter.displayName,
      weightClass: lifterClass,
      value: LibraryRules_dots(kg, lifter.bodyweightKg, lifter.sex),
      detail: `${Math.round(kg * 10) / 10} kg`,
    });
  }
  return withRanks(rows).slice(0, limit);
}

export function LibraryRanking_volumeRows(
  rows: { lifterId: string; displayName: string; sex: ILibrarySex; bodyweightKg: number; kg: number }[],
  sex: ILibrarySex | undefined,
  limit: number
): ILeaderboardRow[] {
  return withRanks(
    rows
      .filter((r) => sex == null || r.sex === sex)
      .map((r) => ({
        lifterId: r.lifterId,
        displayName: r.displayName,
        weightClass: LibraryRules_weightClass(r.bodyweightKg, r.sex),
        value: Math.round(r.kg),
        detail: `${Math.round(r.kg).toLocaleString("en-US")} kg`,
      }))
  ).slice(0, limit);
}

export function LibraryRanking_cardioRows(
  rows: {
    lifterId: string;
    displayName: string;
    sex: ILibrarySex;
    bodyweightKg: number;
    zoneMinutes: number;
    kcal: number;
    hasWhoop: boolean;
  }[],
  sort: "zoneMinutes" | "kcalPerKg",
  limit: number
): ILeaderboardRow[] {
  return withRanks(
    rows.map((r) => {
      const kcalPerKg = r.bodyweightKg > 0 ? r.kcal / r.bodyweightKg : 0;
      const source: ICardioSource = r.hasWhoop ? "whoop" : "manual";
      return {
        lifterId: r.lifterId,
        displayName: r.displayName,
        weightClass: LibraryRules_weightClass(r.bodyweightKg, r.sex),
        value: sort === "zoneMinutes" ? Math.round(r.zoneMinutes) : Math.round(kcalPerKg * 10) / 10,
        detail:
          sort === "zoneMinutes"
            ? `${r.kcal > 0 ? `${Math.round(r.kcal)} kcal` : "no kcal"}`
            : `${Math.round(r.zoneMinutes)} zone-min`,
        source,
      };
    })
  ).slice(0, limit);
}
