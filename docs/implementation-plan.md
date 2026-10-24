# План завершения LEXIS — контракт v2

## Действующая цель и исходная точка

Последнее явное задание владельца v2 от 22 октября 2026 заменяет endpoint «первый vertical slice» полным продуктом: M01–M14, X01–X10, FLOW-01–FLOW-10 и горизонтальные требования. [Полный backlog по 178 ID](REQUIREMENTS_TRACEABILITY.md#полный-контракт-владельца-v2--актуальный-backlog) содержит ожидаемое поведение, код, проверку, SHA/результат, уровень готовности и остаточную границу. Нижеследующие критерии первой итерации сохранены как история, а не текущий предел разработки.

Начальный read-only audit подтвердил: remote `main` = `c39997bc243f54af5c1ae5045ebfc1c51058fa85`, расхождений с входным SHA задания нет; работа начата в `codex/product-completion-v2`. Исторический CI на `dea5a6d` прошёл 64 unit/database и 30 Chromium/WebKit e2e. Новые изменения требуют собственного прогона; numbers не переносятся как свежие.

## Порядок S0–S9 и проверяемые выходы

| Этап | Исполнение                                                                                                                                   | Проверяемый выход и gate                                                                                                                                                |
| ---- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S0   | Проверить актуальный HEAD/изменения/источники, полный backlog, BUG-01/02 и regression baseline                                               | Unavailable-only/mixed Library fixtures; shared due clock/focus/visibility/local-date tests; новые unit/DB/typecheck/lint/build/browser результаты без изменения данных |
| S1   | Совместимые DATA/LEARN/task identities, skill/concept separation, v1 backup/preview/migration, archive/purge, event/review/challenge replay  | Стабильные legacy IDs, round-trip counts/values, no false evidence from save/import/help; поздний Challenge пересчитывает зависимости                                   |
| S2   | Auth/server repository, RLS/storage, small atomic/idempotent commands, sync/revisions/conflicts и export/restore                             | Реальные A/B/anon/expiry/storage/JWT и два устройства; без внешнего test-проекта — готовые contracts/fixtures/instructions с `awaiting-configuration`                   |
| S3   | Own Library и безопасный TXT/EPUB/lexical import, Dictionary Quick/Full/Deep, Smart Inbox, Unicode phrase lookup и structural Reader anchors | Own material→context→explicit sense/intent→save/reopen/source return; 1 000+ import rows с progress/cancel/retry/rollback и malicious-file rejection                    |
| S4   | Реальный library-backed FSRS, общий task engine, форматы, scheduler identity/migration/siblings/workload/recovery                            | Reproducible new/due/lapse/clock/timezone/idempotency/dispute/version tests; skill isolation и сохранённая сессия; multimodal gate отдельно                             |
| S5   | Versioned AI pipeline/evaluation, Challenge, scoped contextual Tutor, three styles/five session types, fairness evals                        | Runtime+semantic validation/cancel/retry/budgets/uncertainty; живой provider и все пользовательские переходы или честный external gate                                  |
| S6   | Writing autosave/revisions/conflicts/stale feedback, Grammar concepts/rules/tasks, Mistake DNA/Knowledge Gaps                                | Draft→feedback error/style→Grammar→independent practice→self-edit→correct separate grammar/writing evidence; originals не теряются                                      |
| S7   | PTT и отдельно live Voice/ASR/TTS, specialized pronunciation, Listening playback/transcript/chunks/shadowing                                 | Реальные источники/transport/scorer где настроены; permissions/interruption/pointercancel/cleanup; no false pronunciation или transcript-based independent listening    |
| S8   | Semantic Network, Observatory/metric definitions, Goals, Memory/Personal Corpus/Immersion и общая IA                                         | Типизированные объяснимые связи, controlled-history counts, consent/retrieval/delete, recommendations с основаниями и подтверждёнными изменениями целей                 |
| S9   | PWA/private offline/update, UI/accessibility/visual/performance, operations и release verification                                           | E01–E30 и FLOW-01–10 на production build; actual device/live/rights/backup/deploy gates; точный readiness report без выдуманного общего процента                        |

S0 исправления предшествуют расширению пользовательских сценариев. Независимые части следующих этапов можно вести параллельно после определения общих contracts. Domain, UI, data preservation, accessibility и безопасность проверяются внутри каждого среза; S9 сверяет целостность и закрывает оставшиеся ограничения.

Отсутствие Supabase/AI/voice/license/device не разрешает остановить независимую работу или назвать адаптер живой интеграцией. Для каждого gate ведётся [реестр зависимостей](risks-and-dependencies.md#реестр-внешних-gates-v2). Платные услуги, API расходы и destructive production migrations не создаются по умолчанию. Для публикации исходников в `tupomark/Eng` действует ранее данное разрешение владельца; GitHub source sync не означает deployment.

## Проверка после каждого совместимого изменения

1. Проверить точные изменённые contracts и негативные случаи подходящими unit/application/DB tests; не писать зеркальные проверки ради количества.
2. Пройти strict typecheck, lint/formatting и production build для готового набора изменений; браузерные journeys проверяют реальное действие→данные→reopen.
3. Для UI получить реальные mobile/desktop captures из указанного SHA и проверить длинный RU/IPA, keyboard/focus/200%/reduced motion. Hardware iPhone не заменяется preset.
4. Для внешней возможности отдельно зафиксировать real provider/config/rights/cost/retention и actual successful/error path; fixture/port не повышает статус до `verified-live`.
5. Обновить PROGRESS и соответствующие строки traceability: поведение, файлы, commands/results/environment/SHA, evidence, оставшийся gate и следующий конкретный шаг.

## Checkpoint и критерий завершения

При границе сессии записать точный HEAD/ветку, completed IDs с уровнем готовности, оставшиеся требования, команды и результаты проверок, реальные blockers и **следующий конкретный файл/сценарий**. Продолжение начинается с checkpoint, а не повторного проектирования. Остановить работу после очередного плана, экрана или единственного green build нельзя, если независимые задачи доступны.

Полное выполнение требует всех четырнадцати настоящих модулей и десяти механизмов, безопасных data/auth/sync/restore flows, реального FSRS и настроенных/проверенных обязательных AI/speech/dictionary capabilities. Release дополнительно требует device/rights/performance/operations gates. До этого отчёт перечисляет точный реализованный scope и недостающие gates вместо «всё готово».

## История: первоначальный план foundation и первого среза

Работа ведётся отдельными проверяемыми срезами. Этапы ниже определяют порядок и критерии готовности; фактические результаты запуска проверок фиксируются в handoff и не предполагаются заранее.

Исходный foundation проверен 21 октября 2026; ниже сохранены его критерии. Актуальное продолжение после handoff 22 октября описано следующим разделом. Полная стратегия из [source/ROADMAP.md](source/ROADMAP.md) сохраняется; текущий срез не заменяет Complete Experience.

## Итерация 22 октября: продолжение после полного handoff

| Этап                | Границы изменения                                                                                                                                | Критерий готовности                                                                                  |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| Аудит и документы   | Сохранить lightweight package и source snapshots, решения, traceability и progress                                                               | Все пять референсов изучены до разработки; новые факты не переписывают историю проверок              |
| Дизайн-основа       | Semantic materials, читаемая typography, greeting/resume-first Home и компактный Core                                                            | Реальные mobile/desktop screenshots; тихий фон; нет неподтверждённых числовых mastery metrics        |
| Voice prototype     | Мягкий слоистый объём, состояния в явном preview, Reduced Motion                                                                                 | Каждый state демонстрационный; отсутствует capture и обещание ASR/TTS/произношения                   |
| Application-session | Вынести coordination и storage snapshot port из React, внедрять часы/IDs                                                                         | Старые local v1 данные читаются; сохраняются errors, idempotency, dispute и evidence isolation       |
| Reader/Dictionary   | Отдельные appearance prefs, adjustable font/spacing, contextual Quick View с раскрытием деталей, typed provenance и безопасный undo свежего save | Смысл/контекст и позиция чтения сохраняются; undo не удаляет evidence; unknown/error states доступны |
| Проверка            | Typecheck, relevant unit/SQL/e2e, production build, реальные screenshots                                                                         | Новые результаты внесены датой; обнаруженные gaps и hardware Safari limit обозначены                 |

Этапы выше реализованы локально 22 октября и отражены в [PROGRESS.md](PROGRESS.md): 64 unit/database tests, lint, strict typecheck и build пройдены; 11 реальных screenshots получены. Полный повторный e2e на финальной исправленной сборке прошёл 30/30. FSRS, Smart Inbox/import, PWA/offline, языковые режимы и настоящие провайдеры остаются следующими отдельными срезами.

Dictionary в этой итерации ограничен Quick View с раскрытием examples/collocations/provenance внутри того же panel. Отдельные Full Entry и Deep Dive из полной спецификации остаются следующими срезами и не объявляются завершёнными.

## Исходные критерии foundation

## 1. Основа и инженерные договорённости

Создать Next.js App Router, React, strict TypeScript, Tailwind CSS, lockfile и локальные команды запуска. Зафиксировать продукт, границы архитектуры, модель данных, визуальные токены и `AGENTS.md`. Не создавать внешние проекты и не публиковать приложение автоматически.

**Готово, когда:** приложение устанавливается по lockfile, проходит typecheck и production build; в документации указаны локальный режим и отсутствующие подключения; клиентский код не содержит секретов.

## 2. Значение, навык и история

Добавить типы значений, сохранений и наблюдений, runtime-валидацию состояния, чистый расчёт расписания и исключение оспоренных наблюдений. Авторский seed содержит несколько значений хотя бы у части слов.

**Готово, когда:** тесты подтверждают отсутствие дублей при сохранении и повторе event ID, отсутствие прироста знания при сохранении, независимость пяти навыков, корректные даты повторений и пересчёт после оспаривания. Некорректные данные не принимаются молча.

## 3. Минимальный UI и дизайн-система

Реализовать семантические токены, поверхности, кнопки, адаптивную навигацию и доступный диалог. Подготовить Home с реальными данными и пустым состоянием. Пять выбранных референсов получены и изучены 22 октября; точные production tokens и pixel-perfect экраны не утверждены. Проверять соответствие последним письменным требованиям и визуальному языку.

**Готово, когда:** интерфейс читается на iPhone-размере и десктопе, доступен с клавиатуры, имеет видимый focus и не требует анимации для понимания состояния. Нет декоративных вымышленных показателей прогресса.

## 4. Reader → Dictionary → сохранение

Открыть авторский текст в отдельном workspace; поддержать выбор слова, поиск локальной записи, выбор конкретного значения и сохранение короткого контекста через repository. Сохранять позицию чтения.

**Готово, когда:** выбранное значение сохраняется один раз и остаётся после перезагрузки; другое значение того же слова можно сохранить отдельно; неизвестное слово и ошибка storage имеют явные состояния; сообщение об успехе появляется после успешной записи.

## 5. Smart Review и объяснение

Показать очередь новых и наступивших повторений. Разделить вопрос, раскрытие ответа и самооценку. Записывать наблюдение только для проверяемого навыка, отображать следующую дату и историю с возможностью оспаривания.

**Готово, когда:** полный путь Home → Reader → Dictionary → Save → Review проходит в Playwright, запись и расписание переживают reload, остальные навыки не меняются, оспоренное наблюдение исключается из результата. Пустая очередь объясняет, что делать дальше.

## 6. Подготовка PostgreSQL

Создать версионированную миграцию с constraints, индексами и RLS. Применить её в локальном тестовом PostgreSQL-движке с явно описанными auth stubs; проверить владение и запреты на межпользовательские ссылки. Подготовленная схема не включается в UI до появления действующего server repository.

**Готово, когда:** миграция выполняется с чистой базы; тесты подтверждают уникальность значений/навыков, ограничения владельца и корректность политик в пределах тестовой среды. Не утверждать, что stub-проверка заменяет настоящие Supabase Auth/JWT-тесты.

## 7. Voice Assistant и LEXIS Command

Добавить полноэкранный визуальный прототип сферы без записи микрофона и поиска AI. Command открывает работающие разделы и локальные словарные записи.

**Готово, когда:** статус прототипа заметен, нет запроса доступа к микрофону, Reduced Motion останавливает необязательную анимацию; Command доступен с клавиатуры и корректно закрывается.

## 8. Проверка и handoff

Запустить типизацию, доменные и SQL-тесты, браузерный сценарий и production build. Проверить мобильную ширину, перезагрузку, ошибки хранения, focus и Reduced Motion. Описать результаты, непроверенные платформы и точную команду запуска.

**Готово, когда:** пользователь получает воспроизводимый локальный проект и список фактически работающих возможностей, прототипов и ограничений. Любой неисполненный check обозначен прямо. Ошибки исправляются перед расширением scope.

## Следующий этап: серверный пилот

После локального handoff подключить согласованную Supabase-среду, Auth, server repository и транзакционную запись наблюдений. Добавить migration CI, реальные RLS/JWT-тесты двух пользователей, импорт локальной истории с подтверждёнными правилами конфликтов и тест потери сессии. Проверить Vercel preview и физический iPhone Safari.

Публичный запуск требует работающего восстановления доступа, политики хранения/удаления, мониторинга ошибок, проверки резервного копирования и обработки лимитов провайдеров. AI, лицензированный словарь и речь подключаются отдельными последующими срезами. Writing/Listening/Grammar расширяют общую модель только после определения наблюдений, критериев и качества оценки для соответствующего навыка.
