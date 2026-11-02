import "mocha";
import { expect } from "chai";
import { SetTag_badge, SetTag_isTag, SetTag_label, SetTag_options } from "../src/models/setTag";

describe("SetTag", () => {
  it("lists every set type alphabetically by its label", () => {
    expect(SetTag_options().map((o) => o.label)).to.eql([
      "AMRAP",
      "Back-off",
      "Drop set",
      "Failed",
      "Partial",
      "Superset",
      "Top set",
      "Warm-up",
      "Working",
    ]);
  });

  it("shows a letter for a typed set and the set number otherwise", () => {
    expect(SetTag_badge("top", false, 0)).to.equal("T");
    expect(SetTag_badge("warmup", false, 2)).to.equal("W");
    expect(SetTag_badge("working", true, 2)).to.equal("3");
    expect(SetTag_badge(undefined, false, 2)).to.equal("3");
    expect(SetTag_badge(undefined, true, 0)).to.equal("W");
  });

  it("recognizes only known set types", () => {
    expect(SetTag_isTag("drop")).to.equal(true);
    expect(SetTag_isTag("heavy")).to.equal(false);
    expect(SetTag_label("backoff")).to.equal("Back-off");
  });
});
