export const questionExtractionPrompt = `
You are extracting assessable questions from one page of a printed question paper.

Return every assessable question in the exact visible reading order. Preserve the visible label exactly. Treat labelled sub-parts such as 11 (a) and 11 (b) as separate entries. Do not emit a separate parent question when only its labelled sub-parts are assessable. Put shared introductory wording in sharedStem and include it in fullText for each relevant sub-part.

Do not mistake instructions, headings, page numbers, diagram labels, or marks annotations for questions. If question wording continues from another page, set the appropriate continuation flags. Return box_2d as [ymin, xmin, ymax, xmax], using absolute corner coordinates normalized from 0 to 1000 with the origin at the top-left. Return a tight box around the complete visible question region. Confidence must be between 0 and 1.
`;

export const answerExtractionPrompt = `
You are transcribing and localizing handwritten student answers from one answer-sheet page.

Return separate logical answer blocks in reading order. Every visible response marker starts a new block, including forms such as "Ans 2(b)", "Q.1", "Answer 4", and "Q.6". Never combine text under two different response markers into one block. In detectedLabel return only the question identifier exactly as written (for example "Q2" from "Q2 - Three schema architecture" and "Q2" from "Q2 continued"); exclude descriptive headings and the word "continued".

Transcribe the answer faithfully without correcting it. A block may have multiple regions only when the same answer is genuinely disjoint. For every region, return box_2d as [ymin, xmin, ymax, xmax], using absolute corner coordinates normalized from 0 to 1000 with the origin at the top-left. yMax and xMax are bottom/right coordinates, not height or width. Each region must begin at that answer's marker and stop after its final ink, strictly before the next response marker. Do not include neighboring answers or extend a box through unused blank page space. Recheck that regions from different blocks do not overlap. Use continuation flags only when an answer clearly enters from or continues to another page. Do not invent a label or text that is not visible. Confidence must be between 0 and 1.
`;

export const semanticMappingPrompt = `
Map only the unresolved answer blocks to the supplied questions. Use the answer meaning, question wording, handwritten labels, and continuity evidence. Do not force a match. Return questionId as null when evidence is insufficient. A confidence below 0.6 should normally be unmatched. Keep reasons short and factual.
`;

export const answerLocalizationPrompt = `
You are localizing answer regions on a handwritten answer-sheet page. The answers have already been transcribed. Your only task is to locate each supplied target on this image.

TARGETS are supplied in the page's visual reading order. Match the literal handwritten response marker whenever present. On dense numbered or multiple-choice lists, target label 20 means the line visibly numbered 20, never a nearby line such as 18 or 19. Use the transcription preview only to confirm the location. Return at most one tight region per target and omit a target only when it is genuinely not visible on this page.

For each location, preserve targetIndex exactly and return box_2d as [ymin, xmin, ymax, xmax], normalized from 0 to 1000. The box must include the target's marker and all of its answer ink, exclude adjacent numbered responses, and contain no unnecessary blank area. yMax and xMax are absolute bottom/right coordinates, not height or width.
`;

export const targetedAnswerLocalizationPrompt = `
Locate exactly one student response on this answer-sheet page. This is a verification task, not transcription or grading.

Find the literal handwritten question/answer marker specified by TARGET. On a dense numbered or multiple-choice list, match the exact visible number: never substitute a nearby row. Confirm that the supplied answer preview belongs to the same response. Ignore headings, page borders, reverse-side show-through, blank areas, and neighboring responses.

If the exact response is not visibly present, return found=false and box_2d=null. Otherwise return one tight box_2d as [ymin, xmin, ymax, xmax], normalized from 0 to 1000. The box must include the visible marker and this response's ink only. Confidence below 0.7 should return found=false.
`;

export const gradingPrompt = `
Evaluate each student answer against its question. This is advisory grading without an official rubric. Be conservative. If maximum marks are absent, return null for both awardedMarks and maxMarks and still provide a correctness verdict when possible. Cite short evidence from the student's response. Feedback must be concise, specific, and useful to a teacher. Do not reward content that is not present.
`;
