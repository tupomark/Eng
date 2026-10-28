# Проверенный local-profile recovery

Compiled source/test SHA: `ccbc68824c98c411e32b5f22a2a0354e8e0d4d46`. Production build прошёл до capture; runtime во время capture не менялся. Реальные UI-действия и original repository fixtures; чужих материалов, live AI, hosted Auth или внешней загрузки нет. Quota failure введён намеренно для проверки resume.

Команда: `LEXIS_CAPTURE_PROFILE=docs/screenshots/2026-10-28-profile-backup LEXIS_CAPTURE_SOURCE_SHA=ccbc68824c98c411e32b5f22a2a0354e8e0d4d46 LEXIS_CAPTURE_BUILD_SHA=ccbc68824c98c411e32b5f22a2a0354e8e0d4d46 npm run test:e2e -- tests/e2e/profile-backup.spec.ts tests/e2e/profile-pause.spec.ts tests/e2e/tutor-chat.spec.ts --grep 'whole local|exported local|tampered container|storage write failure|profile recovery refuses|cancelling a pending request' --workers=1`.

Результат: **12/12 passed, 2,5мин**, без retry/skips. 12 actual viewport PNG, восемь per-scenario/project manifests `captured`, zero pageerrors/horizontal overflow. Все 12 PNG открыты и визуально просмотрены. В manifests отдельные source/build IDs, время, engine/version, viewport/scale/reduced motion/scroll; документационные working-tree изменения не объявлены другой сборкой.

| Состояние         | iPhone WebKit                                            | Desktop Chromium                                            |
| ----------------- | -------------------------------------------------------- | ----------------------------------------------------------- |
| Первый запуск     | [Empty](iphone-webkit-empty-inventory.png)               | [Empty](desktop-chromium-empty-inventory.png)               |
| Настоящие counts  | [Inventory](iphone-webkit-populated-inventory.png)       | [Inventory](desktop-chromium-populated-inventory.png)       |
| Reviewed merge    | [Preview](iphone-webkit-valid-preview.png)               | [Preview](desktop-chromium-valid-preview.png)               |
| Complete и reopen | [Complete](iphone-webkit-completed-restoration.png)      | [Complete](desktop-chromium-completed-restoration.png)      |
| Конфликт same ID  | [Conflict](iphone-webkit-conflicting-preview.png)        | [Conflict](desktop-chromium-conflicting-preview.png)        |
| Partial и resume  | [Interrupted](iphone-webkit-interrupted-restoration.png) | [Interrupted](desktop-chromium-interrupted-restoration.png) |

Материалы: спокойные текущие warm graphite/espresso/sand tokens, без подставленных референсов и нового визуального направления. Complete/partial не показывают stale inventory до full reopen. Пять LIGHT refs задают язык формы, не pixel-perfect макет. Длинная форма требует scrolling; это не приёмка полного RU locale,200% zoom, screen reader, composited contrast, maximum-size memory или physical iPhone/standalone. WebKit27.2 iPhone13 preset390×664/scale3/reduced motion и Chromium154.0.8037.57 desktop1440×1050 исполнялись на Linux.

Неуспешные ранние попытки сохранены отдельно: [Blob background read](../2026-10-27-profile-backup-before-cancel/README.md), [FileReader до metadata-only](../2026-10-27-profile-backup-after-reader-before-metadata/README.md), [успешный UI до устранения stale counters](../2026-10-28-profile-backup-before-inventory-visibility/README.md). Финальная готовность полного продукта/интеграций определяется [PROGRESS](../../PROGRESS.md), не количеством кадров.
