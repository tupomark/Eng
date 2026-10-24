# Локальные измерения LEXIS — 24 октября 2026

Это воспроизводимые наблюдения Node-domain/adapter paths в managed Linux container, **не проверка скорости iPhone, интерфейса браузера или полевых web vitals**. Они дают исходные числа для дальнейшего профилирования и не закрывают PERF-01/IOS-01.

## Среда и воспроизводимость

Запуск выполнен 24.10.2026 в 11:33 UTC: Node **v24.19.0**, Linux x64, `availableParallelism=2`. Зафиксированный Git HEAD — `0cf9e61eaed6c7dae13e3dc5508fe1ae0e60144f`. В дереве шла параллельная интеграционная работа; script и report ещё не были закоммичены. [Машиночитаемый результат](performance/2026-10-24-local-paths.json) содержит SHA-256 **фактически измеренных** модулей, поэтому HEAD не выдаётся за доказательство отсутствия рабочих изменений.

```sh
node --import tsx scripts/measure-local-paths.ts /tmp/lexis-local-paths.json
./node_modules/.bin/tsc --project scripts/tsconfig.benchmarks.json
./node_modules/.bin/eslint scripts/measure-local-paths.ts --max-warnings=0
./node_modules/.bin/prettier --check scripts/measure-local-paths.ts scripts/tsconfig.benchmarks.json docs/performance-local.md docs/performance/2026-10-24-local-paths.json
```

Node import hook использует установленный и закреплённый `tsx`, без новой зависимости. В этом sandbox CLI `tsx` не смог открыть служебный IPC socket; запуск через `node --import tsx` исполнил тот же TypeScript без IPC server. Git provenance читается из HEAD/ref через fs, без child process и без чтения credentials.

Fixture создан самим script: 1 000 CSV-строк, 49 точных повторов, 174 292 UTF-16 characters / 207 856 UTF-8 bytes. Есть BOM, quoted commas, embedded newlines, кириллица, full-width EN, apostrophe, hyphen, accents и emoji. Это исходный разрешённый пример, не учебный корпус пользователя. После каждого прохода проверяются counts, сохранение исходной surface form и unresolved/pending status. Знания, коллекция и повторения не записываются.

## Наблюдаемые результаты

Три прогрева parse/normalize исключены; затем 30 полных проходов используют **production cooperative yield `setTimeout(0)`**, без подмены синхронной заглушкой. Lookup: один прогрев набора из 16 запросов, затем 200 наборов / 3 200 отдельных вызовов реального editorial adapter с ограниченным оригинальным контекстом. p50/p95 — nearest-rank распределения этого запуска, не доверительный интервал, калиброванный SLO или прогноз для другого устройства.

| Путь                                                                | Количество |       p50 |       p95 |  Максимум |
| ------------------------------------------------------------------- | ---------: | --------: | --------: | --------: |
| Parse CSV + normalize 1 000 rows                                    |         30 | 129.91 ms | 240.56 ms | 269.52 ms |
| Editorial lookup, включая await результата                          |      3 200 |  0.052 ms |  0.185 ms |  45.77 ms |
| Интервал соседних callback у 1 ms event-loop probe во время импорта |        480 |   4.44 ms |  39.66 ms |  66.40 ms |

За 30 импортов вызваны 210 parse-progress и 330 normalization-progress callbacks. Из 3 200 lookup результатов 2 000 — found, 1 200 — not-found; это смесь заранее заданных запросов, **не показатель качества/покрытия словаря**. Адаптер содержит восемь авторских entries и не обращается к внешнему провайдеру.

Отмена запрашивалась во время настоящей работы: parse после progress на 32 768 characters, normalize после progress на 100 rows. Promise отклонился через **8.14 ms** и **12.64 ms** соответственно; результат импорта не возвращён. Cancellation наблюдается на следующей кооперативной границе, а не обещает остановку в точной строке callback. Это domain measurement; отказ записи/rollback и UI проверяются отдельными tests.

Максимальный наблюдённый timer gap 66.40 ms требует дальнейшего browser/device профилирования. Node timer включает cooperative yield, GC/runtime scheduling и конкуренцию контейнера; его нельзя объявить браузерной Long Task или INP. Даже очень короткий adapter lookup не измеряет render/route/selection/storage и не подтверждает пользовательский p95 ≤300 ms на iPhone.

## Проверенные по коду границы hot paths

| Путь                              | Что ограничено сейчас                                                                                                               | Что остаётся измерить/улучшить перед ростом                                                                                                                                                                                                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Private Reader                    | `document-reader.tsx` рендерит по 80 абзацев; search/bookmark выдача ограничена                                                     | Весь JSON materials store всё ещё читается/валидируется в памяти: 30 documents, до 2 млн characters на документ, общий serialized guard 20 млн characters. DOM pagination не является lazy book loading или доказательством memory budget                                                        |
| Materials на Home/Library/Command | `useMaterials` синхронизирует repository и обрабатывает failures                                                                    | Shell всегда монтирует CommandPalette с отдельным `useMaterials`; Home/MaterialLibrary имеют свои вызовы. Возможны повторные загрузки/validation одного snapshot при mount. Нужен замер больших fixtures и scoped/shared subscription либо отложенное открытие Command перед расширением лимитов |
| Private media                     | List проходит bounded cursor и сохраняет только metadata; выбранный asset materializes Blob через `loadLocalMedia`; 10 files ×25 MB | Cursor ещё читает одну запись с bytes за раз. Peak heap/GC и reopen больших файлов на hardware не измерены; при росте нужен metadata-only index/store, а не увеличение bounds                                                                                                                    |
| Task/FSRS                         | `useMemo` сохраняет observations/schedules при неизменном state; shared clock не требует повторного replay на каждом tick           | Изменение task state вызывает projection/replay; scheduler канонизирует/сортирует events. Local JSON snapshot commit повторно валидирует/сериализует store (guard 10 млн characters). Это correctness-first local mode, не проверенный hot path для 100 000 events                               |
| Observatory                       | Видимые rows выдаются порциями; trail/filter/summary memoized                                                                       | `buildObservationTrail` строит и сортирует полную историю в памяти. UI pagination не заменяет owner/target/time query pagination и incremental projections                                                                                                                                       |

Эти выводы основаны на конкретных source paths, а не на выдуманных latency/query plans. Большие histories, максимально разрешённые книги/media, hosted PostgreSQL query plans и real-device heap/heat здесь не прогонялись. Изменять storage-архитектуру ради одной container цифры не требуется; следующий шаг — репрезентативные fixtures, browser trace/heap на согласованном reference device и затем измеряемое устранение узкого места с сохранением replay/Challenge correctness.

## Открытые quality gates

Не измерены LCP/INP/CLS, field p75, 100 ms tap feedback, audio end-of-turn/network latency, длительное чтение/Voice, battery/heat и physical iPhone Safari/standalone. Нужны реальные viewport/device/OS/network conditions и source SHA. ASR/TTS/live/AI/dictionary provider latency отдельно проверяется только после разрешённой настройки сервиса. Текущий результат — **implemented-local measurement**, не release-verified performance.
