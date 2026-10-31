/* eslint-disable @typescript-eslint/no-explicit-any */
import "mocha";
import { expect } from "chai";
import { ILibraryEnv, LibraryServer_handle } from "../cloudflare/libraryServer";
import { LibraryRules_isoWeek, LibraryRules_previousWeeks } from "../src/models/libraryRules";
import { SqljsD1_create } from "./utils/sqljsD1";

const day = 24 * 60 * 60 * 1000;
const now = Date.UTC(2026, 9, 28, 12);
const week = LibraryRules_isoWeek(now);
const lastWeek = LibraryRules_previousWeeks(week, 2)[0];
const adminKey = "admin-key-for-tests";

let env: ILibraryEnv;

async function call(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
  at: number = now
): Promise<{ status: number; data: any }> {
  const request = new Request(`https://lyteweight.pages.dev/library/${path}`, {
    method,
    headers: { "content-type": "application/json", "cf-connecting-ip": "1.2.3.4", ...headers },
    body: body != null ? JSON.stringify(body) : undefined,
  });
  const response = await LibraryServer_handle(request, env, at);
  return { status: response.status, data: await response.json() };
}

function publishBody(name: string): unknown {
  return {
    exported: { program: { name, planner: { name, weeks: [] } }, customExercises: {}, version: "1", settings: {} },
    name,
    author: "Zach",
    description: "A test program",
    tags: ["Strength", "strength", "4 day"],
    ownsRights: true,
  };
}

async function publish(name: string): Promise<{ id: string; editKey: string }> {
  const { status, data } = await call("POST", "programs", publishBody(name));
  expect(status).to.equal(201);
  return data;
}

function install(n: number): string {
  return `install-${String(n).padStart(4, "0")}`;
}

async function useProgram(id: string, installN: number, times: number, onWeek: string = week): Promise<void> {
  for (let i = 0; i < times; i += 1) {
    const { status } = await call("POST", `programs/${id}/usage`, { installId: install(installN), week: onWeek });
    expect(status).to.equal(200);
  }
}

describe("LibraryServer", () => {
  beforeEach(async () => {
    env = { LIBRARY_DB: await SqljsD1_create(), LIBRARY_ADMIN_KEY: adminKey };
  });

  it("says not configured without a database", async () => {
    env = {};
    const { status, data } = await call("GET", "programs");
    expect(status).to.equal(503);
    expect(data.error).to.equal("not_configured");
  });

  it("publishes, lists and returns a program with normalized tags", async () => {
    const { id, editKey } = await publish("Squat Focus");
    expect(id).to.match(/^[A-Za-z0-9]{8}$/);
    expect(editKey).to.have.length(32);
    const list = await call("GET", "programs");
    expect(list.data.programs.map((p: any) => p.name)).to.eql(["Squat Focus"]);
    expect(list.data.programs[0].tags).to.eql(["strength", "4-day"]);
    const detail = await call("GET", `programs/${id}`);
    expect(detail.data.exported.program.name).to.equal("Squat Focus");
  });

  it("rejects a publish without the rights confirmation or with offensive text", async () => {
    const noRights = await call("POST", "programs", { ...(publishBody("X") as object), ownsRights: false });
    expect(noRights.status).to.equal(400);
    const offensive = await call("POST", "programs", publishBody("shit program"));
    expect(offensive.status).to.equal(400);
  });

  it("lets only the edit key or the admin key change or delete a program", async () => {
    const { id, editKey } = await publish("Mine");
    expect((await call("PUT", `programs/${id}`, publishBody("Hacked"), { "x-edit-key": "wrong" })).status).to.equal(
      403
    );
    expect((await call("PUT", `programs/${id}`, publishBody("Mine v2"), { "x-edit-key": editKey })).status).to.equal(
      200
    );
    expect((await call("GET", `programs/${id}`)).data.summary.name).to.equal("Mine v2");
    expect((await call("DELETE", `programs/${id}`, undefined, { "x-admin-key": adminKey })).status).to.equal(200);
    expect((await call("GET", `programs/${id}`)).status).to.equal(404);
  });

  it("caps publishes per network per day", async () => {
    for (let i = 0; i < 10; i += 1) {
      await publish(`P${i}`);
    }
    expect((await call("POST", "programs", publishBody("P11"))).status).to.equal(429);
  });

  it("counts lifter-weeks once per install per week and ranks all time by them", async () => {
    const a = await publish("A");
    const b = await publish("B");
    await useProgram(a.id, 1, 3);
    await useProgram(b.id, 1, 1);
    await useProgram(b.id, 2, 1);
    await useProgram(b.id, 2, 1, lastWeek);
    const list = await call("GET", "programs?sort=alltime");
    expect(list.data.programs.map((p: any) => [p.name, p.lifterWeeks])).to.eql([
      ["B", 3],
      ["A", 1],
    ]);
  });

  it("rejects usage for old weeks", async () => {
    const { id } = await publish("A");
    const old = LibraryRules_isoWeek(now - 30 * day);
    const { status } = await call("POST", `programs/${id}/usage`, { installId: install(1), week: old });
    expect(status).to.equal(400);
  });

  it("allows a rating only after 3 workouts and ranks by the Bayesian average", async () => {
    const a = await publish("A");
    const b = await publish("B");
    await useProgram(a.id, 1, 2);
    expect((await call("POST", `programs/${a.id}/rating`, { installId: install(1), stars: 5 })).status).to.equal(403);
    await useProgram(a.id, 1, 1);
    expect((await call("POST", `programs/${a.id}/rating`, { installId: install(1), stars: 5 })).status).to.equal(200);
    for (let n = 2; n <= 9; n += 1) {
      await useProgram(b.id, n, 3);
      await call("POST", `programs/${b.id}/rating`, { installId: install(n), stars: 4 });
    }
    const list = await call("GET", "programs?sort=rated");
    expect(list.data.programs.map((p: any) => p.name)).to.eql(["B", "A"]);
    expect(list.data.programs[1].starsAverage).to.equal(5);
  });

  it("hides a program after 3 reports from different installs", async () => {
    const { id } = await publish("Spam");
    for (const n of [1, 1, 2]) {
      await call("POST", `programs/${id}/report`, { installId: install(n) });
    }
    expect((await call("GET", "programs")).data.programs).to.have.length(1);
    await call("POST", `programs/${id}/report`, { installId: install(3) });
    expect((await call("GET", "programs")).data.programs).to.have.length(0);
  });

  it("builds the weekly board with rank changes and sparklines", async () => {
    const a = await publish("A");
    const b = await publish("B");
    const c = await publish("C");
    await useProgram(a.id, 1, 1, lastWeek);
    await useProgram(a.id, 2, 1, lastWeek);
    await useProgram(b.id, 3, 1, lastWeek);
    for (const n of [4, 5, 6]) {
      await useProgram(b.id, n, 1);
    }
    for (const n of [7, 8]) {
      await useProgram(c.id, n, 1);
    }
    await useProgram(a.id, 9, 1);
    const { data } = await call("GET", "weekly");
    expect(data.week).to.equal(week);
    expect(
      data.entries.map((e: any) => [e.program.name, e.rank, e.change.kind, e.change.by, e.liftersThisWeek])
    ).to.eql([
      ["B", 1, "up", 1, 3],
      ["C", 2, "new", undefined, 2],
      ["A", 3, "down", 2, 1],
    ]);
    expect(data.entries[0].sparkline).to.eql([0, 0, 0, 0, 0, 0, 1, 3]);
  });

  it("lets people who added a program comment, filters text, and hides after 3 reports", async () => {
    const { id } = await publish("A");
    const body = { installId: install(1), displayName: "Zach", body: "Great block" };
    expect((await call("POST", `programs/${id}/comments`, body)).status).to.equal(403);
    await call("POST", `programs/${id}/added`, { installId: install(1) });
    const created = await call("POST", `programs/${id}/comments`, body);
    expect(created.status).to.equal(201);
    expect((await call("POST", `programs/${id}/comments`, { ...body, body: "visit www.spam.com" })).status).to.equal(
      400
    );
    const detail = await call("GET", `programs/${id}`);
    expect(detail.data.comments).to.have.length(1);
    expect(detail.data.comments[0].authorId).to.have.length(16);
    expect(detail.data.comments[0].authorId).to.not.contain("install");
    for (const n of [2, 3, 4]) {
      await call("POST", `comments/${created.data.id}/report`, { installId: install(n) });
    }
    expect((await call("GET", `programs/${id}`)).data.comments).to.have.length(0);
  });

  it("creates coaches only with the admin key, and shows their picks and badge", async () => {
    expect((await call("POST", "admin/coaches", { name: "Coach A", bio: "IPF coach" })).status).to.equal(403);
    const coach = await call(
      "POST",
      "admin/coaches",
      { name: "Coach A", bio: "IPF coach" },
      { "x-admin-key": adminKey }
    );
    const { id } = await publish("A");
    await call("POST", `programs/${id}/recommend`, { coachKey: coach.data.coachKey, note: "Solid peaking block" });
    const coaches = await call("GET", "coaches");
    expect(coaches.data.coaches[0].picks).to.eql([{ programId: id, programName: "A", note: "Solid peaking block" }]);
    const summary = (await call("GET", "programs")).data.programs[0];
    expect(summary.coachPicks).to.eql([{ coachName: "Coach A", note: "Solid peaking block" }]);
    await call("POST", `programs/${id}/added`, { installId: install(1) });
    await call("POST", `programs/${id}/comments`, {
      installId: install(1),
      displayName: "Coach A",
      body: "Run it as written",
      coachKey: coach.data.coachKey,
    });
    expect((await call("GET", `programs/${id}`)).data.comments[0].isCoach).to.equal(true);
  });

  describe("leaderboard", () => {
    async function join(n: number, name: string, bodyweightKg: number, sex: string = "male"): Promise<void> {
      const { status } = await call("POST", "leaderboard/join", {
        installId: install(n),
        displayName: name,
        sex,
        bodyweightKg,
      });
      expect(status).to.equal(200);
    }

    function workout(n: number, workoutId: string, bests: object, volumeKg: number): Promise<{ data: any }> {
      return call("POST", "leaderboard/workout", {
        installId: install(n),
        workoutId,
        week,
        bodyweightKg: 0,
        bests,
        volumeKg,
      });
    }

    it("ranks strength by DOTS and counts a workout once", async () => {
      await join(1, "Light", 67);
      await join(2, "Heavy", 100);
      await workout(1, "w1", { squat: 150, bench: 100, deadlift: 180 }, 5000);
      await workout(1, "w1", { squat: 150, bench: 100, deadlift: 180 }, 5000);
      await workout(2, "w2", { squat: 180, bench: 120, deadlift: 210 }, 9000);
      const strength = await call("GET", "leaderboard?board=strength&lift=total&sex=male");
      expect(strength.data.rows.map((r: any) => [r.displayName, r.detail])).to.eql([
        ["Light", "430 kg"],
        ["Heavy", "510 kg"],
      ]);
      const volume = await call("GET", "leaderboard?board=volume");
      expect(volume.data.rows.map((r: any) => [r.displayName, r.value])).to.eql([
        ["Heavy", 9000],
        ["Light", 5000],
      ]);
    });

    it("rejects lifts above the cap and holds jumps over 15% for approval", async () => {
      await join(1, "Zach", 70);
      const huge = await workout(1, "w1", { squat: 500 }, 0);
      expect(huge.data.rejected).to.eql(["squat"]);
      await workout(1, "w2", { bench: 100 }, 0);
      const jump = await workout(1, "w3", { bench: 120 }, 0);
      expect(jump.data.pending).to.eql(["bench"]);
      const before = await call("GET", "leaderboard?board=strength&lift=bench&sex=male");
      expect(before.data.rows[0].detail).to.equal("100 kg");
      const lifterId = before.data.rows[0].lifterId;
      await call("POST", `admin/approve/${lifterId}`, {}, { "x-admin-key": adminKey });
      const after = await call("GET", "leaderboard?board=strength&lift=bench&sex=male");
      expect(after.data.rows[0].detail).to.equal("120 kg");
    });

    it("ranks cardio by zone-minutes, caps manual entries per day, and needs a joined lifter", async () => {
      const session = (
        n: number,
        sessionId: string,
        zoneMinutes: number,
        source: string,
        kcal?: number
      ): Promise<{ status: number; data: any }> =>
        call("POST", "leaderboard/cardio", {
          installId: install(n),
          sessionId,
          week,
          activity: "Run",
          minutes: Math.ceil(zoneMinutes / 2),
          zoneMinutes,
          kcal,
          source,
        });
      expect((await session(1, "s1", 100, "manual")).status).to.equal(404);
      await join(1, "Runner", 70);
      await join(2, "Rower", 90);
      expect((await session(1, "s1", 400, "manual")).status).to.equal(200);
      expect((await session(1, "s2", 300, "manual")).status).to.equal(429);
      expect((await session(2, "w-1", 500, "whoop", 900)).status).to.equal(200);
      const board = await call("GET", "leaderboard?board=cardio");
      expect(board.data.rows.map((r: any) => [r.displayName, r.value, r.source])).to.eql([
        ["Rower", 500, "whoop"],
        ["Runner", 400, "manual"],
      ]);
      const perKg = await call("GET", "leaderboard?board=cardio&sort=kcalPerKg");
      expect(perKg.data.rows[0].value).to.equal(10);
    });

    it("hides a lifter after 3 reports", async () => {
      await join(1, "Fake", 70);
      await workout(1, "w1", { squat: 150 }, 1000);
      const lifterId = (await call("GET", "leaderboard?board=volume")).data.rows[0].lifterId;
      for (const n of [2, 3, 4]) {
        await call("POST", `leaderboard/lifters/${lifterId}`, { installId: install(n) });
      }
      expect((await call("GET", "leaderboard?board=volume")).data.rows).to.have.length(0);
    });
  });
});
