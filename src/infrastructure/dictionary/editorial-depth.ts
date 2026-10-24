/** Authored explanations supplement the bounded sample; they are not licensed dictionary output. */
export const EDITORIAL_DEPTH_SOURCE = {
  provider: "LEXIS editorial sample",
  version: "editorial-depth-v1",
  rights: "Original usage notes and practice prompts authored for LEXIS sample",
  kind: "editorial" as const,
};

export interface EditorialSenseDepth {
  partOfSpeech: string;
  register: string;
  pattern: string;
  usage: string;
  simpler: string;
  russian: string;
  contrast?: { senseId: string; explanation: string };
  practicePrompt: string;
}

export const EDITORIAL_SENSE_DEPTH: Readonly<
  Record<string, EditorialSenseDepth>
> = {
  "linger-stay": {
    partOfSpeech: "verb",
    register: "Neutral",
    pattern: "linger + place; linger over + activity",
    usage:
      "The person stays for longer. The word often suggests an unhurried or reluctant departure, but context decides the reason.",
    simpler: "Stay a little longer instead of leaving.",
    russian:
      "Человек задерживается. Причина может быть приятной или связанной с нежеланием уходить; само слово не объясняет её полностью.",
    contrast: {
      senseId: "linger-remain",
      explanation:
        "A person can linger by a door. A memory can linger after a conversation: that is the other meaning, remaining noticeable.",
    },
    practicePrompt:
      "Describe a real or imagined place where someone stayed longer than planned. Make the place and the reason clear.",
  },
  "linger-remain": {
    partOfSpeech: "verb",
    register: "Neutral",
    pattern: "a feeling / smell / doubt + lingers",
    usage:
      "Something remains after the event or cause has ended. This meaning does not require a person choosing to stay.",
    simpler: "Something is still present after you expected it to go away.",
    russian:
      "Ощущение, запах или сомнение сохраняется после исходного события. Здесь нет обязательного решения человека задержаться.",
    contrast: {
      senseId: "linger-stay",
      explanation:
        "Compare 'the scent lingered' with 'we lingered by the window'. The first describes a continuing effect; the second describes people staying.",
    },
    practicePrompt:
      "Describe a feeling, smell or doubt that remained after an event. Show what happened first.",
  },
  "stillness-calm": {
    partOfSpeech: "noun",
    register: "Neutral; common in descriptive writing",
    pattern: "the stillness of + place / time; in stillness",
    usage:
      "Stillness emphasizes little movement as well as quiet. A place can be quiet while people move around, so quiet and stillness are not always interchangeable.",
    simpler: "A moment when things hardly move and feel quiet.",
    russian:
      "Stillness подчёркивает неподвижность, часто вместе с тишиной. Quiet может описывать только низкий уровень шума.",
    practicePrompt:
      "Describe a moment with little movement. Include one concrete detail that makes the stillness visible.",
  },
  "deliberate-careful": {
    partOfSpeech: "adjective",
    register: "Neutral",
    pattern: "a deliberate + choice / effort / movement",
    usage:
      "This adjective points to intention. A deliberate action is not necessarily slow. The verb 'deliberate' has a different pronunciation and is outside this sample sense.",
    simpler: "Done because someone chose to do it, with care or intention.",
    russian:
      "Прилагательное означает намеренное или обдуманное действие. Оно не всегда означает медленное действие; одноимённый глагол — отдельная запись, которой нет в этом sample.",
    practicePrompt:
      "Describe an intentional choice. Add enough context to distinguish it from an accident.",
  },
  "glimpse-look": {
    partOfSpeech: "noun",
    register: "Neutral",
    pattern: "catch / get a glimpse of + person / thing",
    usage:
      "A glimpse is short or incomplete. It does not suggest examining something carefully. This sample covers the noun, not the separate verb use.",
    simpler: "A very short look, when you cannot see everything.",
    russian:
      "Короткий или неполный взгляд, а не подробное рассматривание. Здесь представлено существительное, а не отдельное глагольное значение.",
    practicePrompt:
      "Describe something someone saw only briefly, and explain why the view was limited.",
  },
  "beneath-under": {
    partOfSpeech: "preposition",
    register: "Often more formal or literary than 'under'",
    pattern: "beneath + noun phrase",
    usage:
      "This spatial meaning places something lower than another thing. Figurative uses such as social inferiority are separate and are not covered by this sample sense.",
    simpler: "Directly under something.",
    russian:
      "Пространственное значение «под». Переносные значения не следует автоматически приписывать этой записи.",
    practicePrompt:
      "Place one object beneath another in a sentence. Keep the spatial relationship unambiguous.",
  },
  "wander-walk": {
    partOfSpeech: "verb",
    register: "Neutral",
    pattern: "wander through / along / around + place; wander off",
    usage:
      "Wandering emphasizes moving without a fixed route. Wonder, which means to ask yourself a question, is a different word.",
    simpler: "Move around without a clear route or destination.",
    russian:
      "Wander — бродить без определённого маршрута. Не путайте с wonder — задаваться вопросом или удивляться.",
    practicePrompt:
      "Describe a walk without a planned route. Show how it differs from going straight to a destination.",
  },
  "trace-mark": {
    partOfSpeech: "noun",
    register: "Neutral",
    pattern: "a trace of + something; leave a trace",
    usage:
      "The noun describes a small sign or remaining amount. In 'a trace of rain', the trace is the sign; nobody is following a route.",
    simpler: "A small sign that something was there.",
    russian:
      "Существительное: небольшой след или остаток. В a trace of rain слово называет признак, а не действие.",
    contrast: {
      senseId: "trace-follow",
      explanation:
        "A trace on a map is a mark (noun). To trace a route is to follow it (verb). Keep these histories separate.",
    },
    practicePrompt:
      "Describe a small sign left after something disappeared. Use trace as a noun.",
  },
  "trace-follow": {
    partOfSpeech: "verb",
    register: "Neutral",
    pattern: "trace + route / outline / origins",
    usage:
      "The verb describes following a line, course or history. Context tells whether this is a physical movement or an investigation.",
    simpler: "Follow a line or find the path something took.",
    russian:
      "Глагол: следовать по линии или прослеживать историю. Это действие, в отличие от существительного a trace.",
    contrast: {
      senseId: "trace-mark",
      explanation:
        "Compare 'trace the route' (follow it) with 'a trace of rain' (a small sign). A shared spelling does not make them the same meaning.",
    },
    practicePrompt:
      "Describe following an outline or investigating where something came from. Use trace as a verb.",
  },
  "quiet-calm": {
    partOfSpeech: "adjective",
    register: "Neutral",
    pattern: "a quiet + place / moment; keep quiet",
    usage:
      "Quiet can describe little noise or little activity. Quite is a different word. A quiet place is not necessarily completely silent.",
    simpler: "With little noise or activity.",
    russian:
      "Quiet — тихий или спокойный; полная тишина не обязательна. Quite — другое слово, не форма quiet.",
    practicePrompt:
      "Describe a place with little noise or activity. Add a detail that supports the adjective quiet.",
  },
};
