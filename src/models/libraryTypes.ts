import type { IExportedProgram } from "./program";

export type ILibraryLift = "squat" | "bench" | "deadlift";
export type ILibraryBoardLift = ILibraryLift | "total";
export type ILibrarySex = "male" | "female";
export type ICardioSource = "whoop" | "manual";

export interface ILibraryProgramSummary {
  id: string;
  name: string;
  author: string;
  description: string;
  tags: string[];
  publishedAt: number;
  updatedAt: number;
  lifterWeeks: number;
  liftersThisMonth: number;
  starsAverage?: number;
  starsCount: number;
  coachPicks: { coachName: string; note: string }[];
}

export type ILibraryRankChange = { kind: "up" | "down"; by: number } | { kind: "same" } | { kind: "new" };

export interface ILibraryWeeklyEntry {
  program: ILibraryProgramSummary;
  rank: number;
  change: ILibraryRankChange;
  liftersThisWeek: number;
  sparkline: number[];
}

export interface ILibraryComment {
  id: string;
  authorId: string;
  displayName: string;
  isCoach: boolean;
  body: string;
  createdAt: number;
}

export interface ILibraryCoach {
  id: string;
  name: string;
  bio: string;
  picks: { programId: string; programName: string; note: string }[];
}

export interface ILibraryProgramDetail {
  summary: ILibraryProgramSummary;
  exported: IExportedProgram;
  comments: ILibraryComment[];
}

export interface ILibraryPublishBody {
  exported: IExportedProgram;
  name: string;
  author: string;
  description: string;
  tags: string[];
  ownsRights: true;
}

export interface ILeaderboardJoinBody {
  installId: string;
  displayName: string;
  sex: ILibrarySex;
  bodyweightKg: number;
}

export interface ILeaderboardWorkoutBody {
  installId: string;
  workoutId: string;
  week: string;
  bodyweightKg: number;
  bests: Partial<Record<ILibraryLift, number>>;
  volumeKg: number;
}

export interface ICardioSessionBody {
  installId: string;
  sessionId: string;
  week: string;
  activity: string;
  minutes: number;
  zoneMinutes: number;
  kcal?: number;
  source: ICardioSource;
}

export interface ILeaderboardRow {
  rank: number;
  lifterId: string;
  displayName: string;
  weightClass: string;
  value: number;
  detail: string;
  source?: ICardioSource;
  isPending?: boolean;
}

export type ILeaderboardBoard =
  | { kind: "strength"; lift: ILibraryBoardLift; sex: ILibrarySex; weightClass?: string }
  | { kind: "volume"; sex?: ILibrarySex }
  | { kind: "cardio"; sort: "zoneMinutes" | "kcalPerKg" };
