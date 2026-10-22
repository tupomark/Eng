# Решения, ограничения и неизвестное

## УТВЕРЖДЕНО / считать контрактом продукта
1. Название: LEXIS; английский, включая RU assistance.
2. 14 основных модулей из `MODULES_14.md`; Knowledge Flow и общая knowledge model — центральный механизм.
3. **Sense-level** учёт, per-skill evidence; импорт ≠ незнание; добавление ≠ знание.
4. Режимы Quick / Focused / Free Exploration / Goal Training.
5. AI Tutor стили Mentor / Examiner / Companion, корректировка уровня исправлений.
6. Session types: Guided Lesson, Conversation Lab, Weakness Workshop, Real-Life Simulation, Knowledge Check.
7. Balanced Living Home, гибрид Living Core + быстрый возврат к текущей работе.
8. Верхнеуровневая навигация Home / Library / Learn / Tutor / Core.
9. Contextual Workspace: Quick Interaction / Context Panel / Dedicated Workspace / Persistent Context.
10. Dictionary Quick View / Full Entry / Deep Dive; Reader adaptive assistance, My Understanding; Writing adaptive feedback vs style; Voice Live и Push-to-Talk.
11. Grammar Atlas: hybrid structured + contextual; Analytics: Living Core + Knowledge Observatory; Goals совместные и корректировки с подтверждением.
12. Smart Inbox для импорта вместо автоматического назначения всех карточек.
13. Smart Review на принципах FSRS + varied practice и AI verdict appeal.
14. UI dark-only currently, iPhone-first, extreme minimalism, high-legibility matte fogged glass, desert/mid-century color feeling without furnishing imagery.
15. Мягкие rounded, medium-weight typography, spacious surfaces, subtle gradients, voice orb/wave, not overwhelming background.
16. Mobile PWA и полноэкранные Reading/Voice workspaces.

## СИЛЬНЫЕ ПРЕДПОЧТЕНИЯ / не терять
- Голосовой помощник наиболее удачная часть последних макетов.
- Строгий запрет на конкуренцию декора с текстом, особенно Reader, Dictionary, Writing.
- Цвета warm graphite/espresso/smoked walnut/sand/ivory, не ярко-фиолетовый, не агрессивно-бронзовый, не interior imagery.
- Сильная, но матовая «запотевшая» фактура. Умеренные анимации, без эффекта бесконечного свечения.
- Пользователь ценит ощущение премиальной вещи, а не обычного учебного кабинета.

## ПРЕДПОЧТИТЕЛЬНЫЙ, НО ЕЩЁ НЕ УТВЕРЖДЁННЫЙ КОНКРЕТНЫЙ ВЫБОР
- Framework: Next.js/React/TypeScript/Tailwind/CSS tokens/Motion, Postgres/Supabase, Vercel, GitHub.
- Rive для Voice, если производительность и лицензия оправдывают; иначе SVG/CSS/Motion.
- FSRS algorithm library/version нужно подобрать и проверить; не выдумывать «идеальную точность».
- Azure Speech pronunciation scoring, ASR/TTS, AI provider, словарные API, embeddings, observability требуют выбора, тарифов и проверки качества.
- Любые точные цвета, размеры и шрифты из референсов — **направление**, не утверждённые production tokens. Codex должен предложить разумные значения и предъявить реальные скриншоты для сравнения.

## НЕ ИЗВЕСТНО / НЕЛЬЗЯ ПРИДУМЫВАТЬ
- Есть ли уже GitHub-репозиторий, Supabase проект/ключи, Vercel deployment, Linear workspace/project.
- Доступность конкретной GPT-6.1 модели в API/на тарифе, её качество/цена.
- Наличие лицензий на Oxford/Cambridge/другие словари и книги.
- Финальное бренд-лого, платные планы, дата запуска, бюджет инфраструктуры.
- Утверждённые production-метрики, целевой retention, содержимое реальных пользовательских словарей.
- Наличие живого speaking assessment / stream API.

## Коллизия: «Complete Experience» vs «vertical slice»
Это **разные горизонты**, не противоречие: первый инженерный срез небольшой, первое осмысленное публичное предложение должно быть цельным по навыкам.

## Коллизия: изображения vs финальный feedback
Изображения — визуальные эксперименты; последние отзывы пользователя важнее. Не копировать непрозрачность фона, композицию или плотность карточек, если это мешает тексту или минимализму.

## Обновления
При изменении требования указать дату, инициатора, rationale, impact и связанные файлы. Не переписывать прошлые решения молча.
