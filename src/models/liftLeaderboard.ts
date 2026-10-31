import { IHistoryRecord } from "../types";
import { Weight_convertTo, Weight_getOneRepMax } from "./weight";
import { LibraryRules_isoWeek } from "./libraryRules";
import { ILeaderboardWorkoutBody, ILibraryLift } from "./libraryTypes";

const liftExerciseIds: Record<ILibraryLift, string> = { squat: "squat", bench: "benchPress", deadlift: "deadlift" };
const maxRepsForStrength = 5;

function liftForExercise(exerciseId: string): ILibraryLift | undefined {
  return (Object.keys(liftExerciseIds) as ILibraryLift[]).find((lift) => liftExerciseIds[lift] === exerciseId);
}

export function LiftLeaderboard_workoutBody(
  record: IHistoryRecord,
  bodyweightKg: number,
  installId: string
): ILeaderboardWorkoutBody | undefined {
  const bests: Partial<Record<ILibraryLift, number>> = {};
  let volumeKg = 0;
  let completedSets = 0;
  for (const entry of record.entries) {
    const lift = liftForExercise(entry.exercise.id);
    for (const set of entry.sets) {
      const reps = set.completedReps ?? 0;
      const weight = set.completedWeight ?? set.weight;
      if (!set.isCompleted || reps < 1 || weight == null) {
        continue;
      }
      completedSets += 1;
      volumeKg += Weight_convertTo(weight, "kg").value * reps;
      if (lift && reps <= maxRepsForStrength) {
        const e1rm = Weight_convertTo(Weight_getOneRepMax(weight, reps, set.completedRpe), "kg").value;
        bests[lift] = Math.max(bests[lift] ?? 0, Math.round(e1rm * 10) / 10);
      }
    }
  }
  if (completedSets === 0) {
    return undefined;
  }
  return {
    installId,
    workoutId: String(record.id),
    week: LibraryRules_isoWeek(record.startTime),
    bodyweightKg,
    bests,
    volumeKg: Math.round(volumeKg),
  };
}
