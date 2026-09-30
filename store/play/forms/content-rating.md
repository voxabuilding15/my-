# Content rating questionnaire (Play Console → App content → Content rating)

The IARC questionnaire is answered in the console; these are the answers for Studexa and why.

**Email address for the rating certificate:** the `contactEmail` in `site/legal.config.json`.

**Category:** Reference, News, or Educational

| Question (short form)                                                        | Answer  | Why                                                                                                                                                                                                    |
| ---------------------------------------------------------------------------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Violence (any depiction, realistic or fantasy)                               | No      | No such content is part of the app                                                                                                                                                                     |
| Fear / horror                                                                | No      |                                                                                                                                                                                                        |
| Sexuality or nudity                                                          | No      |                                                                                                                                                                                                        |
| Crude humour                                                                 | No      |                                                                                                                                                                                                        |
| Offensive language                                                           | No      | The AI declines unsafe or off-topic requests (13+ study prompt)                                                                                                                                        |
| Controlled substances (drugs, alcohol, tobacco)                              | No      |                                                                                                                                                                                                        |
| Gambling, simulated gambling, loot boxes                                     | No      |                                                                                                                                                                                                        |
| Does the app let users interact or exchange content with each other?         | **No**  | No sharing, messaging or public content between users; AI chat is private to the user                                                                                                                  |
| Does the app share the user's current physical location with other users?    | No      | Location is not collected                                                                                                                                                                              |
| Does the app allow users to purchase digital goods?                          | **Yes** | Premium subscription through Google Play Billing                                                                                                                                                       |
| Does the app contain or promote a web browser / unrestricted internet access | No      | Only the app's own legal pages open in an in-app browser                                                                                                                                               |
| Is the app primarily a news app?                                             | No      |                                                                                                                                                                                                        |
| Does the app contain AI-generated content? (if asked)                        | **Yes** | Summaries, answers, quizzes and flashcards generated from the user's own documents; safety-focused system prompt; users report answers from the flag icon; reports are reviewed in the admin dashboard |

**Expected result:** Everyone / PEGI 3 / USK 0 (with "In-App Purchases" and, where the rating
authority shows it, "Users Interact: No"). The app's own minimum age (13+) is set separately
under **Target audience**, not by the rating.
