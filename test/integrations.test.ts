import "mocha";
import { expect } from "chai";
import { WhoopData_mergeDays, WhoopData_toDays, WhoopData_toWorkouts } from "../src/models/whoopData";
import { WithingsData_addToStats, WithingsData_toEntries } from "../src/models/withingsData";
import {
  IntegrationsSync_apply,
  IntegrationsSync_fetch,
  IntegrationsSync_isDue,
  IIntegrationsFetch,
} from "../src/models/integrationsSync";
import { IntegrationsSummary_recoveryColor, IntegrationsSummary_bodyRows } from "../src/models/integrationsSummary";
import { IIntegrationsEnv, IKv, IntegrationsServer_handle } from "../cloudflare/integrationsServer";
import { Stats_getEmpty } from "../src/models/stats";
import { Weight_build } from "../src/models/weight";
import { migrations } from "../src/migrations/migrations";
import { IStorage } from "../src/types";

const hour = 60 * 60 * 1000;

const whoopFixture = {
  cycles: [
    {
      id: 2,
      start: "2026-10-25T22:00:00.000Z",
      score: { strain: 12.4, kilojoule: 9000, average_heart_rate: 70, max_heart_rate: 165 },
    },
    { id: 1, start: "2026-10-24T22:00:00.000Z" },
  ],
  recoveries: [
    {
      cycle_id: 2,
      sleep_id: "sleep-2",
      score_state: "SCORED",
      score: {
        recovery_score: 41,
        resting_heart_rate: 55,
        hrv_rmssd_milli: 61.234,
        spo2_percentage: 96.5,
        skin_temp_celsius: 33.1,
      },
    },
  ],
  sleeps: [
    {
      id: "sleep-2",
      cycle_id: 2,
      start: "2026-10-25T23:00:00.000Z",
      end: "2026-10-26T07:00:00.000Z",
      nap: false,
      score: {
        stage_summary: {
          total_in_bed_time_milli: 8 * hour,
          total_awake_time_milli: 0.5 * hour,
          total_light_sleep_time_milli: 3.5 * hour,
          total_slow_wave_sleep_time_milli: 2 * hour,
          total_rem_sleep_time_milli: 2 * hour,
          sleep_cycle_count: 4,
          disturbance_count: 9,
        },
        sleep_needed: {
          baseline_milli: 7.5 * hour,
          need_from_sleep_debt_milli: 1 * hour,
          need_from_recent_strain_milli: 0.5 * hour,
          need_from_recent_nap_milli: 0,
        },
        respiratory_rate: 15.2,
        sleep_performance_percentage: 83,
        sleep_consistency_percentage: 70,
        sleep_efficiency_percentage: 93.75,
      },
    },
    { id: "nap-1", cycle_id: 1, start: "2026-10-25T13:00:00.000Z", end: "2026-10-25T13:30:00.000Z", nap: true },
  ],
  workouts: [
    {
      id: "w1",
      start: "2026-10-25T17:00:00.000Z",
      end: "2026-10-25T18:30:00.000Z",
      sport_name: "powerlifting",
      score: {
        strain: 9.1,
        average_heart_rate: 110,
        max_heart_rate: 160,
        kilojoule: 1500,
        zone_durations: { one_milli: 600000, two_milli: 1200000 },
      },
    },
  ],
};

class FakeKv implements IKv {
  public data = new Map<string, string>();
  public async get(key: string): Promise<string | null> {
    return this.data.get(key) ?? null;
  }
  public async put(key: string, value: string): Promise<void> {
    this.data.set(key, value);
  }
  public async delete(key: string): Promise<void> {
    this.data.delete(key);
  }
}

function jsonResponse(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("WhoopData", () => {
  it("joins recovery, main sleep and cycle into one day dated by the wake-up morning", () => {
    const days = WhoopData_toDays(whoopFixture);
    expect(days).to.have.length(2);
    const day = days.find((d) => d.cycleId === 2)!;
    const wake = new Date("2026-10-26T07:00:00.000Z");
    expect(day.date).to.equal(
      `${wake.getFullYear()}-${`${wake.getMonth() + 1}`.padStart(2, "0")}-${`${wake.getDate()}`.padStart(2, "0")}`
    );
    expect(day.recoveryScore).to.equal(41);
    expect(day.hrvMs).to.equal(61.2);
    expect(day.restingHr).to.equal(55);
    expect(day.sleepHours).to.equal(7.5);
    expect(day.deepHours).to.equal(2);
    expect(day.sleepNeedHours).to.equal(9);
    expect(day.sleepDebtHours).to.equal(1);
    expect(day.strain).to.equal(12.4);
    expect(day.sleepPerformance).to.equal(83);
  });

  it("keeps unscored cycles without inventing values, and ignores naps", () => {
    const day = WhoopData_toDays(whoopFixture).find((d) => d.cycleId === 1)!;
    expect(day.recoveryScore).to.equal(undefined);
    expect(day.sleepHours).to.equal(undefined);
    expect(Object.keys(day).sort()).to.eql(["cycleId", "date"]);
  });

  it("replaces re-scored days and sorts newest first", () => {
    const merged = WhoopData_mergeDays(
      [
        { date: "2026-10-24", cycleId: 1, recoveryScore: 20 },
        { date: "2026-10-25", cycleId: 2, recoveryScore: 30 },
      ],
      [{ date: "2026-10-25", cycleId: 2, recoveryScore: 41 }]
    );
    expect(merged.map((d) => [d.cycleId, d.recoveryScore])).to.eql([
      [2, 41],
      [1, 20],
    ]);
  });

  it("converts workouts with heart-rate zone minutes", () => {
    const [w] = WhoopData_toWorkouts(whoopFixture.workouts);
    expect(w.sport).to.equal("powerlifting");
    expect(w.end - w.start).to.equal(1.5 * hour);
    expect(w.zoneMinutes).to.eql([0, 10, 20, 0, 0, 0]);
  });

  it("leaves out fields WHOOP sends as null, because storage validation rejects them", () => {
    const workout = {
      ...whoopFixture.workouts[0],
      score: { ...whoopFixture.workouts[0].score, distance_meter: null as unknown as number },
    };
    const [w] = WhoopData_toWorkouts([workout]);
    expect(w).to.not.have.property("distanceM");
  });

  it("removes null WHOOP fields already saved on the phone", () => {
    const whoopWorkouts = [{ id: "a", start: 1, end: 2, distanceM: null as unknown as number }];
    const whoopDays = [{ date: "2026-11-01", cycleId: 1, spo2: null as unknown as number }];
    const storage = { integrations: { whoopDays, whoopWorkouts, bodyComposition: [] } } as unknown as IStorage;
    const migrated = migrations["20261102120000_drop_null_whoop_fields"](storage);
    expect(migrated.integrations?.whoopWorkouts).to.eql([{ id: "a", start: 1, end: 2 }]);
    expect(migrated.integrations?.whoopDays).to.eql([{ date: "2026-11-01", cycleId: 1 }]);
  });

  it("leaves storage without integrations alone", () => {
    const storage = { version: "1" } as unknown as IStorage;
    expect(migrations["20261102120000_drop_null_whoop_fields"](storage)).to.eql(storage);
  });
});

describe("WithingsData", () => {
  const groups = [
    {
      grpid: 7,
      date: 1761465600,
      measures: [
        { value: 70350, type: 1, unit: -3 },
        { value: 152, type: 6, unit: -1 },
        { value: 5612, type: 76, unit: -2 },
        { value: 7, type: 170, unit: 0 },
        { value: 42, type: 999, unit: 0 },
      ],
    },
  ];

  it("decodes value × 10^unit, names known types and keeps unknown ones", () => {
    const [entry] = WithingsData_toEntries(groups);
    expect(entry.timestamp).to.equal(1761465600000);
    expect(entry.values).to.eql({
      weightKg: 70.35,
      fatRatioPct: 15.2,
      muscleMassKg: 56.12,
      visceralFat: 7,
      type999: 42,
    });
    expect(IntegrationsSummary_bodyRows(entry).map((r) => r.name)).to.include.members(["Weight (kg)", "type999"]);
  });

  it("adds weight and body fat to stats once per timestamp", () => {
    const entries = WithingsData_toEntries(groups);
    const once = WithingsData_addToStats(Stats_getEmpty(), entries, 1);
    const twice = WithingsData_addToStats(once, entries, 2);
    expect(twice.weight.weight).to.have.length(1);
    expect(twice.weight.weight![0].value).to.eql(Weight_build(70.35, "kg"));
    expect(twice.percentage.bodyfat![0].value).to.eql({ value: 15.2, unit: "%" });
  });
});

describe("IntegrationsSync", () => {
  it("pages through WHOOP and Withings for connected services only", async () => {
    const calls: string[] = [];
    const fakeFetch: IIntegrationsFetch = async (url) => {
      calls.push(url);
      const u = new URL(url, "https://x");
      if (u.pathname === "/integrations/status") {
        return jsonResponse({ whoop: true, withings: true, configured: { whoop: true, withings: true } });
      }
      if (u.pathname === "/integrations/whoop/api") {
        const path = u.searchParams.get("path");
        if (path === "/v2/cycle") {
          return u.searchParams.get("nextToken")
            ? jsonResponse({ records: [whoopFixture.cycles[1]] })
            : jsonResponse({ records: [whoopFixture.cycles[0]], next_token: "page2" });
        }
        const key = {
          "/v2/recovery": "recoveries",
          "/v2/activity/sleep": "sleeps",
          "/v2/activity/workout": "workouts",
        }[path!] as "recoveries" | "sleeps" | "workouts";
        return jsonResponse({ records: whoopFixture[key] });
      }
      if (u.pathname === "/integrations/withings/measure") {
        return u.searchParams.get("offset")
          ? jsonResponse({ status: 0, body: { measuregrps: [{ grpid: 2, date: 2, measures: [] }], more: 0 } })
          : jsonResponse({
              status: 0,
              body: { measuregrps: [{ grpid: 1, date: 1, measures: [] }], more: 1, offset: 1 },
            });
      }
      return jsonResponse({}, 404);
    };
    const fetched = await IntegrationsSync_fetch(fakeFetch, "", "key", undefined);
    expect(fetched.whoop!.cycles.map((c) => c.id)).to.eql([2, 1]);
    expect(fetched.withings!.map((g) => g.grpid)).to.eql([1, 2]);
    expect(calls.some((c) => c.includes("start="))).to.equal(false);

    const applied = IntegrationsSync_apply(undefined, fetched, 1000);
    expect(applied.whoopDays).to.have.length(2);
    expect(applied.whoopWorkouts).to.have.length(1);
    expect(applied.bodyComposition).to.have.length(2);
    expect(applied.lastSyncTs).to.equal(1000);
  });

  it("asks only for data since 3 days before the last sync", async () => {
    const calls: string[] = [];
    const fakeFetch: IIntegrationsFetch = async (url) => {
      calls.push(url);
      if (url.includes("/status")) {
        return jsonResponse({ whoop: true, withings: false, configured: { whoop: true, withings: false } });
      }
      return jsonResponse({ records: [] });
    };
    const lastSync = Date.UTC(2026, 9, 20);
    await IntegrationsSync_fetch(fakeFetch, "https://lyteweight.pages.dev", "key", lastSync);
    expect(calls.every((c) => c.startsWith("https://lyteweight.pages.dev/integrations/"))).to.equal(true);
    expect(decodeURIComponent(calls[1])).to.include("start=2026-10-17T00:00:00.000Z");
    expect(calls.some((c) => c.includes("withings"))).to.equal(false);
  });

  it("is due when a key is set and the last sync is over an hour old", () => {
    const base = { whoopDays: [], whoopWorkouts: [], bodyComposition: [] };
    expect(IntegrationsSync_isDue(base, 10 * hour)).to.equal(false);
    expect(IntegrationsSync_isDue({ ...base, syncKey: "k" }, 10 * hour)).to.equal(true);
    expect(IntegrationsSync_isDue({ ...base, syncKey: "k", lastSyncTs: 9.5 * hour }, 10 * hour)).to.equal(false);
  });

  it("colors recovery like WHOOP", () => {
    expect([80, 50, 10, undefined].map(IntegrationsSummary_recoveryColor)).to.eql([
      "green",
      "yellow",
      "red",
      undefined,
    ]);
  });
});

describe("IntegrationsServer", () => {
  const env = (kv: IKv): IIntegrationsEnv => ({
    TOKENS: kv,
    SYNC_KEY: "secret-key",
    WHOOP_CLIENT_ID: "wid",
    WHOOP_CLIENT_SECRET: "wsecret",
    WITHINGS_CLIENT_ID: "nid",
    WITHINGS_CLIENT_SECRET: "nsecret",
  });
  const noFetch = async (): Promise<Response> => {
    throw new Error("unexpected fetch");
  };

  it("refuses to start a login without the sync key", async () => {
    const res = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/whoop/connect?key=wrong"),
      env(new FakeKv()),
      noFetch
    );
    expect(res.status).to.equal(403);
  });

  it("logs in with WHOOP: redirects with state, then trades the code for tokens", async () => {
    const kv = new FakeKv();
    const start = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/whoop/connect?key=secret-key"),
      env(kv),
      noFetch
    );
    expect(start.status).to.equal(302);
    const auth = new URL(start.headers.get("location")!);
    expect(auth.origin + auth.pathname).to.equal("https://api.prod.whoop.com/oauth/oauth2/auth");
    expect(auth.searchParams.get("redirect_uri")).to.equal("https://app.test/integrations/whoop/callback");
    expect(auth.searchParams.get("scope")).to.include("offline");
    const state = auth.searchParams.get("state")!;

    let tokenForm: URLSearchParams | undefined;
    const tokenFetch = async (_: string, init?: RequestInit): Promise<Response> => {
      tokenForm = new URLSearchParams(init!.body as string);
      return jsonResponse({ access_token: "a1", refresh_token: "r1", expires_in: 3600 });
    };
    const done = await IntegrationsServer_handle(
      new Request(`https://app.test/integrations/whoop/callback?code=c1&state=${state}`),
      env(kv),
      tokenFetch,
      1000
    );
    expect(done.status).to.equal(302);
    expect(done.headers.get("location")).to.equal("https://app.test/app/?connected=whoop");
    expect(tokenForm!.get("grant_type")).to.equal("authorization_code");
    expect(tokenForm!.get("client_secret")).to.equal("wsecret");
    expect(JSON.parse(kv.data.get("tokens:whoop")!)).to.eql({
      accessToken: "a1",
      refreshToken: "r1",
      expiresAt: 3601000,
    });

    const replay = await IntegrationsServer_handle(
      new Request(`https://app.test/integrations/whoop/callback?code=c1&state=${state}`),
      env(kv),
      tokenFetch
    );
    expect(replay.status).to.equal(400);
  });

  it("refreshes an expired Withings token, saves the rotated one, and proxies getmeas", async () => {
    const kv = new FakeKv();
    await kv.put("tokens:withings", JSON.stringify({ accessToken: "old", refreshToken: "r-old", expiresAt: 0 }));
    const requests: { url: string; body: URLSearchParams; auth?: string }[] = [];
    const fakeFetch = async (url: string, init?: RequestInit): Promise<Response> => {
      const headers = (init?.headers ?? {}) as Record<string, string>;
      requests.push({ url, body: new URLSearchParams(init?.body as string), auth: headers.authorization });
      if (url.endsWith("/v2/oauth2")) {
        return jsonResponse({ status: 0, body: { access_token: "new", refresh_token: "r-new", expires_in: 10800 } });
      }
      return jsonResponse({ status: 0, body: { measuregrps: [], more: 0 } });
    };
    const res = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/withings/measure?lastupdate=5", {
        headers: { "X-Sync-Key": "secret-key" },
      }),
      env(kv),
      fakeFetch,
      1000
    );
    expect(res.status).to.equal(200);
    expect(requests[0].body.get("grant_type")).to.equal("refresh_token");
    expect(requests[0].body.get("refresh_token")).to.equal("r-old");
    expect(requests[1].auth).to.equal("Bearer new");
    expect(requests[1].body.get("action")).to.equal("getmeas");
    expect(requests[1].body.get("lastupdate")).to.equal("5");
    expect(requests[1].body.has("meastypes")).to.equal(false);
    expect(JSON.parse(kv.data.get("tokens:withings")!).refreshToken).to.equal("r-new");
  });

  it("only proxies allowlisted WHOOP paths and needs the sync key", async () => {
    const kv = new FakeKv();
    await kv.put("tokens:whoop", JSON.stringify({ accessToken: "a", refreshToken: "r", expiresAt: Date.now() + hour }));
    const headers = { "X-Sync-Key": "secret-key" };
    const blocked = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/whoop/api?path=/v2/user/delete", { headers }),
      env(kv),
      noFetch
    );
    expect(blocked.status).to.equal(400);
    const noKey = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/whoop/api?path=/v2/recovery"),
      env(kv),
      noFetch
    );
    expect(noKey.status).to.equal(403);
    let called = "";
    const ok = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/whoop/api?path=/v2/recovery&limit=25&nextToken=t", { headers }),
      env(kv),
      async (url) => {
        called = url;
        return jsonResponse({ records: [] });
      }
    );
    expect(ok.status).to.equal(200);
    expect(called).to.equal("https://api.prod.whoop.com/developer/v2/recovery?limit=25&nextToken=t");
  });

  it("reports which services are connected and configured", async () => {
    const kv = new FakeKv();
    await kv.put("tokens:whoop", "{}");
    const res = await IntegrationsServer_handle(
      new Request("https://app.test/integrations/status", { headers: { "X-Sync-Key": "secret-key" } }),
      { ...env(kv), WITHINGS_CLIENT_SECRET: undefined },
      noFetch
    );
    expect(await res.json()).to.eql({ whoop: true, withings: false, configured: { whoop: true, withings: false } });
  });
});
