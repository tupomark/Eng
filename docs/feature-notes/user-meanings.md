# Собственные значения и общая практика

25 октября 2026. Уровень этого среза — `implemented-local` с отдельными contract/browser проверками. M01/M02 и полный продукт не объявляются завершёнными; точный финальный source SHA и результаты общего gate записываются в [PROGRESS](../PROGRESS.md).

## Пользовательский сценарий

В Library → Own dictionary (`/library/meanings`) можно описать произвольное слово или выражение: обязательны headword, POS и English definition; RU translation, пример, IPA и явные словоформы опциональны. «Meaning belongs to» позволяет явно добавить ещё одно значение выбранной собственной лексеме либо создать отдельную запись/POS. Совпадение написания не объединяет источники или историю.

Создание сохраняет только определение. Затем пользователь открывает его в Dictionary, выбирает конкретный sense и отдельно сохраняет учебное намерение. Quick View/Full Entry, Library, Command, Review, Core, Observatory и practice используют те же stable IDs. При совпадении с редакционным словом Dictionary показывает кандидатов с POS, источником и фрагментом определения; возврат в Reader сохраняет явно выбранный смысл и исходный anchor. Неоднозначность не разрешается выбором первого результата.

В принятой строке Smart Inbox можно выбрать подходящее значение либо описать собственное. Ручное создание связывает sense со строкой, но не включает его в обучение автоматически. «Add chosen meaning to study» остаётся отдельным действием. Если запись определения/сохранение намерения уже произошла, а обновление import link отказало, UI сообщает о частичном результате и позволяет повторить связь без нового смысла/evidence. Rollback партии не удаляет независимо созданное определение, saved intent или практику.

## Данные, источник и обучение

- Domain: `src/domain/lexical-catalog.ts`; adapter: `src/infrastructure/storage/browser-lexical-catalog.ts`; UI binding: `src/components/lexical-catalog-provider.tsx`.
- Store `lexis.lexical-catalog.v1`: version/revision, lexemes/POS, senses, forms, fixed `user-authored` provenance и creation time. Namespaces `user-lexeme-*`/`user-sense-*` не позволяют подменить редакционные IDs при restore.
- Оригинальное содержание не редактируется скрыто. Append добавляет новый sense; прежние определения, задания, attempts и schedule history остаются. Точная повторная отправка сохраняет исходный смысл, включая случай нескольких значений entry; семантическое сходство алгоритм не угадывает.
- Restore сохраняет все stable IDs, включая исторические одинаково выглядящие записи. Если одинаковому ID соответствует другое содержание, весь merge блокируется. При нескольких точных исторических кандидатах создание не выбирает случайную историю.
- Пользовательское определение явно отделено от editorial/licensed/AI content. Нет вымышленного BrE/AmE audio или автоматически сгенерированного Deep Dive. Пустые IPA/example/collocations не маскируются готовыми фактами.
- `catalog-tasks.ts` создаёт общий task с `TaskProvenance.kind=user`. Recognition/recall/translation проверяют собственный answer key, сохраняя source/version. Это не независимая проверка языковой точности определения. Успех recall не обновляет writing/speaking; own-sentence без semantic evaluator остаётся ungraded.
- Attempt, помощь, verdict, explicit rating, Challenge и FSRS используют существующий task engine. Create/import/save не добавляют observations, не повышают mastery и не создают массового due. Старый learning-v1 не перезаписывается при создании каталога.

## Хранилище, восстановление и масштаб

Границы: 4 000 000 serialized UTF-16 code units, 2 000 entries, 10 000 senses, не более 30 senses на entry; формы и collocations также ограничены schema. Runtime validation применяется до чтения/commit/restore. Browser stale-byte guard обнаруживает устаревшую вкладку, но не является атомарной межвкладочной транзакцией. Purge barrier блокирует позднюю запись после начала подтверждённого удаления профиля.

Export/original сохраняет именно исходные bytes; additive restore показывает число новых entries/senses и конфликты перед подтверждением. File preview отменяет устаревший результат чтения и не меняет каталог сам по себе. Ошибка quota сохраняет введённое определение, ранее сохранённые записи и возможность retry. Повреждённые bytes не заменяются пустым каталогом. Raw export и reload доступны; отдельного reset/recovery только этого store пока нет. Полный profile purge в Settings требует отдельного подтверждения и удаляет остальные локальные данные.

Memoized exact headword/form/collocation index обслуживает Reader/Inbox; поиск не выполняет вложенную полную проверку user entries на каждого кандидата строки. Dictionary и список собственных entries показывают результаты порциями. Это bounded single-device реализация, не обещание performance на физическом iPhone или облачного поиска. Воспроизводимый локальный замер индекса: `scripts/measure-catalog-index.ts`, [контрольный Node/container результат](../performance/2026-10-25-catalog-index.json). Он отделяет построение индекса от повторных lookup и не измеряет React render, browser web vitals или hardware Safari. Большие selector lists остаются отдельной задачей.

## Проверка и доказательства

Код и fixtures:

- `tests/unit/lexical-catalog.test.ts`: namespaces/POS/senses, immutable append, exact duplicates, additive restore/ID conflicts, corrupt bytes, stale writes, quota и purge.
- `tests/unit/local-catalog-lookup.test.ts`: общий lookup, формы/Unicode/перевод, cancellation, отдельные источники/POS и exact index.
- `tests/unit/catalog-tasks.test.ts`: editorial IDs, user provenance, только соответствующий skill, открытый ответ без semantic grade и допустимые подсказки.
- `tests/e2e/user-meanings.spec.ts`: фактические create → Dictionary → save → recall/FSRS/Challenge, stable identity двух senses/POS, настоящий export/repeated restore/conflict, corrupt bytes, write failure/retry и unresolved Inbox/rollback.
- `tests/e2e/sense-contexts.spec.ts` и `dictionary-depth.spec.ts`: исходные passages, возврат/выбор и source handling. Исправлена подтверждённая гонка захвата URL до завершения Reader navigation; подробности в [точном CI расследовании](verification-2026-10-25.md).

Промежуточный production source `a8324ad` прошёл build, strict typecheck, zero-warning lint и форматирование; общий unit/database run дал **312/312, 30 suites, 15,87с** в 10:32 UTC. Targeted Chromium/WebKit run на этой сборке прошёл **20/20 за 1,8мин**: шесть новых историй каталога плюс три Dictionary и один saved-context сценарий в обоих движках. Это не результат последующих audit fixes: новая седьмая история неоднозначного Reader return и исправления exact duplicate/Inbox index проходят следующий gate. Новые результаты и screenshots записываются отдельно после фактического запуска.

## Незакрытые границы

Следующий gate `5e31016`: **314 unit/DB и138/138 локальных browser cases за8,8мин**, без retries/skips. CI на этом source — **137 passed +1 flaky WebKit Replay**, отдельный результат. Replay дополнительно прошёл3 последовательных WebKit cases; runtime fault не доказан. Diagnostics/CI artifact retention и prefetch fix зафиксированы отдельно. На build `754323b` получены [12 чистых captures](../screenshots/2026-10-25-user-meanings/capture-manifest.json) с реальными author/save/recall/rating действиями. Exact-HEAD CI и следующий срез — в [PROGRESS](../PROGRESS.md).

Каталог принадлежит одной browser-local идентичности и не становится аккаунтным после Auth. Cloud persistence, два устройства, owner-scoped cache/sync, полный profile/media backup/restore и granular catalogue archive/delete/edit lifecycle ещё не завершены. Полный лицензированный Dictionary, RU/audio/offline rights, live semantic verification и все остальные M01–M14 не заменяются пользовательскими заметками. Physical iPhone native selection, hardware performance, screen reader/zoom и финальная визуальная приёмка остаются самостоятельными gates. Внешние paid calls, deployment и production migrations в этом срезе не выполнялись.
