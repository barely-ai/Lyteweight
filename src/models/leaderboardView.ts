import { ILeaderboardBoard, ILibraryBoardLift, ILibrarySex } from "./libraryTypes";

export interface ILeaderboardSelection {
  section: "resistance" | "cardio";
  resistance: "strength" | "volume";
  lift: ILibraryBoardLift;
  sex: ILibrarySex;
  weightClass: string;
  cardioSort: "zoneMinutes" | "kcalPerKg";
}

export const LeaderboardView_allClasses = "all";

export function LeaderboardView_initial(sex: ILibrarySex | undefined): ILeaderboardSelection {
  return {
    section: "resistance",
    resistance: "strength",
    lift: "total",
    sex: sex ?? "male",
    weightClass: LeaderboardView_allClasses,
    cardioSort: "zoneMinutes",
  };
}

export function LeaderboardView_board(selection: ILeaderboardSelection): ILeaderboardBoard {
  if (selection.section === "cardio") {
    return { kind: "cardio", sort: selection.cardioSort };
  }
  if (selection.resistance === "volume") {
    return { kind: "volume", sex: selection.sex };
  }
  return {
    kind: "strength",
    lift: selection.lift,
    sex: selection.sex,
    weightClass: selection.weightClass === LeaderboardView_allClasses ? undefined : selection.weightClass,
  };
}

export function LeaderboardView_unit(selection: ILeaderboardSelection): string {
  if (selection.section === "cardio") {
    return selection.cardioSort === "zoneMinutes" ? "zone-min" : "kcal/kg";
  }
  return selection.resistance === "volume" ? "kg this week" : "DOTS";
}

export function LeaderboardView_withSex(selection: ILeaderboardSelection, sex: ILibrarySex): ILeaderboardSelection {
  return { ...selection, sex, weightClass: LeaderboardView_allClasses };
}
