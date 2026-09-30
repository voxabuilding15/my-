# Policy declarations (Play Console → App content)

## Privacy policy

- **Privacy policy URL:** `https://voxabuilding15.github.io/my-/privacy/`
- Terms (linked from the listing's website and the app): `https://voxabuilding15.github.io/my-/terms/`
- Account deletion (Data safety form): `https://voxabuilding15.github.io/my-/delete-account/`

The pages are rendered from `site/legal.config.json`. Before submitting, fill every value and
set `aiProviderTermsVerified` and `legalReviewDone` to `true` after checking;
`node scripts/build-legal-site.mjs --check` must print "every value is filled in". While values
are missing, the published pages show highlighted placeholders and a draft notice.

## Ads

- **Does your app contain ads?** **No.** There is no ad SDK in the app.
- **Advertising ID:** **No**, the app does not use the advertising ID (the `AD_ID` permission
  is absent, checked by the release-bundle verification).

## Target audience and content

| Question                                               | Answer                                                                                                                   |
| ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Target age groups                                      | **13–15, 16–17, 18 and over** (not under 13)                                                                             |
| Could the app unintentionally appeal to children?      | **No** — a study tool for secondary school, university and adult learners; no characters, games or child-oriented design |
| Store listing: is anything aimed at children under 13? | No                                                                                                                       |
| Families policy / "Designed for Families"              | Not applicable (no under-13 age group selected)                                                                          |

Because users under 18 are included, keep: no ads, no user-to-user interaction, the 13+ system
prompt that declines unsafe requests, in-app reporting of AI answers, and the minimum age of 13
stated in the Terms (section "Who can use Studexa").

## Other declarations

| Declaration                                                                              | Answer                                                                                                                                                                |
| ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| News app                                                                                 | No                                                                                                                                                                    |
| COVID-19 contact tracing and status                                                      | No                                                                                                                                                                    |
| Government app                                                                           | No                                                                                                                                                                    |
| Financial features                                                                       | No (subscriptions through Google Play only)                                                                                                                           |
| Health apps                                                                              | No health features                                                                                                                                                    |
| Data safety                                                                              | See `data-safety.md`                                                                                                                                                  |
| Photo and video permissions                                                              | Not needed: photos come from the system picker or the camera; the app does not request `READ_MEDIA_IMAGES` / `READ_MEDIA_VIDEO` (checked by the release verification) |
| Foreground service, exact alarms, accessibility services, SMS/call log, all-files access | Not used                                                                                                                                                              |
| Generative AI (if asked)                                                                 | Yes: AI-generated study content from the user's own documents; users can report offensive answers in the app (flag icon), reports are reviewed by staff               |
