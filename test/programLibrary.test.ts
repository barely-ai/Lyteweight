import "mocha";
import { expect } from "chai";
import { IExportedProgram } from "../src/models/program";
import {
  ProgramLibrary_previewDays,
  ProgramLibrary_changeLabel,
  ProgramLibrary_starsLabel,
  ProgramLibrary_emptyStorage,
  ProgramLibrary_filter,
  ProgramLibrary_formProblems,
  ProgramLibrary_idFromLink,
  ProgramLibrary_shortLink,
  ProgramLibrary_usagePing,
  ProgramLibrary_visibleComments,
} from "../src/models/programLibrary";
import {
  LibraryRules_capKg,
  LibraryRules_effortZone,
  LibraryRules_isoWeek,
  LibraryRules_liftStatus,
  LibraryRules_previousWeeks,
  LibraryRules_textProblems,
  LibraryRules_weightClass,
} from "../src/models/libraryRules";
import { LibraryRanking_bayesian } from "../cloudflare/libraryRanking";
import { ILibraryComment, ILibraryProgramSummary } from "../src/models/libraryTypes";
import { IHistoryRecord } from "../src/types";

function summary(name: string, tags: string[], description: string = ""): ILibraryProgramSummary {
  return {
    id: name,
    name,
    author: "Zach",
    description,
    tags,
    publishedAt: 0,
    updatedAt: 0,
    lifterWeeks: 0,
    liftersThisMonth: 0,
    starsCount: 0,
    coachPicks: [],
  };
}

describe("LibraryRules", () => {
  it("numbers ISO weeks across year boundaries", () => {
    expect(LibraryRules_isoWeek(Date.UTC(2026, 0, 1))).to.equal("2026-W01");
    expect(LibraryRules_isoWeek(Date.UTC(2027, 0, 1))).to.equal("2026-W53");
    expect(LibraryRules_isoWeek(Date.UTC(2026, 9, 26))).to.equal("2026-W44");
    expect(LibraryRules_isoWeek(Date.UTC(2026, 9, 25, 23, 59))).to.equal("2026-W43");
    expect(LibraryRules_previousWeeks("2027-W01", 3)).to.eql(["2026-W52", "2026-W53", "2027-W01"]);
  });

  it("flags empty, long, offensive and linked text", () => {
    expect(LibraryRules_textProblems("Good block", 20)).to.eql([]);
    expect(LibraryRules_textProblems("  ", 20)).to.have.length(1);
    expect(LibraryRules_textProblems("x".repeat(21), 20)).to.have.length(1);
    expect(LibraryRules_textProblems("This is SHIT", 50)).to.eql(["Please remove the offensive language."]);
    expect(LibraryRules_textProblems("see https://x.com", 50)).to.eql(["Links aren't allowed."]);
    expect(LibraryRules_textProblems("Classic program", 50)).to.eql([]);
  });

  it("maps effort to heart-rate zones", () => {
    expect([1, 2, 3, 6, 7, 8, 9, 10].map(LibraryRules_effortZone)).to.eql([1, 1, 2, 3, 4, 4, 5, 5]);
  });

  it("puts bodyweights into IPF classes", () => {
    expect(LibraryRules_weightClass(67.5, "male")).to.equal("74");
    expect(LibraryRules_weightClass(66, "male")).to.equal("66");
    expect(LibraryRules_weightClass(130, "male")).to.equal("120+");
    expect(LibraryRules_weightClass(60, "female")).to.equal("63");
  });

  it("caps lifts well above real records and holds big jumps", () => {
    const squatCap = LibraryRules_capKg("squat", "male", 83);
    expect(squatCap).to.be.within(380, 460);
    expect(LibraryRules_capKg("bench", "female", 63)).to.be.lessThan(squatCap);
    expect(LibraryRules_liftStatus(115, 100)).to.equal("ok");
    expect(LibraryRules_liftStatus(116, 100)).to.equal("pending");
    expect(LibraryRules_liftStatus(300, undefined)).to.equal("ok");
  });

  it("pulls a few votes towards 3 stars", () => {
    expect(LibraryRanking_bayesian(5, 1, 3, 5)).to.be.closeTo(3.33, 0.01);
    expect(LibraryRanking_bayesian(32, 8, 3, 5)).to.be.closeTo(3.62, 0.01);
  });
});

describe("ProgramLibrary", () => {
  it("lists every publish form problem", () => {
    const problems = ProgramLibrary_formProblems({
      name: "",
      author: "Zach",
      description: "",
      tags: ["a", "b", "c", "d", "e", "f"],
      ownsRights: false,
    });
    expect(problems).to.eql([
      "Name: Write something first.",
      "Use at most 5 tags.",
      "Confirm you wrote this program or that it is freely published.",
    ]);
  });

  it("searches name, author, description and tags, all words required", () => {
    const programs = [summary("Squat Focus", ["strength"]), summary("Bench Builder", ["hypertrophy"], "upper body")];
    expect(ProgramLibrary_filter(programs, "bench upper").map((p) => p.name)).to.eql(["Bench Builder"]);
    expect(ProgramLibrary_filter(programs, "zach").map((p) => p.name)).to.eql(["Squat Focus", "Bench Builder"]);
    expect(ProgramLibrary_filter(programs, "", "strength").map((p) => p.name)).to.eql(["Squat Focus"]);
  });

  it("pings usage only for library programs and only with consent", () => {
    const record = { programId: "local-1", startTime: Date.UTC(2026, 9, 28) } as IHistoryRecord;
    const library = { ...ProgramLibrary_emptyStorage(), imports: [{ programId: "local-1", libraryId: "AbCd1234" }] };
    expect(ProgramLibrary_usagePing(record, library)).to.equal(undefined);
    expect(ProgramLibrary_usagePing(record, { ...library, usageConsent: true })).to.eql({
      libraryId: "AbCd1234",
      week: "2026-W44",
    });
    expect(ProgramLibrary_usagePing({ ...record, programId: "other" }, { ...library, usageConsent: true })).to.equal(
      undefined
    );
  });

  it("hides comments from hidden authors", () => {
    const comment = (authorId: string): ILibraryComment => ({
      id: authorId,
      authorId,
      displayName: authorId,
      isCoach: false,
      body: "hi",
      createdAt: 0,
    });
    expect(ProgramLibrary_visibleComments([comment("a"), comment("b")], ["a"]).map((c) => c.id)).to.eql(["b"]);
  });

  it("previews the first week as exercise names, skipping comments, templates and scripts", () => {
    const day1 = [
      "// note",
      "main / used: none / 2x5 \\",
      "/ progress: custom(increase: 2.5lb) {~",
      "  weights += state.increase",
      "~}",
      "Squat[1-4] / ...main / 100kg / progress: custom(increase: 5lb) { ...main }",
      "",
      "Bench Press / 3x8",
      "Squat / 1x1",
    ].join("\n");
    const exported = {
      program: {
        planner: {
          vtype: "planner",
          name: "P",
          weeks: [
            { name: "Week 1", days: [{ name: "Day 1", exerciseText: day1 }] },
            { name: "Week 2", days: [{ name: "Day 1", exerciseText: "Squat / 3x3" }] },
          ],
        },
      },
    } as unknown as IExportedProgram;
    expect(ProgramLibrary_previewDays(exported)).to.eql({
      weeksCount: 2,
      days: [{ title: "Week 1 · Day 1", exercises: ["Squat", "Bench Press"] }],
    });
  });

  it("labels rank changes and ratings", () => {
    expect(ProgramLibrary_changeLabel({ kind: "up", by: 2 })).to.eql({ text: "▲2", tone: "up" });
    expect(ProgramLibrary_changeLabel({ kind: "new" }).text).to.equal("NEW");
    expect(ProgramLibrary_starsLabel(summary("A", []))).to.equal("No ratings yet");
    expect(ProgramLibrary_starsLabel({ ...summary("A", []), starsAverage: 4.75, starsCount: 1 })).to.equal(
      "★ 4.8 · 1 rating"
    );
  });

  it("builds and reads short links", () => {
    const link = ProgramLibrary_shortLink("https://lyteweight.pages.dev/", "AbCd1234");
    expect(link).to.equal("https://lyteweight.pages.dev/p/AbCd1234");
    expect(ProgramLibrary_idFromLink(link)).to.equal("AbCd1234");
    expect(ProgramLibrary_idFromLink("https://lyteweight.pages.dev/app/?library=AbCd1234")).to.equal("AbCd1234");
    expect(ProgramLibrary_idFromLink("https://lyteweight.pages.dev/program?data=xyz")).to.equal(undefined);
  });
});
