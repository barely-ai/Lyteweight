import "mocha";
import { expect } from "chai";
import { LiftLeaderboard_workoutBody } from "../src/models/liftLeaderboard";
import {
  CardioLeaderboard_manualBody,
  CardioLeaderboard_whoopBodies,
  CardioLeaderboard_zoneMinutes,
} from "../src/models/cardioLeaderboard";
import { Weight_build, Weight_getOneRepMax } from "../src/models/weight";
import {
  LeaderboardView_board,
  LeaderboardView_initial,
  LeaderboardView_unit,
  LeaderboardView_withSex,
} from "../src/models/leaderboardView";
import { IHistoryRecord, ISet, IWhoopWorkout } from "../src/types";

function set(weight: number, reps: number, unit: "kg" | "lb" = "kg", isCompleted: boolean = true): ISet {
  return {
    vtype: "set",
    id: `${weight}-${reps}`,
    index: 0,
    reps,
    weight: Weight_build(weight, unit),
    completedWeight: Weight_build(weight, unit),
    completedReps: reps,
    isCompleted,
  };
}

function record(entries: [string, ISet[]][]): IHistoryRecord {
  return {
    vtype: "history_record",
    id: 42,
    date: "2026-10-28T12:00:00.000Z",
    startTime: Date.UTC(2026, 9, 28, 12),
    endTime: Date.UTC(2026, 9, 28, 13),
    day: 1,
    dayName: "Day 1",
    programId: "p",
    programName: "P",
    entries: entries.map(([id, sets], i) => ({
      vtype: "history_entry",
      id: String(i),
      index: i,
      exercise: { id },
      sets,
      warmupSets: [],
    })),
  };
}

describe("LiftLeaderboard", () => {
  it("takes the best e1RM per lift from sets of 5 or fewer and sums volume in kg", () => {
    const body = LiftLeaderboard_workoutBody(
      record([
        ["squat", [set(140, 3), set(120, 8)]],
        ["benchPress", [set(225, 1, "lb")]],
        ["bicepCurl", [set(20, 10), set(30, 2, "kg", false)]],
      ]),
      70,
      "install-1"
    )!;
    expect(body.workoutId).to.equal("42");
    expect(body.week).to.equal("2026-W44");
    expect(body.bests.squat).to.equal(Math.round(Weight_getOneRepMax(Weight_build(140, "kg"), 3).value * 10) / 10);
    expect(body.bests.bench).to.be.closeTo(102.1, 0.1);
    expect(body.bests.deadlift).to.equal(undefined);
    expect(body.volumeKg).to.equal(Math.round(140 * 3 + 120 * 8 + 102.058 + 200));
  });

  it("sends nothing for a workout with no completed sets", () => {
    expect(LiftLeaderboard_workoutBody(record([["squat", [set(100, 5, "kg", false)]]]), 70, "i")).to.equal(undefined);
  });
});

describe("LeaderboardView", () => {
  it("turns the tab's choices into a board request and a unit", () => {
    const start = LeaderboardView_initial("female");
    expect(LeaderboardView_board(start)).to.eql({
      kind: "strength",
      lift: "total",
      sex: "female",
      weightClass: undefined,
    });
    expect(LeaderboardView_unit(start)).to.equal("DOTS");
    const classed = { ...start, weightClass: "63" };
    expect(LeaderboardView_board(classed)).to.eql({
      kind: "strength",
      lift: "total",
      sex: "female",
      weightClass: "63",
    });
    expect(LeaderboardView_withSex(classed, "male").weightClass).to.equal("all");
    expect(LeaderboardView_board({ ...start, resistance: "volume" })).to.eql({ kind: "volume", sex: "female" });
    const cardio = { ...start, section: "cardio" as const, cardioSort: "kcalPerKg" as const };
    expect(LeaderboardView_board(cardio)).to.eql({ kind: "cardio", sort: "kcalPerKg" });
    expect(LeaderboardView_unit(cardio)).to.equal("kcal/kg");
  });
});

describe("CardioLeaderboard", () => {
  it("weights minutes by zone", () => {
    expect(CardioLeaderboard_zoneMinutes([10, 5, 10, 20, 0, 2])).to.equal(5 + 20 + 60 + 10);
  });

  it("builds a manual entry from effort, and rejects bad input", () => {
    const ok = CardioLeaderboard_manualBody("i", Date.UTC(2026, 9, 28), "Bike", 30, 7);
    expect(ok.ok && ok.body.zoneMinutes).to.equal(120);
    const bad = CardioLeaderboard_manualBody("i", 0, "", 0, 11);
    expect(bad.ok).to.equal(false);
    expect(!bad.ok && bad.errors).to.have.length(3);
  });

  it("sends new non-lifting WHOOP workouts once, with kcal", () => {
    const workout = (id: string, sport: string): IWhoopWorkout => ({
      id,
      start: Date.UTC(2026, 9, 28, 6),
      end: Date.UTC(2026, 9, 28, 6, 40),
      sport,
      kilojoule: 1674,
      zoneMinutes: [0, 10, 10, 10, 10, 0],
    });
    const bodies = CardioLeaderboard_whoopBodies(
      "i",
      [workout("a", "running"), workout("b", "weightlifting"), workout("c", "cycling")],
      ["c"]
    );
    expect(bodies.map((b) => [b.sessionId, b.minutes, b.zoneMinutes, b.kcal])).to.eql([["w-a", 40, 100, 400]]);
  });
});
