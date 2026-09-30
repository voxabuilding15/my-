# App access (Play Console → App content → App access)

**Answer:** "All or some functionality in my app is restricted" — everything after the welcome
screen needs an account with a verified email address.

Google's reviewers cannot receive the email verification code, so provide a ready account.

## Create the review account (once, on the production backend)

1. In the app (production build), sign up with a mailbox you control, e.g.
   `play-review@<your domain>`, and verify it with the emailed code.
2. Upload a short sample document (a few pages of a textbook you may redistribute) so the
   reviewer can try summaries, chat, quizzes and flashcards straight away.
3. Admin dashboard → Users → this account → **Set plan** → Premium, no end date (store `manual`), so the reviewer
   is not stopped by free-plan limits.
4. Keep the account; do not change its password between releases.

## Text for the console (fill in the two values)

- **Name:** Review account
- **Username:** `<review account email>`
- **Password:** `<review account password>`
- **Any other information required to access your app:**

  > Sign in with "I already have an account", then email and password. The account is verified
  > and has Premium, and its library contains a sample document. Open it and try Summarize,
  > Explain, Ask questions (chat), Flashcards and Quiz from the document page. No other code is
  > needed. The Google sign-in button can also be used with any Google account.

Also tick **"Allow Android to use the credentials you provide for performance and app compatibility
testing"** so the pre-launch report can sign in.
