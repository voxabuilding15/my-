# Data safety form (Play Console → App content → Data safety)

Answers follow what the app and backend actually do (see the Privacy Policy and
`docs/BACKEND.md`). If a feature changes what is collected, update this file and the form
together. Service providers that process data on Studexa's behalf (Supabase, Anthropic, Voyage
AI, Google Cloud, Resend, Sentry, RevenueCat) are **not** "sharing" under Google's definition.

## Overview questions

| Question                                                               | Answer                                                         |
| ---------------------------------------------------------------------- | -------------------------------------------------------------- |
| Does your app collect or share any of the required user data types?    | **Yes**                                                        |
| Is all of the user data collected by your app encrypted in transit?    | **Yes** (HTTPS/TLS only; cleartext traffic is disabled)        |
| Do you provide a way for users to request that their data is deleted?  | **Yes** — in the app (Profile → Delete account) and on the web |
| Account deletion URL                                                   | `https://voxabuilding15.github.io/my-/delete-account/`         |
| Does your app share user data with third parties?                      | **No** (service providers only)                                |
| Has your app been independently validated against a security standard? | **No**                                                         |
| Is your app designed for children / committed to the Families policy?  | **No** (13+)                                                   |

## Data types collected

For every row: **Shared: No**, **Processed ephemerally: No**, **Encrypted in transit: Yes**.

| Category → data type                            | Collected | Required or optional | Purposes                                         | What it is                                                                  |
| ----------------------------------------------- | --------- | -------------------- | ------------------------------------------------ | --------------------------------------------------------------------------- |
| Personal info → **Name**                        | Yes       | Optional             | App functionality, Account management            | Display name (and Google profile name if Google Sign-In is used)            |
| Personal info → **Email address**               | Yes       | Required             | App functionality, Account management            | Sign-in, verification and password-reset codes                              |
| Personal info → **User IDs**                    | Yes       | Required             | App functionality, Account management, Analytics | Account id (also used, pseudonymously, in crash reports), Google account id |
| Financial info → **Purchase history**           | Yes       | Optional             | App functionality, Account management            | Subscription status, product, renewal dates (no card details)               |
| Photos and videos → **Photos**                  | Yes       | Optional             | App functionality                                | Photos of pages the user chooses to scan (text extraction)                  |
| Files and docs → **Files and docs**             | Yes       | Optional             | App functionality                                | Documents the user uploads, and their extracted text                        |
| Messages → **Other in-app messages**            | Yes       | Optional             | App functionality                                | Questions asked to the AI chat and its answers                              |
| App activity → **App interactions**             | Yes       | Required             | App functionality, Analytics                     | Study time, streaks, flashcard reviews, quiz scores, AI usage counts        |
| App activity → **Other user-generated content** | Yes       | Optional             | App functionality                                | Notes, flashcards, quizzes, bookmarks, AI answer reports                    |
| App info and performance → **Crash logs**       | Yes       | Required             | App functionality, Analytics                     | Sentry crash reports (no document content, no email)                        |
| App info and performance → **Diagnostics**      | Yes       | Required             | App functionality, Analytics                     | App version, device model, OS version, error details                        |

**Not collected** (answer "No"): Location (approximate or precise), Phone number, Address, Race
and ethnicity, Political or religious beliefs, Sexual orientation, Other info, Payment info,
Credit score, Other financial info, Health and fitness, Emails, SMS or MMS, Videos, Audio,
Music, Calendar, Contacts, Web browsing history, In-app search history, Installed apps, Other
actions, Other app performance data, Device or other IDs.

Notes for the reviewer questions that sometimes come up:

- **IP address**: used transiently for rate limiting and abuse prevention, not stored as a
  location → not declared as Location.
- **Advertising ID**: not used; the release build is checked for the absence of the `AD_ID`
  permission (`scripts/verify-release-bundle.mjs`). Play Console → App content →
  **Advertising ID: "No"**.
- **Study reminders** are scheduled on the device; no push token is sent to the server.
