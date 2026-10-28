import { extractLookupContext } from "@/domain/contextual-lookup";

/** Read native selection across inline controls without changing the Range or copy behaviour. */
export function readLookupSelection(root: HTMLElement, range: Range) {
  if (
    !root.contains(range.startContainer) ||
    !root.contains(range.endContainer)
  )
    return null;
  const surface = range.toString();
  const startElement =
    range.startContainer instanceof Element
      ? range.startContainer
      : range.startContainer.parentElement;
  const endElement =
    range.endContainer instanceof Element
      ? range.endContainer
      : range.endContainer.parentElement;
  const startParagraph = startElement?.closest<HTMLElement>(
    "[data-reader-paragraph]",
  );
  const endParagraph = endElement?.closest<HTMLElement>(
    "[data-reader-paragraph]",
  );
  if (!startParagraph || !endParagraph) return null;
  const sourceRoot = startParagraph === endParagraph ? startParagraph : root;
  const prefix = root.ownerDocument.createRange();
  prefix.selectNodeContents(sourceRoot);
  prefix.setEnd(range.startContainer, range.startOffset);
  const start = prefix.toString().length;
  const context = extractLookupContext(
    sourceRoot.textContent ?? "",
    start,
    start + surface.length,
  );
  if (!context) return null;
  const paragraphPrefix = root.ownerDocument.createRange();
  paragraphPrefix.selectNodeContents(startParagraph);
  paragraphPrefix.setEnd(range.startContainer, range.startOffset);
  return {
    surface: context.surface.trim(),
    context: context.context,
    tokenId: startElement?.closest<HTMLElement>("[data-reader-token]")?.id,
    paragraphIndex: Number(startParagraph.dataset.readerParagraph),
    characterOffset: paragraphPrefix.toString().length,
  };
}
