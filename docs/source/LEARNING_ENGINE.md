# Единый обучающий движок: domain model / learning science / evidence

## Центральная гипотеза
Ключевой объект: `sense` (значение слова или устойчивого выражения), и его владение по **навыкам**, контекстам и времени. Один и тот же `lexeme` может обладать несколькими meanings с резко различающейся доказанностью.

### Базовые сущности
- `Lexeme`: headword/lemma, POS, language, normalization, inflection links.
- `Sense`: meaning ID, version, definitions/translations, provenance, sense-level CEFR estimate with uncertainty.
- `UsageExample`, `Collocation`, `Pronunciation`, `LexicalRelation`: многозначные ссылки и права использования.
- `UserLexicalItem`: пользователь связывает lexeme/sense с причиной изучения, context ID, imported source, priority/status. Не уровень знания.
- `LearningEvidence`: append-only наблюдение с user, sense, `skill`, task type, modality, result, hint usage, independence, context, timestamp, uncertainty, source, evaluation policy version, challenge status.
- `CompetenceEstimate`: derived projection, not necessarily mutable single field; per (user, sense, skill) score/confidence/observations/updatedAt.
- `ReviewItem`, `ReviewEvent`, `ReviewSchedule`: schedule learning spaced recall; different from evidence and competence, but produces evidence.
- `LearningSession`, `TutorRecommendation`, `GrammarConcept`, `WritingRevision`, `ReadingLocation`, `Goals`.
- `PersonalContext`: user-owned content with explicit scope, rights, retention and deletion.

### Предпочтительная онтология навыков
- recognition: can recognize candidate in isolation;
- contextual_comprehension: interprets use in a passage;
- recall: retrieves word or sense without answer options;
- writing_production: independently uses sense correctly in written output;
- spontaneous_speech: independently uses sense correctly in fluid conversation;
- listening_comprehension: understands heard sense without transcript;
- pronunciation: phonetic performance (separate measurement, with validation);
- grammar: a distinct grammar concept competency, not a direct sense score.

Эти названия — предлагаемая инженерная модель, не UI taxonomy. Не смешивать такие measurements в единую уверенную цифру без методологии.

## Evidence update mechanics
1. Learning event references exact task, context and expected sense.
2. Evaluation policy deterministic where possible; optional AI rubric with confidence and alternatives.
3. Append evidence event, including «invalid / challenged» status.
4. Derived estimates recalculated from valid evidence; confidence considers quantity, age, difficulty, hints, transfer between contexts.
5. Review scheduling consumes meaningful outcomes, not click events; preserve history for re-evaluation.
6. User sees simple natural-language explanation: «вы понимаете смысл в тексте, но пока редко используете его без подсказок».

**Do not fake calibrated probabilistic percentages.** Если не проведена калибровка на реальных данных, UI обозначает уровень как tentative, не «87% mastery».

## FSRS and Smart Review
- Use publicly documented, reproducible FSRS implementation/version when selected. FSRS provides interval planning, not semantic competence proof.
- Map training objective to stable review item: same sense + skill + prompt type or shared history, depending on empirical testing.
- Need policy for when multiple cards targeting same sense share or separate scheduler state. Keep decision recorded.
- Accept alternative valid translations/expressions, avoid penalties on ambiguous prompts.
- Promote recognition → recall → applied writing/speaking progressively, without guaranteeing automatic transfer.
- Intelligent workload: caps, due queue, fatigue, user control, postponed reviews.

## Challenge of AI assessment
Rubric must log expected meaning, admissible alternatives, context, model assessment, confidence, revised judgement. User can challenge, provide intended interpretation, and optionally mark correction. Challenge affects future competence and schedule by reconciliation, not only changing UI message. Avoid storing verbose private texts unnecessarily.

## Knowledge Flow
- Reader lookup recommends dictionary sense with context.
- Saved sense adds to Smart Inbox and candidate review, linking original passage.
- Writing using sense produces stronger production evidence than reading exposure.
- Voice conversation may produce speaking evidence (if transcription and evaluation reliable).
- Listening without transcript gives listening-specific evidence.
- Grammar errors connect to Atlas and focused Tutor session.
- Mistake DNA connects repeated error patterns to weakness workshops.
- Knowledge Observatory displays meaningful progression, with uncertainty and source of evidence.
- Every cross-module operation must be explainable and reversible where appropriate.

## Anti-patterns
- Marking sense «known» on import/add.
- Mistaking AI-generated correction acceptance for spontaneous skill.
- Using pure ASR confidence as pronunciation grade.
- Using a binary database flag as whole knowledge model.
- Automatically linking all similar-looking words as synonyms.
- Showing exact CEFR for each definition without caveat or source.

## Example minimal event (illustrative, not a frozen schema)
```json
{
  "event_type": "answer_evaluated",
  "sense_id": "sense_reluctant_01",
  "skill": "contextual_comprehension",
  "modality": "reader_check",
  "is_independent": true,
  "hints_used": 0,
  "result": "accepted",
  "confidence": "high",
  "review_required": false,
  "evaluation_version": "rubric_v1",
  "source_context_id": "reading_highlight_id"
}
```
The ID and values above are examples, not actual reference dictionary IDs or user data.
