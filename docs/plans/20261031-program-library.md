# Program library — plan
*2026-10-31 · branch `claude/new-github-repository-n10hf0` · worktree: no*

- [x] 0 intake
- [x] 1 draft
- [ ] 2 codex arch (skipped: codex is not installed in this cloud session)
- [x] 3 approved (2026-10-31, all eight recommendations; lifter leaderboard added after approval)
- [ ] 4 contract (written, waiting for approval)
- [ ] 5 implement
- [ ] 6 verify
- [ ] 6b comment pass
- [ ] 7 reviews (codex unavailable: a self-review against the same two prompts replaces it)
- [ ] 8 triage
- [ ] 9 documented

## What the user gets

Anyone using Lyteweight can publish one of their programs to a shared library. Everyone else sees it under a new "Browse community programs" option, can search it by name or tag, preview it, and add it to their own programs with one tap. Each published program also gets a short link, `lyteweight.pages.dev/p/<id>`, to send to a friend. The publisher can update or remove their program later from the same phone. The owner can remove any program, and programs that 3 people report are hidden until the owner looks at them.

The library has three rankings, shown as three tabs:

- **Most run**: lifters × weeks. Each install that imported the program adds one point for every calendar week in which it finished at least one workout of that program. A program 10 people ran for 12 weeks scores 120, above one 50 people tried for 1 week (50).
- **Top rated**: 1 to 5 stars. A device can rate a program after it finished 3 workouts of it. The tab sorts by a Bayesian average (the mean pulled towards the library-wide mean by 5 phantom votes), so one 5-star vote does not beat forty 4.8-star votes.
- **Coach picks**: coaches the owner approves can recommend a program with a short note. Recommended programs show a coach badge and the note.

The library opens on **This week**, a weekly leaderboard. A program's weekly score is the number of installs that finished at least one of its workouts in that ISO week (Monday to Sunday, UTC). Ties break on the Top rated score. The top 10 render as infographic cards:

- the rank, with a change arrow against last week (▲3, ▼1, NEW)
- lifters this week, as a large number
- an 8-week sparkline of weekly lifters
- the star average and vote count
- the coach badge, if any coach recommends it
- the top 3 sit on a podium graphic above the list

Every program has a **comments** section. A comment shows the display name the commenter chose, the date, and a coach badge when a coach key signed it. Anyone who added the program can comment. Each comment has Report and Hide-this-person actions.

A **Coaches** tab lists approved coaches with their name, bio, a verified badge, and the programs they recommend with each note. The separate Coach picks tab folds into it.

A **Leaderboard** tab ranks lifters, separate from the program rankings. It has two sections, **Resistance** and **Cardio**. Joining is opt-in from the tab itself: the lifter picks a display name and their sex, and the app then sends a summary after each finished workout.

**Cardio** ranks by weekly **zone-minutes**: minutes in heart-rate zone 1 count ×1, zone 2 ×2, up to zone 5 ×5. Zones come from the lifter's own max heart rate, so a fit lifter and an unfit one get credit for the same relative effort. Calories show on each row but do not rank, because calories grow with body size: a 100 kg lifter burns about 40% more than a 70 kg lifter doing the same session. A second sort, "kcal per kg", divides calories by bodyweight to remove that gap.

Cardio data sources:

- WHOOP workouts already carry zone durations and kilojoules (`src/models/whoopData.ts`). A row from a wearable shows a watch icon.
- Manual entry: activity, minutes, and effort 1-10. Effort maps to a zone (1-2 → zone 1, 3-4 → 2, 5-6 → 3, 7-8 → 4, 9-10 → 5). A manual row shows a pencil icon and is capped at 600 zone-minutes per day.
- Apple Health workouts need the paid Apple developer account, so they wait for the App Store release.

The WHOOP connection is single-user today: the Cloudflare function holds one set of tokens, the owner's. Until the multi-user rework, other lifters can only log cardio by hand.

**Resistance** has two boards:

- **Strength**: ranked by DOTS (`src/models/dots.ts`, already used by Meet Prep), so a 67.5 kg lifter and a 100 kg lifter compete fairly. Filters for sex, IPF weight class, and lift (squat, bench, deadlift, total). A lift counts from completed sets of 5 reps or fewer, as an estimated 1RM with the existing RPE-aware `Weight_getOneRepMax`.
- **Volume this week**: total kilograms lifted (weight × reps over completed sets), reset every Monday UTC.

The top 3 of each board use the same podium graphic as the program rankings. The board shows the weight class, never the exact bodyweight.

Numbers are self-reported, so the server rejects implausible ones and flags sudden jumps:

- an estimated 1RM above the open raw world record for that sex and class is rejected
- a lift more than 15% above that lifter's previous best within 7 days is held as "pending" until the owner approves it
- every entry has a Report action, and the owner can remove a lifter

Final tab order: This week · All time · Top rated · Coaches · Leaderboard.

## How it works

The library lives in the same Cloudflare Pages project as the WHOOP and Withings sync. A new Pages Function answers `/library/*`. A Cloudflare D1 database (SQLite) stores programs, usage weeks, ratings, reports and coaches. The plan first used KV, but the KV free tier allows 1,000 writes per day, and usage pings write once per workout. D1 allows 100,000 writes and 5 million row reads per day, and sorts by score in SQL.

No accounts. The publish call returns a random edit key, and the publishing phone keeps it in storage. Whoever holds that key can update or delete that one program. Each install has a random install id (`DeviceId_get` already exists) that the usage and rating calls send. Coaches get a coach key from the owner and paste it into Settings once.

Usage sharing is opt-in. The first time someone imports a library program, a dialog asks to share anonymous usage for library programs. Only library program ids, the install id and the week number are sent. The privacy page `src/lyteweight-privacy.html` gets a paragraph saying so.

```
tables
  programs(id, name, author, description, tags, payload, edit_key_hash, published_at, updated_at, hidden)
  usage_weeks(program_id, install_id, week)            primary key all three: one row per install per week
  ratings(program_id, install_id, stars, updated_at)   primary key (program_id, install_id)
  reports(program_id, install_id)                      primary key both
  coaches(coach_key_hash, name, bio)
  recommendations(program_id, coach_key_hash, note)
  comments(id, program_id, install_id, display_name, coach_key_hash, body, created_at, hidden)
  comment_reports(comment_id, install_id)              hidden at 3 reports, owner can restore
  lifters(install_id, display_name, sex, weight_class, bodyweight_kg, hidden)
  lifter_bests(install_id, lift, e1rm_kg, achieved_at, status)     status: ok | pending
  lifter_volume(install_id, week, kg)                  primary key (install_id, week)
  cardio_sessions(id, install_id, week, activity, minutes, zone_minutes, kcal, source)   source: whoop | manual

weekly leaderboard (server SQL, cached 10 minutes with the Cache API)
  this week  = COUNT(DISTINCT install_id) FROM usage_weeks WHERE week = W GROUP BY program_id
  last week  = same for W-1, for the arrows
  sparkline  = same for W-7..W, one query grouped by (program_id, week) for the top 10 only

finish workout of a library program (phone, only if opted in)
  ProgramLibrary_usagePing(record, publications)       -> { programId, week } or nothing
  POST /library/programs/<id>/usage                    INSERT OR IGNORE usage_weeks

rankings (server SQL)
  most run    = COUNT(*) FROM usage_weeks GROUP BY program_id
  top rated   = (5 * mean_all + SUM(stars)) / (5 + COUNT(stars))
  coach picks = programs JOIN recommendations
  a rating is accepted only if usage_weeks has 3+ workouts from that install (counted by a workouts column)
```

Comments make Lyteweight a user-generated-content app under App Store guideline 1.2. Apple then requires four things, and the plan covers each: a word filter on posted text (a short blocklist in `ProgramLibrary_commentProblems`), a Report action, a way to block a person (Hide-this-person stores the install id locally and filters their comments out), and published contact details (the privacy page and the GitHub issues link). Comments are limited to 1000 characters and 30 per install per day.

Spam limits: 10 publishes per IP per day, 20 new install ids per IP per day, ratings only after 3 recorded workouts. Install ids are self-generated, so a determined person can still fake usage with many ids from many networks. The IP cap keeps that slow, and the owner can hide a program.

```
publish (phone)
  ProgramLibrary_publishPayload(program, settings, form)   -> validated body or error list
  POST /library/programs                                    -> { id, editKey }
  storage.libraryPublications += { programId, libraryId, editKey }

browse (phone)
  GET /library/programs                                     -> summaries (KV list metadata, one call)
  ProgramLibrary_filter(summaries, query, tag)              -> what the list shows
  GET /library/programs/<id>                                -> IExportedProgram
  Thunk_importProgram({ decoded: <exported program> })      -> existing import flow, same dialogs

short link
  /p/<id> on web             -> ImportExporter_handleUniversalLink -> library fetch -> Thunk_importProgram
  pasted into Import modal   -> same path on the iPhone app

server (Cloudflare Pages Function)
  POST   /library/programs          validate, rate-limit by IP, put prog:<id> with summary metadata
  GET    /library/programs          list prog:* metadata, drop hidden ones
  GET    /library/programs/<id>     get prog:<id>
  PUT    /library/programs/<id>     editKey or admin key
  DELETE /library/programs/<id>     editKey or admin key
  POST   /library/programs/<id>/report   reports += 1, hidden at 3
```

Edit keys and coach keys are stored as SHA-256 hashes, so a leaked database export cannot edit programs or post as a coach.

The server reuses the shape of `cloudflare/integrationsServer.ts`: a pure handler with its storage injected, and a thin `functions/library/[[path]].ts` entry. The handler takes a small `ILibraryDb` interface (prepare, bind, all, run), which D1 implements. Tests pass an in-memory SQLite (`better-sqlite3` or `sql.js`) behind the same interface, so the ranking SQL runs in mocha.

Import reuses `Thunk_importProgram`, which already asks to confirm, handles an id clash, converts lb to kg, and merges custom exercises.

```ts
export function Thunk_importProgram(importLinkData: IImportLinkData): IThunk {
  return async (dispatch, getState, env) => {
    const { decoded: maybeProgram, source, userid } = importLinkData;
    const result = await ImportExporter_getExportedProgram(env.service.client, maybeProgram, state.storage.settings);
    ...
      if (!(await Dialog_confirm(`Do you want to import program ${newProgram.name}?`))) {
```

Publishing builds its body from `Program_exportProgram`, the same payload the long share link carries.

```ts
export function Program_exportProgram(program: IProgram, settings: ISettings, version?: string): IExportedProgram {
  ...
  return { customExercises, program, version: version || getLatestMigrationVersion(),
    settings: ObjectUtils_pick(settings, ["units", "timers", "planner"]) };
}
```

`storage.libraryPublications` is a new optional `IStorage` field, added the way `meetProfile` was: an optional valibot entry, no storage-version bump. Lyteweight runs local-only, so there is no server sync and no watch filtering to update.

```ts
  meetProfile?: IMeetProfile;
  ...
  meetProfile: v.optional(_VMeetProfile),
```

Limits enforced on the server: 256 KB per program, name 80 characters, description 2000, 5 tags, coach note 280. The browse list pages 50 programs at a time.

## The contract (API · types · state)

### Shared types — `src/models/libraryTypes.ts`

Imported by the app and by the Cloudflare server, so both sides agree on the wire format.

```ts
export type ILibraryLift = "squat" | "bench" | "deadlift";
export type ILibrarySex = "male" | "female";

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

export interface ILibraryWeeklyEntry {
  program: ILibraryProgramSummary;
  rank: number;
  change: { kind: "up" | "down"; by: number } | { kind: "same" } | { kind: "new" };
  liftersThisWeek: number;
  sparkline: number[];
}

export interface ILibraryComment {
  id: string;
  installId: string;
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

export interface ILibraryPublishBody {
  exported: IExportedProgram;
  name: string;
  author: string;
  description: string;
  tags: string[];
  ownsRights: true;
}

export interface ILeaderboardWorkoutBody {
  installId: string;
  week: string;
  bodyweightKg: number;
  bests: Partial<Record<ILibraryLift, number>>;
  volumeKg: number;
}

export interface ICardioSessionBody {
  installId: string;
  week: string;
  activity: string;
  minutes: number;
  zoneMinutes: number;
  kcal?: number;
  source: "whoop" | "manual";
}

export interface ILeaderboardRow {
  rank: number;
  displayName: string;
  weightClass: string;
  value: number;
  detail: string;
  source?: "whoop" | "manual";
}
```

### App, pure logic

`src/models/programLibrary.ts`, tested in `test/programLibrary.test.ts`:

```ts
export function ProgramLibrary_isoWeek(ts: number): string;
export function ProgramLibrary_publishBody(
  program: IProgram, settings: ISettings, form: ILibraryPublishForm
): { ok: true; body: ILibraryPublishBody } | { ok: false; errors: string[] };
export function ProgramLibrary_filter(
  programs: ILibraryProgramSummary[], query: string, tag?: string
): ILibraryProgramSummary[];
export function ProgramLibrary_usagePing(
  record: IHistoryRecord, library: ILibraryStorage | undefined
): { libraryId: string; week: string } | undefined;
export function ProgramLibrary_textProblems(text: string, maxLength: number): string[];
export function ProgramLibrary_visibleComments(
  comments: ILibraryComment[], hiddenInstallIds: string[]
): ILibraryComment[];
export function ProgramLibrary_shortLink(host: string, libraryId: string): string;
export function ProgramLibrary_idFromLink(link: string): string | undefined;
```

`src/models/liftLeaderboard.ts`, tested in `test/liftLeaderboard.test.ts`:

```ts
export function LiftLeaderboard_workoutBody(
  record: IHistoryRecord, settings: ISettings, bodyweightKg: number, installId: string
): ILeaderboardWorkoutBody | undefined;
export function LiftLeaderboard_weightClass(bodyweightKg: number, sex: ILibrarySex): string;
export function LiftLeaderboard_worldRecordKg(lift: ILibraryLift | "total", sex: ILibrarySex, weightClass: string): number;
```

`src/models/cardioLeaderboard.ts`, tested in `test/cardioLeaderboard.test.ts`:

```ts
export function CardioLeaderboard_zoneMinutes(minutesPerZone: number[]): number;
export function CardioLeaderboard_effortZone(effort: number): number;
export function CardioLeaderboard_manualBody(
  installId: string, now: number, activity: string, minutes: number, effort: number
): { ok: true; body: ICardioSessionBody } | { ok: false; errors: string[] };
export function CardioLeaderboard_whoopBodies(
  installId: string, workouts: IWhoopWorkout[], alreadySentIds: string[]
): ICardioSessionBody[];
```

### App, effects

`src/api/libraryApi.ts`: one thin `fetch` wrapper per server route, named `LibraryApi_<route>`, no decisions.

New thunks in `src/ducks/thunks.ts`:

```ts
export function Thunk_libraryPublish(programId: string, form: ILibraryPublishForm): IThunk;
export function Thunk_libraryUnpublish(programId: string): IThunk;
export function Thunk_libraryImport(libraryId: string): IThunk;
export function Thunk_libraryAfterWorkout(record: IHistoryRecord): IThunk;
export function Thunk_libraryAddManualCardio(activity: string, minutes: number, effort: number): IThunk;
```

`Thunk_libraryAfterWorkout` runs from the same place the finish-workout flow runs its other after-workout effects. It sends the usage ping, the leaderboard workout body and new WHOOP cardio sessions, each only if the user opted in.

### Server

`cloudflare/libraryServer.ts`, tested in `test/libraryServer.test.ts` against an in-memory SQLite (`sql.js`, new dev dependency) behind the D1 interface:

```ts
export interface ILibraryDb {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      all<T>(): Promise<{ results: T[] }>;
      first<T>(): Promise<T | null>;
      run(): Promise<unknown>;
    };
  };
  batch(statements: unknown[]): Promise<unknown>;
}
export interface ILibraryEnv { LIBRARY_DB?: ILibraryDb; LIBRARY_ADMIN_KEY?: string; }
export const LibraryServer_schema: string;
export async function LibraryServer_handle(request: Request, env: ILibraryEnv, now: number): Promise<Response>;
```

`cloudflare/libraryRanking.ts`, tested in `test/libraryRanking.test.ts`:

```ts
export function LibraryRanking_bayesian(sum: number, count: number, globalMean: number, priorVotes: number): number;
export function LibraryRanking_weekly(
  thisWeek: { programId: string; lifters: number }[],
  lastWeek: { programId: string; lifters: number }[],
  history: { programId: string; week: string; lifters: number }[],
  weeks: string[]
): { programId: string; rank: number; change: ILibraryWeeklyEntry["change"]; liftersThisWeek: number; sparkline: number[] }[];
export function LibraryRanking_strengthRows(...): ILeaderboardRow[];
```

`functions/library/[[path]].ts`: a 3-line entry, the same shape as `functions/integrations/[[path]].ts`. `_redirects` gets `/p/:id /app/?library=:id 302`.

### State

All new persisted state sits under one optional `IStorage` field, added like `meetProfile`: optional valibot entry, no storage-version bump, no sync or watch path in local-only mode.

```ts
export interface ILibraryStorage {
  publications: { programId: string; libraryId: string; editKey: string }[];
  imports: { programId: string; libraryId: string }[];
  usageConsent?: boolean;
  hiddenInstallIds: string[];
  displayName?: string;
  coachKey?: string;
  leaderboard?: { sex: ILibrarySex };
  sentWhoopWorkoutIds: string[];
}
// IStorage: library?: ILibraryStorage;
```

- `imports` maps a local program to its library id, so usage pings and ratings know which library program a workout belongs to.
- `sentWhoopWorkoutIds` keeps the last 200 ids, so a WHOOP workout is sent once.
- Screen state (`useState`): the active tab, the search text, the publish form fields, the comment draft. All reset when the screen closes.

### Screens

Views render and run effects. Each one's logic lives in the modules above.

- `src/components/screenLibrary.tsx`: the five tabs, the podium and weekly cards, the Coaches list, the Leaderboard with its Resistance and Cardio switch.
- `src/components/screenLibraryProgram.tsx`: the preview, Add, the star rating, comments, Report and Hide-this-person.
- `src/components/modalLibraryPublish.tsx` and `src/components/modalCardioEntry.tsx`.
- Entry points: a "Browse community programs" option in `screenProgramSelect.tsx`, a "Community" row in Settings, and "Publish to library" in the program menu (`bottomSheetEditProgramV2.tsx`).
- Navigation: `library` and `libraryProgram` screens and two modals, registered in both `AppNavigator.tsx` and `AppNavigator.native.tsx`, typed in `src/navigation/types.ts`.

### Tests

- `test/programLibrary.test.ts` (new)
- `test/liftLeaderboard.test.ts` (new)
- `test/cardioLeaderboard.test.ts` (new)
- `test/libraryRanking.test.ts` (new)
- `test/libraryServer.test.ts` (new): publish, list, edit-key auth, admin delete, usage dedupe per week, rating gate at 3 workouts, report hiding at 3, comment filter, world-record rejection, 15% jump hold, rate limits.

## What we're not doing

- Accounts, profiles, ratings or comments.
- Live sync: an imported program is a copy, and a later update by the publisher does not change it.
- Copying programs from Boostcamp or other apps. Publishers confirm they wrote the program or that it is freely published.
- Android: the screens are shared React Native code, but nobody has built the Android app for Lyteweight.

## Open questions

- Accounts or edit keys? Recommendation: edit keys. An account system is about 2 more days of work and needs password reset and email.
- Report threshold before a program is hidden? Recommendation: 3 reports.
- Should the owner see a moderation screen in the app, or remove programs with one command? Recommendation: one command for now (`curl` with the admin key), a screen later if the library grows.
- Who becomes a coach? Recommendation: the owner creates each coach key with one command, after checking the person. Self-signup coaches would make the badge meaningless.
- Usage sharing on or off by default? Recommendation: ask once on the first library import. Apple's review requires disclosure of usage collection, and asking covers it.
- Most run over all time or recent? Recommendation: all time, with "N lifters this month" shown under each program.
- Shareable weekly image (a "Top 10 this week" picture for Instagram)? Recommendation: later. The in-app infographic cards come first, and the image reuses them in about 2 hours.
- Who can comment? Recommendation: anyone who added the program, so a comment comes from someone who saw it.
- Lifter leaderboard metrics? Recommendation: Strength ranked by DOTS plus Volume this week.
- Cardio ranking? Recommendation: zone-minutes, calories shown, kcal per kg as a second sort. Manual entries allowed with a pencil icon and a daily cap.
- Lifter leaderboard cheating? Recommendation: world-record cap, 15% jump hold, report button. Video proof for the top 10 can come later.

## Codex

Not run. Codex is not installed in this cloud session.
