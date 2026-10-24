# LEXIS: продукт и текущая реализация

LEXIS — персональная среда английского для общего, профессионального и академического обучения. Чтение, словарь, письмо, аудирование, разговор, грамматика и повторения используют общую модель знаний. Конечная цель — полный контракт владельца v2: M01–M14, X01–X10 и FLOW-01–FLOW-10. Первый vertical slice — историческая исходная точка, не предел разработки.

Приоритеты источников — в [журнале решений](DECISIONS_AND_SOURCE_OF_TRUTH.md); исходные [PRODUCT_VISION](source/PRODUCT_VISION.md), [MODULES_14](source/MODULES_14.md) и [LEARNING_ENGINE](source/LEARNING_ENGINE.md) сохраняются как provenance. Этот документ описывает актуальный scope, не заменяет полную спецификацию.

## Инварианты

- Знание относится к конкретному значению и навыку. Семь lexical skills — recognition, context, recall, writing, speaking, listening, pronunciation; grammar относится к отдельному concept. Пять старых skill IDs сохраняются совместимо.
- Импорт добавляет материал, сохранение фиксирует намерение. Ни одно действие не доказывает знания или незнания; неизмеренный навык показывает «данных недостаточно».
- Observation, competence projection, review rating и расписание различаются. Recognition не повышает writing/speaking; чтение transcript не доказывает самостоятельное listening; ASR confidence не оценивает pronunciation.
- Подсказки, reveal, принятая коррекция, модальность и самостоятельность фиксируются явно. Технический сбой/неоднозначность не становятся отрицательной оценкой.
- Challenge сохраняет оригинал, исключает сомнительное влияние и пересчитывает зависимые данные. Архив не стирает evidence; окончательное удаление — отдельное действие.
- Рекомендации имеют основание. Пользователь управляет нагрузкой, целями и доступом к личному контексту; Tutor не меняет план скрыто.

## Навигация и сценарии

| Раздел  | Назначение и локальный вход                                         | Остаточная граница                                          |
| ------- | ------------------------------------------------------------------- | ----------------------------------------------------------- |
| Home    | Продолжение чтения, due и короткий следующий шаг                    | Полный cross-module resume и grounded Tutor recommendations |
| Library | TXT/EPUB, материалы, saved senses, import/Inbox                     | Cloud, широкое dictionary coverage                          |
| Learn   | Legacy self-review и общая практика/FSRS, Writing/Grammar/Listening | Все форматы/режимы и живые speech/evaluation capabilities   |
| Tutor   | Явный Voice preview и отдельный scoped text Tutor                   | Настройка provider/budget, live-проверка                    |
| Core    | История/Challenge, Observatory, semantic neighbourhood, Goals       | Это наблюдения, не общий CEFR/mastery                       |

На телефоне остаётся пять пунктов навигации, на desktop — боковая. Reader и Voice имеют отдельные рабочие пространства. Command открывает реальные маршруты и авторские слова; полный поиск по книгам/drafts/concepts/приватным индексам ещё не реализован.

Собственный текст/EPUB → выделение → Dictionary Quick/Full/Deep → явный sense/save → практика/FSRS → Core доступен локально в пределах десяти авторских senses. Импорт → preview/ambiguity → Inbox → выбор изучения не создаёт массового due. Reader сохраняет структурный anchor; ограниченный session-local ledger возвращает из Dictionary к источнику, без личных excerpts в URL. Это не долговременный облачный provenance.

Writing сохраняет исходник, revisions, caret/scroll и конфликтующие ветви; Grammar даёт шесть авторских concepts и общие tasks. Автоматический writing feedback ещё не подключён. Listening воспроизводит реальный sample и локальные файлы; transcript меняет assistance provenance, shadowing записывает короткий локальный повтор без оценки произношения. Observatory и Goals используют реальные observations с опубликованными определениями и исключением disputed/assisted данных.

Старые recognition-самооценки/`heuristic-v1` сохраняются. Настоящий FSRS item создаётся после явного bootstrap preview; самооценка не превращается в объективное доказательство. Задание, помощь, результат и user rating сохраняются отдельно.

## Локальный режим и незавершённый scope

Stores относятся к одной browser-local идентичности: это не Auth, облачная копия, гарантированное хранение или безопасная многопользовательская синхронизация. Ошибки quota/повреждения/устаревшей вкладки не должны давать ложный успех. Backup/restore отдельных stores существует частями; единый полный backup всех медиа/профиля ещё не завершён.

Auth/atomic SQL commands и AI adapters — отдельные основы. Нет подтверждённых app secrets/доступного Supabase-проекта, лицензированного широкого словаря, AI/API бюджета, ASR/TTS/live transport или specialized pronunciation scorer. SDK/экран/миграция не подтверждают соединение. Voice preview остаётся прототипом; local shadowing — настоящая media-функция с более узким scope.

Quick / Focused / Free Exploration / Goal Training, EN/RU/mixed, Learning DNA, Memory и другие утверждённые механики подключаются последовательно. Их наличие в контракте не означает готовность по названию переключателя. [Трассируемость](REQUIREMENTS_TRACEABILITY.md) содержит точный статус и остаток каждой возможности.

## Качество и завершение

Dark-only, warm graphite/espresso/sand, сильно матовое стекло и читаемость остаются согласованным направлением. Пять референсов не являются обязательной пиксельной копией. Mobile fit, keyboard/focus, reduced motion, длинный EN/RU/IPA и честные ошибки обязательны внутри каждого среза.

Полнота требует поведения всех M01–M14 и FLOW, сохранности данных, живых интеграций и прав на контент. Release отдельно требует iPhone hardware, performance/operations/backup/deploy gates. Текущий этап не называется готовым к выпуску по одной сборке или количеству тестов. SHA/команды/результаты и следующий шаг — в [PROGRESS](PROGRESS.md).
