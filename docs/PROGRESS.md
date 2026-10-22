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

**Статус: локальная реализация проверена: 64/64 unit/DB и 30/30 E2E, lint/typecheck/build пройдены.** Новые изменения следуют после source-intake commit `97d2fe0`; итоговые application/QA commits оформляются после проверки.

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
