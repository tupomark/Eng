# Модель знаний, локальные stores и PostgreSQL

Актуальная схема реализации v2, 24 октября 2026. Основная единица — пользователь + стабильное значение + конкретный навык. Сохранение/импорт — намерение/материал, не evidence. Отсутствие наблюдений — недостаток данных, не нулевое знание. Имена таблиц и полей — инженерный выбор, а не исторически утверждённый пиксельный/product контракт.

## Идентичности и разделение фактов

| Группа                | Реализованное представление                                                                            | Правило                                                                                                      |
| --------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| Lexeme / Sense        | Авторский `seed`, стабильные sense IDs, формы/POS, версии/provenance                                   | Разные POS/значения не сливаются по строке; unavailable sense остаётся в Library/history                     |
| Учебное намерение     | Legacy saved sense, materials Inbox rows/intent                                                        | Сохранение не создаёт знания; unresolved candidate не вынуждается ссылаться на первый sense                  |
| Источник              | Material document/version/chapter/paragraph/character anchor, bookmarks, bounded context visits        | Appearance/position и evidence — разные записи; временный excerpt ledger не полная долговременная provenance |
| Task                  | Versioned typed target, skill/format/prompt family, rubric, answers/hints, source/evaluator capability | Lexical target и GrammarConcept различны; проверяется допустимая modality                                    |
| Attempt / Observation | Draft answer, assistance/reveal, final result, exact skill, independent flag и source                  | Uncertain/provider failure не создаёт false negative; accepted correction не independent production          |
| Competence            | Rebuildable task summary/Observatory, legacy self-report projection                                    | Самоотчёт отдельно от независимых observations; нет общего mastery/CEFR процента                             |
| Review                | Review item, explicit user rating events, FSRS card/parameters/version, postpone/archive               | Objective evaluation не заменяет user rating; manual reschedule не меняет knowledge                          |
| Challenge             | Observation exclusion с reason/time/ID, оригинал сохраняется                                           | Исключение сразу применяется; последующие review events воспроизводятся, не «вычитается последнее число»     |
| Writing               | Draft + immutable revisions/parents, caret/scroll, conflict branches                                   | Старый запрос не затирает новую revision; обе конфликтующие версии сохраняются                               |
| Listening             | Private media blob/source/transcript/session + assistance                                              | Seek не доказывает playback; transcript disclosure сохраняется; shadowing не pronunciation grade             |
| Goals/relations       | Local goal revisions и typed editorial edges/provenance                                                | Progress считает определённые observations; workload suggestion требует подтверждения                        |

Семь lexical skills: `recognition`, `context`, `recall`, `writing`, `speaking`, `listening`, `pronunciation`; grammar — отдельный target/skill `grammar`. Старые пять IDs не переименованы. Применение новой модели не переносит recognition history на speaking/listening.

## Browser storage и backup/restore

| Store                                  | Содержимое и версия                                                          | Граница                                                                                               |
| -------------------------------------- | ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `lexis.learning.v1`                    | Старые saved senses/contexts, self-review evidence/disputes, sample position | Сохраняется без автоматической перезаписи; restore preview/merge проверяет совпадающие ID и конфликты |
| `lexis.tasks.v1`                       | Definitions, attempts, challenges, review items/events                       | JSON runtime validation, best-effort stale snapshot guard; не cloud transaction                       |
| `lexis.materials.v1`                   | Books/chapters/anchors/bookmarks/import batches/rows                         | Local owner, ограниченные размеры; additive restore не затирает текущую позицию                       |
| `lexis.reader.preferences.v1`          | Font/size/spacing                                                            | Не evidence и не влияние на schedule                                                                  |
| `lexis.goals.v1`                       | Goals/cadence/revisions/archive                                              | Неизменяемое происхождение counts; stale proposals не применяются                                     |
| `lexis.writing.v1` (IndexedDB)         | Drafts/revisions/conflicts                                                   | Readwrite transactions/revision checks; собственный export/restore                                    |
| `lexis.media.local.v1` (IndexedDB)     | Imported media blobs/transcripts/playback sessions                           | Private object URLs, не public storage; complete media backup/restore ещё не завершён                 |
| Preferences/Tutor/context/offline keys | Отдельные typed settings, conversations и bounded session-local excerpts     | Согласия/сроки/удаление отдельно от evidence; соответствующие новые срезы требуют integrated gate     |

JSON проходят runtime validation; TypeScript не валидирует persisted bytes. Повреждение/неизвестная версия блокирует writes и сохраняет исходник для raw export. Read failure не лечится hidden reset. Quota/write failure не публикует success. localStorage CAS best effort не защищает от всех строго одновременных writes. IndexedDB атомарность ограничена конкретной local DB и не заменяет multi-device sync.

V1 restore проверяет file size/schema, сохраняет IDs, unavailable senses и disputes, показывает preview, требует backup/confirmation и выполняет additive merge. Conflicting IDs/context останавливают перенос. Повтор идентичного импорта идемпотентен, старый backup не активирует исключённое событие. Другие stores экспортируются отдельно. Обещание единого полного profile restore до сверки всех stores/media не даётся.

## FSRS, assistance и replay

Идентичность item: `(target kind + ID, skill, prompt family)`. Schedule facts содержат explicit rating event ID, timestamp, scheduler version, параметры и FSRS card. Канонический порядок — время плюс стабильный ID при равенстве. Соседние задания одного target не показываются подряд как независимые успехи. Внешний model confidence и FSRS desired retention не являются процентом владения языком.

`ts-fsrs@5.4.2`/FSRS-6 с pinned policy `ts-fsrs-5.4.2/fsrs-6/lexis-v1` выполняет actual schedule. Старый heuristic recognition bootstrap сначала показывает preview/backup; local legacy event IDs сохраняются как provenance. Только подходящая recognition self-report история переносится в соответствующий item, не в production skills. Более поздний legacy dispute исключает импортированное влияние; backup restore не снимает exclusion.

Assistance snapshot фиксирует hint IDs, answer/transcript reveal и accepted correction. Uncertain или технически неоценённая попытка не создаёт observation/lapse. Challenge исключает сомнительное observation и связанные ratings из активного replay; оригинал остаётся audit. Observatory/Mistake patterns/Goals используют активный canonical набор, а не старые cached numbers. Детальная политика — в [FSRS/tasks](fsrs-and-tasks.md) и [Observatory](knowledge-observatory.md).

## SQL и доверенная запись

Foundation migration содержит `lexemes`, `senses`, `library_documents`, `reader_positions`, `user_saved_senses`, `learning_evidence`, `evidence_disputes`, `skill_progress`. Следующая `20261022205958_archive_and_atomic_commands.sql` добавляет archive/revision semantics, collections/source contexts/document versions/chapters/import rows/writing revisions и private command/legacy-ID receipts. `20261024055040_ai_request_reservations.sql` добавляет ограниченный private quota journal; её отдельные tests не означают подключённый API.

Все личные связи проверяют owner составными FK и RLS. Чтение Auth identity выполняется сервером; клиентский `user_id`, score/provider/model не доверенные. Service-only SECURITY INVOKER commands принимают небольшой validated payload, idempotency key и ожидаемую revision. Archive/self-review/dispute/purge/writing revision/legacy UUID mapping выполняются в SQL transaction; повтор команды не создаёт новое событие, конфликт revision обнаруживается. Полная task/FSRS/cloud projector transaction ещё не закрыта этими legacy commands.

Локальные event IDs не обязаны быть UUID. `legacy-id.ts` и служебный mapping command стабильно отображают legacy namespace/ID в UUIDv5, сохраняют provenance и исключают случайную новую генерацию при каждом переносе. Это основа MIG-01, а не завершённый UI переноса в аккаунт.

## Архивирование, purge и приватные источники

Baseline cascade saved sense→evidence устранён: обычное archive не удаляет историю; FK не позволяет случайно удалить связь с evidence. Explicit purge имеет отдельную команду и точную подтверждающую фразу, account deletion имеет осознанную cascade semantics. Private source deletion и learning excerpt deletion различаются: UI объясняет, что независимая saved/practice история может остаться. Временные Dictionary contexts удалённого источника инвалидируются.

Полный profile purge должен останавливать in-flight writes/capture, охватывать local/session keys, IndexedDB, own cache/service worker и производные contexts; частичная ошибка не должна называться полным удалением. Hosted account purge, storage objects, search/summaries и residual backup SLA остаются отдельным live/operations gate. Browser-local key deletion не доказывает удаление аккаунта в Supabase.

## Проверки и незакрытый hosted scope

PGlite применяет реальные SQL migrations и выполняет ownership/RLS/grants/FK/idempotency/revision/immutability checks с минимальными auth stubs. Domain/application tests проверяют assistance/skill isolation, stable replay, legacy mapping, restore/conflicts/storage failures. Browser journeys проверяют фактическое сохранение и reopen. Последний результат/SHA каждой проверки — в [PROGRESS](PROGRESS.md).

Это не hosted Supabase Auth/JWT/PostgREST/storage, два устройства, реальная account cache isolation, backup drill или production query plan. Доступного Supabase-проекта и app secrets сейчас нет. Remote repository/projector и owner-scoped sync ещё требуют завершения; полная перезапись browser snapshot не используется как проектируемый cloud-write контракт. Индексы owner/target/time/due и bounded retrieval предусмотрены, репрезентативные performance/query-plan замеры остаются открытыми.
