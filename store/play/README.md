# Google Play store material

Everything Play Console asks for, ready to paste or upload. Nothing here is uploaded
automatically; see `docs/RELEASE.md` for the order of steps.

| Path                                             | What                                                                     | Play Console place                     |
| ------------------------------------------------ | ------------------------------------------------------------------------ | -------------------------------------- |
| `listing/en-US/title.txt`                        | App name (27/30 characters)                                              | Main store listing → App name          |
| `listing/en-US/short_description.txt`            | Short description (72/80)                                                | Main store listing → Short description |
| `listing/en-US/full_description.txt`             | Full description (1,847/4,000)                                           | Main store listing → Full description  |
| `listing/keywords.md`                            | Keyword coverage, category and tags                                      | Store settings                         |
| `listing/en-US/release_notes_closed_testing.txt` | Release notes for the first test release (≤ 500)                         | Release → Release notes                |
| `graphics/icon-512.png`                          | 512 × 512, 32-bit PNG (from `apps/mobile/assets/images/icon.png`)        | Main store listing → App icon          |
| `graphics/feature-graphic.png`                   | 1024 × 500, no transparency                                              | Main store listing → Feature graphic   |
| `graphics/phone/*.png`                           | 7 phone screenshots, 1080 × 1920 (9:16)                                  | Phone screenshots                      |
| `graphics/tablet/*.png`                          | 7 tablet screenshots, 1600 × 2560 (portrait, for 7" and 10" tablets)     | 7-inch and 10-inch tablet screenshots  |
| `forms/data-safety.md`                           | Data safety answers                                                      | App content → Data safety              |
| `forms/content-rating.md`                        | IARC questionnaire answers                                               | App content → Content rating           |
| `forms/app-access.md`                            | Review account and instructions                                          | App content → App access               |
| `forms/policy-declarations.md`                   | Privacy policy, ads, advertising ID, target audience, other declarations | App content                            |
| `revenuecat.md`                                  | Subscription products and RevenueCat production setup                    | Monetise → Subscriptions; RevenueCat   |
| `closed-testing.md`                              | Closed test (12 testers × 14 days) and applying for production           | Testing → Closed testing               |

## How the graphics were made

Screenshots are the real app screens (the same React Native code) rendered from the web build
with its built-in demo data, in phone (405 × 720 dp at 2.67×) and tablet (800 × 1280 dp at 2×)
windows. Two things are hidden because store builds never show them: the "Demo mode" banner and
the demo "Sample output" note. React Native Web clips the bottom tab labels by a few pixels, so
the tab bar is 10 dp taller in the phone captures.

To regenerate (e.g. after a design change):

```bash
# 1. Web export with demo data (Metro must accept .wasm for expo-sqlite on web; do not commit this)
cd apps/mobile
printf "const { getDefaultConfig } = require('expo/metro-config');\nconst c = getDefaultConfig(__dirname);\nc.resolver.assetExts.push('wasm');\nmodule.exports = c;\n" > metro.config.js
EXPO_PUBLIC_USE_MOCKS=true npx expo export --platform web --output-dir /tmp/studexa-web
rm metro.config.js && cd ../..

# 2. Serve it and capture (Playwright + Chromium)
node store/play/tools/serve.mjs /tmp/studexa-web &
node store/play/tools/screenshots.mjs store/play/graphics/phone phone
node store/play/tools/screenshots.mjs store/play/graphics/tablet tablet

# 3. Feature graphic: open store/play/tools/feature-graphic.html at 1024 × 500 and screenshot it
```

Before production, consider replacing the screenshots with captures from a physical device
(same screens, same order) — Play accepts either, and device captures include the status bar.
