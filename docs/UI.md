# Studexa — UI and design system

## Principles

- **Continue learning first.** Home leads with the last document, due flashcards and progress;
  uploading is one tap away but never the headline.
- **Calm, premium surfaces** (Notion), **conversational AI** (ChatGPT), **motivating feedback**
  (Duolingo: streaks, colour-coded study modes, celebratory results).
- **Material Design 3** structure: tonal surfaces, elevation levels, 48 dp touch targets,
  window size classes, M3 motion curves.

## Tokens (`src/core/theme`)

| Token group | Contents                                                                                           |
| ----------- | -------------------------------------------------------------------------------------------------- |
| Colours     | Light and dark palettes: surfaces, text, brand, status, and feature accents with subtle containers |
| Typography  | 7 variants; each resolves to a font family per weight (Android must not synthesise weights)        |
| Fonts       | Inter (Latin) and IBM Plex Sans Arabic (Arabic, 15% taller lines, no tracking), 4 weights each     |
| Spacing     | 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48                                                                 |
| Radii       | 8 · 12 · 16 · 24 · full                                                                            |
| Elevation   | M3 levels 0–3 (shadow on iOS, elevation on Android)                                                |
| Motion      | 150 / 300 / 450 ms; standard, emphasized-decelerate and emphasized-accelerate curves               |

Feature accents: **streak** (orange), **flashcards** (teal), **quizzes** (violet), **notes**
(amber), **chat** (sky). Every text/background pair is **WCAG AA (≥ 4.5:1) in both themes** —
the pairs were checked programmatically and failing colours darkened while keeping their hue.

Fonts are embedded at build time with the `expo-font` config plugin (no font flash on release
builds) and loaded at runtime for Expo Go/web. Only the 8 weights used are bundled.

## Responsive layout (`useLayout`)

| Size class | Width    | Navigation            | Lists       | Content width |
| ---------- | -------- | --------------------- | ----------- | ------------- |
| Compact    | < 600 dp | Bottom navigation bar | 1 column    | full          |
| Medium     | 600–839  | Navigation rail       | 2 columns   | 720           |
| Expanded   | ≥ 840    | Navigation rail       | 2–3 columns | 1040          |

Bottom sheets become centred cards on tablets.

## Right-to-left

- Layout uses logical properties (`start`/`end`, `paddingStart`, `borderTopStartRadius`), so
  everything mirrors automatically in Arabic.
- Directional gestures follow the reading direction: onboarding swipes, reader page swipes and
  the flashcard "know it" swipe all invert in RTL; chevrons flip.
- Numbers, codes and progress rings stay left-to-right where that is the convention (the 6-digit
  code boxes, the clock-like ring).
- Plurals: every counted phrase has all six CLDR forms, so Arabic reads "صفحة واحدة / صفحتان /
  ٣ صفحات / ١١ صفحة" correctly (verified by a test).
- Switching between LTR and RTL languages prompts an app restart (Android applies direction on
  launch).

## Motion

All animations use Reanimated on the UI thread: press scale, staggered section entrances, card
flip, swipe-to-rate, sliding onboarding slides, animated progress bars/rings, segmented control
indicator, bottom-sheet slide-in, typing indicator. When the system **reduce motion** setting is
on, entrances and loops are skipped and transitions become cross-fades.

## Accessibility

- 48 dp minimum touch targets (`IconButton`, list rows, chips ≥ 36 dp high with padding).
- Roles and states on custom controls: tabs, radios (quiz answers, plans), checkboxes,
  progress bars with values, adjustable page indicator, live regions for streamed AI output,
  snackbars and form errors.
- Decorative illustrations are hidden from screen readers; flashcard faces expose only the
  visible side.
- Text scales with the system font size (capped at 1.6× to keep layouts intact).

## Components (`src/shared/ui`)

`AppText`, `Button`, `IconButton`, `Card`, `Chip`, `TextField`, `CodeInput`, `Checkbox`,
`SearchBar`, `SegmentedControl`, `ProgressBar`, `ProgressRing`, `Skeleton`, `Fab`,
`BottomSheet` / `ActionSheet`, `SnackbarProvider` / `useSnackbar`, `ListRow`, `Section`,
`ScreenHeader`, `Screen`, `EmptyState`, `FormMessage`, `Appear`, `PressableScale`, `RichText`.

## Screens

| Area       | Screens                                                                                                           |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| Onboarding | 3 animated slides with Skip / Next / Get started (first launch only)                                              |
| Home       | Continue learning, due cards, quick actions, progress (goal ring, streak, week chart), recent documents and chats |
| Library    | Search, filters, sort, FAB → upload file / camera / gallery, rename, favourite, delete                            |
| Document   | Resume, ask questions, 10 study tools, bookmarks                                                                  |
| Reader     | Paged text, swipe/buttons, bookmark, explain page, progress and study-time tracking                               |
| AI tools   | Streaming result, read aloud, copy, save as note, regenerate, translate target                                    |
| Chat       | Conversations (search, delete), per-document chat with citations and suggestions                                  |
| Study      | Flashcard decks, quizzes, notes; bookmarks; translator                                                            |
| Flashcards | Flip card, swipe or 4 answer buttons with FSRS interval previews, session summary                                 |
| Quiz       | Intro, MCQ / true-false / short answer, timer with auto-submit, score and review                                  |
| Notes      | Pinned + recent, search, autosaving editor                                                                        |
| Settings   | Theme, language, reminders (time, days), daily goal, plan & usage, legal                                          |
| Paywall    | Benefits, yearly/monthly plans, trial, restore                                                                    |

## Data

Screens talk only to repository interfaces through per-feature contexts. The composition root
(`src/composition/app-repositories.tsx`) chooses the implementation: the in-memory **demo
backend** (`src/data/demo`) in demo mode, or the **Supabase repositories** (`src/data/supabase`)
when credentials are configured. AI answers stream token by token over server-sent events
(`src/core/ai`), with page-source chips, a remaining-usage line for Free users, a flag to
report an answer, and a translate icon to switch the answer language. Documents that are still being processed are
polled every 3 seconds; switching accounts clears every cached query.

Remote config (`src/core/remote-config`): `useFeatureFlag(key)` hides features switched off in
the dashboard (camera scan, mind map, paywall entry points), and Home shows the current
announcement until dismissed.

## Known optimisation candidates (Phase 8)

- `expo-router` pulls in a Material Symbols font (~1 MB) through its native-tabs module even
  though the app uses JS tabs; Metro tree-shaking should remove it.
- Material Community Icons (~1.3 MB) could be subset to the glyphs used.
- Phase 5 grew the Hermes bundle from ~6.8 MB to ~12 MB, mostly `@sentry/react-native`
  (bundled replay/feedback integrations) and RevenueCat's JS mappings. Candidates: Sentry's
  Metro plugin with tree-shaking flags, and excluding unused Sentry integrations.
