// Server half of the program library and the leaderboards, running as a Cloudflare Pages Function next to
// the integrations. All state lives in one D1 (SQLite) database. Design and limits:
// docs/plans/20261031-program-library.md.

import {
  ICardioSessionBody,
  ILeaderboardJoinBody,
  ILeaderboardWorkoutBody,
  ILibraryCoach,
  ILibraryComment,
  ILibraryLift,
  ILibraryProgramDetail,
  ILibraryProgramSummary,
  ILibraryPublishBody,
  ILibrarySex,
  ILibraryWeeklyEntry,
} from "../src/models/libraryTypes";
import {
  LibraryRules_capKg,
  LibraryRules_isoWeek,
  LibraryRules_limits,
  LibraryRules_liftStatus,
  LibraryRules_normalizeTags,
  LibraryRules_previousWeeks,
  LibraryRules_textProblems,
} from "../src/models/libraryRules";
import {
  LibraryRanking_bayesian,
  LibraryRanking_cardioRows,
  LibraryRanking_strengthRows,
  LibraryRanking_volumeRows,
  LibraryRanking_weekly,
  ILifterBests,
} from "./libraryRanking";

export interface ILibraryBoundStatement {
  all<T>(): Promise<{ results: T[] }>;
  first<T>(): Promise<T | null>;
  run(): Promise<unknown>;
}

export interface ILibraryDb {
  prepare(sql: string): { bind(...values: unknown[]): ILibraryBoundStatement };
}

export interface ILibraryEnv {
  LIBRARY_DB?: ILibraryDb;
  LIBRARY_ADMIN_KEY?: string;
}

export const LibraryServer_schema: string[] = [
  `CREATE TABLE IF NOT EXISTS programs (id TEXT PRIMARY KEY, name TEXT NOT NULL, author TEXT NOT NULL,
    description TEXT NOT NULL, tags TEXT NOT NULL, payload TEXT NOT NULL, edit_key_hash TEXT NOT NULL,
    published_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0,
    reports INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS installs (install_id TEXT PRIMARY KEY, first_seen INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS program_adds (program_id TEXT NOT NULL, install_id TEXT NOT NULL,
    PRIMARY KEY (program_id, install_id))`,
  `CREATE TABLE IF NOT EXISTS usage_weeks (program_id TEXT NOT NULL, install_id TEXT NOT NULL, week TEXT NOT NULL,
    workouts INTEGER NOT NULL, PRIMARY KEY (program_id, install_id, week))`,
  `CREATE INDEX IF NOT EXISTS usage_weeks_week ON usage_weeks (week)`,
  `CREATE TABLE IF NOT EXISTS ratings (program_id TEXT NOT NULL, install_id TEXT NOT NULL, stars INTEGER NOT NULL,
    updated_at INTEGER NOT NULL, PRIMARY KEY (program_id, install_id))`,
  `CREATE TABLE IF NOT EXISTS program_reports (program_id TEXT NOT NULL, install_id TEXT NOT NULL,
    PRIMARY KEY (program_id, install_id))`,
  `CREATE TABLE IF NOT EXISTS coaches (id TEXT PRIMARY KEY, key_hash TEXT NOT NULL UNIQUE, name TEXT NOT NULL,
    bio TEXT NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS recommendations (program_id TEXT NOT NULL, coach_id TEXT NOT NULL, note TEXT NOT NULL,
    PRIMARY KEY (program_id, coach_id))`,
  `CREATE TABLE IF NOT EXISTS comments (id TEXT PRIMARY KEY, program_id TEXT NOT NULL, install_id TEXT NOT NULL,
    author_id TEXT NOT NULL, display_name TEXT NOT NULL, coach_id TEXT, body TEXT NOT NULL,
    created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0)`,
  `CREATE INDEX IF NOT EXISTS comments_program ON comments (program_id, created_at)`,
  `CREATE TABLE IF NOT EXISTS comment_reports (comment_id TEXT NOT NULL, install_id TEXT NOT NULL,
    PRIMARY KEY (comment_id, install_id))`,
  `CREATE TABLE IF NOT EXISTS lifters (install_id TEXT PRIMARY KEY, lifter_id TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL, sex TEXT NOT NULL, bodyweight_kg REAL NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0, reports INTEGER NOT NULL DEFAULT 0)`,
  `CREATE TABLE IF NOT EXISTS lifter_reports (lifter_id TEXT NOT NULL, install_id TEXT NOT NULL,
    PRIMARY KEY (lifter_id, install_id))`,
  `CREATE TABLE IF NOT EXISTS lifter_workouts (install_id TEXT NOT NULL, workout_id TEXT NOT NULL,
    PRIMARY KEY (install_id, workout_id))`,
  `CREATE TABLE IF NOT EXISTS lifter_bests (install_id TEXT NOT NULL, lift TEXT NOT NULL, ok_kg REAL,
    pending_kg REAL, updated_at INTEGER NOT NULL, PRIMARY KEY (install_id, lift))`,
  `CREATE TABLE IF NOT EXISTS lifter_volume (install_id TEXT NOT NULL, week TEXT NOT NULL, kg REAL NOT NULL,
    PRIMARY KEY (install_id, week))`,
  `CREATE TABLE IF NOT EXISTS cardio_sessions (install_id TEXT NOT NULL, session_id TEXT NOT NULL,
    week TEXT NOT NULL, day TEXT NOT NULL, activity TEXT NOT NULL, minutes INTEGER NOT NULL,
    zone_minutes REAL NOT NULL, kcal REAL, source TEXT NOT NULL, PRIMARY KEY (install_id, session_id))`,
  `CREATE INDEX IF NOT EXISTS cardio_sessions_week ON cardio_sessions (week)`,
  `CREATE TABLE IF NOT EXISTS rate_limits (bucket TEXT NOT NULL, day TEXT NOT NULL, count INTEGER NOT NULL,
    PRIMARY KEY (bucket, day))`,
];

const reportsToHide = 3;
const workoutsToRate = 3;
// Every program starts as if it had 5 votes of 3 stars. The library-wide mean was the first choice, but when
// most ratings are high it is high too, and then a single 5-star vote beat eight 4-star votes.
const priorVotes = 5;
const priorStars = 3;
const weeklyTop = 10;
const sparklineWeeks = 8;
const boardSize = 100;
const maxPublishesPerIpPerDay = 10;
const maxNewInstallsPerIpPerDay = 20;
const maxCommentsPerInstallPerDay = 30;
const maxWorkoutsPerInstallWeek = 14;
const maxVolumeKgPerWorkout = 100000;
const installIdPattern = /^[A-Za-z0-9_-]{8,64}$/;
const weekPattern = /^\d{4}-W\d{2}$/;

const readyDbs = new WeakSet<object>();

class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
  }
}

function json(body: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

async function sha256(text: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

function randomId(length: number): string {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

function publicId(installId: string): Promise<string> {
  return sha256(`public:${installId}`).then((hash) => hash.slice(0, 16));
}

function sameSecret(expected: string | undefined, given: string | null): boolean {
  if (!expected || given == null || expected.length !== given.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) {
    diff += expected.charCodeAt(i) === given.charCodeAt(i) ? 0 : 1;
  }
  return diff === 0;
}

function utcDay(now: number): string {
  return new Date(now).toISOString().slice(0, 10);
}

function clientIp(request: Request): string {
  return request.headers.get("cf-connecting-ip") ?? "unknown";
}

async function readBody<T>(request: Request, maxBytes: number): Promise<T> {
  const text = await request.text();
  if (text.length > maxBytes) {
    throw new HttpError(413, "Too large.");
  }
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new HttpError(400, "Invalid JSON.");
  }
}

function requireText(value: unknown, maxLength: number, label: string): string {
  const problems = LibraryRules_textProblems(typeof value === "string" ? value : "", maxLength);
  if (problems.length > 0) {
    throw new HttpError(400, `${label}: ${problems.join(" ")}`);
  }
  return (value as string).trim();
}

function requireInstallId(value: unknown): string {
  if (typeof value !== "string" || !installIdPattern.test(value)) {
    throw new HttpError(400, "Invalid install id.");
  }
  return value;
}

function requireSex(value: unknown): ILibrarySex {
  if (value !== "male" && value !== "female") {
    throw new HttpError(400, "Sex must be male or female.");
  }
  return value;
}

function requireRecentWeek(value: unknown, now: number): string {
  const current = LibraryRules_isoWeek(now);
  const allowed = new Set(LibraryRules_previousWeeks(current, 2));
  if (typeof value !== "string" || !weekPattern.test(value) || !allowed.has(value)) {
    throw new HttpError(400, "Only this week and last week can be reported.");
  }
  return value;
}

class LibraryStore {
  constructor(
    private readonly db: ILibraryDb,
    private readonly now: number
  ) {}

  public async ensureSchema(): Promise<void> {
    if (readyDbs.has(this.db)) {
      return;
    }
    for (const statement of LibraryServer_schema) {
      await this.run(statement);
    }
    readyDbs.add(this.db);
  }

  public async all<T>(sql: string, ...values: unknown[]): Promise<T[]> {
    return (
      await this.db
        .prepare(sql)
        .bind(...values)
        .all<T>()
    ).results;
  }

  public first<T>(sql: string, ...values: unknown[]): Promise<T | null> {
    return this.db
      .prepare(sql)
      .bind(...values)
      .first<T>();
  }

  public async run(sql: string, ...values: unknown[]): Promise<void> {
    await this.db
      .prepare(sql)
      .bind(...values)
      .run();
  }

  public async withinLimit(bucket: string, max: number): Promise<boolean> {
    const row = await this.first<{ count: number }>(
      `INSERT INTO rate_limits (bucket, day, count) VALUES (?, ?, 1)
       ON CONFLICT (bucket, day) DO UPDATE SET count = count + 1 RETURNING count`,
      bucket,
      utcDay(this.now)
    );
    return (row?.count ?? 0) <= max;
  }

  public async registerInstall(installId: string, ip: string): Promise<void> {
    if (await this.first("SELECT install_id FROM installs WHERE install_id = ?", installId)) {
      return;
    }
    if (!(await this.withinLimit(`newinstall:${ip}`, maxNewInstallsPerIpPerDay))) {
      throw new HttpError(429, "Too many new installs from this network today.");
    }
    await this.run("INSERT OR IGNORE INTO installs (install_id, first_seen) VALUES (?, ?)", installId, this.now);
  }

  public async insertedNew(sql: string, ...values: unknown[]): Promise<boolean> {
    return (await this.first(`${sql} ON CONFLICT DO NOTHING RETURNING 1 AS inserted`, ...values)) != null;
  }
}

interface ISummaryRow {
  id: string;
  name: string;
  author: string;
  description: string;
  tags: string;
  published_at: number;
  updated_at: number;
  lifter_weeks: number;
  lifters_month: number;
  stars_sum: number;
  stars_count: number;
}

async function summaries(store: LibraryStore, now: number, id?: string): Promise<ILibraryProgramSummary[]> {
  const monthStart = LibraryRules_previousWeeks(LibraryRules_isoWeek(now), 5)[0];
  const rows = await store.all<ISummaryRow>(
    `SELECT p.id, p.name, p.author, p.description, p.tags, p.published_at, p.updated_at,
       (SELECT COUNT(*) FROM usage_weeks u WHERE u.program_id = p.id) AS lifter_weeks,
       (SELECT COUNT(DISTINCT u.install_id) FROM usage_weeks u WHERE u.program_id = p.id AND u.week >= ?) AS lifters_month,
       (SELECT COALESCE(SUM(r.stars), 0) FROM ratings r WHERE r.program_id = p.id) AS stars_sum,
       (SELECT COUNT(*) FROM ratings r WHERE r.program_id = p.id) AS stars_count
     FROM programs p WHERE p.hidden = 0 AND p.reports < ? ${id ? "AND p.id = ?" : ""}`,
    ...(id ? [monthStart, reportsToHide, id] : [monthStart, reportsToHide])
  );
  const picks = await store.all<{ program_id: string; note: string; coach_name: string }>(
    `SELECT r.program_id, r.note, c.name AS coach_name FROM recommendations r JOIN coaches c ON c.id = r.coach_id`
  );
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    author: row.author,
    description: row.description,
    tags: JSON.parse(row.tags) as string[],
    publishedAt: row.published_at,
    updatedAt: row.updated_at,
    lifterWeeks: row.lifter_weeks,
    liftersThisMonth: row.lifters_month,
    starsAverage: row.stars_count > 0 ? Math.round((row.stars_sum / row.stars_count) * 10) / 10 : undefined,
    starsCount: row.stars_count,
    coachPicks: picks.filter((p) => p.program_id === row.id).map((p) => ({ coachName: p.coach_name, note: p.note })),
  }));
}

function ratingScores(programs: ILibraryProgramSummary[]): Record<string, number> {
  const scores: Record<string, number> = {};
  for (const p of programs) {
    const sum = (p.starsAverage ?? 0) * p.starsCount;
    scores[p.id] = LibraryRanking_bayesian(sum, p.starsCount, priorStars, priorVotes);
  }
  return scores;
}

async function listPrograms(store: LibraryStore, now: number, sort: string | null): Promise<Response> {
  const programs = await summaries(store, now);
  if (sort === "rated") {
    const scores = ratingScores(programs);
    programs.sort((a, b) => scores[b.id] - scores[a.id]);
  } else if (sort === "alltime") {
    programs.sort((a, b) => b.lifterWeeks - a.lifterWeeks || b.publishedAt - a.publishedAt);
  } else {
    programs.sort((a, b) => b.publishedAt - a.publishedAt);
  }
  return json({ programs: programs.slice(0, 500) });
}

async function weekly(store: LibraryStore, now: number): Promise<Response> {
  const current = LibraryRules_isoWeek(now);
  const weeks = LibraryRules_previousWeeks(current, sparklineWeeks);
  const programs = await summaries(store, now);
  const visible = new Map(programs.map((p) => [p.id, p]));
  const counts = (
    await store.all<{ program_id: string; week: string; lifters: number }>(
      `SELECT program_id, week, COUNT(DISTINCT install_id) AS lifters FROM usage_weeks WHERE week >= ?
       GROUP BY program_id, week`,
      weeks[0]
    )
  ).filter((c) => visible.has(c.program_id));
  const forWeek = (week: string): { programId: string; lifters: number }[] =>
    counts.filter((c) => c.week === week).map((c) => ({ programId: c.program_id, lifters: c.lifters }));
  const ranks = LibraryRanking_weekly(
    forWeek(current),
    forWeek(weeks[weeks.length - 2]),
    counts.map((c) => ({ programId: c.program_id, week: c.week, lifters: c.lifters })),
    weeks,
    ratingScores(programs),
    weeklyTop
  );
  const entries: ILibraryWeeklyEntry[] = ranks.map((r) => ({
    program: visible.get(r.programId)!,
    rank: r.rank,
    change: r.change,
    liftersThisWeek: r.liftersThisWeek,
    sparkline: r.sparkline,
  }));
  return json({ week: current, entries });
}

async function programDetail(store: LibraryStore, now: number, id: string): Promise<Response> {
  const [summary] = await summaries(store, now, id);
  const payload = await store.first<{ payload: string }>("SELECT payload FROM programs WHERE id = ?", id);
  if (!summary || !payload) {
    throw new HttpError(404, "Program not found.");
  }
  const comments = await store.all<{
    id: string;
    author_id: string;
    display_name: string;
    coach_id: string | null;
    body: string;
    created_at: number;
  }>(
    `SELECT id, author_id, display_name, coach_id, body, created_at FROM comments
     WHERE program_id = ? AND hidden = 0 AND reports < ? ORDER BY created_at DESC LIMIT 200`,
    id,
    reportsToHide
  );
  const detail: ILibraryProgramDetail = {
    summary,
    exported: JSON.parse(payload.payload),
    comments: comments.map(
      (c): ILibraryComment => ({
        id: c.id,
        authorId: c.author_id,
        displayName: c.display_name,
        isCoach: c.coach_id != null,
        body: c.body,
        createdAt: c.created_at,
      })
    ),
  };
  return json(detail);
}

function validatedPublish(body: ILibraryPublishBody): {
  name: string;
  author: string;
  description: string;
  tags: string[];
  payload: string;
} {
  const limits = LibraryRules_limits;
  if (body.ownsRights !== true) {
    throw new HttpError(400, "Confirm you wrote this program or that it is freely published.");
  }
  if (typeof body.exported !== "object" || body.exported == null || typeof body.exported.program !== "object") {
    throw new HttpError(400, "Missing program.");
  }
  const tags = LibraryRules_normalizeTags(Array.isArray(body.tags) ? body.tags.map(String) : []);
  if (tags.length > limits.tags || tags.some((t) => t.length > limits.tag)) {
    throw new HttpError(400, `Use at most ${limits.tags} tags of ${limits.tag} characters.`);
  }
  const description = typeof body.description === "string" ? body.description.trim() : "";
  if (description) {
    requireText(description, limits.description, "Description");
  }
  return {
    name: requireText(body.name, limits.name, "Name"),
    author: requireText(body.author, limits.author, "Your name"),
    description,
    tags,
    payload: JSON.stringify(body.exported),
  };
}

async function canEdit(store: LibraryStore, env: ILibraryEnv, request: Request, id: string): Promise<boolean> {
  if (sameSecret(env.LIBRARY_ADMIN_KEY, request.headers.get("x-admin-key"))) {
    return true;
  }
  const editKey = request.headers.get("x-edit-key");
  const row = await store.first<{ edit_key_hash: string }>("SELECT edit_key_hash FROM programs WHERE id = ?", id);
  return row != null && editKey != null && row.edit_key_hash === (await sha256(editKey));
}

function isAdmin(env: ILibraryEnv, request: Request): boolean {
  return sameSecret(env.LIBRARY_ADMIN_KEY, request.headers.get("x-admin-key"));
}

async function publish(store: LibraryStore, request: Request, now: number): Promise<Response> {
  const fields = validatedPublish(await readBody<ILibraryPublishBody>(request, LibraryRules_limits.programBytes));
  if (!(await store.withinLimit(`publish:${clientIp(request)}`, maxPublishesPerIpPerDay))) {
    throw new HttpError(429, "Too many publishes from this network today.");
  }
  const id = randomId(8);
  const editKey = randomId(32);
  await store.run(
    `INSERT INTO programs (id, name, author, description, tags, payload, edit_key_hash, published_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    fields.name,
    fields.author,
    fields.description,
    JSON.stringify(fields.tags),
    fields.payload,
    await sha256(editKey),
    now,
    now
  );
  return json({ id, editKey }, 201);
}

async function updateProgram(store: LibraryStore, request: Request, now: number, id: string): Promise<Response> {
  const fields = validatedPublish(await readBody<ILibraryPublishBody>(request, LibraryRules_limits.programBytes));
  await store.run(
    `UPDATE programs SET name = ?, author = ?, description = ?, tags = ?, payload = ?, updated_at = ? WHERE id = ?`,
    fields.name,
    fields.author,
    fields.description,
    JSON.stringify(fields.tags),
    fields.payload,
    now,
    id
  );
  return json({ ok: true });
}

async function deleteProgram(store: LibraryStore, id: string): Promise<Response> {
  for (const table of ["usage_weeks", "ratings", "program_reports", "recommendations", "program_adds"]) {
    await store.run(`DELETE FROM ${table} WHERE program_id = ?`, id);
  }
  await store.run("DELETE FROM comment_reports WHERE comment_id IN (SELECT id FROM comments WHERE program_id = ?)", id);
  await store.run("DELETE FROM comments WHERE program_id = ?", id);
  await store.run("DELETE FROM programs WHERE id = ?", id);
  return json({ ok: true });
}

async function requireProgram(store: LibraryStore, id: string): Promise<void> {
  if (!(await store.first("SELECT id FROM programs WHERE id = ?", id))) {
    throw new HttpError(404, "Program not found.");
  }
}

async function recordAdd(store: LibraryStore, request: Request, id: string): Promise<Response> {
  const { installId } = await readBody<{ installId: unknown }>(request, 1024);
  const install = requireInstallId(installId);
  await requireProgram(store, id);
  await store.registerInstall(install, clientIp(request));
  await store.run("INSERT OR IGNORE INTO program_adds (program_id, install_id) VALUES (?, ?)", id, install);
  return json({ ok: true });
}

async function recordUsage(store: LibraryStore, request: Request, now: number, id: string): Promise<Response> {
  const body = await readBody<{ installId: unknown; week: unknown }>(request, 1024);
  const install = requireInstallId(body.installId);
  const week = requireRecentWeek(body.week, now);
  await requireProgram(store, id);
  await store.registerInstall(install, clientIp(request));
  await store.run(
    `INSERT INTO usage_weeks (program_id, install_id, week, workouts) VALUES (?, ?, ?, 1)
     ON CONFLICT (program_id, install_id, week) DO UPDATE SET workouts = MIN(workouts + 1, ?)`,
    id,
    install,
    week,
    maxWorkoutsPerInstallWeek
  );
  return json({ ok: true });
}

async function rate(store: LibraryStore, request: Request, now: number, id: string): Promise<Response> {
  const body = await readBody<{ installId: unknown; stars: unknown }>(request, 1024);
  const install = requireInstallId(body.installId);
  if (typeof body.stars !== "number" || !Number.isInteger(body.stars) || body.stars < 1 || body.stars > 5) {
    throw new HttpError(400, "Stars must be 1 to 5.");
  }
  const workouts = await store.first<{ total: number | null }>(
    "SELECT SUM(workouts) AS total FROM usage_weeks WHERE program_id = ? AND install_id = ?",
    id,
    install
  );
  if ((workouts?.total ?? 0) < workoutsToRate) {
    throw new HttpError(403, `Finish ${workoutsToRate} workouts of this program to rate it.`);
  }
  await store.run(
    `INSERT INTO ratings (program_id, install_id, stars, updated_at) VALUES (?, ?, ?, ?)
     ON CONFLICT (program_id, install_id) DO UPDATE SET stars = excluded.stars, updated_at = excluded.updated_at`,
    id,
    install,
    body.stars,
    now
  );
  return json({ ok: true });
}

async function report(
  store: LibraryStore,
  request: Request,
  table: "program_reports" | "comment_reports" | "lifter_reports",
  target: "programs" | "comments" | "lifters",
  idColumn: "program_id" | "comment_id" | "lifter_id",
  targetColumn: "id" | "lifter_id",
  id: string
): Promise<Response> {
  const { installId } = await readBody<{ installId: unknown }>(request, 1024);
  const install = requireInstallId(installId);
  if (await store.insertedNew(`INSERT INTO ${table} (${idColumn}, install_id) VALUES (?, ?)`, id, install)) {
    await store.run(`UPDATE ${target} SET reports = reports + 1 WHERE ${targetColumn} = ?`, id);
  }
  return json({ ok: true });
}

async function coachIdForKey(store: LibraryStore, coachKey: unknown): Promise<string | undefined> {
  if (typeof coachKey !== "string" || coachKey.length === 0) {
    return undefined;
  }
  const row = await store.first<{ id: string }>("SELECT id FROM coaches WHERE key_hash = ?", await sha256(coachKey));
  if (!row) {
    throw new HttpError(403, "Unknown coach key.");
  }
  return row.id;
}

async function comment(store: LibraryStore, request: Request, now: number, id: string): Promise<Response> {
  const body = await readBody<{ installId: unknown; displayName: unknown; body: unknown; coachKey?: unknown }>(
    request,
    8 * 1024
  );
  const install = requireInstallId(body.installId);
  const displayName = requireText(body.displayName, LibraryRules_limits.displayName, "Name");
  const text = requireText(body.body, LibraryRules_limits.comment, "Comment");
  await requireProgram(store, id);
  const hasAdded =
    (await store.first("SELECT 1 FROM program_adds WHERE program_id = ? AND install_id = ?", id, install)) ??
    (await store.first("SELECT 1 FROM usage_weeks WHERE program_id = ? AND install_id = ?", id, install));
  if (!hasAdded) {
    throw new HttpError(403, "Add this program before commenting.");
  }
  if (!(await store.withinLimit(`comment:${install}`, maxCommentsPerInstallPerDay))) {
    throw new HttpError(429, "Too many comments today.");
  }
  const coachId = await coachIdForKey(store, body.coachKey);
  const commentId = randomId(10);
  await store.run(
    `INSERT INTO comments (id, program_id, install_id, author_id, display_name, coach_id, body, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    commentId,
    id,
    install,
    await publicId(install),
    displayName,
    coachId ?? null,
    text,
    now
  );
  return json({ id: commentId }, 201);
}

async function coaches(store: LibraryStore): Promise<Response> {
  const rows = await store.all<{ id: string; name: string; bio: string }>("SELECT id, name, bio FROM coaches");
  const picks = await store.all<{ coach_id: string; program_id: string; program_name: string; note: string }>(
    `SELECT r.coach_id, r.program_id, p.name AS program_name, r.note FROM recommendations r
     JOIN programs p ON p.id = r.program_id WHERE p.hidden = 0 AND p.reports < ?`,
    reportsToHide
  );
  const result: ILibraryCoach[] = rows.map((c) => ({
    id: c.id,
    name: c.name,
    bio: c.bio,
    picks: picks
      .filter((p) => p.coach_id === c.id)
      .map((p) => ({ programId: p.program_id, programName: p.program_name, note: p.note })),
  }));
  return json({ coaches: result });
}

async function recommend(store: LibraryStore, request: Request, id: string): Promise<Response> {
  const body = await readBody<{ coachKey: unknown; note: unknown }>(request, 4 * 1024);
  const coachId = await coachIdForKey(store, body.coachKey);
  if (!coachId) {
    throw new HttpError(403, "A coach key is required.");
  }
  await requireProgram(store, id);
  const note = requireText(body.note, LibraryRules_limits.coachNote, "Note");
  await store.run(
    `INSERT INTO recommendations (program_id, coach_id, note) VALUES (?, ?, ?)
     ON CONFLICT (program_id, coach_id) DO UPDATE SET note = excluded.note`,
    id,
    coachId,
    note
  );
  return json({ ok: true });
}

async function createCoach(store: LibraryStore, request: Request): Promise<Response> {
  const body = await readBody<{ name: unknown; bio: unknown }>(request, 4 * 1024);
  const name = requireText(body.name, LibraryRules_limits.displayName, "Name");
  const bio = requireText(body.bio, LibraryRules_limits.description, "Bio");
  const coachKey = randomId(32);
  const id = randomId(8);
  await store.run(
    "INSERT INTO coaches (id, key_hash, name, bio) VALUES (?, ?, ?, ?)",
    id,
    await sha256(coachKey),
    name,
    bio
  );
  return json({ id, coachKey }, 201);
}

async function joinLeaderboard(store: LibraryStore, request: Request): Promise<Response> {
  const body = await readBody<ILeaderboardJoinBody>(request, 2048);
  const install = requireInstallId(body.installId);
  const displayName = requireText(body.displayName, LibraryRules_limits.displayName, "Name");
  const sex = requireSex(body.sex);
  if (typeof body.bodyweightKg !== "number" || body.bodyweightKg < 30 || body.bodyweightKg > 250) {
    throw new HttpError(400, "Bodyweight must be between 30 and 250 kg.");
  }
  await store.registerInstall(install, clientIp(request));
  await store.run(
    `INSERT INTO lifters (install_id, lifter_id, display_name, sex, bodyweight_kg) VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (install_id) DO UPDATE SET display_name = excluded.display_name, sex = excluded.sex,
       bodyweight_kg = excluded.bodyweight_kg`,
    install,
    await publicId(install),
    displayName,
    sex,
    body.bodyweightKg
  );
  return json({ lifterId: await publicId(install) });
}

async function requireLifter(
  store: LibraryStore,
  installId: string
): Promise<{ sex: ILibrarySex; bodyweight_kg: number }> {
  const lifter = await store.first<{ sex: ILibrarySex; bodyweight_kg: number }>(
    "SELECT sex, bodyweight_kg FROM lifters WHERE install_id = ?",
    installId
  );
  if (!lifter) {
    throw new HttpError(404, "Join the leaderboard first.");
  }
  return lifter;
}

async function submitWorkout(store: LibraryStore, request: Request, now: number): Promise<Response> {
  const body = await readBody<ILeaderboardWorkoutBody>(request, 4096);
  const install = requireInstallId(body.installId);
  const week = requireRecentWeek(body.week, now);
  const lifter = await requireLifter(store, install);
  if (typeof body.workoutId !== "string" || body.workoutId.length === 0 || body.workoutId.length > 40) {
    throw new HttpError(400, "Invalid workout id.");
  }
  const isNew = await store.insertedNew(
    "INSERT INTO lifter_workouts (install_id, workout_id) VALUES (?, ?)",
    install,
    body.workoutId
  );
  if (!isNew) {
    return json({ rejected: [], pending: [] });
  }
  const bodyweightKg =
    typeof body.bodyweightKg === "number" && body.bodyweightKg >= 30 && body.bodyweightKg <= 250
      ? body.bodyweightKg
      : lifter.bodyweight_kg;
  await store.run("UPDATE lifters SET bodyweight_kg = ? WHERE install_id = ?", bodyweightKg, install);
  const rejected: ILibraryLift[] = [];
  const pending: ILibraryLift[] = [];
  for (const lift of ["squat", "bench", "deadlift"] as ILibraryLift[]) {
    const kg = body.bests?.[lift];
    if (typeof kg !== "number" || !(kg > 0)) {
      continue;
    }
    if (kg > LibraryRules_capKg(lift, lifter.sex, bodyweightKg)) {
      rejected.push(lift);
      continue;
    }
    const existing = await store.first<{ ok_kg: number | null; pending_kg: number | null }>(
      "SELECT ok_kg, pending_kg FROM lifter_bests WHERE install_id = ? AND lift = ?",
      install,
      lift
    );
    const status = LibraryRules_liftStatus(kg, existing?.ok_kg ?? undefined);
    const okKg = status === "ok" ? Math.max(existing?.ok_kg ?? 0, kg) : (existing?.ok_kg ?? null);
    const pendingKg = status === "pending" ? Math.max(existing?.pending_kg ?? 0, kg) : (existing?.pending_kg ?? null);
    if (status === "pending") {
      pending.push(lift);
    }
    await store.run(
      `INSERT INTO lifter_bests (install_id, lift, ok_kg, pending_kg, updated_at) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (install_id, lift) DO UPDATE SET ok_kg = excluded.ok_kg, pending_kg = excluded.pending_kg,
         updated_at = excluded.updated_at`,
      install,
      lift,
      okKg,
      pendingKg,
      now
    );
  }
  const volume = typeof body.volumeKg === "number" ? Math.min(Math.max(body.volumeKg, 0), maxVolumeKgPerWorkout) : 0;
  await store.run(
    `INSERT INTO lifter_volume (install_id, week, kg) VALUES (?, ?, ?)
     ON CONFLICT (install_id, week) DO UPDATE SET kg = kg + excluded.kg`,
    install,
    week,
    volume
  );
  return json({ rejected, pending });
}

async function submitCardio(store: LibraryStore, request: Request, now: number): Promise<Response> {
  const body = await readBody<ICardioSessionBody>(request, 2048);
  const install = requireInstallId(body.installId);
  const week = requireRecentWeek(body.week, now);
  await requireLifter(store, install);
  const limits = LibraryRules_limits;
  const activity = requireText(body.activity, limits.activity, "Activity");
  if (typeof body.sessionId !== "string" || body.sessionId.length === 0 || body.sessionId.length > 60) {
    throw new HttpError(400, "Invalid session id.");
  }
  if (typeof body.minutes !== "number" || body.minutes < 1 || body.minutes > limits.manualMinutes) {
    throw new HttpError(400, `Minutes must be between 1 and ${limits.manualMinutes}.`);
  }
  if (typeof body.zoneMinutes !== "number" || body.zoneMinutes < 0 || body.zoneMinutes > body.minutes * 5) {
    throw new HttpError(400, "Zone-minutes can't be more than 5 per minute.");
  }
  const source = body.source === "whoop" ? "whoop" : "manual";
  const day = utcDay(now);
  if (source === "manual") {
    const today = await store.first<{ total: number | null }>(
      "SELECT SUM(zone_minutes) AS total FROM cardio_sessions WHERE install_id = ? AND day = ? AND source = 'manual'",
      install,
      day
    );
    if ((today?.total ?? 0) + body.zoneMinutes > limits.manualMinutes) {
      throw new HttpError(429, `Manual cardio is capped at ${limits.manualMinutes} zone-minutes a day.`);
    }
  }
  const kcal = typeof body.kcal === "number" && body.kcal >= 0 && body.kcal < 10000 ? body.kcal : null;
  await store.run(
    `INSERT INTO cardio_sessions (install_id, session_id, week, day, activity, minutes, zone_minutes, kcal, source)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT (install_id, session_id) DO NOTHING`,
    install,
    body.sessionId,
    week,
    day,
    activity,
    Math.round(body.minutes),
    body.zoneMinutes,
    kcal,
    source
  );
  return json({ ok: true });
}

async function leaderboard(store: LibraryStore, url: URL, now: number): Promise<Response> {
  const board = url.searchParams.get("board");
  const week = LibraryRules_isoWeek(now);
  const sexParam = url.searchParams.get("sex");
  const sex = sexParam === "male" || sexParam === "female" ? sexParam : undefined;
  const visible = `l.hidden = 0 AND l.reports < ${reportsToHide}`;
  if (board === "strength") {
    const lift = url.searchParams.get("lift");
    const boardLift = lift === "squat" || lift === "bench" || lift === "deadlift" ? lift : "total";
    const rows = await store.all<{
      lifter_id: string;
      display_name: string;
      sex: ILibrarySex;
      bodyweight_kg: number;
      lift: ILibraryLift;
      ok_kg: number | null;
    }>(
      `SELECT l.lifter_id, l.display_name, l.sex, l.bodyweight_kg, b.lift, b.ok_kg FROM lifters l
       JOIN lifter_bests b ON b.install_id = l.install_id WHERE ${visible}`
    );
    const byLifter = new Map<string, ILifterBests>();
    for (const row of rows) {
      const lifter = byLifter.get(row.lifter_id) ?? {
        lifterId: row.lifter_id,
        displayName: row.display_name,
        sex: row.sex,
        bodyweightKg: row.bodyweight_kg,
        okKg: {},
      };
      if (row.ok_kg != null) {
        lifter.okKg[row.lift] = row.ok_kg;
      }
      byLifter.set(row.lifter_id, lifter);
    }
    const weightClass = url.searchParams.get("class") ?? undefined;
    const result = LibraryRanking_strengthRows(
      Array.from(byLifter.values()),
      boardLift,
      sex ?? "male",
      weightClass,
      boardSize
    );
    return json({ rows: result });
  }
  if (board === "volume") {
    const rows = await store.all<{
      lifter_id: string;
      display_name: string;
      sex: ILibrarySex;
      bodyweight_kg: number;
      kg: number;
    }>(
      `SELECT l.lifter_id, l.display_name, l.sex, l.bodyweight_kg, v.kg FROM lifter_volume v
       JOIN lifters l ON l.install_id = v.install_id WHERE v.week = ? AND ${visible}`,
      week
    );
    const result = LibraryRanking_volumeRows(
      rows.map((r) => ({
        lifterId: r.lifter_id,
        displayName: r.display_name,
        sex: r.sex,
        bodyweightKg: r.bodyweight_kg,
        kg: r.kg,
      })),
      sex,
      boardSize
    );
    return json({ week, rows: result });
  }
  if (board === "cardio") {
    const rows = await store.all<{
      lifter_id: string;
      display_name: string;
      sex: ILibrarySex;
      bodyweight_kg: number;
      zone_minutes: number;
      kcal: number;
      has_whoop: number;
    }>(
      `SELECT l.lifter_id, l.display_name, l.sex, l.bodyweight_kg, SUM(c.zone_minutes) AS zone_minutes,
         SUM(COALESCE(c.kcal, 0)) AS kcal, MAX(c.source = 'whoop') AS has_whoop
       FROM cardio_sessions c JOIN lifters l ON l.install_id = c.install_id
       WHERE c.week = ? AND ${visible} GROUP BY l.install_id`,
      week
    );
    const sort = url.searchParams.get("sort") === "kcalPerKg" ? "kcalPerKg" : "zoneMinutes";
    const result = LibraryRanking_cardioRows(
      rows.map((r) => ({
        lifterId: r.lifter_id,
        displayName: r.display_name,
        sex: r.sex,
        bodyweightKg: r.bodyweight_kg,
        zoneMinutes: r.zone_minutes,
        kcal: r.kcal,
        hasWhoop: r.has_whoop === 1,
      })),
      sort,
      boardSize
    );
    return json({ week, rows: result });
  }
  throw new HttpError(400, "Unknown board.");
}

async function pendingLifts(store: LibraryStore): Promise<Response> {
  const rows = await store.all(
    `SELECT l.lifter_id, l.display_name, b.lift, b.ok_kg, b.pending_kg FROM lifter_bests b
     JOIN lifters l ON l.install_id = b.install_id WHERE b.pending_kg IS NOT NULL`
  );
  return json({ pending: rows });
}

async function approveLifts(store: LibraryStore, lifterId: string): Promise<Response> {
  await store.run(
    `UPDATE lifter_bests SET ok_kg = MAX(COALESCE(ok_kg, 0), pending_kg), pending_kg = NULL
     WHERE pending_kg IS NOT NULL AND install_id = (SELECT install_id FROM lifters WHERE lifter_id = ?)`,
    lifterId
  );
  return json({ ok: true });
}

async function route(request: Request, env: ILibraryEnv, store: LibraryStore, now: number): Promise<Response> {
  const url = new URL(request.url);
  const parts = url.pathname
    .replace(/^\/library\/?/, "")
    .split("/")
    .filter(Boolean);
  const method = request.method;
  const [section, id, action] = parts;
  const admin = isAdmin(env, request);

  if (section === "weekly" && method === "GET") {
    return weekly(store, now);
  }
  if (section === "coaches" && method === "GET") {
    return coaches(store);
  }
  if (section === "programs") {
    if (!id) {
      if (method === "GET") {
        return listPrograms(store, now, url.searchParams.get("sort"));
      }
      if (method === "POST") {
        return publish(store, request, now);
      }
    } else if (!action) {
      if (method === "GET") {
        return programDetail(store, now, id);
      }
      if (method === "PUT" || method === "DELETE") {
        if (!(await canEdit(store, env, request, id))) {
          throw new HttpError(403, "This phone can't edit that program.");
        }
        return method === "PUT" ? updateProgram(store, request, now, id) : deleteProgram(store, id);
      }
    } else if (method === "POST") {
      switch (action) {
        case "added":
          return recordAdd(store, request, id);
        case "usage":
          return recordUsage(store, request, now, id);
        case "rating":
          return rate(store, request, now, id);
        case "report":
          return report(store, request, "program_reports", "programs", "program_id", "id", id);
        case "comments":
          return comment(store, request, now, id);
        case "recommend":
          return recommend(store, request, id);
      }
    }
  }
  if (section === "comments" && id) {
    if (action === "report" && method === "POST") {
      return report(store, request, "comment_reports", "comments", "comment_id", "id", id);
    }
    if (!action && method === "DELETE" && admin) {
      await store.run("UPDATE comments SET hidden = 1 WHERE id = ?", id);
      return json({ ok: true });
    }
  }
  if (section === "leaderboard") {
    if (!id && method === "GET") {
      return leaderboard(store, url, now);
    }
    if (method === "POST" && id === "join") {
      return joinLeaderboard(store, request);
    }
    if (method === "POST" && id === "workout") {
      return submitWorkout(store, request, now);
    }
    if (method === "POST" && id === "cardio") {
      return submitCardio(store, request, now);
    }
    if (method === "POST" && id === "lifters" && action) {
      return report(store, request, "lifter_reports", "lifters", "lifter_id", "lifter_id", action);
    }
  }
  if (section === "admin") {
    if (!admin) {
      throw new HttpError(403, "Admin key required.");
    }
    if (id === "coaches" && method === "POST") {
      return createCoach(store, request);
    }
    if (id === "pending" && method === "GET") {
      return pendingLifts(store);
    }
    if (id === "approve" && action && method === "POST") {
      return approveLifts(store, action);
    }
    if (id === "hide-lifter" && action && method === "POST") {
      await store.run("UPDATE lifters SET hidden = 1 WHERE lifter_id = ?", action);
      return json({ ok: true });
    }
  }
  throw new HttpError(404, "Not found.");
}

export async function LibraryServer_handle(request: Request, env: ILibraryEnv, now: number): Promise<Response> {
  if (!env.LIBRARY_DB) {
    return json({ error: "not_configured" }, 503);
  }
  const store = new LibraryStore(env.LIBRARY_DB, now);
  try {
    await store.ensureSchema();
    return await route(request, env, store, now);
  } catch (e) {
    if (e instanceof HttpError) {
      return json({ error: e.message }, e.status);
    }
    console.error(e);
    return json({ error: "Server error." }, 500);
  }
}
