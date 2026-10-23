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
