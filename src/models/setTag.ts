export type ISetTag = "amrap" | "backoff" | "drop" | "failed" | "partial" | "superset" | "top" | "warmup" | "working";

export const SetTag_all: ISetTag[] = [
  "amrap",
  "backoff",
  "drop",
  "failed",
  "partial",
  "superset",
  "top",
  "warmup",
  "working",
];

const labels: Record<ISetTag, string> = {
  amrap: "AMRAP",
  backoff: "Back-off",
  drop: "Drop set",
  failed: "Failed",
  partial: "Partial",
  superset: "Superset",
  top: "Top set",
  warmup: "Warm-up",
  working: "Working",
};

const badges: Record<ISetTag, string | undefined> = {
  amrap: "A",
  backoff: "B",
  drop: "D",
  failed: "F",
  partial: "P",
  superset: "S",
  top: "T",
  warmup: "W",
  working: undefined,
};

export function SetTag_isTag(value: unknown): value is ISetTag {
  return typeof value === "string" && (SetTag_all as string[]).includes(value);
}

export function SetTag_label(tag: ISetTag): string {
  return labels[tag];
}

export function SetTag_options(): { tag: ISetTag; label: string }[] {
  return SetTag_all.map((tag) => ({ tag, label: labels[tag] })).sort((a, b) => a.label.localeCompare(b.label));
}

export function SetTag_badge(tag: ISetTag | undefined, isWarmupList: boolean, setIndex: number): string {
  if (tag != null) {
    return badges[tag] ?? String(setIndex + 1);
  }
  return isWarmupList ? "W" : String(setIndex + 1);
}
