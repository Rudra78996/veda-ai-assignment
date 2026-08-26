# VedaAI Assignment — Detailed Implementation Plan

## 1. Recommended approach

Build a single-session Next.js application that processes the documents page by page in the browser, sends each normalized page to a server-side Gemini API route, validates every AI response against a strict schema, then performs a separate answer-mapping pass.

The browser keeps the uploaded documents, rendered page previews, and analysis result in memory. No authentication or database is required. The application should be deployed to Vercel.

The core pipeline is:

```text
Question paper + answer sheet
        |
        v
Validate and render every page to a normalized image
        |
        +--------------------------+
        |                          |
        v                          v
Extract ordered questions      Extract answer blocks and regions
        |                          |
        +------------+-------------+
                     v
        Consolidate cross-page continuations
                     |
                     v
       Deterministic label matching first
                     |
                     v
       AI semantic mapping for ambiguous blocks
                     |
                     v
        Unanswered + unmatched classification
                     |
                     v
          Optional grading and feedback
                     |
                     v
     Question list + synchronized answer viewer
```

This separation matters. Extraction and mapping should not be one large prompt because a single failure would corrupt the whole result and make progress, retries, and debugging much harder.

## 2. Scope and priorities

### P0 — submission-critical

- Upload one question paper and one logical answer sheet.
- Accept PDF, PNG, JPEG, and WebP.
- Accept multiple ordered image files for either logical document.
- Preview, remove, and reorder selected image pages before processing.
- Show genuine phase and page progress.
- Extract every question in printed reading order.
- Flatten labelled sub-parts into separate question entries.
- Preserve original labels such as `11 (a)`, `11 (b)`, `Q.4`, or `2(ii)`.
- Extract handwritten answer blocks with one or more page regions.
- Map answers even when they are written out of order.
- Mark questions as answered, unanswered, or needing review.
- Keep answer blocks that do not map to a question in an “Unmatched answers” group.
- On question selection, scroll to and highlight every corresponding region, including regions on multiple pages.
- Responsive desktop and mobile layouts following the supplied Figma.
- Deploy to a public URL and document setup and limitations.

### P1 — high-value polish

- AI-estimated marks and concise per-question feedback.
- Mapping confidence and a “Needs review” state instead of silently forcing uncertain matches.
- Teacher correction: reassign an answer block to a different question or mark it unmatched.
- Retry only a failed page or phase.
- Overall score summary and counts for answered, unanswered, and review-needed questions.

### P2 — only after the core is reliable

- Export a JSON or PDF review report.
- Zoom controls and page thumbnails.
- Manual box adjustment.
- Shareable/persistent sessions. This would require storage and is outside the no-database MVP.

## 3. Recommended tech stack

| Area | Choice | Why |
|---|---|---|
| Full-stack framework | Next.js App Router, React, TypeScript | One deployable codebase, server-only API key handling, route handlers, good Vercel support |
| Styling | Tailwind CSS plus CSS custom properties | Fast Figma matching while keeping design tokens explicit |
| UI primitives | Small local components; Radix only for dialogs/tooltips if needed | The result workspace is custom and should not look like a generic component library |
| Icons | Lucide React | Consistent accessible SVG icons |
| PDF rendering | `pdfjs-dist` | Browser-side PDF parsing and page rendering with known page dimensions |
| AI SDK/model | `@google/genai` with `gemini-3.7-flash` | Multimodal PDF/image understanding, handwriting transcription, structured output, and a free tier suitable for a demo |
| Runtime validation | Zod | Reject malformed or incomplete AI JSON before it reaches UI state |
| Client state | React `useReducer` + Context | The workflow is a finite state machine; a global state library is unnecessary for one page |
| IDs | `crypto.randomUUID()` | Stable client-side entities without a database |
| Unit/component tests | Vitest + React Testing Library | Fast validation of sorting, mapping, coordinate math, and components |
| End-to-end tests | Playwright | Verifies upload-to-highlight behavior in a real browser |
| Deployment | Vercel | Natural fit for Next.js and a quick public submission URL |
| Monitoring | Vercel logs plus sanitized structured events | Enough for a demo; document images and OCR text must never be logged |

Use the latest stable releases when scaffolding and commit the lockfile. Keep the model name in `GEMINI_MODEL` so it can be changed without a code edit.

### Why one multimodal provider

Using Gemini for document understanding, handwriting transcription, bounding-box detection, semantic matching, and feedback minimizes integration risk. Adding a separate OCR vendor would add credentials, response formats, and coordinate conversion without guaranteeing better handwriting recognition.

The important safeguard is not another provider; it is a staged pipeline, strict schemas, confidence scores, retries, and a small ground-truth fixture set.

## 4. Architecture and deployment constraints

Vercel Functions have a 4.5 MB request/response payload limit. A full PDF should therefore not be posted directly to a route handler.

Instead:

1. Read the selected file in the browser.
2. For a PDF, use PDF.js to render each page to a canvas.
3. Correct EXIF orientation for image inputs.
4. Scale each analysis image to about 1,800–2,200 px on its long edge.
5. Encode as JPEG or WebP with adaptive quality until the page is below a safe binary limit (target 3.2 MB).
6. Send one page per multipart request.
7. Analyze at most two pages concurrently to avoid rate-limit spikes.
8. Keep the original local object URL for the high-quality viewer; use the normalized image only for AI analysis.

This produces real per-page progress, permits page-level retry, and gives every bounding box an unambiguous page coordinate system.

### Runtime choices

- Use the Node.js runtime for AI routes.
- Set a reasonable `maxDuration` for analysis routes.
- Never expose `GEMINI_API_KEY` through a public environment variable.
- Set `GEMINI_MODEL=gemini-3.7-flash` in Vercel.
- Cap pages per document, source file size, rendered pixels, and total processing time.
- Abort in-flight calls when the user starts over.

## 5. Core domain model

Coordinates should be normalized to `[0, 1000]`, independent of the displayed zoom level.

```ts
type NormalizedBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type PageRegion = {
  id: string;
  pageNumber: number;       // 1-based source page
  box: NormalizedBox;
  kind: "label" | "answer" | "continuation";
};

type Question = {
  id: string;
  originalLabel: string;    // e.g. "11 (a)"
  normalizedLabel: string;  // e.g. "11a", for matching only
  parentLabel: string | null;
  subpartLabel: string | null;
  sharedStem: string | null;
  text: string;
  fullText: string;
  maxMarks: number | null;
  orderIndex: number;       // printed order; never derived by numeric sort
  sourceRegions: PageRegion[];
  extractionConfidence: number;
};

type AnswerBlock = {
  id: string;
  detectedLabel: string | null;
  normalizedDetectedLabel: string | null;
  transcription: string;
  regions: PageRegion[];    // may span pages
  extractionConfidence: number;
};

type AnswerMapping = {
  questionId: string;
  answerBlockIds: string[];
  status: "answered" | "unanswered" | "needs_review";
  method: "exact_label" | "label_alias" | "semantic" | "manual" | "none";
  confidence: number;
  reason: string;
};

type Grade = {
  questionId: string;
  awardedMarks: number | null;
  maxMarks: number | null;
  verdict: "correct" | "partially_correct" | "incorrect" | "not_graded";
  feedback: string;
  evidence: string[];
  confidence: number;
};
```

Do not store only a single answer box on a mapping. `AnswerBlock.regions[]` is what makes multi-page and disjoint answers possible.

## 6. Document processing pipeline

### 6.1 Input validation

- Validate MIME type and extension.
- Suggested limits for the deployed demo: 20 pages per logical document, 25 MB per original file, and 40 pages total.
- Reject encrypted or corrupted PDFs with a specific recovery message.
- Show the page count and page order before processing.
- For multiple image uploads, use selection order initially and allow drag reordering.
- Detect and correct image rotation before producing the analysis image.

### 6.2 Question extraction

Analyze each question-paper page with a strict structured-output schema. The prompt should require:

- printed reading order from top to bottom and column by column;
- the exact visible question label;
- separate entries for labelled sub-parts;
- no separate parent entry when only its labelled sub-parts are assessable;
- shared context/stem captured separately and included in `fullText` for each sub-part;
- question text, marks if printed, source region, and confidence;
- continuation markers when text begins on the previous page or continues on the next page;
- no invented question when a heading, instruction, diagram label, or page number is encountered.

After page extraction, run a small consolidation pass that:

- merges cross-page question continuations;
- removes exact duplicates near page boundaries;
- flattens sub-parts;
- assigns `orderIndex` from `(pageNumber, readingOrderOnPage)`;
- preserves `originalLabel` exactly;
- validates that label and text are non-empty.

Never sort questions by parsed number. Printed order is the page/read-order sequence, which also works for Roman numerals, alphabetic parts, and unusual numbering.

### 6.3 Answer extraction and localization

Analyze each answer-sheet page independently and ask for logical answer blocks rather than a single page transcript.

Each block should contain:

- any handwritten question label;
- transcription;
- one or more tight regions that include the label and all answer content;
- whether the block appears to continue from the previous page or onto the next;
- extraction confidence.

Then consolidate adjacent pages. Join blocks only when there is evidence such as a continuation marker, matching labels, unfinished language, or a top-of-page continuation with no new label. Keep every original page region on the joined block.

For more accurate highlighting:

1. Ask the model for normalized boxes around answer content, excluding margins and unrelated work.
2. Clamp and validate every box to the page.
3. Expand boxes by a small safety padding so ink is not clipped.
4. Optionally trim excessive white space with a lightweight canvas pixel-density pass.
5. If localization confidence is low, run one localization-only retry using the page image and the extracted text/label.
6. Mark the mapping “Needs review” if the retry remains uncertain.

### 6.4 Answer mapping

Use a deterministic-first strategy:

1. Normalize labels for matching only: lowercase, remove whitespace/punctuation, standardize Roman numerals, and remove an optional leading `q`.
2. Exact normalized-label match.
3. Match common aliases such as `11a`, `11(a)`, `Q11-a`, and `11 a`.
4. Link cross-page continuations before semantic mapping.
5. Send only remaining ambiguous answer blocks plus candidate questions to a structured-output semantic mapping call.
6. Require the model to return confidence, reasoning, and `unmatched` when evidence is insufficient.
7. Enforce one mapping per answer block unless the response explicitly identifies one physical block containing multiple labelled answers; split that block before final mapping.
8. Questions with no mapped blocks become `unanswered`.
9. Blocks with no sufficiently confident question remain visible under `Unmatched answers`.

Do not force every answer into a question. Honest unmatched and review states are more accurate and directly satisfy the edge-case requirements.

### 6.5 Grading and feedback

Run grading after mapping so it cannot affect the mapping decision.

- Grade per question using `fullText`, detected max marks, and answer transcription.
- If no answer key or rubric is supplied, label marks as “AI estimate.”
- Ask for concise evidence-based feedback, not generic praise.
- Do not invent max marks when they are absent; show a correctness verdict and feedback instead.
- An unanswered question gets zero only when a printed maximum exists; otherwise it remains ungraded.
- Calculate totals only from questions with known maximum marks.
- Keep grading failures non-blocking: extraction and highlighting should still be usable.

## 7. API design

All routes return a common envelope:

```ts
type ApiResult<T> =
  | { ok: true; data: T; requestId: string }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        retryable: boolean;
      };
      requestId: string;
    };
```

Recommended route handlers:

| Route | Input | Output |
|---|---|---|
| `POST /api/analyze/questions/page` | Multipart normalized page image + page metadata | Page questions and continuation flags |
| `POST /api/analyze/answers/page` | Multipart normalized page image + page metadata | Answer blocks and regions |
| `POST /api/analyze/consolidate` | Small JSON with all page-level results | Cross-page merged questions and answer blocks |
| `POST /api/analyze/map` | Questions + answer blocks | Mappings and unmatched block IDs |
| `POST /api/analyze/grade` | One or a small batch of mapped question/answer pairs | Grades and feedback |

Implementation rules:

- Validate request and response with Zod.
- Use low temperature for extraction and mapping.
- Add an `AbortSignal` and finite timeout to provider calls.
- Retry 429 and transient 5xx responses with bounded exponential backoff and jitter.
- Do not automatically retry schema/prompt errors more than once.
- Never return raw provider errors or secrets to the client.
- Keep provider calls in `lib/ai/` behind a small adapter so the model can be replaced.

## 8. Client workflow and progress state

Model the UI as a reducer-driven state machine:

```text
idle
  -> files_ready
  -> rendering_pages
  -> extracting_questions
  -> extracting_answers
  -> consolidating
  -> mapping
  -> grading
  -> complete

Any processing state -> recoverable_error -> retry previous phase
Any state -> reset -> idle
```

Use progress based on completed work units rather than a timer:

- Render/normalize pages: 10%
- Extract questions: 25%
- Extract answers: 35%
- Consolidate: 5%
- Map: 10%
- Grade: 10%
- Final UI preparation: 5%

Within page phases, calculate progress as `completedPages / totalPages`. Display the current action, such as “Reading answer sheet — page 3 of 8.”

## 9. UI plan based on the supplied Figma

The public preview shows desktop and mobile variants for upload, processing, and review. Before implementation, inspect exact typography, spacing, colors, radii, and component states in Figma/Dev Mode and encode them as CSS variables rather than guessing from the thumbnail.

### Upload state

- Retain the Figma’s centered upload workspace and restrained warm background.
- Two clearly labelled upload areas: question paper and answer sheet.
- Each area shows accepted formats, selected filename/page count, remove/replace control, and validation error.
- The primary action remains disabled until both logical documents are valid.
- Multiple selected image pages appear as a reorderable strip/list.
- Use the Figma’s navigation/sidebar treatment on desktop and compact top bar on mobile.

### Processing state

- A focused central processing panel matching the Figma loading state.
- Phase label, real percentage, per-page progress, and a concise privacy note.
- Keep animation subtle and respect `prefers-reduced-motion`.
- If one page fails, explain which page failed and offer “Retry page.”

### Review state

Desktop layout:

```text
+----------------------+------------------------------+---------------------------+
| App navigation       | Question list / summary      | Answer-sheet viewer       |
|                      |                              |                           |
| New assessment       | [score and filters]          | viewer controls           |
|                      | Q1 answered                  | page image                |
|                      | Q2 unanswered                | + selected overlays       |
|                      | Q3 needs review              |                           |
|                      | Unmatched answers            | next page                 |
+----------------------+------------------------------+---------------------------+
```

- Keep the question list and document viewer independently scrollable.
- Selecting a question sets `selectedQuestionId`, highlights its card, scrolls the first answer region into view, and renders every associated region.
- Use distinct but accessible states: answered, unanswered, needs review, selected, and unmatched.
- Show transcription, grading, confidence, and feedback as supporting detail without obscuring the core mapping task.
- A multi-page answer should show “3 regions across 2 pages.”
- An unanswered selection should show an empty-state explanation, not a blank viewer.

Mobile layout:

- Use two tabs or segmented views: `Questions` and `Answer sheet`.
- Selecting an answered question moves to the viewer and scrolls to the first region.
- A sticky compact header lets the teacher return to the question list.
- Do not squeeze three desktop columns into a narrow screen.

### Accessibility

- Full keyboard selection of questions.
- Visible focus treatment.
- Status conveyed by text/icon as well as color.
- `aria-live` progress and error messages.
- Minimum 44 px touch targets on mobile.
- Overlay contrast that remains visible on white and ruled paper.
- Reduced-motion support.

## 10. Highlight implementation

Render each source page in a positioned wrapper:

```tsx
<div className="page" ref={registerPage(pageNumber)}>
  <canvas aria-label={`Answer sheet page ${pageNumber}`} />
  <div className="overlayLayer" aria-hidden="true">
    {selectedRegions.map(region => (
      <div style={normalizedBoxToPercent(region.box)} />
    ))}
  </div>
</div>
```

The conversion is direct:

```ts
left   = `${box.x / 10}%`;
top    = `${box.y / 10}%`;
width  = `${box.width / 10}%`;
height = `${box.height / 10}%`;
```

Because the overlay uses percentages and the AI saw the same normalized page orientation, it remains aligned at every zoom level and viewport size.

On selection:

1. Collect all regions from all mapped answer blocks.
2. Group them by page.
3. Scroll the first page wrapper into view.
4. Render all regions, not just the first.
5. Briefly animate the active outline once, unless reduced motion is requested.

## 11. Suggested project structure

```text
app/
  api/analyze/questions/page/route.ts
  api/analyze/answers/page/route.ts
  api/analyze/consolidate/route.ts
  api/analyze/map/route.ts
  api/analyze/grade/route.ts
  layout.tsx
  page.tsx
  globals.css
components/
  upload/
    document-dropzone.tsx
    page-order-list.tsx
    upload-workspace.tsx
  processing/
    processing-progress.tsx
    processing-error.tsx
  review/
    assessment-summary.tsx
    question-list.tsx
    question-item.tsx
    answer-viewer.tsx
    answer-page.tsx
    region-overlay.tsx
    unmatched-answers.tsx
    feedback-panel.tsx
  shell/
    app-sidebar.tsx
    mobile-header.tsx
lib/
  ai/
    client.ts
    prompts.ts
    schemas.ts
    provider.ts
  documents/
    pdf-renderer.ts
    image-normalizer.ts
    file-validation.ts
    coordinate-utils.ts
  analysis/
    label-normalizer.ts
    consolidate.ts
    deterministic-mapper.ts
    progress.ts
  state/
    assessment-context.tsx
    assessment-reducer.ts
  types.ts
tests/
  fixtures/
  unit/
  integration/
  e2e/
```

## 12. Error and edge-case behavior

| Scenario | Expected behavior |
|---|---|
| `11(a)` and `11(b)` | Two separate question entries with preserved labels and shared stem context |
| Answers written `5, 2, 4` | Question list stays in paper order; each item points to its actual answer region |
| Missing answer | Question is explicitly marked `Unanswered`; no fabricated region |
| Extra working/no matching question | Appears under `Unmatched answers` with its regions |
| Answer continues on another page | One answer block contains regions from every involved page |
| One page contains two answers | Separate blocks/regions, even if handwriting is close together |
| Student omitted a label | Semantic mapping is allowed, but low confidence becomes `Needs review` |
| Duplicate handwritten label | Use semantics and page continuity; do not silently merge unrelated work |
| Rotated/skewed scan | Normalize orientation; retain the same normalized image coordinate system for AI and viewer |
| Very faint handwriting | Retry at enhanced contrast; otherwise expose low confidence |
| Corrupt/encrypted PDF | Stop before AI calls and explain how to provide a readable file |
| One AI page call fails | Preserve completed pages and retry only the failed page |
| Grading fails | Show extraction/mapping normally and mark feedback unavailable |

## 13. Testing strategy

### Ground-truth fixture set

Create synthetic or anonymized documents for:

1. Clean printed questions and ordered answers.
2. Labelled sub-parts.
3. Out-of-order answers.
4. One unanswered question.
5. One unmatched answer.
6. One answer spanning two pages.
7. Unlabelled but semantically recognizable answer.
8. Rotated image pages.
9. Faint/noisy handwriting.
10. Multi-column question paper.

Manually record expected question labels/order, mapping IDs, and answer boxes for the key fixtures.

### Unit tests

- Label normalization and aliases.
- Printed-order sorting.
- Cross-page merge rules.
- Unanswered/unmatched derivation.
- Normalized-box validation, clamping, and percentage conversion.
- Reducer state transitions and weighted progress.
- Zod schemas reject malformed model output.

### Integration tests

- Mock AI outputs and test the complete extraction → consolidation → mapping pipeline.
- Retry behavior for 429, timeout, invalid JSON, and one failed page.
- Ensure grading errors do not remove mappings.

### End-to-end tests

- Upload fixtures, process, select a question, and verify the correct page/overlay.
- Verify out-of-order, unanswered, unmatched, and multi-page states.
- Test desktop and mobile layouts.
- Test keyboard navigation and accessible names.

### Evaluation metrics

- Question recall and exact original-label accuracy.
- Printed-order accuracy.
- Answer-to-question mapping accuracy.
- Unanswered and unmatched precision/recall.
- Region IoU against manually drawn boxes and visual ink coverage.
- Median processing time and page-level failure rate.

Do not tune prompts only against one sample. Keep at least a few fixtures as a holdout set.

## 14. Security, privacy, and abuse controls

- Keep the Gemini key server-side.
- Do not log uploaded files, base64 content, transcriptions, names, or answer text.
- Process in memory and clear client state/object URLs on reset or tab close.
- Validate magic bytes in addition to the browser-provided MIME type.
- Apply page, file-size, pixel, request-time, and output-size limits.
- Escape all extracted text by rendering it as React text, never raw HTML.
- Add basic per-session throttling and use Vercel deployment protection/firewall controls if abuse appears.
- Use synthetic/anonymized samples in the public demo.
- Clearly state that Gemini’s free tier may use submitted content to improve products; real student data should use an appropriate paid/privacy-reviewed setup.

## 15. Implementation phases

### Phase 0 — design and fixture audit (half day)

- Inspect all Figma frames and record exact tokens and responsive behavior.
- Gather or create representative question/answer fixtures.
- Define expected JSON and manually mark several answer regions.
- Confirm Gemini access and run a handwriting/bounding-box spike before building the full UI.

Exit criterion: one representative page returns valid questions/answers and usable normalized regions.

### Phase 1 — foundation and upload experience (day 1)

- Scaffold Next.js, TypeScript, Tailwind, linting, and tests.
- Build the Figma-matched shell and upload state.
- Add PDF/image validation, page rendering, orientation normalization, compression, reorder, and cleanup.
- Define shared types, schemas, reducer, and progress model.

Exit criterion: both logical documents can be prepared page-by-page in the browser without AI.

### Phase 2 — extraction pipeline (day 2)

- Implement server-only Gemini adapter and structured schemas.
- Add question-page and answer-page extraction routes.
- Add concurrency control, abort, timeout, retry, and page-level error UI.
- Implement consolidation of page results.

Exit criterion: fixture documents produce an ordered question list and localized answer blocks.

### Phase 3 — mapping and synchronized viewer (day 3)

- Implement label normalization and deterministic mapping.
- Add semantic mapping for unresolved blocks.
- Derive unanswered, needs-review, and unmatched states.
- Build PDF/image answer viewer, overlay layer, scroll-to-region, zoom-safe coordinates, and multi-page selection.

Exit criterion: every assignment edge case is visibly represented and selectable.

### Phase 4 — grading and product polish (day 4)

- Add per-question grading/feedback and overall summary.
- Add correction/reassignment for low-confidence mappings if time permits.
- Finish mobile behavior, keyboard behavior, loading, empty, error, and retry states.
- Compare screenshots against Figma at target desktop/mobile widths.

Exit criterion: complete, responsive teacher workflow with non-blocking grading.

### Phase 5 — hardening and deployment (day 5)

- Add unit, integration, and Playwright coverage.
- Run the full fixture matrix and record known limitations.
- Check performance, payload caps, API-key safety, sanitized logging, and accessibility.
- Deploy to Vercel and smoke-test the production URL.
- Write README, environment setup, approach, model, assumptions, and submission notes.

Exit criterion: live URL works from a fresh browser and the repository is reproducible.

## 16. Acceptance checklist

- [ ] Both PDF and multiple-image input paths work.
- [ ] Progress reflects real phases/pages.
- [ ] All fixture questions are extracted in printed order.
- [ ] Labelled sub-parts are separate entries.
- [ ] Original labels are preserved for display.
- [ ] Out-of-order answers map correctly.
- [ ] Unanswered questions are explicit.
- [ ] Unmatched answer work remains visible.
- [ ] A selected question highlights the correct region.
- [ ] All regions of a multi-page answer are highlighted.
- [ ] Low-confidence mappings are not presented as certain.
- [ ] Grading is clearly described as estimated without an answer key.
- [ ] One failed page can be retried without starting over.
- [ ] Desktop and mobile screens match the Figma closely.
- [ ] API key is absent from the client bundle and repository.
- [ ] Live production URL passes a fresh-browser smoke test.

## 17. Main risks and mitigations

| Risk | Mitigation |
|---|---|
| Handwriting OCR varies greatly | Use high-resolution normalized pages, confidence, contrast retry, and representative fixtures |
| AI boxes are too loose or miss ink | Localization-only retry, safety padding, optional white-space trimming, multi-region support, manual review state |
| Model forces a plausible but wrong mapping | Deterministic-first matching, explicit unmatched option, confidence threshold, teacher reassignment |
| Cross-page continuations are merged incorrectly | Preserve page-level blocks, require evidence to merge, show multiple regions and mapping reason |
| Serverless payload limit | Render/compress and upload one page per request below a safe limit |
| Free-tier rate limits | Concurrency cap, bounded retries, per-page resume, configurable model |
| Public demo consumes quota | Strict input caps, basic throttling, provider quota cap, synthetic demo files |
| Grading appears authoritative without a rubric | Label it “AI estimate,” show evidence/confidence, and keep mapping independent of grading |

## 18. Assumptions and limitations to disclose

- The first version handles one student answer sheet per session.
- Processing is ephemeral; refreshing the page clears the assessment.
- Highlight boxes are AI-detected regions, not mathematically exact ink segmentation.
- Recognition quality depends on scan clarity, handwriting, language, and page orientation.
- Grading without an answer key/rubric is advisory.
- The public demo should use anonymized data.
- The model identifier and free-tier quota can change, so both are configurable and should be rechecked before submission.

## 19. Build recommendation

Start with the bounding-box spike and fixture set, not the polished dashboard. The assignment’s highest-risk and highest-value requirement is accurate mapping with synchronized highlights. Once one clean, one out-of-order, and one multi-page fixture work end to end, implement the Figma shell around that verified pipeline and then add grading as a non-blocking layer.

## 20. Technical references checked

- [Next.js App Router documentation](https://nextjs.org/docs/app)
- [Gemini document understanding](https://ai.google.dev/gemini-api/docs/document-processing)
- [Gemini structured outputs](https://ai.google.dev/gemini-api/docs/structured-output)
- [Gemini API pricing](https://ai.google.dev/gemini-api/docs/pricing)
- [PDF.js examples](https://mozilla.github.io/pdf.js/examples/)
- [Vercel Functions limits](https://vercel.com/docs/functions/limitations)

