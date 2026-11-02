import { IWhoopDay, IWhoopWorkout } from "../types";

// Shapes of WHOOP developer API v2 records. Every field is optional because records that WHOOP hasn't scored
// yet (score_state "PENDING_SCORE" or "UNSCORABLE") come without a score.
export interface IWhoopApiRecovery {
  cycle_id: number;
  sleep_id?: string;
  score_state?: string;
  score?: {
    recovery_score?: number;
    resting_heart_rate?: number;
    hrv_rmssd_milli?: number;
    spo2_percentage?: number;
    skin_temp_celsius?: number;
  };
}

export interface IWhoopApiSleep {
  id: string;
  cycle_id?: number;
  start: string;
  end: string;
  nap?: boolean;
  score?: {
    stage_summary?: {
      total_in_bed_time_milli?: number;
      total_awake_time_milli?: number;
      total_light_sleep_time_milli?: number;
      total_slow_wave_sleep_time_milli?: number;
      total_rem_sleep_time_milli?: number;
      sleep_cycle_count?: number;
      disturbance_count?: number;
    };
    sleep_needed?: {
      baseline_milli?: number;
      need_from_sleep_debt_milli?: number;
      need_from_recent_strain_milli?: number;
      need_from_recent_nap_milli?: number;
    };
    respiratory_rate?: number;
    sleep_performance_percentage?: number;
    sleep_consistency_percentage?: number;
    sleep_efficiency_percentage?: number;
  };
}

export interface IWhoopApiCycle {
  id: number;
  start: string;
  end?: string;
  score?: { strain?: number; kilojoule?: number; average_heart_rate?: number; max_heart_rate?: number };
}

export interface IWhoopApiWorkout {
  id: string;
  start: string;
  end: string;
  sport_name?: string;
  score?: {
    strain?: number;
    average_heart_rate?: number;
    max_heart_rate?: number;
    kilojoule?: number;
    distance_meter?: number;
    zone_durations?: Record<string, number | undefined>;
  };
}

export interface IWhoopApiData {
  recoveries: IWhoopApiRecovery[];
  sleeps: IWhoopApiSleep[];
  cycles: IWhoopApiCycle[];
  workouts: IWhoopApiWorkout[];
}

const msPerHour = 60 * 60 * 1000;
const msPerMinute = 60 * 1000;

function hours(ms: number | undefined): number | undefined {
  return ms == null ? undefined : Math.round((ms / msPerHour) * 100) / 100;
}

function localDate(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number): string => `${n}`.padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function sleepFields(sleep: IWhoopApiSleep | undefined): Partial<IWhoopDay> {
  const score = sleep?.score;
  if (!score) {
    return {};
  }
  const stages = score.stage_summary ?? {};
  const need = score.sleep_needed ?? {};
  const asleepMs =
    stages.total_in_bed_time_milli != null
      ? stages.total_in_bed_time_milli - (stages.total_awake_time_milli ?? 0)
      : undefined;
  const needMs =
    need.baseline_milli != null
      ? need.baseline_milli +
        (need.need_from_sleep_debt_milli ?? 0) +
        (need.need_from_recent_strain_milli ?? 0) +
        (need.need_from_recent_nap_milli ?? 0)
      : undefined;
  return {
    sleepPerformance: score.sleep_performance_percentage,
    sleepEfficiency: score.sleep_efficiency_percentage,
    sleepConsistency: score.sleep_consistency_percentage,
    respiratoryRate: score.respiratory_rate,
    sleepHours: hours(asleepMs),
    inBedHours: hours(stages.total_in_bed_time_milli),
    lightHours: hours(stages.total_light_sleep_time_milli),
    deepHours: hours(stages.total_slow_wave_sleep_time_milli),
    remHours: hours(stages.total_rem_sleep_time_milli),
    awakeHours: hours(stages.total_awake_time_milli),
    sleepCycles: stages.sleep_cycle_count,
    disturbances: stages.disturbance_count,
    sleepNeedHours: hours(needMs),
    sleepDebtHours: hours(need.need_from_sleep_debt_milli),
  };
}

// WHOOP sends null for values it has no reading for, and VStorage rejects null, which blocks the app at startup.
export function WhoopData_withoutEmptyFields<T extends object>(obj: T): T {
  return Object.fromEntries(Object.entries(obj).filter(([, value]) => value != null)) as T;
}

/** One entry per WHOOP cycle (a "day" from one sleep to the next), dated by the morning the main sleep ended. */
export function WhoopData_toDays(data: IWhoopApiData): IWhoopDay[] {
  const sleepsById = new Map(data.sleeps.map((s) => [s.id, s]));
  const mainSleepByCycle = new Map(
    data.sleeps.filter((s) => !s.nap && s.cycle_id != null).map((s) => [s.cycle_id!, s])
  );
  const recoveriesByCycle = new Map(data.recoveries.map((r) => [r.cycle_id, r]));
  return data.cycles.map((cycle) => {
    const recovery = recoveriesByCycle.get(cycle.id);
    const sleep =
      (recovery?.sleep_id != null ? sleepsById.get(recovery.sleep_id) : undefined) ?? mainSleepByCycle.get(cycle.id);
    const score = recovery?.score;
    return WhoopData_withoutEmptyFields<IWhoopDay>({
      date: localDate(sleep?.end ?? cycle.start),
      cycleId: cycle.id,
      recoveryScore: score?.recovery_score,
      hrvMs: score?.hrv_rmssd_milli != null ? Math.round(score.hrv_rmssd_milli * 10) / 10 : undefined,
      restingHr: score?.resting_heart_rate,
      spo2: score?.spo2_percentage,
      skinTempC: score?.skin_temp_celsius,
      ...sleepFields(sleep),
      strain: cycle.score?.strain,
      kilojoule: cycle.score?.kilojoule,
      avgHr: cycle.score?.average_heart_rate,
      maxHr: cycle.score?.max_heart_rate,
    });
  });
}

export function WhoopData_toWorkouts(workouts: IWhoopApiWorkout[]): IWhoopWorkout[] {
  return workouts.map((w) => {
    const zones = w.score?.zone_durations;
    const zoneKeys = ["zero_milli", "one_milli", "two_milli", "three_milli", "four_milli", "five_milli"];
    return WhoopData_withoutEmptyFields<IWhoopWorkout>({
      id: w.id,
      start: new Date(w.start).getTime(),
      end: new Date(w.end).getTime(),
      sport: w.sport_name,
      strain: w.score?.strain,
      avgHr: w.score?.average_heart_rate,
      maxHr: w.score?.max_heart_rate,
      kilojoule: w.score?.kilojoule,
      distanceM: w.score?.distance_meter,
      zoneMinutes: zones ? zoneKeys.map((k) => Math.round(((zones[k] ?? 0) / msPerMinute) * 10) / 10) : undefined,
    });
  });
}

/** Newer entries replace older ones with the same cycle; the result is newest first. */
export function WhoopData_mergeDays(existing: IWhoopDay[], incoming: IWhoopDay[]): IWhoopDay[] {
  const byCycle = new Map(existing.map((d) => [d.cycleId, d]));
  for (const day of incoming) {
    byCycle.set(day.cycleId, day);
  }
  return Array.from(byCycle.values()).sort((a, b) =>
    a.date < b.date ? 1 : a.date > b.date ? -1 : b.cycleId - a.cycleId
  );
}

export function WhoopData_mergeWorkouts(existing: IWhoopWorkout[], incoming: IWhoopWorkout[]): IWhoopWorkout[] {
  const byId = new Map(existing.map((w) => [w.id, w]));
  for (const workout of incoming) {
    byId.set(workout.id, workout);
  }
  return Array.from(byId.values()).sort((a, b) => b.start - a.start);
}
