import type { TaskDefinition } from "@/domain/tasks";

export interface GrammarConcept {
  id: string;
  title: string;
  description: string;
  rule: string;
  russianRule: string;
  examples: { sentence: string; explanation: string }[];
  contrast: string;
  options: string[];
  task: TaskDefinition;
}

const provenance = {
  provider: "LEXIS editorial",
  version: "grammar-editorial-v1",
  rights: "Original LEXIS-authored explanations, examples and exercises.",
  kind: "editorial" as const,
};

function concept(
  input: Omit<GrammarConcept, "task"> & {
    prompt: string;
    answers: string[];
    explanation: string;
    hint: string;
  },
): GrammarConcept {
  const { prompt, answers, explanation, hint, ...content } = input;
  return {
    ...content,
    task: {
      id: `grammar:${input.id}:choice-1`,
      version: "1",
      target: { kind: "grammar", conceptId: input.id },
      skill: "grammar",
      format: "grammar-choice",
      promptFamily: "editorial-concept-choice",
      prompt,
      acceptedAnswers: answers,
      explanation,
      rubricVersion: "grammar-closed-v1",
      evaluator: "deterministic",
      hints: [{ id: "rule-hint", text: hint }],
      source: provenance,
    },
  };
}

/** A small authored Atlas. It deliberately makes no claim of complete grammar coverage. */
export const GRAMMAR_CONCEPTS: readonly GrammarConcept[] = [
  concept({
    id: "subject-verb-agreement",
    title: "Subject–verb agreement",
    description: "Match the verb to the subject, not the nearest noun.",
    rule: "In the present simple, he, she and it usually take a verb ending in -s. I, you, we and they take the base form. The subject can be separated from its verb by a longer phrase.",
    russianRule:
      "В Present Simple после he, she, it у смыслового глагола обычно появляется -s. Ориентируйтесь на подлежащее, а не на ближайшее существительное.",
    examples: [
      {
        sentence: "The notebook beside the keys belongs to Mia.",
        explanation: "Notebook is singular, so the verb is belongs.",
      },
      {
        sentence: "The keys beside the notebook belong to Mia.",
        explanation: "Keys is plural, so the verb is belong.",
      },
    ],
    contrast:
      "Some collective nouns allow different agreement in British and American usage. This exercise avoids that ambiguity.",
    prompt:
      "Choose the present-simple verb: Each of the windows ___ a small brass handle.",
    answers: ["has"],
    options: ["has", "have", "having"],
    explanation:
      "Each is singular here: Each of the windows has a small brass handle. The plural noun windows does not control the verb.",
    hint: "Find the subject of the clause: each, not windows.",
  }),
  concept({
    id: "past-simple-present-perfect",
    title: "Past simple & present perfect",
    description: "Connect an event to finished time or to the present.",
    rule: "Use the past simple for a completed event at a finished time such as yesterday. The present perfect links a past event or experience to now and normally does not pair with an explicit finished past-time expression.",
    russianRule:
      "Past Simple описывает событие в завершённый момент прошлого. Present Perfect связывает прошлое с настоящим и обычно не употребляется с yesterday или last year.",
    examples: [
      {
        sentence: "I visited the exhibition yesterday.",
        explanation: "Yesterday is a finished past time.",
      },
      {
        sentence: "I have visited that exhibition twice.",
        explanation:
          "The sentence describes experience up to now, without a finished time.",
      },
    ],
    contrast:
      "American English often uses the past simple with already or just where British English also uses the present perfect. Those variants need context and are not automatically errors.",
    prompt:
      "Choose the form for a finished past time: We ___ the gallery yesterday.",
    answers: ["visited"],
    options: ["visited", "have visited", "visiting"],
    explanation:
      "We visited the gallery yesterday. The explicit finished time yesterday calls for the past simple in this sentence.",
    hint: "Look at the time expression yesterday.",
  }),
  concept({
    id: "articles-reference",
    title: "Articles & shared reference",
    description: "Introduce something, then make its reference clear.",
    rule: "A or an often introduces one countable thing that the listener cannot yet identify. The often points to something already identified or otherwise clear from the situation. General plural and uncountable references often use no article.",
    russianRule:
      "A/an часто вводит один исчисляемый предмет. The указывает на уже известный или понятный из ситуации предмет. Перед обобщающим множественным числом артикль часто не нужен.",
    examples: [
      {
        sentence: "I found a letter. The letter was addressed to my neighbour.",
        explanation:
          "The second mention identifies the letter already introduced.",
      },
      {
        sentence: "Letters can tell us a great deal.",
        explanation: "Letters refers to letters in general.",
      },
    ],
    contrast:
      "Article choice depends on the intended reference. A different article can be grammatical when the speaker means something different.",
    prompt:
      "You have already introduced a particular notebook: I bought a notebook. ___ notebook has a green cover.",
    answers: ["The"],
    options: ["The", "A", "An"],
    explanation:
      "The notebook refers back to the particular notebook in the first sentence.",
    hint: "The listener can identify the notebook from the previous sentence.",
  }),
  concept({
    id: "hypothetical-conditionals",
    title: "Hypothetical conditionals",
    description: "Describe an imagined situation and its possible result.",
    rule: "For an imagined present or future situation, if often takes a past form and the result takes would plus a base verb. The past form can express distance from reality, not past time.",
    russianRule:
      "Во втором условном предложении if часто сочетается с формой прошедшего времени, а результат — с would + начальной формой глагола. Прошедшая форма здесь может выражать нереальность, а не прошлое.",
    examples: [
      {
        sentence: "If I had more time, I would walk home.",
        explanation: "The speaker imagines having more time now.",
      },
      {
        sentence: "If I were you, I would ask.",
        explanation: "Were is a standard form for a hypothetical situation.",
      },
    ],
    contrast:
      "Both was and were can occur in some hypothetical if-clauses. Were is common in formal usage; the exercise explicitly accepts both forms.",
    prompt:
      "Choose a standard hypothetical form: If she ___ here now, she would help us.",
    answers: ["were", "was"],
    options: ["were", "was", "is"],
    explanation:
      "Both were and was can express this hypothetical situation. Were is common in formal English. Is would normally belong to a different conditional meaning.",
    hint: "The sentence imagines her presence now. Both a formal and a common informal past form are accepted.",
  }),
  concept({
    id: "time-prepositions",
    title: "Time prepositions",
    description: "Use at, on and in with clear time expressions.",
    rule: "At commonly goes with clock times, on with days and dates, and in with months, years and longer periods. Fixed expressions and regional variants need to be learned in context.",
    russianRule:
      "At часто употребляется с точным временем, on — с днями и датами, in — с месяцами, годами и более долгими периодами. Устойчивые выражения и региональные варианты зависят от контекста.",
    examples: [
      {
        sentence: "The train leaves at six.",
        explanation: "At marks a clock time.",
      },
      {
        sentence: "The exhibition opens on Friday.",
        explanation: "On marks a particular day.",
      },
    ],
    contrast:
      "At the weekend and on the weekend are regional alternatives. Neither should be rejected solely because it differs from a preferred accent.",
    prompt: "Choose the preposition: The reading group meets ___ Tuesday.",
    answers: ["on"],
    options: ["on", "at", "in"],
    explanation:
      "On Tuesday is the standard preposition with a named day in this sentence.",
    hint: "Tuesday names a day, not a clock time or a month.",
  }),
  concept({
    id: "uncountable-reference",
    title: "Countable & uncountable uses",
    description: "Treat the intended meaning as part of the grammar.",
    rule: "Some nouns are normally uncountable in a particular meaning. Advice in its usual meaning takes no plural -s and cannot directly follow a/an. Use a piece of advice when counting individual recommendations.",
    russianRule:
      "В обычном значении advice — неисчисляемое существительное: без -s и без a/an. Чтобы посчитать отдельные советы, используют a piece of advice / two pieces of advice.",
    examples: [
      {
        sentence: "She gave me useful advice.",
        explanation: "Advice is uncountable in this meaning.",
      },
      {
        sentence: "She gave me two useful pieces of advice.",
        explanation:
          "Pieces lets the speaker count individual recommendations.",
      },
    ],
    contrast:
      "A noun can have countable and uncountable senses. Material names, experiences and servings need context; a single rule cannot decide every use.",
    prompt:
      "Choose the usual form: Could you give me ___ about preparing for the interview?",
    answers: ["some advice"],
    options: ["some advice", "an advice", "several advices"],
    explanation:
      "Some advice is standard here. To count recommendations, say several pieces of advice.",
    hint: "Advice is uncountable in its everyday meaning.",
  }),
];

export function grammarConcept(id: string | null | undefined) {
  return GRAMMAR_CONCEPTS.find((item) => item.id === id) ?? null;
}

/** One contiguous change, presented as text without HTML or invented evaluation. */
export function writingDifference(before: string, after: string) {
  const points = (value: string) =>
    typeof Intl.Segmenter === "function"
      ? Array.from(
          new Intl.Segmenter("en", { granularity: "grapheme" }).segment(value),
          (part) => part.segment,
        )
      : Array.from(value);
  const left = points(before),
    right = points(after);
  let start = 0;
  while (
    start < left.length &&
    start < right.length &&
    left[start] === right[start]
  )
    start += 1;
  let tail = 0;
  while (
    tail < left.length - start &&
    tail < right.length - start &&
    left[left.length - tail - 1] === right[right.length - tail - 1]
  )
    tail += 1;
  return {
    prefix: left.slice(0, start).join(""),
    removed: left.slice(start, left.length - tail).join(""),
    added: right.slice(start, right.length - tail).join(""),
    suffix: tail ? right.slice(right.length - tail).join("") : "",
  };
}
