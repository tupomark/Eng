import { DICTIONARY_CONTEXT_KEY } from "@/infrastructure/dictionary/context-navigation";

/** Remove derived, tab-local excerpts when their private source is deleted. */
export function purgeTemporaryDocumentContext(
  documentId: string,
  storage: Pick<Storage, "getItem" | "setItem">,
): void {
  const raw = storage.getItem(DICTIONARY_CONTEXT_KEY);
  if (raw === null) return;
  if (raw.length > 30_000)
    throw new Error("Temporary reading context could not be safely cleared.");
  const ledger: unknown = JSON.parse(raw);
  if (
    !ledger ||
    typeof ledger !== "object" ||
    !("version" in ledger) ||
    ledger.version !== 1 ||
    !("visits" in ledger) ||
    !Array.isArray(ledger.visits) ||
    ledger.visits.length > 12
  )
    throw new Error("Temporary reading context could not be safely cleared.");
  const visits = ledger.visits.filter((visit: unknown) => {
    if (
      !visit ||
      typeof visit !== "object" ||
      !("context" in visit) ||
      !visit.context ||
      typeof visit.context !== "object"
    )
      throw new Error("Temporary reading context could not be safely cleared.");
    const context = visit.context;
    return !(
      "source" in context &&
      context.source &&
      typeof context.source === "object" &&
      "documentId" in context.source &&
      context.source.documentId === documentId
    );
  });
  if (visits.length !== ledger.visits.length)
    storage.setItem(
      DICTIONARY_CONTEXT_KEY,
      JSON.stringify({ version: 1, visits }),
    );
}
