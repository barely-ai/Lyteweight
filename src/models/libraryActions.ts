import { lb } from "lens-shmens";
import { IDispatch } from "../ducks/types";
import { Thunk_importProgram } from "../ducks/thunks";
import { IHistoryRecord, ILibraryStorage } from "../types";
import { DeviceId_get } from "../utils/deviceId";
import { Dialog_confirm } from "../utils/dialog";
import { IState, updateState } from "./state";
import { Stats_getCurrentBodyweight } from "./stats";
import { Weight_convertTo } from "./weight";
import { IntegrationsActions_baseUrl } from "./integrationsActions";
import {
  ILibraryPublishForm,
  ProgramLibrary_emptyStorage,
  ProgramLibrary_libraryIdForProgram,
  ProgramLibrary_publishBody,
  ProgramLibrary_shortLink,
  ProgramLibrary_usagePing,
} from "./programLibrary";
import { LiftLeaderboard_workoutBody } from "./liftLeaderboard";
import { CardioLeaderboard_manualBody, CardioLeaderboard_whoopBodies } from "./cardioLeaderboard";
import {
  ILeaderboardBoard,
  ILeaderboardRow,
  ILibraryCoach,
  ILibraryProgramDetail,
  ILibraryProgramSummary,
  ILibrarySex,
  ILibraryWeeklyEntry,
} from "./libraryTypes";

const sentWhoopIdsKept = 200;
const usageConsentQuestion =
  "Share anonymous usage of community programs? Lyteweight sends the program, a random install id and the week " +
  "number when you finish a workout. It ranks programs by how long people run them. Nothing else is sent.";

function libraryHost(): string {
  return IntegrationsActions_baseUrl() || (typeof window !== "undefined" ? window.location.origin : "");
}

async function request<T>(
  path: string,
  init?: { method?: string; body?: unknown; headers?: Record<string, string> }
): Promise<T> {
  const response = await fetch(`${IntegrationsActions_baseUrl()}/library/${path}`, {
    method: init?.method ?? "GET",
    headers: { "content-type": "application/json", ...init?.headers },
    body: init?.body != null ? JSON.stringify(init.body) : undefined,
  });
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) {
    throw new Error(
      data.error === "not_configured"
        ? "The community library isn't set up on the server yet."
        : (data.error ?? `Request failed (${response.status}).`)
    );
  }
  return data;
}

function updateLibrary(dispatch: IDispatch, fn: (library: ILibraryStorage) => ILibraryStorage, desc: string): void {
  updateState(
    dispatch,
    [
      lb<IState>()
        .p("storage")
        .p("library")
        .recordModify((library) => fn(library ?? ProgramLibrary_emptyStorage())),
    ],
    desc
  );
}

export function LibraryActions_shortLink(libraryId: string): string {
  return ProgramLibrary_shortLink(libraryHost(), libraryId);
}

export async function LibraryActions_list(sort: "new" | "alltime" | "rated"): Promise<ILibraryProgramSummary[]> {
  return (await request<{ programs: ILibraryProgramSummary[] }>(`programs?sort=${sort}`)).programs;
}

export async function LibraryActions_weekly(): Promise<{ week: string; entries: ILibraryWeeklyEntry[] }> {
  return request("weekly");
}

export function LibraryActions_detail(libraryId: string): Promise<ILibraryProgramDetail> {
  return request(`programs/${libraryId}`);
}

export async function LibraryActions_coaches(): Promise<ILibraryCoach[]> {
  return (await request<{ coaches: ILibraryCoach[] }>("coaches")).coaches;
}

export async function LibraryActions_leaderboard(board: ILeaderboardBoard): Promise<ILeaderboardRow[]> {
  const query =
    board.kind === "strength"
      ? `board=strength&lift=${board.lift}&sex=${board.sex}${board.weightClass ? `&class=${board.weightClass}` : ""}`
      : board.kind === "volume"
        ? `board=volume${board.sex ? `&sex=${board.sex}` : ""}`
        : `board=cardio&sort=${board.sort}`;
  return (await request<{ rows: ILeaderboardRow[] }>(`leaderboard?${query}`)).rows;
}

export async function LibraryActions_publish(
  dispatch: IDispatch,
  state: IState,
  programId: string,
  form: ILibraryPublishForm
): Promise<{ ok: true; link: string } | { ok: false; errors: string[] }> {
  const program = state.storage.programs.find((p) => p.id === programId);
  if (!program) {
    return { ok: false, errors: ["Program not found."] };
  }
  const built = ProgramLibrary_publishBody(program, state.storage.settings, form);
  if (!built.ok) {
    return built;
  }
  const existing = state.storage.library?.publications.find((p) => p.programId === programId);
  if (existing) {
    await request(`programs/${existing.libraryId}`, {
      method: "PUT",
      body: built.body,
      headers: { "x-edit-key": existing.editKey },
    });
    return { ok: true, link: LibraryActions_shortLink(existing.libraryId) };
  }
  const { id, editKey } = await request<{ id: string; editKey: string }>("programs", {
    method: "POST",
    body: built.body,
  });
  updateLibrary(
    dispatch,
    (library) => ({
      ...library,
      displayName: library.displayName ?? form.author.trim(),
      publications: [...library.publications, { programId, libraryId: id, editKey }],
    }),
    "Library: publish program"
  );
  return { ok: true, link: LibraryActions_shortLink(id) };
}

export async function LibraryActions_unpublish(dispatch: IDispatch, state: IState, programId: string): Promise<void> {
  const publication = state.storage.library?.publications.find((p) => p.programId === programId);
  if (!publication) {
    return;
  }
  await request(`programs/${publication.libraryId}`, {
    method: "DELETE",
    headers: { "x-edit-key": publication.editKey },
  });
  updateLibrary(
    dispatch,
    (library) => ({ ...library, publications: library.publications.filter((p) => p.programId !== programId) }),
    "Library: unpublish program"
  );
}

export async function LibraryActions_add(
  dispatch: IDispatch,
  state: IState,
  detail: ILibraryProgramDetail
): Promise<void> {
  const libraryId = detail.summary.id;
  const programId = detail.exported.program.id;
  let usageConsent = state.storage.library?.usageConsent;
  if (usageConsent == null) {
    usageConsent = await Dialog_confirm(usageConsentQuestion);
  }
  dispatch(Thunk_importProgram({ decoded: JSON.stringify(detail.exported) }));
  updateLibrary(
    dispatch,
    (library) => ({
      ...library,
      usageConsent,
      imports: [...library.imports.filter((i) => i.programId !== programId), { programId, libraryId }],
    }),
    "Library: add program"
  );
  const installId = await DeviceId_get();
  await request(`programs/${libraryId}/added`, { method: "POST", body: { installId } }).catch(() => undefined);
}

export async function LibraryActions_rate(libraryId: string, stars: number): Promise<void> {
  await request(`programs/${libraryId}/rating`, { method: "POST", body: { installId: await DeviceId_get(), stars } });
}

export async function LibraryActions_comment(
  dispatch: IDispatch,
  state: IState,
  libraryId: string,
  displayName: string,
  body: string
): Promise<void> {
  const library = state.storage.library;
  await request(`programs/${libraryId}/comments`, {
    method: "POST",
    body: { installId: await DeviceId_get(), displayName, body, coachKey: library?.coachKey },
  });
  if (library?.displayName !== displayName.trim()) {
    updateLibrary(dispatch, (l) => ({ ...l, displayName: displayName.trim() }), "Library: set display name");
  }
}

export async function LibraryActions_report(kind: "program" | "comment" | "lifter", id: string): Promise<void> {
  const path =
    kind === "program"
      ? `programs/${id}/report`
      : kind === "comment"
        ? `comments/${id}/report`
        : `leaderboard/lifters/${id}`;
  await request(path, { method: "POST", body: { installId: await DeviceId_get() } });
}

export function LibraryActions_hideAuthor(dispatch: IDispatch, authorId: string): void {
  updateLibrary(
    dispatch,
    (library) => ({ ...library, hiddenAuthorIds: Array.from(new Set([...library.hiddenAuthorIds, authorId])) }),
    "Library: hide comment author"
  );
}

export function LibraryActions_setCoachKey(dispatch: IDispatch, coachKey: string): void {
  updateLibrary(dispatch, (library) => ({ ...library, coachKey: coachKey.trim() || undefined }), "Library: coach key");
}

export function LibraryActions_setUsageConsent(dispatch: IDispatch, usageConsent: boolean): void {
  updateLibrary(dispatch, (library) => ({ ...library, usageConsent }), "Library: usage consent");
}

export async function LibraryActions_recommend(state: IState, libraryId: string, note: string): Promise<void> {
  await request(`programs/${libraryId}/recommend`, {
    method: "POST",
    body: { coachKey: state.storage.library?.coachKey, note },
  });
}

function bodyweightKg(state: IState): number | undefined {
  const weight = Stats_getCurrentBodyweight(state.storage.stats);
  return weight ? Math.round(Weight_convertTo(weight, "kg").value * 10) / 10 : undefined;
}

export async function LibraryActions_joinLeaderboard(
  dispatch: IDispatch,
  state: IState,
  displayName: string,
  sex: ILibrarySex
): Promise<void> {
  const kg = bodyweightKg(state);
  if (kg == null) {
    throw new Error("Add your bodyweight under Me → Measurements first. The Strength board uses it for DOTS.");
  }
  await request("leaderboard/join", {
    method: "POST",
    body: { installId: await DeviceId_get(), displayName, sex, bodyweightKg: kg },
  });
  updateLibrary(
    dispatch,
    (library) => ({ ...library, displayName: displayName.trim(), leaderboard: { sex } }),
    "Library: join leaderboard"
  );
}

export function LibraryActions_leaveLeaderboard(dispatch: IDispatch): void {
  updateLibrary(dispatch, (library) => ({ ...library, leaderboard: undefined }), "Library: leave leaderboard");
}

export async function LibraryActions_addManualCardio(
  activity: string,
  minutes: number,
  effort: number
): Promise<{ ok: true } | { ok: false; errors: string[] }> {
  const built = CardioLeaderboard_manualBody(await DeviceId_get(), Date.now(), activity, minutes, effort);
  if (!built.ok) {
    return built;
  }
  await request("leaderboard/cardio", { method: "POST", body: built.body });
  return { ok: true };
}

export async function LibraryActions_afterWorkout(
  dispatch: IDispatch,
  state: IState,
  record: IHistoryRecord
): Promise<void> {
  const library = state.storage.library;
  if (!library) {
    return;
  }
  const installId = await DeviceId_get();
  const ping = ProgramLibrary_usagePing(record, library);
  if (ping) {
    await request(`programs/${ping.libraryId}/usage`, { method: "POST", body: { installId, week: ping.week } }).catch(
      () => undefined
    );
  }
  if (!library.leaderboard) {
    return;
  }
  const kg = bodyweightKg(state);
  const workout = kg != null ? LiftLeaderboard_workoutBody(record, kg, installId) : undefined;
  if (workout) {
    await request("leaderboard/workout", { method: "POST", body: workout }).catch(() => undefined);
  }
  const whoop = CardioLeaderboard_whoopBodies(
    installId,
    state.storage.integrations?.whoopWorkouts ?? [],
    library.sentWhoopWorkoutIds
  );
  const sent: string[] = [];
  for (const session of whoop) {
    const ok = await request("leaderboard/cardio", { method: "POST", body: session }).then(
      () => true,
      () => false
    );
    if (ok) {
      sent.push(session.sessionId.replace(/^w-/, ""));
    }
  }
  if (sent.length > 0) {
    updateLibrary(
      dispatch,
      (l) => ({ ...l, sentWhoopWorkoutIds: [...l.sentWhoopWorkoutIds, ...sent].slice(-sentWhoopIdsKept) }),
      "Library: WHOOP cardio sent"
    );
  }
}

export function LibraryActions_libraryIdForProgram(state: IState, programId: string): string | undefined {
  return ProgramLibrary_libraryIdForProgram(state.storage.library, programId);
}
