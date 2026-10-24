import {
  changePreferences,
  DEFAULT_PREFERENCES,
  parsePreferences,
  type PreferenceChange,
  type Preferences,
} from "@/domain/preferences/preferences";
import { assertLocalWritesAllowed } from "./local-write-guard";
export const PREFERENCES_KEY = "lexis.preferences.v1";
export const LOCAL_PURGE_MARKER = "lexis.local-purge.v1";
export interface PreferencesStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export class PreferencesRepository {
  private baseline: string | null | undefined;
  private current: Preferences = { ...DEFAULT_PREFERENCES };
  constructor(private readonly storage: PreferencesStorage) {}
  read(): Preferences {
    const raw = this.storage.getItem(PREFERENCES_KEY);
    const current =
      raw === null
        ? { ...DEFAULT_PREFERENCES }
        : parsePreferences(JSON.parse(raw));
    this.current = current;
    this.baseline = raw;
    return current;
  }
  change(change: PreferenceChange): Preferences {
    if (this.baseline === undefined)
      throw new Error(
        "Reload readable preferences before making changes. Existing data is preserved.",
      );
    assertLocalWritesAllowed(this.storage);
    if (this.storage.getItem(LOCAL_PURGE_MARKER))
      throw new Error(
        "Local data deletion is in progress. Finish or retry deletion before changing preferences.",
      );
    if (this.storage.getItem(PREFERENCES_KEY) !== this.baseline)
      throw new Error(
        "Preferences changed in another tab. Reload preferences before saving this choice.",
      );
    const next = changePreferences(this.current, change);
    const raw = JSON.stringify(next);
    this.storage.setItem(PREFERENCES_KEY, raw);
    this.baseline = raw;
    this.current = next;
    return next;
  }
}
