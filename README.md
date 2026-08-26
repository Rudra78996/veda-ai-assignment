# VedaAI Assessment Mapper

A teacher-facing Next.js application that extracts questions from a printed paper, extracts handwritten student answers, maps each answer to the correct question, and highlights the corresponding answer-sheet region.

## Features

- PDF, PNG, JPEG, and WebP input
- One PDF or multiple ordered image pages per logical document
- Browser-side PDF rendering and image normalization
- Real page-level extraction progress
- Printed-order question extraction
- Separate entries for labelled sub-parts
- Original question-label preservation
- Deterministic label matching with semantic AI fallback
- Out-of-order, unanswered, unmatched, and low-confidence states
- Multiple highlighted regions across multiple answer pages
- Advisory marks and question-level AI feedback
- Page-level error reporting and workflow retry
- Responsive desktop and mobile review workspace
- No authentication, database, or application-level document persistence

## Stack

- Next.js 16 App Router
- React 19 and TypeScript
- Tailwind CSS 4
- Gemini 3.7 Flash through `@google/genai`
- PDF.js
- Zod
- Phosphor Icons
- Vitest and Playwright

## Local setup

Requirements:

- Node.js 20 or newer
- npm
- Gemini API key with access to `gemini-3.7-flash`

Install dependencies:

```bash
npm install
```

Create `.env` or `.env.local`:

```env
GEMINI_API_KEY=your_api_key
GEMINI_MODEL=gemini-3.7-flash
```

Start the application:

```bash
npm run dev
```

Open `http://localhost:3000`.

## Processing architecture

The application does not send a full PDF through one serverless request. It renders documents in the browser and compresses every page to a consistent analysis image below 3.2 MB.

```text
Prepare pages in browser
        |
        v
Extract questions and answer blocks per page
        |
        v
Join verified cross-page continuations
        |
        v
Match exact labels first
        |
        v
Semantically map unresolved blocks
        |
        v
Grade mapped answers independently
        |
        v
Render normalized answer highlights
```

Coordinates are stored in a top-left-origin `[0, 1000]` coordinate system. The answer viewer converts them directly to percentages, so overlays remain aligned at every zoom level.

## API routes

- `POST /api/analyze/questions/page`
- `POST /api/analyze/answers/page`
- `POST /api/analyze/map`
- `POST /api/analyze/grade`

The API key is used only in server-side route handlers. Every response is validated before reaching UI state.

## Testing

Run unit tests:

```bash
npm test
```

Run lint and TypeScript checks:

```bash
npm run lint
npm run typecheck
```

Run browser tests:

```bash
npm run test:e2e
```

The E2E harness sets `AI_MOCK_MODE=true` only for its local test server. It uploads a generated PDF plus an image answer sheet and validates extraction, out-of-order mapping, semantic mapping, unmatched answers, grading, mobile tabs, and highlighting. Production and normal development never enable mock mode.

Build production output:

```bash
npm run build
```

## Deploying to Vercel

1. Push this directory to a GitHub repository.
2. Import the repository into Vercel.
3. Add `GEMINI_API_KEY` and optionally `GEMINI_MODEL` in Project Settings.
4. Deploy.
5. Test one PDF and one multi-page image submission from the production URL.

The analysis route handlers declare a 120-second maximum duration. Confirm the selected Vercel plan supports the required execution duration.

## Privacy and safety

- Uploaded documents and results remain in browser memory and request memory.
- The app does not intentionally store documents in a database or object store.
- Object URLs are revoked when documents are removed, the assessment is reset, or the app unmounts.
- Image content, OCR text, and API keys are not logged by application code.
- `.env` and `.env.*` are excluded from Git.
- The public demo should use synthetic or anonymized documents.
- Google states that free-tier Gemini content may be used to improve its products. A real student-data deployment needs an appropriate paid and privacy-reviewed setup.

## Assumptions and limitations

- The first version processes one student answer sheet per session.
- Refreshing clears the assessment.
- Input is capped at 20 pages and 25 MB per source file.
- Highlight boxes are AI-detected regions rather than pixel-level ink segmentation.
- Handwriting, scan quality, rotation, diagrams, and unusual layouts can reduce confidence.
- Marks are advisory when no official answer key or rubric is supplied.
- Semantic mapping deliberately leaves uncertain work unmatched instead of forcing a result.
- The deployed model name and free-tier quota can change. `GEMINI_MODEL` keeps model selection configurable.

## Assignment documentation

See [IMPLEMENTATION_PLAN.md](./IMPLEMENTATION_PLAN.md) for the architecture, data contracts, edge-case matrix, implementation phases, risks, and acceptance checklist.
