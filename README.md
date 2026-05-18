# Ella Vocab Check

Standalone vocabulary assessment frontend for the post-robot story flow.

## Requirements

- Node.js 20+
- Firebase web app config for the existing Ella Firebase project
- Realtime Database enabled with the existing nodes:
  - `vocabAccounts`
  - `vocabAssessments`
  - `vocabResults`

## Local setup

1. Copy `.env.example` to `.env`
2. Fill in the `VITE_FIREBASE_*` values for the shared Firebase project
3. Install dependencies:

```bash
npm install
```

4. Start the app:

```bash
npm run dev
```

## Implemented flow

- Login checks `vocabAccounts/{username}`
- Submitted accounts are blocked from re-entry
- Assessment content loads from `vocabAssessments/{assessmentId}`
- Questions are sorted by `order`
- One question is shown at a time
- Each question renders 4 image options in a 2x2 grid on desktop
- Answers stay editable until final submission
- Submission is blocked unless every question is answered
- Final confirmation is required
- Submit writes `vocabResults/{username}` and updates `vocabAccounts/{username}`
- Successful submit clears the local session and returns to login
