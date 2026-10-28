export interface Preferences {
  version: 1;
  revision: number;
  uiLanguage: "en" | "ru" | "mixed";
  explanationLanguage: "en" | "ru" | "mixed";
  taskLanguage: "en";
  reducedMotion: "system" | "reduce";
  learningMode: "quick" | "focused" | "free" | "goal";
  dailyItems: number;
  accent: "BrE" | "AmE";
  correctionStyle: "gentle" | "balanced" | "detailed";
  onboardingCompleted: boolean;
}
export type PreferenceChange = Partial<
  Omit<Preferences, "version" | "revision" | "taskLanguage">
>;
export const DEFAULT_PREFERENCES: Readonly<Preferences> = Object.freeze({
  version: 1,
  revision: 0,
  uiLanguage: "en",
  explanationLanguage: "en",
  taskLanguage: "en",
  reducedMotion: "system",
  learningMode: "quick",
  dailyItems: 20,
  accent: "BrE",
  correctionStyle: "balanced",
  onboardingCompleted: false,
});
const KEYS = Object.keys(DEFAULT_PREFERENCES);
const oneOf = (value: unknown, choices: readonly string[]) =>
  typeof value === "string" && choices.includes(value);

export function parsePreferences(value: unknown): Preferences {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error(
      "Saved preferences could not be opened. The original data has been preserved.",
    );
  const item = value as Record<string, unknown>;
  if (
    Object.keys(item).length !== KEYS.length ||
    KEYS.some((key) => !(key in item)) ||
    item.version !== 1 ||
    !Number.isInteger(item.revision) ||
    Number(item.revision) < 0 ||
    Number(item.revision) >= Number.MAX_SAFE_INTEGER ||
    !oneOf(item.uiLanguage, ["en", "ru", "mixed"]) ||
    !oneOf(item.explanationLanguage, ["en", "ru", "mixed"]) ||
    item.taskLanguage !== "en" ||
    !oneOf(item.reducedMotion, ["system", "reduce"]) ||
    !oneOf(item.learningMode, ["quick", "focused", "free", "goal"]) ||
    !Number.isInteger(item.dailyItems) ||
    Number(item.dailyItems) < 1 ||
    Number(item.dailyItems) > 100 ||
    !oneOf(item.accent, ["BrE", "AmE"]) ||
    !oneOf(item.correctionStyle, ["gentle", "balanced", "detailed"]) ||
    typeof item.onboardingCompleted !== "boolean"
  )
    throw new Error(
      "Saved preferences could not be opened. The original data has been preserved.",
    );
  return {
    version: 1,
    revision: item.revision as number,
    uiLanguage: item.uiLanguage as Preferences["uiLanguage"],
    explanationLanguage:
      item.explanationLanguage as Preferences["explanationLanguage"],
    taskLanguage: "en",
    reducedMotion: item.reducedMotion as Preferences["reducedMotion"],
    learningMode: item.learningMode as Preferences["learningMode"],
    dailyItems: item.dailyItems as number,
    accent: item.accent as Preferences["accent"],
    correctionStyle: item.correctionStyle as Preferences["correctionStyle"],
    onboardingCompleted: item.onboardingCompleted,
  };
}

export function changePreferences(
  current: Preferences,
  change: PreferenceChange,
): Preferences {
  const next = parsePreferences({
    ...current,
    ...change,
    revision: current.revision + 1,
  });
  if (
    Object.keys(change).some(
      (key) =>
        !KEYS.includes(key) ||
        ["version", "revision", "taskLanguage"].includes(key),
    )
  )
    throw new Error("This preference cannot be changed by that action.");
  return next;
}
