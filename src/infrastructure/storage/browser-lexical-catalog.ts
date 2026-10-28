import {
  emptyUserLexicalCatalog,
  parseUserLexicalCatalog,
  type UserLexicalCatalog,
} from "@/domain/lexical-catalog";
import { assertLocalWritesAllowed } from "./local-write-guard";

export const USER_LEXICAL_CATALOG_KEY = "lexis.lexical-catalog.v1";
export const USER_LEXICAL_CATALOG_LIMIT = 4_000_000;
/** Best-effort stale-byte guard; this is not a cross-tab database transaction. */
export class BrowserUserLexicalRepository {
  constructor(private readonly storage: Pick<Storage, "getItem" | "setItem">) {}
  read(): { state: UserLexicalCatalog; serialized: string | null } {
    const serialized = this.storage.getItem(USER_LEXICAL_CATALOG_KEY);
    if (serialized !== null && serialized.length > USER_LEXICAL_CATALOG_LIMIT)
      throw new Error(
        "Your personal dictionary is too large to open safely. Export the original before recovery.",
      );
    return {
      state:
        serialized === null
          ? emptyUserLexicalCatalog()
          : parseUserLexicalCatalog(JSON.parse(serialized)),
      serialized,
    };
  }
  commit(state: UserLexicalCatalog, expected: string | null): string {
    assertLocalWritesAllowed(this.storage);
    // Read+validate existing bytes first: malformed storage is never overwritten.
    if (this.read().serialized !== expected)
      throw new Error(
        "Your personal dictionary changed in another tab. Reload it before saving again.",
      );
    const serialized = JSON.stringify(parseUserLexicalCatalog(state));
    if (serialized.length > USER_LEXICAL_CATALOG_LIMIT)
      throw new Error(
        "Your personal dictionary reached the local size limit. Export a backup before adding more.",
      );
    this.storage.setItem(USER_LEXICAL_CATALOG_KEY, serialized);
    return serialized;
  }
}
