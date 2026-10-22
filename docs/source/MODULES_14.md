# Функциональные модули LEXIS: подробная карта

Все модули используют одну систему идентификаторов слов/значений (`lemma`, `sense`) и общую историю доказательств (`learning_evidence`). Уровень знания не живёт независимо в 14 разных таблицах.

## 01. Intelligent Dictionary
- Поиск по слову, форме, фразе, переводу, контексту. Lemmatization и disambiguation.
- Один `lexeme` → несколько `senses`; POS, формы, транскрипция IPA, BrE/AmE audio, definition EN, перевод RU (если доступен и легален), грамматика управления, collocations, synonyms/antonyms, register, CEFR estimate (source-qualified).
- Контекст из Reader/Writing/Voice переносится в Quick View и рекомендует **значение**, не подменяя выбор пользователя.
- UI глубина: Quick View → Full Entry → Deep Dive.
- Содержимое должно иметь source, license, version, uncertainty; сгенерированные AI толкования не выдавать за лицензированный словарь.
- Add to Knowledge с изменяемым study intent и источником контекста; сохранить возможность изучать альтернативные значения позже.

## 02. Bulk Import / Smart Inbox
- Paste, TXT, CSV, XLSX, по доступности экспорт Reverso. Не обещать прямой доступ в закрытый аккаунт Reverso без интеграции.
- Preview rows, file encoding, empty/error report, source contexts, manual correction, duplicate detection by normalized lexeme + sense/context.
- Disambiguation uncertain imports, merge vs split, source metadata, undo/rollback, import status, batch selection.
- «Импортировано» не означает «не знаю». В обзор новых карточек отправлять выборочно, не все слова разом.

## 03. AI Verification / Challenge
- Evidence-backed проверки владения конкретным sense и skill.
- Политика rubric: самостоятельность, контекст, допустимые синонимы, грамматическая пригодность, степень подсказок, тип ошибки.
- Разделять deterministic grading (где возможно) и AI judgement; AI confidence / uncertainty.
- Возможность «Оспорить оценку», ручное исправление, журнал пересмотра; воспроизводить reason и исходный контекст, минимизируя сохранение чувствительных данных.

## 04. Smart Spaced Repetition
- FSRS-inspired scheduling per item/sense with ability/skill evidence; не ломать систему единого знания отдельной «правдой» карточек.
- Форматы recognition/production, translation, context gap, synonym discrimination, listening, speech, reading recall.
- Учёт качества ответа, hints, response modality, answer latency only if meaningful, lapse, interference, contextual variety.
- Не ухудшать оценку пользователя из-за неправильного AI judgment; schedule transparent and user-adjustable.

## 05. Voice Practice
- Modes Live Conversation и Push-to-Talk; mentor/examiner/companion styles, topic and goal.
- State machine: idle, permission, listening, processing, speaking, paused, recovery/error.
- Clear audio controls, language/accent selection, transcript visibility, correction intensity, post-session evidence review.
- ASR transcription != reliable phonetic assessment; separate pronunciation evaluator when integrated, uncertainty display.
- Dialogues, scenario practice, shadowing, repeat and repair; user may choose delayed/inline correction.

## 06. Semantic Network
- `sense`→`sense` typed relations: synonym, antonym, entailment, hypernym, collocation, often-confused, morphologic.
- Personal network of learned concepts + contexts, with filters and explainable edges; no explosion of unvalidated links.
- Small, navigable visual map, not an unreadable orbital visualization.

## 07. Analytics / Knowledge Observatory
- Separate activity vs retention vs demonstrated comprehension/production vs pronunciation (where valid).
- Trends over time, source diversity, confidence, goals, knowledge gaps and uncertainty; explain how figures are computed.
- Living Core = immediate affective orientation, Knowledge Observatory = detail and rigorous metrics.
- Privacy-preserving event instrumentation; no unconsented transmission of actual books/essays/voice transcripts.

## 08. Text Extraction & Contextual Lookup
- Paste selected text, import document where legal; tokenize safely, segment sentences, preserve original user text.
- Click/select expression, lemma/sense resolution, definitions, contextual examples; avoid accidental spoilers.
- Distinguish phrase/idiom vs single word, idiomatic meaning; low-confidence mapping asks for selection.

## 09. LEXIS Reader
- Import TXT, EPUB (where supported and DRM-free), pasted text; library status, chapter, progress, highlights, bookmarks, reading goals.
- Fluid typography, adjustable reading mode, font/size/spacing, theme contrast, progress, optional TTS, focus states.
- Tap word/phrase → contextual Quick View → select meaning → save / skip → return exactly to reading position.
- 'My Understanding' self-explanation, comprehension prompts and gentle AI feedback; help only on demand, avoid spoilers.
- Respect copyright/licensing, no DRM circumvention; user-provided content remains private.

## 10. Smart Cards
- Variety in modality + evidence; multiple acceptable answers, alternative phrasing, escalation from recognition to production.
- AI grading with reasons and Challenge; deterministic scoring for objective formats.
- Compact microinteraction, tactile visual feedback, accessibility and no shame-based gamification.

## 11. Writing Studio
- Free write, essay, email, topic prompts, business/IT writing if chosen; personal corpus from consenting user materials.
- Modes Write → Feedback → Improve; separate errors (grammar, meaning, vocabulary) from optional style suggestions.
- Explain-why + revise-yourself before auto-apply; version history, comparisons, user discretion.
- Knowledge evidence only when user independently produces target sense; auto-correct acceptance does not prove mastery.

## 12. Listening Studio
- Audio/video/transcript source with rights; transcript progressive reveal, shadowing, chunks, repetition, speed control (where audio provider supports).
- Follow listening → comprehension check → targeted vocabulary → spaced recall, with source trace and uncertainty.
- Distinguish reading transcript from actual listening comprehension in knowledge scoring.

## 13. AI Tutor
- Context-aware persistent pedagogical agent: knows current workspace/session, learning goals, evidence, not merely a generic chatbot.
- Modes Mentor / Examiner / Companion, adaptable correction style, Explain Differently, ask-for-example, non-intrusive suggestions.
- Sessions: Guided Lesson, Conversation Lab, Weakness Workshop, Real-Life Simulation, Knowledge Check.
- Tutor recommendation should cite the user’s own evidence in understandable language and avoid claiming definitive language level.
- Explicit permission for cross-module context; boundaries for personal corpus/private texts; deletion/export.

## 14. Grammar Atlas
- Structured grammar map + contextual deep dive when student encounters grammar in Reader/Writing/Voice.
- Concise rule, contrastive examples, common confusions, transfer exercises, revisit schedule.
- Grammar evidence distinct from word sense evidence; cannot infer grammar competence just because user read a sentence.
- Personalized weakness links, confidence and appeal.

## Сквозные функции (в дополнение к 14)
1. **Memory:** meaningful retrieval of contexts and studied patterns, controlled retention.
2. **Mistake DNA:** categorization and recurrence of mistakes, no stigmatizing labels.
3. **Deep Dive:** deeper linguistic and pragmatic explanations as progressive disclosure.
4. **Immersion:** EN/RU/mixed language support, adjustable by level and task.
5. **Shadowing:** repeat-after-listening and speech flow practice.
6. **Challenge:** dispute AI assessment and preserve validated user corrections.
7. **Personal Corpus:** user-owned examples with privacy controls.
8. **Goals:** co-authored targets with explicit confirmation of suggested adjustments.
9. **Explain Differently:** alternative explanation form, examples, analogy, step-by-step.
10. **Knowledge Gaps:** identify skill-specific underdeveloped contexts and offer targeted practice.

## Shared UI mechanics
- Home cards resume last meaningful activity, do not flood screen with 14 links.
- Command search across content/context, respecting privacy.
- Notification/inbox should be opt-in, flexible, no dark patterns.
- Consistent 'learned', 'recognizing', 'can produce' vocabulary must be explained to user and defined in code.
