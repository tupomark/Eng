# Визуальная сверка LIGHT-пакета — 22 октября 2026

Все пять WebP и обзорный JPG действительно открыты инструментом просмотра изображений до начала разработки. Перечень и SHA архива — в [аудите](HANDOFF_AUDIT_2026-10-22.md). Ни один макет не обозначен финальным утверждённым экраном. Письменные требования имеют приоритет, в особенности снижение заметности фона за текстом.

| Изображение                                                                                        | Что увидено и перенесено как принцип                                                     | Что не копируется                                                                              |
| -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [B4369BCF…](../references/2026-10-22-light/assets/B4369BCF-53F9-4F54-9196-408731F3EDEA.webp)       | Семейство мобильных экранов, тёплое дымчатое стекло, мягкие перекрывающиеся объёмы Voice | Яркая дюна за Reader, вымышленные 328/87%, микроскопические подписи                            |
| [Матовый интерфейс](../references/2026-10-22-light/assets/матовый_стеклянный_интерфейс_lexis.webp) | Мягкие стеклянные контейнеры и ясная группа выбора значения; слоистая voice-мембрана     | Плотность всех модулей сразу, слишком активный фон, неподключённые кнопки воспроизведения      |
| [Премиальная концепция](../references/2026-10-22-light/assets/премиальная_ui_концепция_lexis.webp) | Воздушные отступы, спокойные округлые поверхности и малое число действий                 | Точные композиции и размеры не принимаются за утверждённые; нет готового макета-картинки в DOM |
| [3E9D10E4…](../references/2026-10-22-light/assets/3E9D10E4-A913-4353-8473-7714EBFA1448.webp)       | Тёплый charcoal/espresso и контекстный словарь справа на широком экране                  | Desktop-плотность, ландшафт и светящаяся сфера непосредственно под длинным текстом             |
| [IMG_2070](../references/2026-10-22-light/assets/IMG_2070.webp)                                    | Скульптурная мягкость объёма, растушёванные переходы светлого и тёмного                  | Это mood-референс, не интерфейс LEXIS; содержимое исходного приложения не переносится          |

[Обзор пакета](../references/2026-10-22-light/reference_overview.jpg) объединяет эти пять материалов. Он не содержит доступных оригиналов всех 18 исторических изображений.

## Результат текущего среза

- Home: приветствие, продолжение реального sample-чтения, компактный Core и повторение. Первое действие видно на мобильном экране без прокрутки.
- Voice: три CSS-мембраны, минимальный микрофон, явное обозначение preview, управляемые состояния без capture. Орбитальные траектории и спутники удалены.
- Reader: ровный графитовый фон и управляемая sans/serif-типографика. Декоративные световые объекты за абзацами отсутствуют.
- Dictionary: контекст, намеренный выбор значения, сохранение и прогрессивное раскрытие. Нет фоновой картинки или неподключённой кнопки аудио.
- Core: качественное `Tentative` вместо числовой псевдовероятности владения; внутренние самооценки и история сохранены.

Реальные снимки приложения: [Home mobile](screenshots/2026-10-22/home-390.png), [Home desktop](screenshots/2026-10-22/home-1440.png), [Reader](screenshots/2026-10-22/reader-390.png), [Dictionary](screenshots/2026-10-22/dictionary-390.png), [Review](screenshots/2026-10-22/review-390.png), [Voice](screenshots/2026-10-22/tutor-390.png).

Сверка подтверждает реализованные принципы, а не финальное визуальное утверждение владельцем. Физический iPhone, производительность Safari при длительной прокрутке и реальная клавиатура требуют отдельной проверки. Полный скриншот длинной страницы сохраняет fixed-панели в координатах исходного viewport; он не показывает положение панели после пользовательской прокрутки.

## Продолжение v2 — 24 октября 2026

Все пять реальных WebP и overview повторно открыты перед визуальными изменениями v2; тринадцать исключённых оригиналов не считаются доступными. Новые functional workspaces продолжают тот же warm graphite/espresso/sand и matte fogged material, без подстановки картинок/новой неоновой концепции. Эта запись не является завершённой сверкой новых экранов: root получает актуальные production screenshots, фиксирует source SHA/viewports/long states и реальные расхождения. Снимки22.10 выше — исторические. Physical iPhone и финальное одобрение владельца остаются отдельными proof gates.

### Воспроизводимый capture v2

Подготовлен `scripts/capture-workspaces.mjs`; он запускается **после** browser tests против уже работающей production-сборки на `http://127.0.0.1:3000`. Скрипт не запускает сервер и не должен выполняться одновременно с rebuild. В этой документационной задаче браузеры не запускались и снимки ещё не объявляются полученными.

```sh
node scripts/capture-workspaces.mjs
```

Source anchor — `a3db700`; фактический `git HEAD`, dirty flag, browser versions, source URL, viewport/device scale и исход каждого capture записываются в `docs/screenshots/2026-10-24-v2/capture-manifest.json` при реальном запуске. При local extracted browser dependencies применяются те же environment paths, что и для e2e. Секретные значения и raw DOM не выводятся в diagnostics.

Матрица: Chromium desktop **1440×1050 CSS px**, WebKit `iPhone 13` **390×844 CSS px**, обе с reduced motion. Создаются свежие изолированные contexts, original TXT/XLSX fixtures импортируются через настоящий UI, Writing содержит авторский capture-текст, а наблюдение появляется только после реального закрытого recall задания и явного user rating. Это воспроизводимая test data, не личная история владельца и не искусственная оценка мастерства.

Capture охватывает Home first-use/resume, Library empty/material, Import start/preview, Inbox empty/imported, Learn, practice draft/feedback/FSRS, sample/private Reader, Dictionary Quick/Full/Deep/unavailable, Tutor chat unavailable, шесть подписанных Voice preview states, Core/Observatory empty/populated/Network, Writing, Grammar, Goals, Settings, offline before setup, **настоящий network-disabled shell и private Reader**. Offline capture сначала требует реальной opt-in подготовки service worker и лишь затем отключает сеть контекста. AI не вызывается, microphone permission не запрашивается, Voice states остаются явно simulated.

Снимки viewport, не фиктивные полноэкранные композиции. Скрипт записывает горизонтальное переполнение и page-error category; failure даёт ненулевой exit code, не скрытый «успех». Эти checks не заменяют ручную визуальную оценку, composited contrast, длинный RU/IPA/чат/большие списки, 200% zoom, screen reader, keyboard/scroll/native iPhone gestures, hardware audio/heat/memory и финальное одобрение владельца. Реальные расхождения нужно зафиксировать после открытия полученных PNG, а не предполагать по наличию скрипта.

## Выполненная визуальная сверка v2 — 24 октября

Скрипт `scripts/capture-workspaces.mjs` снимает 39 реальных состояний в каждом движке: desktop Chromium 154.0.8037.57, 1440×1050; WebKit27.2 с iPhone13 preset, 390×664, scale3, reduced motion. Исходники сборки указаны отдельно в `builtSourceHead` [manifest](screenshots/2026-10-24-v2/capture-manifest.json); рабочие документационные изменения не выдаются за чистый source checkout. Использованы только оригинальные fixtures и настоящие UI-действия, без API-ответов-заготовок и без микрофонной передачи.

| Шаг                | Проверенный результат                                                                                                  | Реальный снимок                                                                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| 1. Home            | Основная кнопка sample-чтения находится над нижней навигацией; нет выдуманного прогресса                               | [Mobile Home](screenshots/2026-10-24-v2/iphone-webkit-home-first-use.png)                                                                  |
| 2. Private Reader  | Компактные controls/заголовок, свёрнутая помощь, исходный текст виден без уменьшения чтения ниже18px                   | [Reader](screenshots/2026-10-24-v2/iphone-webkit-reader-own-text.png)                                                                      |
| 3. Dictionary      | Запрошенное слово видно в первом viewport; выбранный исходный контекст доступен в disclosure                           | [Full](screenshots/2026-10-24-v2/iphone-webkit-dictionary-full.png), [Quick](screenshots/2026-10-24-v2/iphone-webkit-dictionary-quick.png) |
| 4. Practice/Core   | Настоящая отправка recall-ответа и явная FSRS-самооценка, отдельно inspectable evidence                                | [Practice](screenshots/2026-10-24-v2/iphone-webkit-practice-feedback.png), [Core](screenshots/2026-10-24-v2/iphone-webkit-core.png)        |
| 5. Writing         | Настоящий сохранённый текст в редакторе; снимок сохраняет положение фокуса вместо принудительного scroll к заголовку   | [Writing](screenshots/2026-10-24-v2/iphone-webkit-writing-draft.png)                                                                       |
| 6. Voice/Listening | Voice остаётся явно обозначенным preview; Listening использует реальный sample audio, transcript раскрывается отдельно | [Voice](screenshots/2026-10-24-v2/iphone-webkit-voice-idle.png), [Listening](screenshots/2026-10-24-v2/iphone-webkit-listening-hidden.png) |
| 7. Offline         | Сеть действительно отключена, собственный разрешённый текст повторно открыт из local store                             | [Offline Reader](screenshots/2026-10-24-v2/iphone-webkit-reader-network-disabled.png)                                                      |

Открыты и визуально проверены основные mobile Home/Reader/Dictionary/Writing/Voice и desktop Home. В предыдущем [e092d1f capture](screenshots/2026-10-24-v2-before/README.md) выявлены перекрытая CTA и слишком высокие вводные блоки; исправлены scoped CSS/markup, шесть геометрических regressions прошли в обоих движках. Native WebKit disclosure-marker заменён тихим CSS-chevron с сохранением native keyboard/ARIA поведения. Палитра и исходные пять референсов не заменены новой концепцией.

78 captures не означают полную визуальную/доступностную сертификацию каждого состояния. Zero horizontal overflow и отсутствие pageerror в manifest — конкретные автоматические наблюдения, не проверка всего содержимого при200% zoom. Требуются отдельные SR/контраст/длинные данные/ландшафт/реальная клавиатура, hardware iPhone Safari/standalone, heat/memory, live voice и итоговое визуальное одобрение владельца. Словарь остаётся восьми-entry editorial sample; большие возможности не считаются подключёнными по одному экрану.
