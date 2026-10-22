# LEXIS Visual Design System — extremely detailed direction

> **TOP PRIORITY:** This product is not generic EdTech and not a neon AI dashboard. It should feel like an extremely refined, warm, quiet, fogged-glass interface, purpose-built for iPhone. Text content is sacred: decorative landscape/gradients never compete with reading, dictionary or writing.

## 1. История итераций и что пользователь отверг
Пользователь неоднократно пересматривал варианты. Концепты Aubergine Theory, Graphite & Ivory, Nocturne, Orbital, Eclipse, Noir Minimal, Aurora и более эффектные графитово-бронзовые композиции не были безусловно утверждены. Требования к последней итерации: **ещё сильнее минимализм, больше запотевания и мягкости, фон заметно тише, голосовой помощник нравится особенно**, скриншоты-референсы приложены в `assets/`. Не трактовать любой одиночный макет как финальную утверждённую работу.

## 2. Emotional brand signature
- Calm, intelligent, private, understated premium.
- Quiet energy, not gamer aesthetic or cryptocurrency UX.
- Warm atmospheric darkness, not black-and-white clinical, not glossy metallic bronze.
- Shapes recall dune contours, soft earth/stone, lacquered mid-century materials **only abstractly**.
- No photographs of luxury interiors, chairs, bedrooms, desert stock photography inside working UI.
- User’s concept words: desert / dune / mid-century feeling; expressive Voice orb; fogged glass; minimalism; spacious, fluid forms.

## 3. Color system (proposed direction, values pending visual validation)
Avoid blindly hardcoding sampled screenshot pixels. Derive semantic tokens (`surface`, `surface-muted`, `surface-elevated`, `text-primary`, `text-secondary`, `accent-warm`, `accent-focus`, `glass-fill`, `glass-stroke`, `shadow-soft`, `backdrop-mist`) from a coherent neutral ramp. Suggested **non-approved starting examples**:
- Background: deep espresso charcoal around #171615 / #22201E.
- Primary text: gentle warm off-white #EDE9E3 (check contrast).
- Secondary text: warm ash #B8B2A9.
- Accent: muted sand/stone #C9AF90, applied sparingly.
- Gentle highlights: smoky beige/pearl, not yellow/orange neon.
- Glass surfaces: layered warm-neutral fill, edge glint only when needed, no sharp outlines.
- Error/success: clear semantic signals, not only colors; reserve warm palette for brand, preserve legibility.

These HEX examples are suggestions, not final approval. Test contrast with actual composited backgrounds.

## 4. Fogged glass materials
- Visible softness/fogging comes from translucent softly tinted surfaces, subtle gradient/texture and local blur, not just CSS `backdrop-filter: blur(50px)` everywhere.
- Use 2–3 material levels consistently: background ambient, reading surface, interactive elevated panel.
- For dense reading blocks, a **mostly opaque neutral glass panel** / uniform reading background is preferred. Glass texture must not interfere with small text or selection.
- Blur restricted to small local panels, with static fallback, budgeted for battery/scroll performance.
- No sparkling bevels, hard white borders, overdriven shine or giant volumetric light behind paragraphs.
- Keep layers distinguishable via luminance and spacing, not multiple nested shadows.

## 5. Layout and density
- iPhone first: generous outer gutters, intentional 8pt-ish rhythm but no forced precise token before review.
- A few purposeful high-quality components rather than busy dashboard tiles.
- Strong visual hierarchy, short labels, icons with meaning and tap affordances.
- Corner radii generous and variable by scale, organic feel but stable geometry for text.
- High-density info via progressive disclosure, not cramming.
- Reader/Dictionary/Writing surfaces should look calmer than Home or Voice.
- Home cards should not fill every gap; whitespace is intentional.

## 6. Type
- Modern rounded, not overly geometric; medium weights, crisp but soft.
- Avoid ultra-light hairlines, decorative high-contrast serif for UI. A subtle editorial serif could be considered for a reading headline only if it does not undermine coherence; not a mandate.
- Adequate font-size, line height, measure and weight for body. Do not copy tiny unreadable text in AI-generated mockup images.
- EN/RU glyph quality matters. Test Cyrillic, IPA, phonetics, italics, punctuation and long translations.
- UI should scale gracefully with iOS accessibility text size and browser zoom.

## 7. Icons, buttons, chips
- Lucide-consistent or similarly coherent custom vector set. Use legible strokes and stable alignment.
- Icon-only interactive elements have accessibility label/tooltip and minimum comfortable tap area.
- Buttons: minimal segmented/soft-glass primary states, restrained accent. Avoid multiple equally screaming CTAs.
- Controls: visible selection and pressed states, focus rings and voice feedback.

## 8. Background: precise behavioral contract
- Decorative dune-like shapes may appear on splash, selected Home hero, voice/orb and Core.
- As soon as text density increases (Reader, Dictionary, Writing, long-form Tutor), background must reduce contrast/complexity, become dimmer and flatter **without darkening text itself or making page oppressively black**.
- Never place a text column on top of an unshielded sculptural highlight. Put text on a calm high-legibility glass surface or flat background.
- Natural warm shadows without heavy contrast spikes or oversaturated bronze.
- Optional visual atmosphere can be toggled/diminished in focus reading mode.

## 9. Voice Assistant — especially important
- The user specifically praised the voice assistant in preceding mockups. Preserve its character: one sophisticated, tactile, warm, translucent living orb/wave, simple centered mic waveform/glyph, breathing/response to actual voice state.
- Orb should appear less like a shiny hard sphere and more like layered softly fogged membrane; naturally diffused translucency.
- Voice activity animation state-driven: idle slow/quiet, listening subtle responsive, processing inward/controlled, speaking nuanced, error/paused distinct. Do not endlessly pulsate at full intensity.
- Keep control row uncomplicated: mic, cancel/back, transcript/captions, locale/accent, settings if useful.
- Texture gradients possible via layered SVG/vector/CSS; use Rive only if it produces meaningfully better verified performance. Provide reduced-motion static variants.

## 10. Living Core
- Refined compact sculptural representation of progress/knowledge; evokes living evolving system but not literal network graph or orbital galaxy with dozens of nodes.
- No pseudo-precision (e.g. '87% retention' without methodology).
- Progressive detail: Core overview → Knowledge Observatory → per-skill evidence.
- Animation secondary to comprehensibility. No frantic particles.

## 11. Reader UI
- Most restrained screen of the product. Reading layout and text content dominate.
- Smooth inline highlight and contextual lookup; selected words preserve positional anchoring and visual continuity.
- Quiet controls: back, font controls, bookmark, chapter progress, optional TTS.
- Onboarding for reader controls in context, not an intrusive tutorial.
- No ambient light beams crossing sentences. Light contrast stable across scroll.

## 12. Dictionary UI
- Quick View clean and short; sense number, IPA, tap-to-play, concise EN definition, RU gloss, examples, save/expand.
- Full Entry and Deep Dive only on interaction; short lines and consistent hierarchy.
- Sense ambiguity exposed, not auto-picked invisibly.

## 13. Writing UI
- A calm writing canvas with very high text readability. Feedback either a nonintrusive side/drawer/below paragraph or anchored annotation.
- Error vs style suggestions clearly different. User revisions preserve control; no auto replacement without action.
- On small screen avoid microscopic split panes.

## 14. Motion
- Continuity and gentle feedback over spectacle. Transform/opacity primarily; avoid costly massive dynamic blurs.
- Microinteractions support navigation, memorization and control; mode change shouldn't animate huge backgrounds behind reading text.
- Reduced motion: not just slow motion, but eliminate decorative movement; keep important state feedback accessible.
- Page and layer transitions coordinated; no competing spring overshoot, no parallax nausea.

## 15. Hard negative rules
1. No purple/magenta/neon AI aesthetic.
2. No high-contrast bright copper UI or amber-on-black cliché.
3. No stock photos, furnishings, realistic indoor scenes.
4. No landing-page-only prototype pretending to be an app.
5. No dashboard of 14 competing panels.
6. No font below readable size because screenshot looked cool.
7. No ambient background visible through long text without strong contrast shielding.
8. No opaque wallpaper-image screenshots as app UI; all components genuine responsive DOM/SVG.
9. No unjustified WebGL, continuous shaders or unoptimized costly filter stacks on mobile.
10. No substitution of user's requirements by default Tailwind/shadcn look.

## 16. How to validate visual fidelity
- Screen captures on mobile viewport (e.g. iPhone-like width and height) for Splash, Home, Reader, Dictionary, Voice, Core, Library, Writing, Goals.
- Compare against **visual language** not word-for-word copied AI-generated fake text.
- Confirm background salience: readable with grayscale test; check user ability to read paragraphs without eyes following dunes.
- Check fogging: cards genuinely soften depth but retain clear text; neither flat opaque generic cards nor glass with intense busy scene.
- Check state transitions, accessibility focus, reduced-motion, touch interactions, scroll performance.
- Flag discrepancies before polishing screens further.

## 17. Priority order
1. Readability and usability; 2. extreme minimalism; 3. refined fogged-glass texture; 4. soft organic atmosphere and restrained warmth; 5. voice visual expressiveness; 6. animation and effects.

The priorities settle any conflict: **readability wins against visual flourish**.
