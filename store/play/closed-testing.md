# Closed testing release (required for new personal developer accounts)

Personal Google Play developer accounts created after 13 November 2023 must run a **closed
test with at least 12 testers opted in for at least 14 consecutive days** before they can apply
for production access. Nothing below is uploaded automatically.

## Release

| Item          | Value                                                                                                         |
| ------------- | ------------------------------------------------------------------------------------------------------------- |
| Track         | Testing → **Closed testing** → create track "Studexa testers" (API name `alpha` if you use the default track) |
| App bundle    | the signed production build from EAS (`eas build -p android --profile production`)                            |
| Release name  | `1.0.0 (<versionCode>)` — the versionCode EAS assigned                                                        |
| Release notes | `store/play/listing/en-US/release_notes_closed_testing.txt`                                                   |
| Countries     | the countries you plan to launch in                                                                           |
| Rollout       | full (closed tracks are not staged)                                                                           |

## Testers

1. Create a Google Group (e.g. `studexa-testers@googlegroups.com`) and add **at least 12**
   people with Android devices — aim for 15–20, since testers who leave the group or uninstall
   stop counting.
2. Testers → select the group; add a **feedback URL or email** (the support email).
3. Share the opt-in link from the console. Each tester must open it, accept, and install from
   Play (not a sideloaded APK).
4. Keep them opted in for **14 days in a row**. Ask them to use the app on several days —
   Google asks about engagement when you apply for production.
5. Add the same accounts to **License testing** so subscriptions can be tested without charges.

## During the test

- Watch Play Console → Quality → **Android vitals** (crash-free rate, ANRs) and **Pre-launch
  report** (it signs in with the App access credentials).
- Watch Sentry (production environment) and the admin dashboard (AI usage, errors, reports).
- Fixes: JavaScript-only fixes can go out as an EAS Update on the `production` channel
  (`eas update --channel production`, see `docs/RELEASE.md`); native changes need a new build,
  uploaded to the same closed track.

## Applying for production (day 14 or later)

Play Console → Dashboard → **Apply for production**. Google asks how testers were recruited,
how engaged they were, what feedback you received and what you changed. Keep short notes
during the test so these answers are easy.
