import { IHistoryRecord, ILibraryStorage, IProgram, ISettings } from "../types";
import { IExportedProgram, Program_exportProgram } from "./program";
import { ILibraryComment, ILibraryProgramSummary, ILibraryPublishBody, ILibraryRankChange } from "./libraryTypes";
import {
  LibraryRules_isoWeek,
  LibraryRules_limits,
  LibraryRules_normalizeTags,
  LibraryRules_textProblems,
} from "./libraryRules";

export interface ILibraryPublishForm {
  name: string;
  author: string;
  description: string;
  tags: string[];
  ownsRights: boolean;
}

const libraryIdPattern = "[A-Za-z0-9]{8}";

export function ProgramLibrary_formProblems(form: ILibraryPublishForm): string[] {
  const limits = LibraryRules_limits;
  const problems = LibraryRules_textProblems(form.name, limits.name).map((p) => `Name: ${p}`);
  problems.push(...LibraryRules_textProblems(form.author, limits.author).map((p) => `Your name: ${p}`));
  if (form.description.trim()) {
    problems.push(...LibraryRules_textProblems(form.description, limits.description).map((p) => `Description: ${p}`));
  }
  const tags = LibraryRules_normalizeTags(form.tags);
  if (tags.length > limits.tags) {
    problems.push(`Use at most ${limits.tags} tags.`);
  }
  if (tags.some((t) => t.length > limits.tag)) {
    problems.push(`Keep each tag under ${limits.tag} characters.`);
  }
  if (!form.ownsRights) {
    problems.push("Confirm you wrote this program or that it is freely published.");
  }
  return problems;
}

export function ProgramLibrary_publishBody(
  program: IProgram,
  settings: ISettings,
  form: ILibraryPublishForm
): { ok: true; body: ILibraryPublishBody } | { ok: false; errors: string[] } {
  const errors = ProgramLibrary_formProblems(form);
  if (errors.length > 0) {
    return { ok: false, errors };
  }
  const exported = Program_exportProgram(program, settings);
  const name = form.name.trim();
  return {
    ok: true,
    body: {
      exported: { ...exported, program: { ...exported.program, name } },
      name,
      author: form.author.trim(),
      description: form.description.trim(),
      tags: LibraryRules_normalizeTags(form.tags),
      ownsRights: true,
    },
  };
}

export function ProgramLibrary_filter(
  programs: ILibraryProgramSummary[],
  query: string,
  tag?: string
): ILibraryProgramSummary[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return programs.filter((p) => {
    if (tag && !p.tags.includes(tag)) {
      return false;
    }
    const haystack = `${p.name} ${p.author} ${p.description} ${p.tags.join(" ")}`.toLowerCase();
    return words.every((w) => haystack.includes(w));
  });
}

export function ProgramLibrary_libraryIdForProgram(
  library: ILibraryStorage | undefined,
  programId: string
): string | undefined {
  return (
    library?.imports.find((i) => i.programId === programId)?.libraryId ??
    library?.publications.find((p) => p.programId === programId)?.libraryId
  );
}

export function ProgramLibrary_usagePing(
  record: IHistoryRecord,
  library: ILibraryStorage | undefined
): { libraryId: string; week: string } | undefined {
  if (!library?.usageConsent) {
    return undefined;
  }
  const libraryId = ProgramLibrary_libraryIdForProgram(library, record.programId);
  if (!libraryId) {
    return undefined;
  }
  return { libraryId, week: LibraryRules_isoWeek(record.startTime) };
}

export function ProgramLibrary_visibleComments(
  comments: ILibraryComment[],
  hiddenAuthorIds: string[]
): ILibraryComment[] {
  const hidden = new Set(hiddenAuthorIds);
  return comments.filter((c) => !hidden.has(c.authorId));
}

export function ProgramLibrary_shortLink(host: string, libraryId: string): string {
  return `${host.replace(/\/+$/, "")}/p/${libraryId}`;
}

export function ProgramLibrary_idFromLink(link: string): string | undefined {
  const trimmed = link.trim();
  const match =
    trimmed.match(new RegExp(`/p/(${libraryIdPattern})(?:[/?#]|$)`)) ??
    trimmed.match(new RegExp(`[?&]library=(${libraryIdPattern})(?:&|#|$)`));
  return match?.[1];
}

export function ProgramLibrary_changeLabel(change: ILibraryRankChange): {
  text: string;
  tone: "up" | "down" | "flat" | "new";
} {
  switch (change.kind) {
    case "up":
      return { text: `▲${change.by}`, tone: "up" };
    case "down":
      return { text: `▼${change.by}`, tone: "down" };
    case "new":
      return { text: "NEW", tone: "new" };
    case "same":
      return { text: "–", tone: "flat" };
  }
}

export function ProgramLibrary_starsLabel(summary: ILibraryProgramSummary): string {
  if (summary.starsAverage == null || summary.starsCount === 0) {
    return "No ratings yet";
  }
  return `★ ${summary.starsAverage.toFixed(1)} · ${summary.starsCount} ${summary.starsCount === 1 ? "rating" : "ratings"}`;
}

export interface ILibraryPreviewDay {
  title: string;
  exercises: string[];
}

const previewWeeks = 1;

function exerciseNames(exerciseText: string): string[] {
  const names: string[] = [];
  let isInScript = false;
  for (const raw of exerciseText.split("\n")) {
    const line = raw.trim();
    const wasInScript = isInScript;
    const lastOpen = line.lastIndexOf("{~");
    const lastClose = line.lastIndexOf("~}");
    if (lastOpen !== -1 || lastClose !== -1) {
      isInScript = lastOpen > lastClose;
    }
    if (
      wasInScript ||
      line === "" ||
      line.startsWith("//") ||
      line.startsWith("/") ||
      line.startsWith("~}") ||
      /used:\s*none/.test(line)
    ) {
      continue;
    }
    const name = line
      .split("/")[0]
      .replace(/\[.*?\]/g, "")
      .trim();
    if (name && !names.includes(name)) {
      names.push(name);
    }
  }
  return names;
}

export function ProgramLibrary_previewDays(exported: IExportedProgram): {
  weeksCount: number;
  days: ILibraryPreviewDay[];
} {
  const weeks = exported.program.planner?.weeks ?? [];
  const days = weeks.slice(0, previewWeeks).flatMap((week) =>
    week.days.map((day) => ({
      title: weeks.length > 1 ? `${week.name} · ${day.name}` : day.name,
      exercises: exerciseNames(day.exerciseText),
    }))
  );
  return { weeksCount: weeks.length, days };
}

export function ProgramLibrary_emptyStorage(): ILibraryStorage {
  return { publications: [], imports: [], hiddenAuthorIds: [], sentWhoopWorkoutIds: [] };
}
