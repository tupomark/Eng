import type { DictionaryEntry } from "../../domain";

/** Original editorial examples for the initial reading passage; no licensed dictionary API is connected. */
export const seedEntries: DictionaryEntry[] = [
  {
    lexeme: {
      id: "lex-linger",
      lemma: "linger",
      ipa: "/ˈlɪŋ.ɡər/",
      partOfSpeech: "verb",
    },
    senses: [
      {
        id: "linger-stay",
        lexemeId: "lex-linger",
        definition:
          "To stay somewhere longer than expected, often because you do not want to leave.",
        translation: "задерживаться, медлить с уходом",
        example: "We lingered by the window as the afternoon light faded.",
        collocations: [
          "linger over coffee",
          "linger by the door",
          "linger a little longer",
        ],
      },
      {
        id: "linger-remain",
        lexemeId: "lex-linger",
        definition: "To remain noticeable after the original cause has gone.",
        translation: "сохраняться, долго не исчезать",
        example:
          "The warmth of her words lingered long after the conversation.",
        collocations: [
          "a lingering memory",
          "a scent lingers",
          "doubts linger",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-stillness",
      lemma: "stillness",
      ipa: "/ˈstɪl.nəs/",
      partOfSpeech: "noun",
    },
    senses: [
      {
        id: "stillness-calm",
        lexemeId: "lex-stillness",
        definition: "A quiet state with little or no movement.",
        translation: "неподвижность, тишина",
        example:
          "In the stillness of the morning, she could hear a distant bird.",
        collocations: [
          "complete stillness",
          "the stillness of dawn",
          "sit in stillness",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-deliberate",
      lemma: "deliberate",
      ipa: "/dɪˈlɪb.ər.ət/",
      partOfSpeech: "adjective",
    },
    senses: [
      {
        id: "deliberate-careful",
        lexemeId: "lex-deliberate",
        definition:
          "Done carefully and with intention rather than by chance or in a hurry.",
        translation: "осознанный, обдуманный",
        example: "He took a deliberate step away from his usual routine.",
        collocations: [
          "a deliberate choice",
          "a deliberate pace",
          "a deliberate effort",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-glimpse",
      lemma: "glimpse",
      ipa: "/ɡlɪmps/",
      partOfSpeech: "noun",
    },
    senses: [
      {
        id: "glimpse-look",
        lexemeId: "lex-glimpse",
        definition: "A brief or incomplete look at something.",
        translation: "мимолётный взгляд",
        example: "Through the leaves, she caught a glimpse of the sea.",
        collocations: [
          "catch a glimpse",
          "a brief glimpse",
          "a glimpse of the future",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-beneath",
      lemma: "beneath",
      ipa: "/bɪˈniːθ/",
      partOfSpeech: "preposition",
    },
    senses: [
      {
        id: "beneath-under",
        lexemeId: "lex-beneath",
        definition: "In or to a position directly under something.",
        translation: "под, ниже",
        example: "A narrow path lay beneath the branches.",
        collocations: [
          "beneath the surface",
          "beneath your feet",
          "beneath the trees",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-wander",
      lemma: "wander",
      ipa: "/ˈwɒn.dər/",
      partOfSpeech: "verb",
    },
    senses: [
      {
        id: "wander-walk",
        lexemeId: "lex-wander",
        definition: "To walk or move without a fixed route or destination.",
        translation: "бродить, неспешно гулять",
        example: "They wandered along the shore until the sky grew dark.",
        collocations: [
          "wander through a city",
          "wander along the coast",
          "wander off",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-trace",
      lemma: "trace",
      ipa: "/treɪs/",
      partOfSpeech: "noun · verb",
    },
    senses: [
      {
        id: "trace-mark",
        lexemeId: "lex-trace",
        definition: "A small mark or sign showing that something was present.",
        translation: "след, едва заметный признак",
        example: "By noon, only a trace of mist remained above the water.",
        collocations: ["a trace of warmth", "leave a trace", "without a trace"],
      },
      {
        id: "trace-follow",
        lexemeId: "lex-trace",
        definition: "To follow the course, outline, or history of something.",
        translation: "прослеживать, обводить",
        example: "She traced the winding route on the map with one finger.",
        collocations: [
          "trace a route",
          "trace the origins",
          "trace an outline",
        ],
      },
    ],
  },
  {
    lexeme: {
      id: "lex-quiet",
      lemma: "quiet",
      ipa: "/ˈkwaɪ.ət/",
      partOfSpeech: "adjective",
    },
    senses: [
      {
        id: "quiet-calm",
        lexemeId: "lex-quiet",
        definition: "Making little noise or having little activity.",
        translation: "тихий, спокойный",
        example: "The quiet street gave her room to think.",
        collocations: ["a quiet moment", "a quiet place", "keep quiet"],
      },
    ],
  },
];

const forms: Record<string, string> = {
  lingered: "linger",
  lingering: "linger",
  lingers: "linger",
  wandered: "wander",
  wandering: "wander",
  wanders: "wander",
  traced: "trace",
  tracing: "trace",
  traces: "trace",
  glimpses: "glimpse",
  quieter: "quiet",
  quietest: "quiet",
};

export function findEntry(word: string): DictionaryEntry | undefined {
  const normalized = word
    .normalize("NFKC")
    .toLowerCase()
    .trim()
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
  const lemma = forms[normalized] ?? normalized;
  return seedEntries.find((entry) => entry.lexeme.lemma === lemma);
}
