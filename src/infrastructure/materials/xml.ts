import { XMLParser, XMLValidator } from "fast-xml-parser";
import { MATERIAL_LIMITS } from "@/domain/materials/types";

export function xmlDocument(bytes: Uint8Array, ordered = false): unknown {
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  if (
    bytes.length > MATERIAL_LIMITS.maxEntryBytes ||
    /<!\s*(?:DOCTYPE|ENTITY)/iu.test(xml)
  )
    throw new Error(
      "XML declarations with external entities or document types are not accepted.",
    );
  if (XMLValidator.validate(xml) !== true)
    throw new Error("A document contains damaged XML.");
  return new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: "@_",
    removeNSPrefix: true,
    preserveOrder: ordered,
    parseTagValue: false,
    parseAttributeValue: false,
    trimValues: false,
    processEntities: false,
  }).parse(xml) as unknown;
}

export function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function list(value: unknown): unknown[] {
  return value === undefined ? [] : Array.isArray(value) ? value : [value];
}

export function textContent(value: unknown): string {
  if (typeof value === "string" || typeof value === "number")
    return String(value);
  if (Array.isArray(value)) return value.map(textContent).join("");
  return Object.entries(record(value))
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, item]) => textContent(item))
    .join("");
}

/** A small fixed entity map; never expand user-defined entities. */
export function plainEntities(text: string): string {
  const named: Record<string, string> = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " ",
    ndash: "–",
    mdash: "—",
    hellip: "…",
    lsquo: "‘",
    rsquo: "’",
    ldquo: "“",
    rdquo: "”",
  };
  return text.replace(
    /&(#(?:x[\da-f]+|\d+)|[a-z]+);/giu,
    (original, code: string) => {
      if (code[0] !== "#") return named[code] ?? original;
      const number =
        code[1]?.toLowerCase() === "x"
          ? parseInt(code.slice(2), 16)
          : parseInt(code.slice(1), 10);
      return number > 0 &&
        number <= 0x10ffff &&
        !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number)
        : "�";
    },
  );
}

const ignored = new Set([
  "head",
  "script",
  "style",
  "form",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "audio",
  "video",
  "noscript",
]);
const blocks = new Set([
  "p",
  "div",
  "section",
  "article",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "li",
  "blockquote",
  "pre",
]);

export function xhtmlParagraphs(value: unknown): string[] {
  let text = "";
  function visit(nodes: unknown): void {
    for (const node of list(nodes))
      for (const [key, child] of Object.entries(record(node))) {
        if (key === ":@" || key.startsWith("?")) continue;
        if (key === "#text") {
          text += textContent(child);
          continue;
        }
        const tag = key.toLocaleLowerCase("en");
        if (ignored.has(tag)) continue;
        if (blocks.has(tag)) text += "\n\n";
        if (tag === "br") text += "\n";
        else visit(child);
        if (blocks.has(tag)) text += "\n\n";
      }
  }
  visit(value);
  return plainEntities(text)
    .split(/\n\s*\n/u)
    .map((paragraph) => paragraph.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
}
