export const RELATION_TYPES = [
  "synonym",
  "near-synonym",
  "antonym",
  "hypernym",
  "entailment",
  "collocation",
  "often-confused",
  "morphological",
  "sense-contrast",
  "contextual-association",
] as const;
export type RelationType = (typeof RELATION_TYPES)[number];
export interface SenseEdge {
  id: string;
  fromSenseId: string;
  toSenseId: string;
  type: RelationType;
  explanation: string;
  example: string;
  provenance: {
    provider: string;
    version: string;
    rights: string;
    kind: "editorial" | "ai" | "user";
  };
  verification: "editorial" | "proposal";
}
export function senseConnections(
  edges: readonly SenseEdge[],
  senseId: string,
  options: {
    type?: RelationType;
    source?: SenseEdge["provenance"]["kind"];
    savedSenseIds?: readonly string[];
  } = {},
): SenseEdge[] {
  const saved = options.savedSenseIds ? new Set(options.savedSenseIds) : null;
  return edges.filter(
    (edge) =>
      (edge.fromSenseId === senseId || edge.toSenseId === senseId) &&
      (!options.type || edge.type === options.type) &&
      (!options.source || edge.provenance.kind === options.source) &&
      (!saved || saved.has(edge.fromSenseId) || saved.has(edge.toSenseId)),
  );
}
export function relationLabel(type: RelationType): string {
  return type === "sense-contrast"
    ? "Different meanings"
    : type === "contextual-association"
      ? "Related in this example"
      : type.replace(/-/gu, " ");
}
