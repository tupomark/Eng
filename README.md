# LEXIS

Персональная среда английского: чтение, словарь, письмо, аудирование, грамматика и практика используют общие значения, навыки и учебные наблюдения. Конечная цель — полный контракт владельца v2, все четырнадцать модулей; текущая реализация ещё не является полным продуктом.

Исходники: [tupomark/Eng](https://github.com/tupomark/Eng). Разработка v2 ведётся в `codex/product-completion-v2`. Публикация исходников не означает deployment приложения. Начните со [START_HERE_CODEX.md](START_HERE_CODEX.md), [решений](docs/DECISIONS_AND_SOURCE_OF_TRUTH.md) и [журнала](docs/PROGRESS.md).

## Запуск

Требуется Node.js `>=22.18.0 <27` и npm. Локальные сценарии не требуют внешних ключей.

```sh
git clone https://github.com/tupomark/Eng.git
cd Eng
git switch codex/product-completion-v2
npm ci
npm run dev
```

Откройте `http://localhost:3000`. Для production-режима: `npm run build`, затем `npm start`. Используется Webpack; строгая проверка TypeScript включена. В ограниченной среде можно задать `npm ci --cache /tmp/lexis-npm-cache`.

## Реализованный локальный scope

- Home, Library, Learn, Tutor, Core, Command и полноэкранный Reader. Home продолжает последнее локальное чтение; единые часы обновляют due по сроку и при возвращении. Недоступное сохранённое значение остаётся видимым, доступным поиску и экспорту.
- Собственные TXT, вставленный текст и поддерживаемый DRM-free EPUB: preview, главы, структурная позиция, закладки, поиск, настройки чтения, архивирование/удаление и materials backup/restore. EPUB читается как безопасный текст, без исходного сложного оформления/изображений.
- TXT/CSV/XLSX и поддерживаемая вставка таблицы Reverso: preview, кодировка/разделитель, неоднозначные строки, Smart Inbox, правка, явное учебное намерение и rollback. Импорт не повышает знание и не делает весь список немедленно due.
- Dictionary Quick → Full Entry → Deep Dive, формы/фразы, выбор значения, редакционные примеры/нюансы/provenance и возврат к тексту. Покрытие — **восемь авторских слов и десять значений**, а не полный словарный сервис; IPA не означает наличие аудио.
- Несколько приватных source passages для одного значения: повторное сохранение контекста сохраняет learning-v1 bytes и историю; отдельные export/preview-merge и поиск в Library.
- Общие versioned tasks с отдельными навыками, подсказками, проверкой закрытых заданий и Challenge. Практика, Grammar и Listening используют этот контракт. Открытое предложение без semantic evaluator сохраняется неоценённым.
- Настоящий FSRS: `ts-fsrs@5.4.2`, FSRS-6, отдельные user rating events и item identity. Старые recognition-самооценки `heuristic-v1` сохраняются; явный bootstrap с preview/backup не превращает их в объективную оценку.
- Writing: IndexedDB-черновик, autosave, revisions/diff, сохранение конфликтующих версий, restore и переход к шести авторским Grammar concepts с общей практикой. Автоматический feedback Writing не подключён.
- Listening: реальное воспроизведение авторского синтетического WAV и разрешённых локальных файлов, скорость/A–B/позиция, transcript assistance и короткая локальная запись для shadowing. Это не ASR, live conversation или pronunciation assessment.
- Settings с раздельными предпочтениями, управляемым reduced motion, подтверждённым удалением local profile и opt-in offline shell. Приватные API/Auth/pages не попадают в service-worker cache; сеть и внешний AI не имитируются offline.
- Observatory с объяснимыми counts и исходными observations, небольшие авторские semantic relations и локальные Goals. Они не выводят общий «процент владения языком».
- Восстановление v1 JSON с preview/merge без перезаписи конфликтующей истории; отдельные backups материалов, практики, черновиков и целей. Единый полный backup всех медиа и данных ещё не завершён.

Новые сценарии имеют unit/database/browser fixtures. **Наличие тестового файла не означает успешный полный прогон.** SHA, команды, результаты и оставшиеся ошибки записываются в [PROGRESS](docs/PROGRESS.md); [трассируемость](docs/REQUIREMENTS_TRACEABILITY.md) отделяет исторический baseline от нового кода.

## Сервер и внешние gates

Опциональные `/account`, Supabase SSR adapter, origin/redirect guards, SQL/RLS и небольшие атомарные команды подготовлены. Доступного подключённого Supabase-проекта нет. Локальный профиль не становится облачным после входа; полный repository/projector, перенос в аккаунт, private storage и два устройства ещё требуют реализации и live-проверки. Локальные stores пока относятся к одной browser-local идентичности, а не к безопасно изолированным аккаунтам.

AI pipeline/Tutor adapter и quota contracts разрабатываются с отключённым по умолчанию внешним вызовом. Ключ, фактическая модель, разрешённый бюджет и цены явно настраиваются оператором. Отсутствие настройки не имитируется готовым AI-ответом. Подписка ChatGPT и инструменты разработки не являются backend/API-бюджетом LEXIS.

AI evaluation/Tutor, лицензированный широкий словарь/RU/audio, ASR/TTS/live transport и отдельный pronunciation scorer **не live-проверены**. `/tutor` сохраняет подписанный Voice preview. Local shadowing в Listening использует микрофон только по действию пользователя и не выставляет оценку. Physical iPhone Safari, hosted backup/restore, deployment/HTTPS и эксплуатационные gates открыты. Точные зависимости — в [реестре](docs/risks-and-dependencies.md).

Данные браузера могут быть удалены/вытеснены. localStorage не даёт атомарной межвкладочной транзакции; IndexedDB-транзакции черновиков/медиа не являются облачной копией. Сохраняйте исходные файлы и экспортируйте backups. Секреты нельзя помещать в `NEXT_PUBLIC_*`, Git или чат. Имена опциональных настроек описаны в `.env.example` и [supabase/README.md](supabase/README.md).

## Проверки

```sh
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Playwright запускает production-сервер после сборки. Linux `/usr/bin/chromium` используется автоматически; override — `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. WebKit/iPhone preset не заменяет физический iPhone. Исторический [CI на dea5a6d](https://github.com/tupomark/Eng/actions/runs/39846824037) прошёл 64 unit/database и 30 e2e 22 октября; этот результат не подтверждает новый код v2. S0 отдельно проверен: 67 unit/database и 36 e2e, см. PROGRESS.

Версии закреплены lockfile. ESLint 9.39.5 временно выбран из-за совместимости React-плагина Next, но помечен EOL; обновление цепочки остаётся tooling gap. Next использует compiler API (`useTypeScriptCli: false`), проверки не отключены.

## Документы и визуальное направление

Тёплый graphite/espresso/sand, мягкое матовое стекло и спокойные поверхности чтения остаются согласованным направлением. Пять референсов и overview сохранены в LIGHT-пакете; тринадцать исторических вариантов намеренно отсутствуют. Они не являются пиксельно утверждёнными макетами и не подставляются вместо интерфейса.

- [Продукт](docs/product.md), [архитектура](docs/architecture.md), [модель данных](docs/data-model.md).
- [FSRS/tasks](docs/fsrs-and-tasks.md), [импорт и Reader](docs/feature-notes/materials-ingest.md), [Listening](docs/feature-notes/listening.md), [Observatory/Goals](docs/knowledge-observatory.md).
- [Дизайн-система](docs/design-system.md), [сверка референсов](docs/REFERENCE_REVIEW.md).
- [План S0–S9](docs/implementation-plan.md), [178 ID](docs/REQUIREMENTS_TRACEABILITY.md), [журнал](docs/PROGRESS.md), [live gates](docs/risks-and-dependencies.md).
- [Инженерные правила](AGENTS.md). `docs/source/` и `references/2026-10-22-light/` остаются неизменными снимками требований.
