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

## Build Script

Use `scripts/build_vocab_assessment.py` to turn a teacher-provided vocab image package into Firebase-ready output.

### 1. Prepare the input package

The script accepts either:
- a `.zip` file
- an extracted directory

Expected structure:
- each top-level folder = one question
- folder name = vocab word
- each question folder must contain exactly 4 images:
  - `A.*`
  - `B.*`
  - `C.*`
  - `D.*`
- one filename must include `(correct)`

Example:

```text
ppvt_zip/
  graffiti/
    A.png
    B.png
    C.png
    D(correct).png
  nudge/
    A.png
    B.png
    C(correct).png
    D.png
```

### 2. Run the script

Recommended command:

```bash
python3 scripts/build_vocab_assessment.py \
  "/Users/wang/Downloads/ppvt_zip(fin).zip" \
  --assessment-id assessment_formal_1 \
  --accounts leyun,yoonjae \
  --password 123456 \
  --output-dir data/vocab_check/generated \
  --upload
```

### 3. What the script does

- uploads images to Firebase Storage when `--upload` is included
- generates:
  - `vocab_assessments.json`
  - `vocab_accounts.json`
  - `vocab_results.json`
  - `README.txt`

Current fixed behavior:
- Firebase Storage bucket: `ella-development-464ea.firebasestorage.app`
- Storage prefix: `vocab_check`
- Question ids: `q1`, `q2`, `q3`, ...
- Initial `vocabResults` use:
  - `responses.{questionId}.word`
  - `responses.{questionId}.selectedOptionId = null`

### 4. Import the generated JSON into Firebase

After the script finishes, import the generated files manually into Realtime Database:

- `vocab_assessments.json` -> `vocabAssessments`
- `vocab_accounts.json` -> `vocabAccounts`
- `vocab_results.json` -> `vocabResults`

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
- Submit writes `vocabResults/{username}.responses` and updates `vocabAccounts/{username}`
- Successful submit clears the local session and returns to login
