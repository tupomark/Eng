import type { SenseEdge } from "@/domain/knowledge/network";

const provenance = {
  provider: "LEXIS editorial sample",
  version: "relations-v1",
  rights: "Original teaching contrasts and examples authored for LEXIS",
  kind: "editorial" as const,
};

/** Small warranted examples. No embedding distance or invented synonym claims. */
export const EDITORIAL_RELATIONS: readonly SenseEdge[] = [
  {
    id: "linger-polysemy",
    fromSenseId: "linger-stay",
    toSenseId: "linger-remain",
    type: "sense-contrast",
    explanation:
      "A person can linger by choosing not to leave; a smell or memory can linger by remaining noticeable. The shared verb does not make these interchangeable meanings.",
    example: "We lingered by the door. A familiar scent lingered in the room.",
    provenance,
    verification: "editorial",
  },
  {
    id: "trace-pos-contrast",
    fromSenseId: "trace-mark",
    toSenseId: "trace-follow",
    type: "sense-contrast",
    explanation:
      "A trace can be a remaining sign (noun). To trace can mean to follow an outline or history (verb). These entries require different grammatical roles.",
    example: "A trace of ink remained. She traced the route on the map.",
    provenance,
    verification: "editorial",
  },
  {
    id: "quiet-stillness-example",
    fromSenseId: "quiet-calm",
    toSenseId: "stillness-calm",
    type: "contextual-association",
    explanation:
      "Quiet describes little noise or activity; stillness names a state with little movement. They can describe one scene, but one does not guarantee the other and the words are not direct synonyms.",
    example: "The room was quiet, yet the spinning fan broke its stillness.",
    provenance,
    verification: "editorial",
  },
  {
    id: "trace-linger-example",
    fromSenseId: "trace-mark",
    toSenseId: "linger-remain",
    type: "contextual-association",
    explanation:
      "An authored example links a remaining trace with the verb linger. This is a connection in one sentence, not a dictionary claim that the words are synonyms or a frequent collocation.",
    example: "A trace of warmth lingered after the fire went out.",
    provenance,
    verification: "editorial",
  },
];
