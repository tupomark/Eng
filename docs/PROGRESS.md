# LEXIS: журнал разработки

## 21.10.2026 — локальный foundation и первый учебный путь

**Статус: исторически проверенный baseline.** Репозиторий создан на Next.js/React/TypeScript/Tailwind. Работает локальный Home → Reader → Dictionary sense → Save → Smart Review → Core/dispute/replay. Реализованы browser persistence, валидация состояния, error/empty states, Command, экспорт и подтверждённый reset. Voice — визуальный прототип без звука.

Подготовлена SQL-миграция с RLS; она выполнена только в локальном PGlite с auth stubs. Удалённой Supabase/Auth/AI/voice/deployment интеграции нет. `heuristic-v1` — прозрачная recognition-эвристика, не FSRS.

По [verification.md](verification.md) на эту дату: typecheck/build успешны, 43 unit/database tests и 16 e2e cases в desktop Chromium/iPhone WebKit, дополнительные layout checks и четыре реальные screenshots. GitHub CI подготовлен, удалённо не выполнялся. Физический iPhone не проверен.

## 22.10.2026 — получение полного lightweight handoff и аудит

**Статус: материалы изучены до разработки.** Сохранены три текстовых файла, пять WebP и reference_overview из lightweight ZIP. Прочитан весь brief с START_HERE, AGENTS и пятнадцатью embedded docs; открыты все пять изображений и overview. Владелец получил подтверждение чтения до начала изменений.

Пять выбранных изображений намеренно заменяют восемнадцать исходных; тринадцать исторических исключены. Ни одно не является утверждённым pixel-perfect UI. Старые формулировки от 21 октября об отсутствии референсов остаются историческим фактом; актуальный source ledger теперь отражает полученные материалы.

Добавлены: [аудит](HANDOFF_AUDIT_2026-10-22.md), [решения и приоритет источников](DECISIONS_AND_SOURCE_OF_TRUTH.md), [трассируемость](REQUIREMENTS_TRACEABILITY.md); актуализированы инженерные правила, README и текущие product/architecture/plan. Исходные документы сохранены отдельно в `docs/source/`, полученный пакет — в `references/2026-10-22-light/`. Source-intake commit: `97d2fe0` (`docs: import curated LEXIS handoff and record source precedence`). Архив и извлечённые исходные тексты не переписаны.

## 22.10.2026 — ограниченная итерация Foundation + vertical slice

**Статус: локальная реализация проверена: 64/64 unit/DB и 30/30 E2E, lint/typecheck/build пройдены.** Новые изменения следуют после source-intake commit `97d2fe0`; application/design/reader/toolchain/QA зафиксированы отдельными коммитами e209659, e6dcf22, 7d2fede, 0e8839e и 367d79e; отчёт и снимки — в 5c42e3c.

| Срез                 | Запланированное изменение                                                      | Критерий готовности                                                                                             | Проверка                                                         |
| -------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| Source of truth      | Сохранить пакет, актуальные решения, требования и прогресс                     | Нет старого утверждения «референсов нет» в актуальном guidance; архив не изменён                                | Inventory, ссылки, обзор diff                                    |
| Design foundation    | Семантические glass materials, читаемая type scale, спокойный Home             | Декор уступает основному действию; текст читается на iPhone                                                     | Новые реальные mobile/desktop screenshots, focus/viewport checks |
| Voice concept        | Слоистый мягкий объём, preview состояний                                       | Текст явно сообщает demo; idle/listening/processing/speaking/error/paused не выдают себя за microphone activity | State/reduced-motion smoke, capture отсутствует                  |
| Reader/Dictionary    | Регулируемые font/spacing, Quick View с раскрытием деталей и ограниченный undo | Чтение и выбранный sense/context сохраняются; undo не уничтожает evidence                                       | Unit/e2e, reload, explicit sense choice, long text               |
| Application boundary | Вынести session/command orchestration из React                                 | Existing local state v1 читается, ошибки и stale snapshot поведение сохранены                                   | Session/storage regression и полный учебный путь                 |
| Handoff              | Новые команды, результаты, снимки, известные gaps                              | Ни одна planned-возможность не объявлена проверенной без evidence                                               | Typecheck, relevant tests, build и фактический QA report         |

План не включает all-modules rewrite, реальный voice/AI, FSRS, Smart Inbox/import, PWA, облачную авторизацию, внешний deploy или production migrations. Это сохранённые продуктовые направления следующих срезов.

### Реализованные изменения по этапам

| Этап                  | Фактически изменённые файлы                                                                                     | Результат                                                                                                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Source of truth       | `references/2026-10-22-light/`, `docs/source/`, START_HERE, AGENTS, audit/decisions/traceability и текущие docs | Сохранены исходники и происхождение; пять референсов просмотрены, исторические решения отделены от текущих                                                                                                                               |
| Application           | `src/application/learning-session.ts`, `ports.ts`, browser repository, LearningProvider, domain learning        | Команды отделены от React; snapshot port, injected clock/IDs, errors/retry/dispute, safe undo и старый learning v1                                                                                                                       |
| Материалы и Home/Core | `src/styles/{tokens,layout,materials,orb}.css`, globals.css, home/core/orb components                           | Семантические токены, readable type, компактный Core и resume-first Home; qualitative Tentative вместо числовой псевдовероятности                                                                                                        |
| Voice                 | `src/domain/voice-preview.ts`, voice/orb components                                                             | Шесть preview состояний, pause/resume/reset и Reduced Motion; нет microphone capture, audio output или записи learning evidence                                                                                                          |
| Reader/Dictionary     | reader/preferences components, dictionary seed/provenance types                                                 | Sans по умолчанию, typeface/size/spacing в отдельном storage, сохранность native selection до explicit lookup, выделение слова, Quick View с раскрытием деталей, provenance всех восьми entries, undo текущего свежего save без evidence |
| QA/tooling            | session/voice unit tests, reference-alignment e2e, ESLint config, package/lockfile, Next config, CI             | Совместимая строгая проверка; CI включает lint, но удалённо ещё не запускался                                                                                                                                                            |

Undo не превращается в произвольное удаление: UI ограничивает его сохранениями текущего посещения, `canUndoSave` защищает прежнее idempotent-сохранение, domain запрещает удалять sense с любыми evidence, включая оспоренные. Settings и evidence не смешиваются; повреждённые reading preferences сохраняются до явного reset.

### Новые проверки 22 октября

| Команда / проверка                             | Фактический результат                                                                                                               |
| ---------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                     | **64/64**: 54 unit/domain/storage/application/voice и 10 PostgreSQL tests                                                           |
| `npm run lint`                                 | Успешно; `--max-warnings=0`                                                                                                         |
| `npm run typecheck`                            | Успешно; strict TypeScript 6.0.3                                                                                                    |
| `npm run build`                                | Успешно; Next.js 16.4.2 / Webpack, compiler API; strict checks включены                                                             |
| `npm ci --dry-run`                             | Успешно; проверен план установки, это не утверждение о новой полной установке                                                       |
| Production dependency audit                    | 0 найденных production vulnerabilities на момент нового запуска                                                                     |
| Полный e2e на финальной сборке                 | **30/30**: 15 сценариев в Chromium desktop и 15 в iPhone WebKit; полный чистый запуск на исправленной production-сборке, 1,8 минуты |
| Рендеринг всех шести маршрутов при 390/1440 px | HTTP 200, горизонтального переполнения и JS page errors при capture не обнаружено                                                   |
| Новые screenshots                              | 11 реальных PNG в `docs/screenshots/2026-10-22/`; не подставленные изображения handoff                                              |
| GitHub Actions                                 | Lint/test/build/e2e workflow подготовлен; удалённое выполнение не проверено                                                         |

### Toolchain: исправление совместимости

Первый lint выявил явную несовместимость typescript-eslint с TypeScript 7. Закреплён TypeScript 6.0.3 и совместимая peer-цепочка ESLint 9.39.5 + eslint-config-next 16.4.2: React-плагин 7.37.5 ещё не включает ESLint 10. npm предупреждает, что ESLint 9 deprecated/EOL; обновление dev tooling остаётся открытым долгом и не объявляется полностью vendor-supported.

Строгий отдельный tsc работал, но default TypeScript CLI-интеграция внутри Next возвращала пустой JSON. Документированный `experimental.useTypeScriptCli: false` переключает Next на compiler API; production build прошёл без отключения проверок. Lint также исправил anonymous PostCSS export и effect, сбрасывавший Command query: теперь повторное открытие сохраняет запрос, focus задаётся отдельно. Учебный формат и продуктовые решения от этих исправлений не изменились.

Финальный e2e обнаружил отдельную реальную гонку Command на desktop: быстрые Escape → Ctrl+K повторно открывали palette, после чего отложенное native `close` событие закрывало её снова. Shared Modal исправлен: cancel управляется через parent, устаревший close для уже открытого dialog игнорируется. Targeted Command regression пройден 2/2; затем полный чистый прогон 30/30 прошёл на той же исправленной сборке. Усиленный тест выполняет три быстрых цикла Escape → повторное открытие без sleeps. Исходный результат 29/30 сохранён как этап обнаружения ошибки, а не итог.

Контраст семантических цветов на ровной поверхности Reader рассчитан по WCAG: основной текст 13,01:1, дополнительный 7,97:1. Это проверка конкретных токенов чтения, не утверждение о полном accessibility audit.

### Реальная визуальная сверка

Все пять референсов сопоставлены с письменным контрактом в [REFERENCE_REVIEW.md](REFERENCE_REVIEW.md). Материал стал мягче; orbital rings/satellites убраны; Home возвращает к чтению, Reader оставляет фон спокойным, Dictionary раскрывает детали по запросу. Это соответствие направлению, не утверждение владельцем финального pixel-perfect UI.

Снимки: [Home 390](screenshots/2026-10-22/home-390.png), [Home 1440](screenshots/2026-10-22/home-1440.png), [Reader](screenshots/2026-10-22/reader-390.png), [Dictionary Quick](screenshots/2026-10-22/dictionary-390.png), [Dictionary detail](screenshots/2026-10-22/dictionary-detail-390.png), [Review](screenshots/2026-10-22/review-390.png), [Voice idle](screenshots/2026-10-22/tutor-390.png), [Voice listening preview](screenshots/2026-10-22/voice-listening-390.png), [Core](screenshots/2026-10-22/core-390.png), [Library](screenshots/2026-10-22/library-390.png), [Learn](screenshots/2026-10-22/learn-390.png).

### Ограничения и следующий срез

Физический iPhone Safari, реальные selection handles/keyboard и устойчивое энергопотребление не проверены. Отдельные Dictionary Full Entry/Deep Dive не реализованы: Quick View раскрывает examples/collocations/provenance в той же панели. PWA/offline, Smart Inbox/import, FSRS, language modes, AI/voice, Auth, удалённый server repository/projector и cloud backup не реализованы. Typed provenance описывает авторское наполнение и не является лицензией внешнего словаря. Самооценка recognition остаётся субъективной.

Следующий архитектурный срез — асинхронные server commands, Auth и атомарная запись evidence/dispute/projection с реальными двухпользовательскими JWT/RLS-тестами в согласованной test-среде. До него локальная session не называется облачной интеграцией. Отдельные продуктовые срезы FSRS и Smart Inbox сохраняются в roadmap; расширение выбирается без имитации остальных модулей.

## Шаблон следующей записи

- Дата, milestone/commit и scope.
- Изменённые файлы и поведение.
- Реализовано локально / визуально смоделировано / подключено и проверено / отложено.
- Команды и точные результаты новых проверок; не переносить старые counts без запуска.
- Реальные screenshots, сравнение с письменным визуальным контрактом и выбранными референсами.
- Ограничения, ошибки, риски и следующий ограниченный шаг.

## 22 октября 2026 — запрос ссылки на GitHub

GitHub-доступ проверен: аутентификация как `tupomark` работает. У локального репозитория remote отсутствует. Проверки через коннектор не нашли доступного `tupomark/lexis`. Попытка создания приватного репозитория через GitHub CLI отклонена API: `does not have the correct permissions to execute CreateRepository`. Репозиторий не создан, remote не добавлен, push и удалённый CI не выполнялись. Требуется URL пустого репозитория с правом записи либо расширение разрешений подключения. До этого подготовлены переносимые Git bundle и ZIP из проверенного HEAD; они не включают node_modules, кеши, секреты или временные browser dependencies.

## 22 октября 2026 — подключение предоставленного GitHub-репозитория

Владелец предоставил `https://github.com/tupomark/Eng.git`. GitHub metadata подтвердили `public`, default branch `main`, права push/admin и size 0; `git ls-remote` успешно вернул пустой список refs. Локально добавлен `origin` с этим URL. Существующая удалённая история не изменялась.

Попытка `git push -u origin main` отклонена автоматической проверкой безопасности до выполнения: публикация полного кода и документации в публичном репозитории требует явного согласия владельца. Отказ не является ошибкой GitHub-доступа. Повторный push не выполнялся; нужен ответ владельца о публичной публикации. Код не загружен, GitHub Actions не запускался.

Изменены только README и этот журнал, плюс локальная Git-конфигурация remote. Проверки приложения повторно не запускались, поскольку код не менялся; предыдущие 64/64 unit/database и 30/30 e2e остаются результатами указанного выше прогона. Для этого шага проверяются форматирование изменённых документов и `git diff --check`.

## 22 октября 2026 — публичная публикация разрешена, выявлен GitHub integration blocker

На прямой вопрос о публикации исходников и документации в публичном `tupomark/Eng` владелец ответил «Разрешаю». Согласие действует для последующей загрузки в этот репозиторий; повторно запрашивать его не требуется. Предыдущий approval blocker закрыт.

Перед отправкой `git ls-remote origin` снова успешно вернул пустой список refs. Попытка `git push -u origin main` с HEAD `1c11ea6e4b6177fcecce7195dbeee24ca5a3b100` действительно выполнена и получила от GitHub `Permission to tupomark/Eng.git denied to tupomark`, HTTP 403. Проверка через штатный GitHub connector (`create_tree`) также получила HTTP 403, `Resource not accessible by integration`. Удалённые объекты и refs этими неуспешными операциями не созданы. Metadata `permissions.push/admin: true` описывают права пользователя и не доказывают право интеграции записывать код. Авторизация CLI работает, но текущего доступа интеграции недостаточно.

Код не загружен; GitHub Actions не запускался. Для следующей попытки нужно подключение GitHub с доступом к `Eng`, правами Contents: read/write и Workflows: read/write для `.github/workflows/ci.yml`; секреты не следует передавать в чат. После исправления доступа следует проверить refs, выполнить обычный push без force и проверить Actions.

Изменены только README и этот журнал. Форматирование этих файлов и `git diff --check` прошли; проверки приложения повторно не запускались. Дополнительный read-only review CI не выявил очевидных блокирующих проблем. Переносимые bundle/ZIP обновлены из локального HEAD и доступны до устранения GitHub-доступа.

## 22 октября 2026 — исходники опубликованы в GitHub

После установки ChatGPT Codex Connector владельцем выполнена повторная проверка: `git ls-remote origin` подтвердил пустой репозиторий. Обычный `git push -u origin main` успешно создал удалённую ветку `main` и настроил tracking; force не использовался. Повторное чтение `refs/heads/main` подтвердило SHA `dea5a6d6da2b8098b929ee44c60cf5b010c3a2c1`, совпадающий с опубликованным локальным HEAD. Код и история доступны в публичном [tupomark/Eng](https://github.com/tupomark/Eng). Предыдущий integration blocker закрыт; согласие владельца сохранено.

GitHub Actions автоматически запустил [LEXIS checks #39846824037](https://github.com/tupomark/Eng/actions/runs/39846824037) на этом SHA. Финальный результат — **success**, job `verify` завершён за 2 минуты 45 секунд. По шагам и логу подтверждены `npm ci`, lint, strict typecheck, **64/64 unit/database tests**, production build, установка браузеров и **30/30 Playwright tests** (Chromium/WebKit, 1,3 минуты). Это отдельный выполненный удалённый прогон, а не перенос локальных результатов.

Runner сообщил неблокирующие предупреждения: checkout/setup-node v4 объявляют Node 20 и автоматически исполняются на Node 24; `ubuntu-latest` переходит на Ubuntu 26. Обновление major-версий Actions остаётся небольшим tooling follow-up; текущий run успешен. Физический iPhone Safari по-прежнему не проверен.

Обновлены README (реальный clone URL и статус публикации), эта запись и C01 в requirements traceability. Исходники приложения не менялись. Публикация репозитория не является Vercel deployment, подключением Supabase/Auth или AI/voice. Предыдущие локальные проверки не выдаются за новый запуск.

Финальные изменения документации проверены Prettier и `git diff --check`; они публикуются отдельным docs-only коммитом с `[skip ci]`. Проверенный CI относится к указанному выше source SHA; код приложения после него не менялся. Bundle/ZIP обновлены из заключительного локального HEAD.

## 22 октября 2026 — принят полный scope v2, S0

Последнее задание владельца расширяет конечную цель до всех четырнадцати модулей и сквозных механизмов. Первый local slice остаётся исторической исходной точкой. `git fetch origin` подтвердил: локальный и удалённый main имеют SHA `c39997bc243f54af5c1ae5045ebfc1c51058fa85`; разницы с baseline нет. Создана ветка `codex/product-completion-v2`, существующая работа сохранена. Все пять WebP и overview вновь открыты визуально. Полный backlog по 178 именованным ID находится в существующей REQUIREMENTS_TRACEABILITY; решение и AGENTS обновлены, source snapshots неизменны.

Аудит зависимостей: Supabase connector вернул `projects: []`; переменные приложения для Auth/AI/speech/dictionary/deploy не найдены (проверялись только имена, значения не выводились). В среде есть лишь `.env.example`. Vercel list_teams вернул пустой список; проекта/deploy для LEXIS пока не подтверждено. Никакие платные ресурсы, удалённые миграции или AI-запросы не запускались. Серверный PostgreSQL и provider contracts разрабатываются и тестируются локально, live gates остаются открытыми.

BUG-01: Library сохраняет видимость недоступных senses, контекст, ID, дату, поиск и правильные counts; добавлены unavailable-only/mixed browser fixtures с reload/export. BUG-02: единый LiveClock обновляет Home/Review/Core по deadline, локальной полуночи, focus/pageshow/visibility; отдельный Review interval убран. Изменены application/live-clock, infrastructure/browser-clock, learning-provider и три экрана; добавлены unit и browser regressions. Первый targeted запуск baseline+clock: 67/67 unit/database прошли. Lint прошёл; общий typecheck/build временно обнаружил незавершённый тип нового FSRS adapter в параллельном S1. Для S0 выполняется отдельная проверка точного коммита без незавершённых S1-файлов; её результат будет записан отдельно. Браузерная проверка S0 пока не объявляется пройденной.

## 23 октября 2026 — S0 regression gate пройден

Проверка S0 выполнена в отдельном worktree `/workspace/lexis-s0-check` на `86dec84`, без незавершённых S1–S3-файлов. `npm run lint`, `npm run typecheck`, `npm test` (**67/67**) и `npm run build` прошли. Первый browser run обнаружил один WebKit-сбой тестового CSS-локатора: во время navigation transition он захватывал скрытый старый и актуальный счётчики. Регрессия уточнена через доступный heading, без изменения проверяемого count или данных. Полный повторный `npm run test:e2e` прошёл **36/36** (18 desktop Chromium + 18 iPhone WebKit), 2,4 минуты, без retry; новые случаи проверили недоступную запись, смешанный поиск/reload/export и due без reload при смене даты/focus. Результат относится к S0 и исправленному тестовому локатору, не ко всем незавершённым продуктовым модулям.

Команда WebKit использует локально извлечённые browser dependencies и `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` только из-за отсутствия системного ldconfig: реальный WebKit запущен, сценарии выполнены. Физический iPhone по-прежнему awaiting-device-verification. Следующий gate — интеграция общего task/FSRS store, безопасное восстановление v1 и пользовательские сценарии собственных материалов/словаря. Исходные local v1 bytes не мигрируются автоматически.

## 24 октября 2026 — foundations v2 и интеграция новых локальных сценариев

Эта запись фиксирует инженерный checkpoint, не полный выпуск и не результат ещё не законченного общего прогона. Серверная основа ветки `codex/product-completion-v2` — `23fca53`; новые material/Dictionary/practice/Writing/Grammar/knowledge/Listening/AI/Settings/PWA изменения зафиксированы небольшими commits через source anchor **`a3db700`**. Итоговые browser/CI результаты ожидаются и добавляются отдельно. Unit/DB и build выполнены на интегрированном дереве перед фиксацией; последующее изменение offline route — только форматирование. Source snapshots/референсы не переписывались.

### Зафиксированные небольшие изменения

| Commit    | Изменение                                                     | Пользовательское следствие и граница                                                                                                             |
| --------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `07be796` | Pinned FSRS, bounded parsing и Supabase adapter dependencies  | Реальные packages/API, без force/peer suppression; сами зависимости не интеграция                                                                |
| `3261543` | Общие tasks/evidence и library-backed FSRS                    | Exact skill/concept, помощь/самостоятельность, stable replay и явный legacy bootstrap                                                            |
| `144c208` | Validated v1 restore preview/merge                            | Недоступные senses, string event IDs и disputes сохраняются; конфликты не затираются                                                             |
| `23fca53` | Archive-safe SQL commands, guarded Supabase SSR/Auth adapters | Обычное archive не каскадно стирает evidence; небольшие owner/idempotency/revision commands. Hosted проект и полный cloud repository отсутствуют |

Промежуточные targeted проверки S2: 26 database и 19 unit/SDK-fixture checks прошли в локальной среде с PGlite auth stubs; это не live Supabase JWT/Data API/storage. Старые S0 67/36 и baseline64/30 не выдаются за проверку нового полного продукта.

### Новые связанные local capabilities

- **Материалы/импорт/Reader:** собственный TXT/paste/DRM-free EPUB, bounded ZIP/XML/XLSX, preview/rights consent, vocabulary Inbox, unresolved/manual choices, rollback, structural anchors/bookmarks/search, export/additive restore. Local-only, first XLSX sheet, plaintext EPUB; no cloud/TTS/My Understanding. Детали/targeted evidence — [materials note](feature-notes/materials-ingest.md).
- **Dictionary/практика:** Quick→Full→Deep и source return, Unicode phrase/form lookup, authored provenance/Explain Differently, четыре lexical practice formats, explicit rating и реальный FSRS; open sentence без semantic evaluator остаётся ungraded. По-прежнему только восемь слов/десять senses, нет licensed live source/audio.
- **Writing/Grammar:** original/revisions/diff/autosave/caret/scroll, transactional conflict branches и restore; шесть authored Grammar concepts используют common tasks/Challenge/FSRS. Live writing error/style feedback и два устройства ещё отсутствуют.
- **Observatory/Network/Goals:** defined activity/evidence counts, insufficient-data и excluded audit, repeated independent difficulty patterns, небольшой typed teaching neighbourhood, editable/archivable local goals и подтверждаемая fixed-rule load suggestion. Counts не mastery/CEFR и не AI diagnosis. См. [metric definitions](knowledge-observatory.md).
- **Listening:** реальный original synthetic sample/private file playback, speed/A–B/position/transcript assistance и opt-in короткая local shadow recording. Нет ASR/live transport/pronunciation grade; media profile export/restore и device gates ещё открыты. Детали — [Listening note](feature-notes/listening.md).
- **AI/Tutor, Settings и PWA:** завершаются contracts/consent/cancel/quota/unconfigured UI, independent settings/purge и opt-in public offline shell. Наличие этих файлов не означает живого провайдера или успешного offline/update/profile purge gate.

### Проверки и ещё открытый интеграционный gate

Targeted feature suites сообщали: materials 19/19, Writing/Grammar16/16, knowledge12/12, Listening+materials25/25; их область и ограничения описаны в feature notes. Это промежуточные результаты соответствующих рабочих изменений, **не итоговые counts текущего HEAD**. Дополнительные изменения после этих запусков требуют повторной релевантной проверки.

Интегрированный production/browser прогон обнаружил проблемы accessible labels/широких alert locators в новых экранах. Исправления проходят повторную проверку. 24 октября в 11:14 UTC на интегрированном рабочем дереве от `23fca53` общий unit/database прогон прошёл **273/273**, 25 suites, 39 секунд; в 11:15 UTC production build прошёл, включая Settings/Tutor/Listening/offline routes. Общий browser gate на 112 случаях ещё выполняется; его успешный результат здесь не предполагается. Последние правки после этого build требуют релевантного повторного gate. Test files и старый successful CI не заменяют запуск на новом source SHA. Команды окончательного gate: `npm run format:check`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, `npm run test:e2e` (Chromium/WebKit), затем реальные captures и exact-SHA GitHub CI. Новый formatting step добавлен в CI, без отключения проверок.

README/product/architecture/data-model актуализированы под реальный v2 scope; все 178 ID трассируемости сохранены с конкретным кодом/способом проверки и остаточной границей. `implemented-local` составной строки обозначает описанную часть, не полное закрытие требования. Source anchor `a3db700` связывает зафиксированные изменения; промежуточные рабочие проверки явно отделены от ещё ожидаемого browser/CI результата.

### Точные внешние и независимые оставшиеся задачи

Доступного Supabase-проекта (`projects: []`) и app server secrets нет; AI/model/billing, licensed dictionary/audio и speech/scorer не live-проверены. Physical iPhone — awaiting-device-verification. Deployment/HTTPS, hosted backup/restore/retention и operations также не проверены. Исходники разрешено публиковать в Eng; это не разрешение на расходы/production destructive migrations/публикацию личных материалов.

Кроме внешних gates остаётся независимая инженерная работа: полный remote task/review repository/projector/sync и local→account migration UI; complete profile/media restore и deletion lineage; весь task/mode/search/Memory/Corpus scope; end-to-end tracing всех FLOW; performance/a11y/visual проверки новых workspaces. Отсутствие одного provider не закрывает эти задачи и не является основанием остановиться.

**Следующий конкретный шаг:** закончить текущие AI/Settings/PWA интеграционные правки, собрать production, повторить новые и регрессионные Chromium/WebKit journeys, исправить все реальные failures, получить screenshots, записать точный source SHA/commands/results и сохранить изменения небольшими feature commits. После этого выполнить разрешённый push/PR и новый CI, затем продолжить незавершённые независимые требования по S1–S9.

### Source checkpoint новых features — a3db700

| Commit    | Scope                                 | Уровень/граница                                                                                 |
| --------- | ------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `034f0a3` | Preferences domain/provider           | Local typed settings; full locale/voice/live capabilities не подразумеваются                    |
| `75e29d9` | Dictionary Full/Deep/context lookup   | Seed-only, no licensed live dictionary/audio                                                    |
| `b5aa864` | Materials/ingest/Inbox/private Reader | Local text/EPUB/XLSX scope, no cloud sync                                                       |
| `f811d62` | Practice/FSRS UI/legacy continuation  | Real local scheduler; полный workload/multimodal/device scope отдельно                          |
| `26d8838` | Writing/Grammar                       | Original/revisions/conflicts/tasks; no live writing feedback                                    |
| `c3dce57` | Observatory/Network/Goals             | Defined local counts/relations/goals, not calibrated mastery                                    |
| `806299a` | Listening/local shadowing             | Actual playback/capture slice; not live ASR/TTS/scorer                                          |
| `365fd97` | AI pipeline/Tutor/quotas              | Contracts/adapters, awaiting-configuration/live verification                                    |
| `cea2a75` | Settings/local profile purge          | Browser-local only; общий integrated purge gate отдельно                                        |
| `a3db700` | Opt-in PWA/public shell/navigation    | Original vector/PNG icons; private API/Auth не кэшируются; install/update/device gates отдельно |

Полный browser run **112 случаев** выполняется после этих изменений; промежуточные первые успешные случаи не подменяют итог. Реальные новые captures ещё ожидаются; соответствующие pending секции оставлены в design-system/REFERENCE_REVIEW. Последний точный HEAD перед продолжением следует читать через `git rev-parse HEAD`, поскольку после source anchor отдельно фиксируется документация.

## 24 октября 2026 — review branch опубликована, повторный интеграционный gate

Source последовательно сохранён отдельными feature-коммитами; `f9ab8a69dbae2170bd1e93f4c472b75c27aee618` опубликован обычным push в `codex/product-completion-v2`, без force и изменения main. Создан [draft PR #1](https://github.com/tupomark/Eng/pull/1). Это публикация исходников, не deployment и не выпуск продукта. [GitHub CI на этом source](https://github.com/tupomark/Eng/actions/runs/40089892923) запущен; результат записывается после завершения.

Первый общий browser gate новой функциональности завершился **109/112** за 6,6 минуты. Все 56 Chromium прошли; три WebKit Listening failures не скрыты. Воспроизведены реальные причины: этот Linux WebKit не сохраняет Blob/File в IndexedDB (`UnknownError`) и не предоставляет MediaRecorder. Commit `2107f14` сохраняет новые аудиоданные как `array-buffer-v1`, читает прежние Blob без перезаписи, удерживает в списке лишь метаданные и материализует выбранный источник. Проверки микрофона различают реально доступный recorder и честную unavailable-ветку; Chromium проверяет освобождение настоящего MediaStream track. Это не подтверждение hardware Safari.

На чистом `f9ab8a6` в 11:26–11:27 UTC прошли `npm run build`, **274/274 unit/database tests (25 suites, 29,85 с)** и `prettier --check .`. Новый полный browser run включает **114 случаев**: дополнительно реальный активный worker → подтверждённое удаление профиля → отсутствие регистрации/cache и запрет позднего восстановления. Он пока выполняется; успешный результат не предполагается. Приложение и личные данные в публичный deploy не публиковались.

## 24 октября, с 23:10 UTC — исправления обучения, мобильного первого экрана и browser gates

На восстановленной среде продолжен существующий PR#1 без повторного проектирования. Дополнительные source commits: `f583bed` — несколько durable source passages для одного sense без изменения learning-v1; `a665846` — явная withdrawal policy для неверного Listening rubric; `c8fc2d7` — main landmark Writing и видимые file controls; `9c74699` — мобильные Home/Reader/Dictionary; `d68d431` — правильный абзац fixture в геометрическом тесте; `d509857` — quiet disclosure-marker и корректный focused Writing capture. Source snapshots не менялись.

Реальная новая возможность: после двух разных контекстов одного слова сохранить оба источника, найти их в Library, экспортировать/preview-merge восстановить, не дублируя смысл и не создавая evidence. Новый Listening prompt проверяет услышанное действие. Старые location-verdicts больше не повышают/снижают владение `linger`: исходный аудит остаётся, explicit policy exclusions пересчитывают FSRS после более поздних попыток; UI/Core получают согласованное состояние даже при отказе записи.

Фактические локальные проверки:

- `npm run build`: прошёл на source `9c74699`; после cosmetic marker/script changes повторно прошёл на `d509857`.
- `vitest run`: **288/288**, 27 suites, **25,33с**, 23:24 UTC. Strict TypeScript, ESLint с zero warnings и Prettier также прошли. Измерения отдельного Node benchmark не выдаются за iPhone/web vitals.
- Source `e092d1f`: **28/28 Chromium/WebKit**, 1,7мин — Dictionary, unavailable Library, Listening/media, offline worker purge и два durable contexts.
- Source `9c74699` + latest test files: targeted48 дал **46 passed**, два failures были ошибочным ожиданием тела текста от title-параграфа fixture. После уточнения locator `d68d431` все **6/6 mobile regressions** прошли за13,4с, включая реальный абзац при default font≥18px. Остальные46 не были переименованы в48/48.
- Новый assessment-withdrawal browser story прошёл в обоих движках: boot → audit preserved → policy exclusion → later FSRS replay → Core1active/1excluded → reload without duplicate.

Общий GitHub CI проверяется на точном remote source; прежние runs с selector failures не объявлены зелёными. Вся итоговая цепочка и её фактический SHA/result доступны через PR#1; заключительный результат записывается отдельно, когда run завершён. Локальная библиотека браузеров использовала `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` только из-за linker path к workspace libraries; настоящий WebKit исполнялся. Это не physical iPhone proof.

Реальные captures и сравнение: [REFERENCE_REVIEW](REFERENCE_REVIEW.md), [manifest](screenshots/2026-10-24-v2/capture-manifest.json), [до исправления](screenshots/2026-10-24-v2-before/README.md). Captures разделяют compiled source и Git HEAD, используют original fixtures и не содержат личных материалов владельца. Это проверка текущего интерфейса, не окончательное одобрение всей визуальной системы.

### Точный checkpoint для продолжения

- Repo `tupomark/Eng`, branch `codex/product-completion-v2`, draft [PR#1](https://github.com/tupomark/Eng/pull/1). Main baseline `c39997b` сохранён. Перед продолжением читать фактический HEAD и remote, не откатывать последующие docs/proof commits.
- Полный scope M01–M14/X01–X10/FLOW-01–10 и все178 IDs сохранён; реализованные части и оставшиеся gates перечислены в REQUIREMENTS_TRACEABILITY/risks. Ни один общий процент готовности не присвоен.
- Незавершённые независимые задачи: durable user-authored lexical catalog за пределами8seed (точные sense/POS IDs, provenance, ручной разбор Inbox и общий lookup/task port); полный command-based cloud repository/projector/sync/restore; trusted AI evidence/streaming и evaluation corpus; полные media/profile backups; remaining task modalities, Grammar/Writing feedback, Memory/Corpus/Immersion/notifications/placement и полный UX/a11y/performance scope.
- Следующий конкретный независимый slice: **unresolved Inbox → вручную описанное пользователем значение → общий Dictionary → Save → recall**, с явной user provenance, stable sense identity, preview/export/restore и без автоматического доказательства знания. Сначала прочитать текущие dictionary/import/task ports; не добавлять очередной конкурирующий прогресс-store.
- Реальные внешние gates: test Supabase/Auth/storage и A/B/JWT/two-device checks; подтверждённый API budget/model/terms; dictionary RU/audio/offline rights; реальные ASR/TTS/live/scorer; physical iPhone; авторизованный deploy и backup/restore drill. Secrets в чат/Git не нужны. Платные calls, remote migration и deploy не выполнялись.

### Consolidated verification and captured source

[CI#40142960806](https://github.com/tupomark/Eng/actions/runs/40142960806) on exact `d68d431b1a3020932c3098da6caa08bbbe26e3b5` completed **success**: install, formatting, lint, strict typecheck,288 unit/DB, build and browser gate. Browser summary was **123 passed +1 flaky**, not124 first-attempt successes: the due-clock assertion also matched a hidden retained Core tree. `6e41f25` scopes it to the accessible current main; **6/6 reruns** across both engines (3each,41,1с) then passed. The next CI evaluates the corrected source; the earlier retry is retained in this history.

Final UI build `9760e5a095bcdc689eb8969dff561b87b23c5ecb` passed. A capture run observed WebKit errors from speculative workspace requests during rapid navigation. Common Shell links now disable speculative prefetch; a subsequent complete run captured **39states×2 =78**, zero pageerror and zero horizontal overflow, including real editor focus and network-disabled private Reader. Current captures/manifest refer to that compiled SHA. Original before-images are preserved separately. No reference mockup is rendered as app UI.

All178 distinct requirement IDs and seven traceability columns were checked programmatically. `docs/source/` and `references/` have no diff from baseline. Common private-key/token patterns were checked by filename-only search without printing values; no matching shipped secret was reported. This check does not replace hosted secret/storage/tenant audits. Final formatting/lint/diff checks precede publication of these proof documents; exact subsequent HEAD/CI should be read from Git/PR rather than assumed equal to the compiled capture SHA.

## 25 октября 2026 — собственные значения за пределами seed и настоящая практика

Продолжен существующий `codex/product-completion-v2`, draft PR#1. Remote main по-прежнему `c39997b`; source snapshots и пять LIGHT-референсов не переписывались. Среда проверена повторно: server secrets/runtime variables и доступный hosted проект не появились. Новые paid calls, миграции production и deploy не выполнялись.

| Commit    | Проверяемое изменение                                                                                                                                           |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `71dc088` | Namespaced user lexeme/sense IDs, POS/forms, immutable authored metadata, validated storage/preview/merge и pure lookup contracts                               |
| `330fd67` | Own dictionary → Dictionary → Save → common tasks/FSRS; ручной разбор unresolved Inbox; Library/Reader/Command/Review/Core/Observatory используют общий каталог |
| `a8324ad` | Исправление подтверждённой гонки browser-теста: сохранить URL только после фактического перехода в Reader                                                       |
| `858f3dc` | Сохранение явно выбранного sense при неоднозначном возврате, точные повторы после append, индекс Inbox вместо вложенного полного сканирования                   |
| `7420f4b` | Воспроизводимый Node benchmark и capture script с обязательным compiled SHA                                                                                     |
| `5e31016` | Проверки расширенного offline Dictionary и ожидание фактического URL; актуальные тексты старых assertions                                                       |

Пользователь может описать собственное значение/формы/часть речи, явно добавить другое значение той же лексемы, найти его в Dictionary/Command, сохранить как намерение и выполнить recall с отдельным rating/FSRS/Challenge. Принятая импортированная строка допускает собственное описание и явный выбор значения, не создавая массового due. Source `user-authored` видим; task source `user` проверяет воспроизведение собственной заметки, **не независимую лингвистическую правильность**. Создание, импорт и сохранение не создают evidence. Полный лицензированный словарь и editorial Deep Dive для личных заметок этим не заменены.

Сохраняются исходные ID, история, разделение POS/источников и повреждённые bytes. Restore additive, preview до записи, конфликт ID блокирует весь merge. Ошибка quota сохраняет ввод и допускает retry без reload. Границы локального каталога: 4M serialized UTF-16 units, 2000 entries/10000 senses, 30 senses/entry. Granular edit/archive/delete/recovery и общий profile/media backup ещё не завершены. Подробности — [user meanings](feature-notes/user-meanings.md).

### Проверки и найденные причины

- Build, strict TypeScript, zero-warning lint и Prettier прошли. Общий unit/database run на итоговой реализации дал **314/314**, 30 suites, **15,46с**, 10:39 UTC. Отдельный benchmark tsconfig также прошёл `tsc --noEmit`.
- Промежуточный `a8324ad`: **312 unit/DB** и **20/20 Chromium/WebKit**, 1,8мин. До этого новые тесты имели ошибочные exact label locators для вложенных select/controlled textarea; исправлены на реальные accessible roles. Первоначальный прерванный прогон не объявлен успешным.
- Первый полный локальный run с audit fixes завершился **128 passed /10 failed /0 flaky /0 skipped** из138, **495,22с**. Восемь failures — старые copy assertions, один — мгновенная проверка ещё не завершённого URL replace. Они исправлены в `5e31016`. Ещё один WebKit Listening case исчерпал общий timeout на последнем delete-действии; он сохраняется как отдельная проверка, без скрытого увеличения timeout/retry.
- На неизменяемом наборе `5e31016` выполняется свежий полный138 browser gate. [CI#40212297359](https://github.com/tupomark/Eng/actions/runs/40212297359) относится к этому точному source; фактический итог дописывается после завершения. Предыдущий CI `4490472` действительно был красным: 288unit/123browser +1failed. Trace и исправление Reader URL описаны в [CI investigation](feature-notes/verification-2026-10-25.md).
- [Node/container benchmark](performance/2026-10-25-catalog-index.json), Node24.19/Linux x64/2 CPUs: 2000 entries ×30 missing Inbox rows — прежний nested predicate1000,25ms; index build5,41ms однократно; lookup30 rows p50≈0,011ms/p95≈0,049ms,100 runs. Это не iPhone, React rendering, browser web vitals или полевые показатели. `scripts/measure-catalog-index.ts` воспроизводит замер с явным source SHA.
- Проверена целостность всех178 уникальных IDs/семи колонок трассируемости; `docs/source/` и `references/` не имеют diff от baseline. Новые визуальные captures должны ссылаться на runtime source `7420f4b`; их gate записывается отдельно после фактического создания.

### Продолжение полного scope

Следующий независимый срез после текущего gate — **единый проверяемый backup/restore локального профиля, включая catalogue IDs, tasks/evidence, passages, materials, writing revisions и private media**: bounded package, preview конфликтов/ссылок, явное подтверждение, возобновление и сверка данных без перезаписи повреждённых bytes. Это уменьшает риск потери связанного личного материала перед следующим cloud migration. Существующие отдельные exports не выдаются за полный restore.

Затем — полный command-based cloud repository/projector/sync и local→account preview, trusted AI evidence/streaming/eval corpus, оставшиеся task/Grammar/Writing/Memory/Corpus/Immersion/placement/notification сценарии. Наличие внешнего blocker не отменяет эту независимую работу. Реальные внешние gates остаются: test Supabase/Auth/JWT/storage A/B/two-device, разрешённый API budget/model/terms, dictionary RU/audio/offline rights, ASR/TTS/live/scorer, physical iPhone, авторизованный deploy и operational restore drill. Это checkpoint продолжающегося полного продукта, не готовый выпуск.

### Завершённый повторный gate 25 октября

Свежий локальный прогон неизменяемого набора `5e31016` завершился **138/138 passed за8,8мин**, без retries/flaky/skipped. Проверены обе browser projects: Chromium154.0.8037.57 desktop1440×1050 и WebKit27.2 iPhone13 preset390×664, reduced motion. Runtime source совпадает с build `7420f4b` (`git diff ... -- src` пустой); более поздние test-only commits не выдаются за другой интерфейс. Workspace browser libraries и linker path по-прежнему не означают hardware Safari.

Одновременно [CI#40212297359](https://github.com/tupomark/Eng/actions/runs/40212297359) на точном `5e31016` прошёл install/format/lint/TS/**314unitDB**, build и browser gate, но его итог **137 passed +1 flaky**, не138 first-attempt. WebKit Replay один раз не достиг ожидаемого playback state; retry прошёл. Отдельно выполнены **3/3 последовательных WebKit Replay cases,1worker,1,0мин, без retries**. Причина product fault не воспроизведена; runtime Listening не изменялся. `754323b` добавляет только bounded native media/visibility diagnostics при неуспешной попытке и сохранение CI artifacts даже после успешного retry. Timeout/retry не увеличены, история flaky run сохранена.

Первый capture создал12 реальных кадров с нулевым horizontal overflow, но поймал один WebKit pageerror при уходе из Dictionary в Practice. Он **не объявлен чистым**: исходный manifest сохранён как `before-prefetch-fix-manifest.json`. `d17e380` выключает speculative prefetch у двух контекстных Review/Practice links; новая production-сборка и повтор captures проверяют этот конкретный переход. Это продолжение прежней Shell policy, не смена дизайна и не скрытое игнорирование исключения.

25 октября Supabase connector повторно вернул `projects: []`; managed runtime не содержит app secrets/runtime variables. Live cloud/AI/speech не стали доступными по одному GitHub push. Свежий CI после diagnostics/prefetch/docs evidence следует читать на актуальном HEAD, не наследовать из `5e31016`.

Итоговый build `754323bd3b2d958f070e1e7945487da4d5ffdb54` прошёл. Повторный capture script завершился exit0: **12 PNG, оба engine result `captured`, zero pageerror/overflow**. Кадры действительно открыты; [REFERENCE_REVIEW](REFERENCE_REVIEW.md) фиксирует просмотренные состояния и ограничения. Чистый manifest не подменяет сохранённый before-prefetch failure. Финальные docs/capture изменения не вводят новую UI-концепцию; актуальный HEAD/remote/CI проверяются перед передачей.

## 26–27 октября 2026 — общий локальный backup и возобновляемое восстановление

Продолжение началось с `c7f77a7379a2414f1b0622786771536b3c61ef93`, без reset и повторного проектирования. Fetch 27 октября подтвердил неизменные remote main `c39997b` и review branch `c7f77a7`; исходные snapshots без diff. Исторический [CI#40214211879](https://github.com/tupomark/Eng/actions/runs/40214211879) действительно прошёл на точном `c7f77a7`: 314 unit/DB и 138/138 Chromium/WebKit, без retries/flaky/skips. Это результат предыдущего кода, а не новая проверка recovery.

| Commit    | Совместимый срез                                                                                             | Пользовательская возможность и граница                                                                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `2ada728` | Bounded container, pure section plans/coordinator, Writing/media adapters, durable journal/epoch             | Точные IDs/история, opaque raw rescue, branch-preserving merge, verified steps и resume; browser stores не объявляются общей транзакцией                                           |
| `f535ec3` | `/settings/backup`, export/integrity/preview/confirm/restore/reopen, safe workspace pause и purge generation | Пользователь выбирает 12 local sections с настоящими медиа; конфликт не затирает данные, unsaved Writing во второй вкладке блокирует подготовку; внешний consent не возобновляется |

Файл `.lexis` не зашифрован и не отправляется на сервер. Auth credentials, account-prefixed Tutor, ephemeral context permissions и offline caches исключены. EPUB сохраняется как извлечённая текстовая модель, не исходный архив. Неизвестные поля/повреждённые strings можно сохранить opaque, но нельзя применять как валидные данные; повреждённый destination не сбрасывается. Writing revisions/branches и media IDs/bytes/transcript/anchors сохраняются, import/restore не создаёт учебное evidence. Старое media rights checkbox не становится выдуманной лицензией.

Cross-store restore: preview → проверка unsaved input и pause ресурсов → сохранение/проверка payloads в journal IDB → marker/epoch → global semantic/hash preflight → guarded store write → readback/receipt → final reconciliation. Preparation отклоняет dirty/composing input; marker публикуется только после проверки всех staged payloads. Потерянный receipt не означает rollback: exact after-state принимается без второй записи. Partial/cancel/accept-partial/reopen имеют отдельные статусы; прежние вкладки не оживают после снятия marker. Explicit profile purge удаляет private journal payloads и меняет неприватный epoch до нового старта.

Фактические проверки до финального gate:

- `npm test` 27 октября, Node24.19.0/Linux x64, **452/452, 38 suites, 18,12с**. Это integrated tree перед source commit `f535ec3`; после прогона изменились только docs и browser capture/test organization, не unit/runtime code.
- Предварительная production-сборка прошла. Fresh exact-HEAD formatting/lint/strict TS/build выполняются отдельно; их результат не предполагается заранее.
- Первый новый browser набор (6 cases) дал 1 passed/5 failed: traces показали чтение до полной navigation и alert selector, захватывающий Next announcer. Ожидание полного document reload и scope locator исправлены; data assertions не убраны.
- Следующий целевой gate (18 cases): **17 passed/1 failed, 2,0мин**. WebKit успел проверить оба restore/readback и исчерпал общий 30s test budget перед Listening navigation. История разделена на fresh restore/playback и отдельный repeated merge; таймаут не увеличен, исходные data/audio assertions сохранены. Финальный повтор ещё не объявлен пройденным.
- Новый capture/targeted gate на `f535ec3`: **19 passed/1 failed, 2,4мин**. Все проверки данных прошли, но WebKit manifest поймал реальный `Cannot load blob` между reload и navigation во время `readMediaBackupSnapshot` → `Blob.arrayBuffer`. Gate не скрыт: [исходные manifests/frames](screenshots/2026-10-27-profile-backup-before-cancel/README.md) сохранены. `baa7303` заменяет backup чтение на FileReader с native abort/cleanup по signal/pagehide; 11 новых regressions и постоянный pageerror assertion защищают ошибку. Inventory copy также показывает человекочитаемые singular/plural labels вместо `reviewItems`/`pendingRequests`.
- После исправления: **463/463 unit/database, 39 suites, 20,83с**; formatting, zero-warning ESLint, strict TypeScript и production build на `baa730346df0c1cebd6c6e79ac19c0bdd50115c5` прошли. Новый полный browser gate и повтор capture после исправления фиксируются ниже по факту завершения.

Аудит среды 27 октября: managed runtime connected/running, app capabilities/secrets/runtime variables/outbound identities пусты; значения секретов не выводились. Новых paid requests, hosted migrations, production reset или deploy не выполнялось. Голосовой live/API, hosted Auth/RLS/storage и physical iPhone не стали доступны от GitHub-публикации.

### Текущий checkpoint recovery gate

Source HEAD `baa730346df0c1cebd6c6e79ac19c0bdd50115c5`, ветка `codex/product-completion-v2`, draft PR#1; опубликованы три последовательных source commits `2ada728`, `f535ec3`, `baa7303`. Runtime source заморожен. Сейчас выполняется полный 148-case regression на production build этого SHA, затем 12 реальных profile captures/manifest с 1 worker (без конкурирующей сборки) → финальная traceability и exact-HEAD CI. При обнаружении сбоя сохранить trace/причину, исправить подходящий слой, повторить нужный gate; старые 138/138 не выдавать за новый результат. Следующая независимая продуктовая задача после этого gate — существующие command/repository contracts для local→account transfer preview/resume, без автоматической отправки local books или передачи секретов в чат.

## 28 октября 2026 — завершение локального recovery gate

Продолжены существующие source/tests, без reset/изменения main. После `baa7303` локальный полный browser run дал **147 passed / 1 failed за8,8мин**. Tutor fixture отвечал через600ms и убирал Cancel, пока WebKit ждал стабильную кнопку; `d1261b0` удерживает response до реального Cancel, затем выпускает поздний ответ и проверяет сохранённый вопрос/отмену. CI `baa7303` [40594846369](https://github.com/tupomark/Eng/actions/runs/40594846369) дал463 unit и145 browser passed +2 failed +1 flaky: два failures — hidden retained file inputs; старый Listening Replay один раз остановился после seek при успешных HTTP206, retry прошёл. Причина native media stall не объявлена исправленной; диагностический artifact сохранён. `d1261b0` scopes recovery locators к доступному current main. Его [CI40596466044](https://github.com/tupomark/Eng/actions/runs/40596466044) прошёл463 unit и146 browser passed +2 flaky за3,3мин, **не148 first-attempt**: ещё два старых hidden-tree selectors (offline title и account status) уточнены в `7f88866`, без изменения runtime/timeout.

Финальный capture `baa7303`/tests `d1261b0` всё ещё дал **11 passed/1 failed**, даже с FileReader: WebKit emitted `Cannot load blob` во время reload фонового media inventory. Pagehide-abort не оказался универсальной гарантией teardown. [Вторая попытка сохранена](screenshots/2026-10-27-profile-backup-after-reader-before-metadata/README.md); первая неуспешная попытка также остаётся в истории. `cbe5560` устраняет корень наблюдаемого workflow: inventory валидирует только metadata/session rows без Blob decoding, byte reads и SHA; explicit export/restore сохраняет полную byte verification. Added4 regressions, **467/467 unit/DB, 39 suites,22,30с**, strict TypeScript/scoped lint и production build прошли. Три последовательных WebKit repeats прежнего conflict/reload дали **3/3 за44,3с**, без retries/timeout changes. Затем targeted6 cases×2engines с captures прошли **12/12 за2,0мин**; все12PNG/8manifests были clean.

Визуальный просмотр выявил stale pre-restore inventory counts под complete/partial result. `ccbc688` показывает только recorded recovery actions до Open restored profile; свежий inventory после full navigation показывает восстановленные данные. Содержимое/hash/learning history не менялись ради UI. Проверка видимости форм и counts после reopen добавлена в существующий browser round-trip. [Успешные кадры предыдущего UI сохранены](screenshots/2026-10-28-profile-backup-before-inventory-visibility/README.md). Exact source `ccbc68824c98c411e32b5f22a2a0354e8e0d4d46`: scoped lint, strict TypeScript и production build прошли; final capture/CI выполняются отдельно и не предполагаются заранее.

### Точный checkpoint после recovery source

Текущий source/test HEAD `ccbc68824c98c411e32b5f22a2a0354e8e0d4d46`, review branch `codex/product-completion-v2`, [draft PR#1](https://github.com/tupomark/Eng/pull/1). Source после последнего build не меняется; новые docs/proof commits отдельно не выдаются за другой runtime. Следующий проверочный шаг — закончить capture12/точный CI148 на этом SHA, открыть реальные PNG, сверить178ID/семь колонок, сохранить финальные результаты/ограничения и обновить PR. Ни один hosted/device gate не повышается по локальному файлу или CI.

Следующая независимая реализация: **выбранный Writing draft → preview переноса в подтверждённый account → все revisions/branches → resume/reconciliation**. Начать с `src/application/account-transfer.ts`, существующих `src/application/server/learning-command.ts` и `src/infrastructure/supabase/command-repository.ts`; затем CLI-created migration и `/api/account/transfer`. Сохранять original origin/time/head/tips, stable `mapLegacyId`, owner/version/receipt guards. Нельзя replay импорт через `record_self_review_command` (он меняет смысл на recognition/self-review-v1), загружать весь `.lexis` или помещать private authored senses в глобальные таблицы без owner scope. Остальные M01–M14/X01–X10/FLOW-01–10 и полный backlog продолжают действовать.

Внешние gates остаются реальными: hosted Supabase/Auth/JWT/storage/two-device (connector27октября `projects:[]`, runtime28октября без app secrets/variables); настроенный API budget/model/terms, licensed dictionary/audio/offline, ASR/TTS/live/scorer, physical iPhone и разрешённый deploy/hosted restore drill. Ни paid API calls, ни production migrations, ни deploy не выполнялись. Из независимой работы также остаются private cloud entities/sync/projectors, trusted AI evidence/streaming/eval corpus, остальные task/Grammar/Writing/Memory/Corpus/Immersion/placement/notification и полные UX/a11y/performance/device gates. Общий процент готовности не присваивается.

### Финальные local evidence и повторный CI

`ccbc688` targeted gate завершился **12/12 за2,5мин, без retries/skips**: fresh profile с настоящими Writing/media IDB, два повторных merges без новых IDs/observations, malformed/conflict без записи, quota fail→reload→resume, несохранённый composing Writing во второй вкладке и отмена настоящего pending browser transport. Последний transport — контролируемая error fixture, не живой AI. [12 final PNG/8 captured manifests](screenshots/2026-10-28-profile-backup/README.md) действительно открыты во всех шести состояниях и обоих движках; zero pageerror/horizontal overflow. Runtime и build SHA совпадают с `ccbc688`; native WebKit27.2 с iPhone13 preset390×664/scale3/reduced motion и Chromium154 desktop1440×1050 — не physical Safari.

[CI40721948343](https://github.com/tupomark/Eng/actions/runs/40721948343) точного `ccbc688` прошёл install/format/lint/TS/**467unitDB,39suites,5,63с**/build и browser gate, но итог **147 passed+1 flaky за3,6мин**, не148 first-attempt. [Artifact12832096108](https://github.com/tupomark/Eng/actions/runs/40721948343/artifacts/12832096108). Старый Observatory empty-state locator совпал со скрытым retained paragraph и текущим main; retry прошёл. `06990ab78ff62300e7294759cc50d281f699a141` уточняет весь этот case через доступный main. **6/6 последовательных repeats (3каждый engine),27,7с**, прошли без retries; runtime не менялся, timeout не увеличен. CI нового точного test/source SHA проверяется отдельно; завершение не предполагается заранее.

Проверена сохранность178 уникальных IDs/семи traceability columns; актуальные recovery строки обновляются с этим proof. `docs/source/` и `references/` без diff от main baseline. Filename-only scan private-key/provider-token patterns в `src` и production static JS не нашёл совпадений; это ограниченная проверка shipped patterns, не hosted credential audit. Финальные documentation/capture changes проходят formatting/diff check и публикуются в той же review-ветке, без изменения runtime source после `ccbc688`.

### Закрытый gate и состояние для следующего продолжения

[CI40723399293](https://github.com/tupomark/Eng/actions/runs/40723399293) на **точном `06990ab78ff62300e7294759cc50d281f699a141` завершился success**: install, formatting, zero-warning ESLint, strict TypeScript, **467/467 unit/database (39 suites,6,87с)**, production build и **148/148 Chromium/WebKit за3,7мин,2workers,0retry/flaky/failure/skipped**. [Artifact12832565804](https://github.com/tupomark/Eng/actions/runs/40723399293/artifacts/12832565804). Окружение CI: Ubuntu24.04/Node24.22.1. Локальные captures исполнялись на Linux/Node24.19.0; workspace linker libraries и `PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS=1` не подменяют настоящий WebKit hardware Safari.

Практический результат: Settings → Profile export and restore экспортирует выбранные12local sections, сохраняет opaque originals, проверяет файл/конфликты до записи, объединяет историю/контексты/книги/Writing branches/media, возобновляет подтверждённые шаги после сбоя и сверяет результат. Повтор не создаёт IDs/evidence и не обновляет внешние permissions. Незавершённый/complete marker имеет отдельный рабочий экран; актуальные counts видны после полного reopen. Ordinary archive не уничтожает evidence; explicit local purge удаляет private staging и сохраняет generation barrier до нового профиля. Это `implemented-local`/`contract-tested` подмножество широких DATA/MIG/ARCH/FLOW требований, не закрытый hosted scope или весь продукт.

**Точный anchor продолжения:** runtime/capture source `ccbc68824c98c411e32b5f22a2a0354e8e0d4d46`, проверенный source+tests `06990ab78ff62300e7294759cc50d281f699a141`. Последующие proof commits меняют только docs/PNG/manifest и проверяются форматированием; актуальный Git HEAD читать `git rev-parse HEAD`, перед следующими изменениями fetch remote. PR#1 остаётся draft, main `c39997b` сохранён. Не запускать заново audit/проектирование и не выдавать old failures/flaky за first-attempt успех.

**Следующий конкретный шаг:** открыть existing Writing server command/SQL/legacy-ID contracts и создать `src/application/account-transfer.ts` для selected Writing graph → verified destination preview → bounded commands/receipts/resume → exact revisions/branches readback. Сначала deterministic graph/mapping/conflict/cancel и PGlite ownership/transactions, затем реальные SDK/API/userA/B/two-device gates на настроенном test-проекте. `.lexis` целиком не отправлять, private books не переносить автоматически; новые origin/time/head/tips сохранять явно. Остальной полный178-ID backlog и внешние gates остаются обязательными. UI polish, full locale/a11y/maximum-device budgets и редкий native WebKit Replay stall сохраняют ограничения; последнему не приписывается несуществующее runtime-исправление.
