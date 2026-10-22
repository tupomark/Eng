# Технический аудит handoff: 22 октября 2026

## Что получено и изучено

Получен lightweight ZIP размером **513461 байт**. SHA-256 исходного архива: `37f9a06e997fe5423114b1b9f88c64c3b9f011825f503b032ae16a3c2926aebc`. Содержимое сохранено в `references/2026-10-22-light/` и не используется как runtime UI.

| Файл в пакете                                      | Размер, байт | Назначение                                                   |
| -------------------------------------------------- | -----------: | ------------------------------------------------------------ |
| `CODEX_FIRST_MESSAGE.md`                           |         3827 | Первая команда; содержит исторические ссылки на полный пакет |
| `README_FIRST.md`                                  |          225 | Актуальная точка входа lightweight-пакета                    |
| `LEXIS_COMPLETE_CODEX_BRIEF.md`                    |        96256 | Полный консолидированный текст, 1189 строк                   |
| `reference_overview.jpg`                           |       150837 | Обзор пяти выбранных изображений                             |
| `assets/B4369BCF-53F9-4F54-9196-408731F3EDEA.webp` |        71110 | Пользовательский mobile screen family, особенно Voice        |
| `assets/матовый_стеклянный_интерфейс_lexis.webp`   |        82586 | Сгенерированное исследование fogged glass                    |
| `assets/премиальная_ui_концепция_lexis.webp`       |        79892 | Сгенерированное premium mobile exploration                   |
| `assets/3E9D10E4-A913-4353-8473-7714EBFA1448.webp` |        87750 | Пользовательское warm charcoal/dune desktop mood             |
| `assets/IMG_2070.webp`                             |        15850 | Пользовательское вдохновение мягкими объёмами; не UI         |

Прочитаны CODEX_FIRST_MESSAGE, README_FIRST, весь brief, встроенные START_HERE и AGENTS, все пятнадцать документов, действующие README/AGENTS/docs и реализация репозитория. Открыты overview и все пять WebP. Корневой агент отдельно подтвердил пользователю чтение до начала разработки.

Актуальный curated catalog намеренно заменяет восемнадцать исходных изображений пятью. Тринадцать исключены как исторические или повторяющиеся. Ни один оставшийся макет не утверждён как точный финальный экран. Новые реальные скриншоты должны показывать работающий интерфейс, а не эти картинки.

## Карта источников

Встроенные исходники сохранены в brief с маркерами `SOURCE`; отдельные снимки размещаются в `docs/source/`: DECISIONS_AND_SOURCE_OF_TRUTH, PRODUCT_VISION, MODULES_14, LEARNING_ENGINE, UX_FLOWS, SCREEN_BLUEPRINTS, VISUAL_DESIGN, REFERENCE_CATALOG, REFERENCE_GALLERY, TECH_ARCHITECTURE, INTEGRATIONS_AND_TOOLS, ROADMAP, ACCEPTANCE_MATRIX, QUALITY_AND_TESTING, PROGRESS.

Текущий [журнал решений](DECISIONS_AND_SOURCE_OF_TRUTH.md) определяет приоритет и изменения. [Трассируемость](REQUIREMENTS_TRACEABILITY.md) отделяет требования от реализованного. Исходный `docs/source/PROGRESS.md` сообщает лишь о подготовке handoff; фактическая история разработки ведётся в [PROGRESS.md](PROGRESS.md). Снимок handoff не должен подменять уже существующие результаты приложения.

## Реальный репозиторий на входе в итерацию

Репозиторий не пустой. Имеются Next.js 16.4.2, React 19.3.1, TypeScript strict, Tailwind CSS, npm lockfile, локальная Git-история и шесть маршрутов: `/`, `/library`, `/learn`, `/tutor`, `/core`, `/reader`.

Основные реальные файлы:

- `src/domain/{types,learning,validation,index}.ts`: значения, пять навыков, самооценки, расписание, оспаривание и runtime-валидация.
- `src/application/ports.ts`: контракты хранения, словаря, AI и речи; наличие портов не означает подключения.
- `src/infrastructure/dictionary/seed.ts`: авторские записи восьми слов; `src/infrastructure/storage/browser-repository.ts`: browser-local сохранение.
- `src/components/{learning-provider,shell,home,library,reader,review,core,voice,orb,modal}.tsx`: рабочие экраны и визуальный Voice.
- `src/app/globals.css`, `layout.tsx` и route pages: действующие стили и входные точки.
- `supabase/migrations/20261021223658_knowledge_foundation.sql`: подготовленная локально миграция восьми таблиц с RLS.
- `tests/unit`, `tests/database`, `tests/e2e`, `playwright.config.ts`, `vitest.config.ts`, `.github/workflows/ci.yml`: проверки и подготовленный CI.
- README, AGENTS, семь существующих документов и четыре скриншота в `docs/screenshots/`.

Зафиксированная проверка **21 октября**: 43 unit/database tests, 16 e2e cases в desktop Chromium и iPhone WebKit, typecheck, production build, отсутствие известных production vulnerabilities на момент audit. Это исторический baseline из [verification.md](verification.md), а не повторный запуск 22 октября. Удалённый CI не проверялся.

В UI действительно работает Home → Reader → слово → явный выбор значения → Save → recognition Review → reload → Core → dispute/replay. Хранение локальное, расписание `heuristic-v1`, исходный словарь авторский. Voice представляет анимационный концепт. Supabase Auth/удалённые записи, AI, speech, licensed dictionary, GitHub remote, Vercel и Linear не подтверждены как подключённые к приложению.

## Архитектурная оценка

Модульный монолит соответствует первому срезу. Чистый domain отделён от React; значения и навыки не сводятся к одному флагу. Есть защита от дублей, прозрачная самооценка и пересчёт после исключения evidence. SQL использует ownership RLS и составные FK; локальная проверка PostgreSQL не заменяет проверку Supabase JWT/PostgREST.

Главный архитектурный долг на входе: orchestration локальных команд и ошибки живут в React LearningProvider, привязанном к browser repository. Текущая итерация выносит application-session, сохраняя local state v1. Будущий сервер должен принимать атомарные команды, а не перезапись всего LearningState; удалённый projector и транзакции остаются отдельным этапом.

## Основные расхождения

| Требование handoff                               | Состояние на входе                                                    | Действие                                                                                             |
| ------------------------------------------------ | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Реальные референсы как источник                  | Старые README/AGENTS/docs ещё говорят, что изображения отсутствуют    | Обновить актуальный source ledger; сохранить исторические факты от 21 октября                        |
| Спокойный Home, мягкий Core                      | Есть продолжение чтения, но большой orbital Core и мелкая microcopy   | Упростить иерархию, типографику и материал без новых псевдометрик                                    |
| Мягкая мембрана Voice со state-driven поведением | Жёсткая сферическая форма, орбиты/спутники и Boolean animation toggle | Слоистый fogged объём, явные demo idle/listening/processing/speaking/error/paused states             |
| Настройки чтения и контекстные уровни            | Фиксированный serif, разделы, общий dictionary modal                  | Регулируемый шрифт/интервал, спокойный Reader, Quick View с раскрытием деталей, сохранение контекста |
| Обратимость учебного намерения                   | Save без отдельного undo                                              | Добавить ограниченное undo, сохраняя существующие наблюдения                                         |
| App/domain/infrastructure/UI                     | Домен отделён, orchestration находится в provider                     | Вынести локальную application-session и проверить persistence compatibility                          |
| FSRS + varied practice                           | Только recognition-самооценка и heuristic-v1                          | Оставить честный статус; отдельный алгоритмический срез                                              |
| Smart Inbox, PWA, EN/RU/mixed, multimodal        | Не реализованы                                                        | Явно сохранить в roadmap и трассируемости, не имитировать                                            |

Пять текущих skill IDs — scope локальной версии, а не окончательная онтология для listening/pronunciation/grammar. Эвристические баллы не являются калиброванной вероятностью. Dictionary provenance и лицензирование будущих данных потребуют расширения до подключения внешнего источника.

## Ограниченный план текущей итерации

1. Зафиксировать архив, source ledger, актуальные продуктовые решения, трассируемость и progress; не переписывать исходный handoff.
2. Уточнить семантические материалы, минимальные размеры полезного текста и quiet Home; переработать Voice-прототип с честными состояниями без capture.
3. Развить первый путь через Reader controls, Dictionary Quick View с раскрытием деталей и ограниченный undo; отделить application-session, сохранить локальные данные v1 и evidence.
4. Запустить соответствующие unit/e2e, typecheck и build; получить реальные мобильные и desktop screenshots, сравнить визуальный язык и отметить расхождения.

Реализация каждого пункта подтверждается отдельно в PROGRESS и verification. Эта итерация не включает все четырнадцать модулей, настоящий голос/AI, PWA, FSRS, внешний деплой или применение production migrations.

## Неизвестные и риски

Не подтверждены production service projects, credentials, тарифы и лицензии, доступ API-моделей, полный speaking evaluator, финальный бренд и production targets. Архив задаёт направление, но не одобряет точный цвет или размер. Синтетический WebKit не проверяет реальные iOS selection handles, safe areas, клавиатуру и энергопотребление; физический iPhone остаётся обязательным отдельным smoke test перед пилотом.

## Продолжение после аудита

Source-intake commit `97d2fe0` сохранил пакет и приоритет источников. На основании аудита реализован ограниченный локальный срез: semantic materials, resume-first Home, qualitative Core, six-state Voice preview, Reader preferences/Dictionary Quick View с раскрытием деталей/provenance/safe undo и application LearningSession без миграции learning v1.

Новые unit/toolchain проверки и 11 реальных screenshots от 22 октября зафиксированы в [PROGRESS.md](PROGRESS.md), визуальное сопоставление — в [REFERENCE_REVIEW.md](REFERENCE_REVIEW.md). Итог финального полного e2e заносится после его завершения. Таблицы выше сохраняют состояние на входе в аудит; они не означают, что исправленные gaps всё ещё отсутствуют.
