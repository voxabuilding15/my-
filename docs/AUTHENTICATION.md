# Studexa — Authentication

## Overview

| Capability         | Implementation                                                                   |
| ------------------ | -------------------------------------------------------------------------------- |
| Email + password   | Supabase Auth; policy: ≥10 chars, lower, upper, digit (config + shared schema)   |
| Google             | Native account picker (Android Credential Manager) → ID token → Supabase         |
| Email verification | 6-digit code from the `auth-email-code` Edge Function                            |
| Password reset     | 6-digit code, then a new password; signs out every device                        |
| Session storage    | AES-256-GCM encrypted, key in Android Keystore / iOS Keychain                    |
| Account deletion   | `delete-account` Edge Function; requires a sign-in within the last 10 minutes    |
| Route protection   | `Stack.Protected` guards: `(auth)` when signed out, `(app)` when signed in       |
| iOS readiness      | Bundle id, Google iOS client/URL scheme via env; `AuthProviderId` reserves Apple |

## Email codes

Supabase's built-in OTP verify endpoint can be called directly with the public anon key, so
attempt limits enforced in our own code could be bypassed. Codes are therefore issued and
verified only by our Edge Function:

| Rule                           | Where enforced                                                 |
| ------------------------------ | -------------------------------------------------------------- |
| 6 digits, uniformly random     | `generateNumericCode` (rejection sampling)                     |
| Expire after 10 minutes        | `private.email_codes.expires_at`                               |
| Resend only after 60 seconds   | `issue_email_code` (+ app countdown)                           |
| Max 5 sends per hour per user  | `issue_email_code` → `check_rate_limit`                        |
| 5 wrong attempts lock the code | `verify_email_code` deletes the code                           |
| A new code invalidates the old | one row per (user, purpose), replaced on issue                 |
| Codes never stored in clear    | HMAC-SHA256 with `AUTH_CODE_PEPPER`, bound to user and purpose |

All values live in `app_config.auth.email_codes` and can be tuned without a release.

### Account enumeration protection

`send_password_reset` returns the same response for existing, unknown and Google-only
accounts, and performs lookups and email delivery after responding, so timing reveals nothing.
`check`/`complete_password_reset` never report remaining attempts.

## Email verification gate

Users can sign in before verifying (so onboarding isn't blocked), but
`consume_quota` and `authorize_upload` return `email_unverified` until
`auth.users.email_confirmed_at` is set. Unverified users therefore cannot consume any free AI,
OCR or upload quota. Unverified email accounts are deleted after 7 days, freeing the address.

## Rate limiting

| Endpoint                   | Limit                                                      |
| -------------------------- | ---------------------------------------------------------- |
| Supabase sign-in / sign-up | 30 per 5 min per IP (`config.toml` → `auth.rate_limit`)    |
| Token refresh              | 150 per 5 min per IP                                       |
| Code sending               | 20/h per IP; 5/h per email (reset); 5/h per user (DB)      |
| Code checking              | 30/10 min per IP; 10/10 min per email; 5 attempts per code |
| Account deletion           | 3/h per user                                               |

Limits use `check_rate_limit` (fixed windows in an unlogged table). Keys that would contain an
email address use an HMAC of it instead.

## Sessions

- `supabase-js` persists the session through `secureSessionStorage`: the JSON is encrypted with
  AES-256-GCM, the key is generated on first use and stored with
  `AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY`, and the storage key is bound as additional data.
  Undecryptable data (e.g. after a device restore) is discarded and the user signs in again.
- `android.allowBackup = false` keeps app data out of device backups.
- Access tokens expire after 1 hour; refresh tokens rotate (`enable_refresh_token_rotation`).
- Auto-refresh runs only while the app is in the foreground.
- Password reset revokes every session (`revoke_user_sessions`).
- "Sign out of all devices" uses `signOut({ scope: 'global' })`.

## Rooted devices

`checkDeviceIntegrity()` uses `expo-device`'s root detection on physical devices only
(emulators are skipped). A rooted device gets an informational notice on the profile screen and
is **never blocked**: rooted phones are common among legitimate users, and data security is
enforced server-side (RLS, server-side quotas), not by trusting the device. Stronger attestation
(Play Integrity API) is planned for purchase protection in the release phase.

## Legal links

The app reads `app_config.legal` (readable before sign-in) for the Privacy Policy, Terms and
account deletion URLs, with a bundled fallback built from `EXPO_PUBLIC_LEGAL_BASE_URL`. The
pages are in `site/` and published by `.github/workflows/pages.yml`.

**Moving to your own domain later:** publish the pages there (or set a custom domain in GitHub
Pages — the old `github.io` URLs then redirect automatically), then
`update app_config set value = value || '{"privacy_url": "…", "terms_url": "…", "account_deletion_url": "…"}' where key = 'legal'`.
No app release is needed. Update the Play Console listing URLs at the same time.

## Setup checklist (when credentials exist)

1. **Supabase:** create the project, run migrations (`npx supabase db push`), note URL + anon key.
2. **Google Cloud:** create an OAuth consent screen, a _Web_ client id, and an _Android_ client id
   per signing key (package `com.studexa.ai`, SHA-1 of the debug/upload/Play signing keys).
   Put the Web client id in `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`, and all accepted client ids
   (comma-separated) in the Supabase Google provider settings.
3. **Resend:** create an API key; after buying a domain, verify it and set `EMAIL_FROM`.
4. **Secrets:** `npx supabase secrets set --env-file supabase/functions/.env`
   (`AUTH_CODE_PEPPER` = `openssl rand -base64 48`).
5. **Deploy functions:** `npx supabase functions deploy auth-email-code delete-account`.
6. **App:** fill `apps/mobile/.env` (see `.env.example`); mock mode switches off automatically.
7. **GitHub Pages:** Settings → Pages → Source: GitHub Actions.
8. Fill the placeholders in `site/` (publisher, address, contact email, effective date, region).

Verify on a real Supabase project (not coverable by the local test harness): Google ID-token
sign-in, `revoke_user_sessions` privileges on `auth.sessions`, and bundling of
`packages/shared` into the Edge Functions on deploy.
