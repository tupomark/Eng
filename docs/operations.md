# LEXIS: test/release и восстановление

Runbook инженерной основы v2, 24 октября 2026. Это подготовленные инструкции, **не доказательство проверенной hosted эксплуатации**. Нет подтверждённого preview URL, согласованного production проекта, live backup drill или фактического provider бюджета. Проверенные команды/SHA дополняются в PROGRESS после выполнения.

## Окружения и безопасная конфигурация

| Окружение    | Что разрешено и доступно сейчас                                               | Что нельзя предполагать                                                                                    |
| ------------ | ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Local        | Одна browser-local идентичность, original fixtures, PGlite/unit/browser tests | Local данные не cloud backup/Auth и не приватная multi-account изоляция                                    |
| Test/preview | Подготовленные server adapters/migrations и opt-in provider config            | Не создавать платный проект, не применять remote SQL и не включать API расходы без покрывающего разрешения |
| Production   | Конфигурация/план проверяются до выпуска                                      | Наличие GitHub source/next build не означает публикацию и безопасность hosted данных                       |

Серверные secrets устанавливает оператор через secret storage выбранного окружения. Не печатать `.env`, process environment, cookie/header/token или private material в отчёт. `.env.example` содержит имена и пустые значения; `NEXT_PUBLIC_*` допустим только для действительно публичного URL/publishable key, не service/provider key.

Supabase требует URL/publishable key, server secret и корректный `LEXIS_APP_ORIGIN`; Auth site/callback URLs должны совпадать с фактическим HTTPS origin. Сначала test project, затем настоящие A/B/anon/expired/revoked/foreign ID/storage/cache проверки. Login UI ещё не подключает полный cloud learning repository и не разрешает multi-user pilot.

AI disabled по умолчанию. Для запуска нужны explicit `LEXIS_AI_ENABLED=true`, выбранный provider и фактический model ID, server API key, output/context/request limits, проверенные текущие цены и per-user/server daily budgets. Конфигурация budgets без согласованного разрешения расходов не является согласием на запрос. Model capabilities/region/retention/terms проверяются непосредственно перед подключением; ChatGPT subscription не заменяет API billing. При отсутствии trusted quota store внешний вызов не должен выполняться.

## Проверка source release

Из чистого lockfile checkout на точном SHA:

```sh
npm ci
npm run format:check
npm run lint
npm run typecheck
npm test
npm run build
PLAYWRIGHT_BROWSERS_PATH=.cache/ms-playwright npx playwright install --with-deps chromium webkit
npm run test:e2e
```

Для managed Linux с локальными browser dependencies использовать задокументированный путь, не отключать реальные сценарии. Сохранять traces/screenshots failures. После исправления повторять затронутый gate, а полный общий gate — когда готов совместимый source набор. Для нового source SHA нужен свой CI; исторический success не переносится.

Перед publication проверить отсутствие tracked secrets/private uploads/generated learner data. Исходники/документация в публичный Eng разрешены, пользовательские книги/essays/audio — нет. Push обычный в review branch, fetch актуального remote до отправки; без force и подмены чужой работы. Review PR содержит concrete behavior, validation и точные ограничения. GitHub CI и source publish — отдельные факты от deploy.

Перед авторизованным preview deploy: actual environment/config/origin, server secrets, migration order/backup, provider budgets/rights, private storage и security headers. После deploy записать URL/SHA/region и пройти browser→API→data→reopen, отрицательные Auth/ownership/provider paths и public-cache privacy. Защищённый deploy проверяется через предусмотренный доступ, а не снятием защиты. Без выполненного шага не писать «опубликовано».

## Резервные копии и local restore drill

Единого полного профиля backup/restore ещё нет. Используются отдельные возможности:

| Данные               | Доступный путь                    | Что проверить                                                                                                        |
| -------------------- | --------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| Learning v1          | Core export и `/core/restore`     | Preview counts/IDs/context/disputes; confirm merge; повтор без дублей; conflict не меняет данные                     |
| Tasks/FSRS           | Practice export/restore preview   | Attempts/hints/challenges/rating events/versions, stable replay и exclusion после old backup                         |
| Materials/Inbox      | Library materials backup/restore  | Chapters/source IDs/anchors/bookmarks/batches/rows; additive merge не затирает current position                      |
| Writing              | Studio export/restore             | Original/revisions/branches/parents; конфликтующие revisions сохраняются                                             |
| Goals                | Goals backup/restore              | Stable IDs/revisions, archive, stale proposal protection и counts из реальных events                                 |
| Imported audio/video | Сохранить исходные файлы отдельно | Complete media/profile archive и automated restore пока не реализованы; не обещать их сохранность одной JSON-кнопкой |

Перед существенной migration создать exports всех доступных stores и сохранить исходные books/media. Повреждённые bytes скачать raw; не делать reset или migration поверх них. Restore сначала в отдельном test browser profile/origin: validate → preview → confirmation → counts/values/source links/history reconciliation → reopen → повторный restore. Идентификаторы и disputes сверяются, не только общий счётчик. Fixtures должны быть оригинальными/разрешёнными; private archives не добавляются в Git.

Настоящий hosted backup требует отдельной test destination и restore drill DB/storage/search/projections без production reset. Записать backup age, migration/schema version, owner counts, object references и residual backup retention. До такого drill нельзя называть hosted backup/restore проверенным.

## Архивирование и удаление

Archive убирает intent/document/item из активного списка, сохраняя независимую history. Permanent purge — отдельное подтверждённое действие с конкретным названием/последствиями. Deleting a source не равно автоматическому удалению всех learning excerpts; фактическая политика отображается рядом с действием.

Полный local purge обязан остановить in-flight writes/media/AI, заблокировать late callbacks, уведомить другие вкладки, удалить только принадлежащие LEXIS local/session keys/IndexedDB/cache/service worker и сверить результат. Не закрывшаяся IndexedDB/отказ браузера → partial failure с retry, не сообщение «всё удалено». Новая вкладка не должна восстанавливать удалённый материал из старой памяти. Local purge не удаляет hosted account/provider retention/backups.

Cloud delete drill отдельно проверяет DB, private objects/signed URLs, поисковые индексы, excerpts/summaries/transcripts/cache и допустимый backup residual period. Сроки провайдера нельзя выдумывать. Revocation/deletion должны предотвращать повторное появление через скрытый summary.

## Обновление, откат и сбой

Перед несовместимой schema migration: backup/preview, validation всех старых IDs, migration test, forward-fix и проверка совместимости frontend/API/offline DB. Не применять destructive reset к production. Связанный pending answer/draft нельзя удалять ради обновления shell. Offline worker не кэширует Auth/API/private pages; update применяется осмысленным действием после сохранения workspaces.

Для source-only regression: оставить прежний проверенный release, исправить в review branch и повторить подходящий gate. Actual deployment rollback выполняется средствами выбранной платформы и проверяется на реальных data/schema contracts; инструкция платформы определяется после её выбора. DB rollback не должен удалять новые факты. При необратимой forward schema использовать совместимый forward-fix.

Для AI/provider incident: выключить `LEXIS_AI_ENABLED`, не сбрасывать пользовательские drafts/answers, показать unavailable/unevaluated состояние и оставить Reader/Library/редактирование полезными. Сохранить безопасные trace ID/feature/error class/duration/provider capability, без raw payloads/secrets. Quota exhaustion/timeout не создают incorrect/lapse. Отдельный операторский health/signal и incident owner ещё должны быть назначены в hosted среде.

## Отчёт gate

Каждый выполненный шаг записывает source SHA, environment, команду/сценарий, фактический результат, реальный URL/capture при наличии, данные о device/browser и оставшуюся границу. Physical iPhone/standalone/audio interruptions/heat — отдельный gate от Playwright WebKit. Release-ready claim требует полного требования/rights/security/operations scope, не одного зелёного build.
